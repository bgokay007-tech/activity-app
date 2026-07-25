import prisma from '../config/prisma.js';
import { createNotification } from '../controllers/notification.controller.js';
import { advanceTournamentAfterMatch } from '../controllers/tournament.controller.js';

// tournament.controller.js'teki advanceTournamentAfterMatch, tip '1' turnuvalarda bir turun
// deadline'ı geçtiğinde joker'li tek bir açık maçı beklemeden bir sonraki grup turunu kurar —
// ama bu fonksiyon sadece bir MAÇ tamamlandığında reaktif olarak çağrılıyor. Bir turdaki son
// açık maç joker'liyse (kendi deadline'ı hâlâ gelecekte) başka hiçbir maç tamamlanmayacağı için
// bu kontrol bir daha asla tetiklenmeyebilir. Bu job periyodik olarak "tıkanmış" turları tarayıp
// aynı fonksiyonu senkron bir maç olmadan da tetikler.

// Deadline'a kalan süreye göre gönderilecek hatırlatma pencereleri (büyükten küçüğe).
const WINDOWS = [
    { key: '3d', hours: 72, label: '3 gün' },
    { key: '2d', hours: 48, label: '2 gün' },
    { key: '24h', hours: 24, label: '24 saat' },
    { key: '12h', hours: 12, label: '12 saat' },
];

// tournament.type === '2'/'4' (Çiftler Rekabetçi/Çiftler Antrenman) maçlarında p1Id/p2Id bir
// TournamentTeam id'sidir, gerçek kullanıcı id'lerine buradan çözülür (bkz. cleanupTournaments.js).
function buildRecipientResolver(tournamentMap, teamMap) {
    return (match) => {
        const tournament = tournamentMap[match.tournamentId];
        if (tournament?.type === '2' || tournament?.type === '4') {
            const t1 = teamMap[match.p1Id], t2 = teamMap[match.p2Id];
            return [...new Set([t1?.player1Id, t1?.player2Id, t2?.player1Id, t2?.player2Id].filter(Boolean))];
        }
        return [...new Set([match.p1Id, match.p2Id].filter(Boolean))];
    };
}

async function loadTournamentAndTeamMaps(matches) {
    const tournamentIds = [...new Set(matches.map(m => m.tournamentId))];
    const tournaments = await prisma.tournament.findMany({ where: { id: { in: tournamentIds } } });
    const tournamentMap = Object.fromEntries(tournaments.map(t => [t.id, t]));

    const teamIds = [...new Set(
        matches.filter(m => ['2', '4'].includes(tournamentMap[m.tournamentId]?.type)).flatMap(m => [m.p1Id, m.p2Id]).filter(Boolean)
    )];
    const teams = teamIds.length ? await prisma.tournamentTeam.findMany({ where: { id: { in: teamIds } } }) : [];
    const teamMap = Object.fromEntries(teams.map(t => [t.id, t]));

    return { tournamentMap, teamMap };
}

/** Deadline'ına 3 gün / 2 gün / 24 saat / 12 saat kala oyunculara "maçını oyna, aksi halde
 *  berabere sayılacak" hatırlatması gönderir. Her (maç, pencere, kullanıcı) kombinasyonu için
 *  en fazla 1 kez gönderilir — dedupe, aynı türden son 4 gün içindeki Notification kayıtlarına
 *  bakılarak yapılır. */
async function checkAndNotifyUpcomingDeadlines() {
    try {
        const now = new Date();
        const horizon = new Date(now.getTime() + (WINDOWS[0].hours + 1) * 3600 * 1000);

        const matches = await prisma.tournamentMatch.findMany({
            where: { status: 'PENDING', phase: 'GROUP', deadline: { gt: now, lte: horizon } },
        });
        if (matches.length === 0) return;

        const { tournamentMap, teamMap } = await loadTournamentAndTeamMaps(matches);
        const getRecipients = buildRecipientResolver(tournamentMap, teamMap);

        const since = new Date(now.getTime() - 4 * 86400000);
        const sentNotifs = await prisma.notification.findMany({
            where: { type: 'TOURNAMENT_MATCH_DEADLINE_WARNING', createdAt: { gte: since } },
            select: { userId: true, data: true },
        });
        const sentKeys = new Set(sentNotifs.map(n => `${n.data?.matchId}|${n.data?.window}|${n.userId}`));

        let sentCount = 0;
        for (const match of matches) {
            const tournament = tournamentMap[match.tournamentId];
            if (!tournament || tournament.status !== 'IN_PROGRESS') continue;

            const hoursLeft = (match.deadline.getTime() - now.getTime()) / 3600000;
            const crossedWindows = WINDOWS.filter(w => hoursLeft <= w.hours);
            if (crossedWindows.length === 0) continue;

            const recipients = getRecipients(match);
            if (recipients.length === 0) continue;

            for (const w of crossedWindows) {
                for (const userId of recipients) {
                    const key = `${match.id}|${w.key}|${userId}`;
                    if (sentKeys.has(key)) continue;
                    sentKeys.add(key);
                    sentCount++;

                    createNotification(
                        userId,
                        'TOURNAMENT_MATCH_DEADLINE_WARNING',
                        `⏳ Maçınıza ${w.label} kaldı`,
                        `${tournament.name}: ${match.p1Name || '?'} - ${match.p2Name || '?'} maçını oynamak için ${w.label} kaldı. Süre dolduğunda maç otomatik olarak berabere sayılacaktır.`,
                        { tournamentId: tournament.id, matchId: match.id, window: w.key, category: tournament.category, subCategory: tournament.subCategory }
                    ).catch(() => {});
                }
            }
        }
        if (sentCount > 0) console.log(`[tournamentDeadlineReminder] Sent ${sentCount} deadline warning notification(s)`);
    } catch (err) {
        console.error('[tournamentDeadlineReminder] checkAndNotifyUpcomingDeadlines error:', err.message);
    }
}

/** Deadline'ı geçmiş, hâlâ PENDING olan GROUP maçlarını otomatik olarak berabere (0-0, kazanan yok)
 *  kaydeder — puana/dereceye hiçbir etkisi olmaz. Tur ilerletme ve turnuva otomatik tamamlama,
 *  skor girişiyle aynı yolu (advanceTournamentAfterMatch) kullanır, böylece bu maç yüzünden
 *  bir sonraki tur/play-off asla oluşturulmadan takılı kalmaz. */
async function autoDrawExpiredMatches() {
    try {
        const now = new Date();
        const expired = await prisma.tournamentMatch.findMany({
            where: { status: 'PENDING', phase: 'GROUP', deadline: { lt: now }, p1Id: { not: null }, p2Id: { not: null } },
        });
        if (expired.length === 0) return;

        for (const match of expired) {
            try {
                const tournament = await prisma.tournament.findUnique({
                    where: { id: match.tournamentId },
                    include: {
                        participants: {
                            where: { status: 'ACCEPTED' },
                            include: { user: { select: { id: true, username: true, fullName: true } } },
                        },
                    },
                });
                if (!tournament || tournament.status !== 'IN_PROGRESS') continue;

                const isTeamTournament = tournament.type === '2' || tournament.type === '4';
                let p1Members = [match.p1Id].filter(Boolean);
                let p2Members = [match.p2Id].filter(Boolean);
                if (isTeamTournament) {
                    const teams = await prisma.tournamentTeam.findMany({ where: { id: { in: [match.p1Id, match.p2Id].filter(Boolean) } } });
                    const t1 = teams.find(t => t.id === match.p1Id);
                    const t2 = teams.find(t => t.id === match.p2Id);
                    if (t1) p1Members = [t1.player1Id, t1.player2Id].filter(Boolean);
                    if (t2) p2Members = [t2.player1Id, t2.player2Id].filter(Boolean);
                }

                const score = {
                    sets: [], winner: null, p1Sets: 0, p2Sets: 0, p1Games: 0, p2Games: 0,
                    p1EloDelta: 0, p2EloDelta: 0,
                    p1RatingBefore: null, p1RatingAfter: null, p2RatingBefore: null, p2RatingAfter: null,
                    p1MemberRatings: [], p2MemberRatings: [],
                    autoDraw: true,
                };

                await prisma.tournamentMatch.update({
                    where: { id: match.id },
                    data: {
                        score, status: 'COMPLETED', winnerId: null,
                        scoreEnteredBy: null,
                        p1Confirmed: true, p2Confirmed: true,
                        scoreSubmittedAt: now,
                    },
                });

                await advanceTournamentAfterMatch(tournament, match, isTeamTournament, false);

                for (const uid of [...new Set([...p1Members, ...p2Members])]) {
                    createNotification(
                        uid, 'TOURNAMENT_MATCH_AUTO_DRAW',
                        '🤝 Maç süresi doldu, berabere sayıldı',
                        `${tournament.name}: ${match.p1Name || '?'} - ${match.p2Name || '?'} maçı süresi içinde oynanmadığı için otomatik olarak berabere kaydedildi.`,
                        { tournamentId: tournament.id, matchId: match.id, category: tournament.category, subCategory: tournament.subCategory }
                    ).catch(() => {});
                }

                console.log(`[tournamentDeadlineReminder] Auto-drew expired match ${match.id} (tournament ${tournament.id})`);
            } catch (matchErr) {
                console.error(`[tournamentDeadlineReminder] Failed to auto-draw match ${match.id}:`, matchErr.message);
            }
        }
    } catch (err) {
        console.error('[tournamentDeadlineReminder] autoDrawExpiredMatches error:', err.message);
    }
}

/** Tip '1' turnuvalarda mevcut grup turunda hâlâ PENDING maç varsa (muhtemelen joker'le
 *  uzatılmış), advanceTournamentAfterMatch'i senkron bir maç tamamlanması olmadan tekrar
 *  çağırır — fonksiyonun kendi içindeki dynamicRoundDeadlinePassed kontrolü, turun orijinal
 *  deadline'ı gerçekten geçmediyse zaten hiçbir şey yapmaz (no-op), o yüzden burada ekstra
 *  bir deadline kontrolüne gerek yok. */
async function advanceStuckDynamicRounds() {
    try {
        const tournaments = await prisma.tournament.findMany({
            where: { status: 'IN_PROGRESS', type: '1' },
            include: {
                participants: {
                    where: { status: 'ACCEPTED' },
                    include: { user: { select: { id: true, username: true, fullName: true } } },
                },
            },
        });
        if (tournaments.length === 0) return;

        for (const tournament of tournaments) {
            try {
                const groupMatches = await prisma.tournamentMatch.findMany({
                    where: { tournamentId: tournament.id, phase: 'GROUP' },
                    select: { round: true, status: true },
                });
                if (groupMatches.length === 0) continue;
                const maxRound = Math.max(...groupMatches.map(m => m.round));
                const hasPending = groupMatches.some(m => m.round === maxRound && m.status === 'PENDING');
                if (!hasPending) continue;

                await advanceTournamentAfterMatch(tournament, { round: maxRound, phase: 'GROUP' }, false, false);
            } catch (tErr) {
                console.error(`[tournamentDeadlineReminder] advanceStuckDynamicRounds failed for tournament ${tournament.id}:`, tErr.message);
            }
        }
    } catch (err) {
        console.error('[tournamentDeadlineReminder] advanceStuckDynamicRounds error:', err.message);
    }
}

export function startTournamentDeadlineReminderJob() {
    checkAndNotifyUpcomingDeadlines();
    autoDrawExpiredMatches();
    advanceStuckDynamicRounds();
    setInterval(checkAndNotifyUpcomingDeadlines, 30 * 60 * 1000); // every 30 minutes
    setInterval(autoDrawExpiredMatches, 15 * 60 * 1000); // every 15 minutes
    setInterval(advanceStuckDynamicRounds, 15 * 60 * 1000); // every 15 minutes
    console.log('⏳ Tournament match deadline reminder job started (every 30 min)');
    console.log('🤝 Tournament match auto-draw job started (every 15 min)');
    console.log('🔓 Tournament stuck-round unblock job started (every 15 min)');
}
