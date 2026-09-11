import prisma from '../config/prisma.js';

// Migration'lar production'da otomatik uygulanmıyor (db push schema.prisma'dan senkronlar).
// TournamentMessage bu yüzden hiç oluşmamıştı: sohbet listesi sessizce boş kalıyor,
// mesaj gönderince create() patlıyor ve istemci "işlem başarısız" gösteriyor.
export async function ensureTournamentChatTables() {
    await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "TournamentMessage" (
            "id"           TEXT         NOT NULL,
            "tournamentId" TEXT         NOT NULL,
            "senderId"     TEXT         NOT NULL,
            "content"      TEXT         NOT NULL,
            "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT "TournamentMessage_pkey" PRIMARY KEY ("id")
        );
    `);
    await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "TournamentMessage_tournamentId_idx"
        ON "TournamentMessage"("tournamentId");
    `);
    await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "TournamentMessage_senderId_idx"
        ON "TournamentMessage"("senderId");
    `);
    await addFk(
        'TournamentMessage_tournamentId_fkey',
        `ALTER TABLE "TournamentMessage"
            ADD CONSTRAINT "TournamentMessage_tournamentId_fkey"
            FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await addFk(
        'TournamentMessage_senderId_fkey',
        `ALTER TABLE "TournamentMessage"
            ADD CONSTRAINT "TournamentMessage_senderId_fkey"
            FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );

    await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "TournamentChatNotify" (
            "id"           TEXT    NOT NULL,
            "tournamentId" TEXT    NOT NULL,
            "userId"       TEXT    NOT NULL,
            "enabled"      BOOLEAN NOT NULL DEFAULT true,
            CONSTRAINT "TournamentChatNotify_pkey" PRIMARY KEY ("id")
        );
    `);
    await prisma.$executeRawUnsafe(`
        CREATE UNIQUE INDEX IF NOT EXISTS "TournamentChatNotify_tournamentId_userId_key"
        ON "TournamentChatNotify"("tournamentId", "userId");
    `);
    await addFk(
        'TournamentChatNotify_tournamentId_fkey',
        `ALTER TABLE "TournamentChatNotify"
            ADD CONSTRAINT "TournamentChatNotify_tournamentId_fkey"
            FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await addFk(
        'TournamentChatNotify_userId_fkey',
        `ALTER TABLE "TournamentChatNotify"
            ADD CONSTRAINT "TournamentChatNotify_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
}

export function isMissingChatTable(e) {
    const msg = String(e?.message || '');
    return e?.code === 'P2021' || /does not exist/i.test(msg) || /relation .* does not exist/i.test(msg);
}

async function addFk(name, sql) {
    await prisma.$executeRawUnsafe(`
        DO $$ BEGIN
            ${sql};
        EXCEPTION
            WHEN duplicate_object THEN NULL;
        END $$;
    `).catch(e => {
        console.error(`❌ ${name}:`, e.message);
    });
}
