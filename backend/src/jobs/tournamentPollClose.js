import prisma from '../config/prisma.js';
import { createNotification } from '../controllers/notification.controller.js';
import { emitToUser } from '../config/socket.js';
import { tournamentPollDeadline, checkPollAutoJoinEligibility } from '../controllers/tournament.controller.js';

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
                `"${tournament.name}" turnuvasında oyladığınız tür (${winner === '1' ? 'Bireysel' : 'Çiftler'} Rekabetçi) kazandı — oy sıranıza göre başvurunuz otomatik oluşturuldu, organizatör onayı bekleniyor.`,
                { tournamentId: tournament.id, category: tournament.category, subCategory: tournament.subCategory },
            ).catch(() => {});
        } catch (err) {
            console.error(`[poll-close] auto-join failed for voter ${vote.userId} on tournament ${tournament.id}:`, err.message);
        }
    }

    // Kaybeden türe oy verenler otomatik eklenmez ama kayıtlar açık olduğu sürece
    // normal başvuru yapabilirler — bunu kendilerine ayrıca bildir.
    const otherType = winner === '1' ? '2' : '1';
    const loserVotes = await prisma.tournamentTypeVote.findMany({
        where: { tournamentId: tournament.id, votedType: otherType },
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

    return joinedCount;
}

async function closeDuePolls() {
    try {
        const now = new Date();
        const polls = await prisma.tournament.findMany({ where: { status: 'POLL' } });
        const due = polls.filter(t => tournamentPollDeadline(t).getTime() <= now.getTime());

        for (const tournament of due) {
            try {
                const tallies = await prisma.tournamentTypeVote.groupBy({
                    by: ['votedType'],
                    where: { tournamentId: tournament.id },
                    _count: { id: true },
                });
                const c1 = tallies.find(x => x.votedType === '1')?._count.id || 0;
                const c2 = tallies.find(x => x.votedType === '2')?._count.id || 0;
                const winner = c2 > c1 ? '2' : '1'; // eşitlik veya oy yoksa Tür 1 (Bireysel Rekabetçi) kazanır

                await prisma.tournament.update({
                    where: { id: tournament.id },
                    data: { type: winner, status: 'OPEN' },
                });

                const joinedCount = await autoJoinWinningVoters(tournament, winner);

                createNotification(
                    tournament.creatorId,
                    'TOURNAMENT_POLL_CLOSED',
                    '🗳️ Anket sonuçlandı',
                    `"${tournament.name}" turnuvasında ${winner === '1' ? 'Bireysel' : 'Çiftler'} Rekabetçi türü kazandı, kayıtlar açıldı.` +
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
