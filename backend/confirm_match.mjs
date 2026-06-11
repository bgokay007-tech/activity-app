import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// Find the pending confirmation match
const requests = await prisma.rivalRequest.findMany({
    where: { scoreConfirmStatus: 'PENDING' },
    include: {
        sender: { select: { id: true, username: true } },
        receiver: { select: { id: true, username: true } },
    },
    orderBy: { updatedAt: 'desc' },
});

console.log('Pending confirmation matches:');
console.log(JSON.stringify(requests.map(r => ({
    id: r.id,
    sender: r.sender.username,
    receiver: r.receiver.username,
    scoreConfirmStatus: r.scoreConfirmStatus,
    scoreConfirmBy: r.scoreConfirmBy,
    score: r.score,
})), null, 2));

await prisma.$disconnect();
