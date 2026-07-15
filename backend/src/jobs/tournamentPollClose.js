import prisma from '../config/prisma.js';
import { createNotification } from '../controllers/notification.controller.js';
import { emitToUser } from '../config/socket.js';
import { tournamentPollDeadline, checkPollAutoJoinEligibility } from '../controllers/tournament.controller.js';

// Mobildeki TOURN_TYPE_LABELS ile aynı isimler ('5'-'8' henüz kesinleşmemiş yer
// tutucular, oradaki gibi burada da genel "Tür N" olarak anılır).
function typeLabel(tp) {
    if (tp === '1') return 'Bireysel Rekabetçi';
    if (tp === '2') return 'Çiftler Rekabetçi';
    if (tp === '3') return 'Bireysel Antrenman';
    if (tp === '4') return 'Çiftler Antrenman';
    return `Tür ${tp}`;
}

// Kazanan türe oy verenleri OY SIRASINA göre başvuru kuyruğuna (PENDING) ekler —
// oy vermek bu türün kazanması halinde kesin katılım taahhüdü sayılır. createdAt
// bilinçli olarak oyun kendi createdAt'ine eşitlenir ki mevcut sıralama/kapasite/
// yedek-terfi mantığı (createdAt asc) oy sırasını otomatik olarak korusun. Kabul/
// onay süreci normal başvurularla birebir aynı (organizatör onayı gerekir).
async function autoJoinWinningVoters(tournament, winner) {
    const votes = await prisma.tournamentTypeVote.findMany({
        where: { tournamentId: tournament.id, votedType: winner },
        orderBy: { createdAt: 'asc' },
    });

    let joinedCount = 0;
    for (const vote of votes) {
        try {
            const existing = await prisma.tournamentParticipant.findUnique({
                where: { tournamentId_userId: { tournamentId: tournament.id, userId: vote.userId } },
            });
            if (existing) continue;

            const eligibility = await checkPollAutoJoinEligibility(tournament, vote.userId);
            if (!eligibility.ok) {
                createNotification(
                    vote.userId,
                    'TOURNAMENT_POLL_JOIN_FAILED',
                    '⚠️ Otomatik Başvuru Oluşturulamadı',
                    `"${tournament.name}" turnuvasında oyladığınız tür kazandı, ancak ${eligibility.message} İsterseniz koşulları sağladıktan sonra elle başvurabilirsiniz.`,
                    { tournamentId: tournament.id, category: tournament.category, subCategory: tournament.subCategory },
                ).catch(() => {});
                continue;
            }

            await prisma.tournamentParticipant.create({
                data: {
                    tournamentId: tournament.id,
                    userId: vote.userId,
                    status: 'PENDING',
                    acceptedAt: null,
                    note: 'Anket oyu ile otomatik başvuru',
                    createdAt: vote.createdAt,
                },
            });
            joinedCount++;

            createNotification(
                vote.userId,
                'TOURNAMENT_POLL_AUTO_JOINED',
                '✅ Turnuvaya Otomatik Başvuruldu',
                `"${tournament.name}" turnuvasında oyladığınız tür (${typeLabel(winner)}) kazandı — oy sıranıza göre başvurunuz otomatik oluşturuldu, organizatör onayı bekleniyor.`,
                { tournamentId: tournament.id, category: tournament.category, subCategory: tournament.subCategory },
            ).catch(() => {});
        } catch (err) {
            console.error(`[poll-close] auto-join failed for voter ${vote.userId} on tournament ${tournament.id}:`, err.message);
        }
    }

    // Kaybeden türlere oy verenler otomatik eklenmez ama kayıtlar açık olduğu sürece
    // normal başvuru yapabilirler — bunu kendilerine ayrıca bildir.
    const pollTypes = Array.isArray(tournament.pollTypes) ? tournament.pollTypes : [];
    const loserTypes = pollTypes.filter(tp => tp !== winner);
    if (loserTypes.length > 0) {
        const loserVotes = await prisma.tournamentTypeVote.findMany({
            where: { tournamentId: tournament.id, votedType: { in: loserTypes } },
            select: { userId: true },
        });
        for (const lv of loserVotes) {
            createNotification(
                lv.userId,
                'TOURNAMENT_POLL_CLOSED',
                '🗳️ Anket Sonuçlandı',
                `"${tournament.name}" turnuvasında oyladığınız tür kazanmadı. Yine de kayıtlar açık olduğu sürece bu turnuvaya normal şekilde başvurabilirsiniz.`,
                { tournamentId: tournament.id, category: tournament.category, subCategory: tournament.subCategory },
            ).catch(() => {});
        }
    }

    return joinedCount;
}

// pollTypes içindeki en çok oy alan türü döner. Eşitlik (veya hiç oy yoksa) pollTypes
// dizisindeki İLK türü kazanır — eski "eşitlikte Tür 1 kazanır" kuralının genellemesi
// (turnuvayı açan kişi genelde tercih ettiği türü listenin başına koyar).
async function pickPollWinner(tournament) {
    const pollTypes = Array.isArray(tournament.pollTypes) ? tournament.pollTypes : [];
    if (pollTypes.length === 0) return '1';
    const tallies = await prisma.tournamentTypeVote.groupBy({
        by: ['votedType'],
        where: { tournamentId: tournament.id },
        _count: { id: true },
    });
    const countOf = (tp) => tallies.find(x => x.votedType === tp)?._count.id || 0;
    let winner = pollTypes[0];
    let winnerCount = countOf(winner);
    for (const tp of pollTypes.slice(1)) {
        const c = countOf(tp);
        if (c > winnerCount) { winner = tp; winnerCount = c; }
    }
    return winner;
}

async function closeDuePolls() {
    try {
        const now = new Date();
        const polls = await prisma.tournament.findMany({ where: { status: 'POLL' } });
        const due = polls.filter(t => tournamentPollDeadline(t).getTime() <= now.getTime());

        for (const tournament of due) {
            try {
                const winner = await pickPollWinner(tournament);

                await prisma.tournament.update({
                    where: { id: tournament.id },
                    data: { type: winner, status: 'OPEN' },
                });

                const joinedCount = await autoJoinWinningVoters(tournament, winner);

                createNotification(
                    tournament.creatorId,
                    'TOURNAMENT_POLL_CLOSED',
                    '🗳️ Anket sonuçlandı',
                    `"${tournament.name}" turnuvasında ${typeLabel(winner)} türü kazandı, kayıtlar açıldı.` +
                        (joinedCount > 0 ? ` Oy sırasına göre ${joinedCount} kişi otomatik başvuru kuyruğuna eklendi, onayınızı bekliyor.` : ''),
                    { tournamentId: tournament.id }
                ).catch(() => {});
                emitToUser(tournament.creatorId, 'tournament:poll_closed', { tournamentId: tournament.id, winner });

                console.log(`[poll-close] Tournament ${tournament.id} resolved to type ${winner}, ${joinedCount} voter(s) auto-queued`);
            } catch (err) {
                console.error(`[poll-close] Failed for ${tournament.id}:`, err.message);
            }
        }
    } catch (err) {
        console.error('[poll-close] Error:', err.message);
    }
}

export function startTournamentPollCloseJob() {
    closeDuePolls();
    setInterval(closeDuePolls, 60 * 1000);
    console.log('🗳️  Tournament poll-close job started (every 1 min)');
}
