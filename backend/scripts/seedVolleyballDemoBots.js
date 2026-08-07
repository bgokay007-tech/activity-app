// Tek seferlik kurulum: voleybol demo botlarının 100'ünü de (ismen davet edilebilsinler diye)
// önceden DB'ye yazar — spam butonu zaten rastgele seçtikçe lazy oluşturuyor ama ilan
// oluştururken isim arayarak davet edebilmek için hepsinin baştan var olması gerekiyor.
// Çalıştır: railway run node scripts/seedVolleyballDemoBots.js  (backend/ içinden)
import prisma from '../src/config/prisma.js';
import { DEMO_VOLLEYBALL_PLAYERS, ensureDemoVolleyballPlayer } from '../src/controllers/demo.controller.js';

async function main() {
    let created = 0;
    for (const demo of DEMO_VOLLEYBALL_PLAYERS) {
        const existing = await prisma.user.findUnique({ where: { username: demo.username } });
        await ensureDemoVolleyballPlayer(demo);
        if (!existing) created++;
    }
    console.log(`Bitti. ${DEMO_VOLLEYBALL_PLAYERS.length} demo voleybol botu hazır (${created} yeni oluşturuldu).`);
    await prisma.$disconnect();
}

main().catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
});
