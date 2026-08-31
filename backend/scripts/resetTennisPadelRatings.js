// TEK SEFERLİK, GERİ ALINAMAZ migrasyon — tenis/padel UTR-esinli puanlama sistemine geçişte
// "sıfırdan başla" kararının uygulanması (bkz. plan §7). Kullanıcı açıkça onayladı:
//   1) UserInterest (tennis/padel): rating/istatistikler sıfırlanır, anket sonucu (varsa)
//      singlesSeedRating/doublesSeedRating'e BİR KEREYE mahsus taşınır.
//   2) DESTRÜKTİF: tamamlanmış tenis/padel ActivityRequest kayıtları (Geçmiş Maçlar/arşiv) VE
//      o maçlarda paylaşılan medya (rivalId'li Post + cascade Comment/Like/StoryView) SİLİNİR.
//
// Varsayılan mod: DRY-RUN (sadece sayım, hiçbir şey silinmez/değiştirilmez).
// Gerçek migrasyonu çalıştırmak için --confirm bayrağı ZORUNLU.
//
// Çalıştır (backend/ içinden):
//   railway run node scripts/resetTennisPadelRatings.js            (dry-run — sadece rapor)
//   railway run node scripts/resetTennisPadelRatings.js --confirm  (gerçek migrasyon)
import prisma from '../src/config/prisma.js';

const UTR_SUBCATEGORIES = ['tennis', 'padel'];
const CONFIRM = process.argv.includes('--confirm');

async function main() {
    const interests = await prisma.userInterest.findMany({
        where: { subCategory: { in: UTR_SUBCATEGORIES } },
    });
    const completedMatches = await prisma.activityRequest.findMany({
        where: { subCategory: { in: UTR_SUBCATEGORIES }, status: 'COMPLETED' },
        select: { id: true },
    });
    const matchIds = completedMatches.map(m => m.id);
    const mediaPosts = matchIds.length
        ? await prisma.post.findMany({ where: { rivalId: { in: matchIds } }, select: { id: true } })
        : [];

    console.log('--- Tenis/Padel UTR Migrasyonu ---');
    console.log(`Mod: ${CONFIRM ? 'GERÇEK ÇALIŞTIRMA (--confirm)' : 'DRY-RUN (rapor, hiçbir şey silinmiyor)'}`);
    console.log(`UserInterest satırı (sıfırlanacak): ${interests.length}`);
    console.log(`Tamamlanmış maç (SİLİNECEK): ${matchIds.length}`);
    console.log(`Bağlı medya postu (SİLİNECEK, yorum/beğeni/story-view dahil cascade): ${mediaPosts.length}`);

    if (!CONFIRM) {
        console.log('\nGerçekten çalıştırmak için: node scripts/resetTennisPadelRatings.js --confirm');
        await prisma.$disconnect();
        return;
    }

    console.log('\nSiliniyor...');
    if (mediaPosts.length) {
        await prisma.post.deleteMany({ where: { id: { in: mediaPosts.map(p => p.id) } } });
    }
    if (matchIds.length) {
        await prisma.activityRequest.deleteMany({ where: { id: { in: matchIds } } });
    }

    console.log('UserInterest satırları sıfırlanıyor...');
    let reset = 0;
    for (const i of interests) {
        // Tenis: skillRating anket'in ham çıktısıydı (hiç harmanlanmadı) — bir kereye mahsus
        // seed olarak taşınır. Padel: selfAssessmentRating aynı role sahip.
        const seed = i.subCategory === 'padel' ? (i.selfAssessmentRating ?? null) : (i.assessmentCompleted ? i.skillRating : null);
        await prisma.userInterest.update({
            where: { id: i.id },
            data: {
                singlesRating: null, doublesRating: null,
                singlesSeedRating: seed, doublesSeedRating: seed,
                singlesRatingOffset: 0, doublesRatingOffset: 0,
                singlesMatchCount: 0, doublesMatchCount: 0,
                singlesLastMatchAt: null, doublesLastMatchAt: null,
                wins: 0, losses: 0, totalPoints: 0, matchesSinceAssessment: 0,
                assessmentCompletedAt: i.assessmentCompleted ? (i.assessmentCompletedAt ?? i.updatedAt) : null,
            },
        });
        reset++;
    }

    console.log(`Bitti. ${reset} UserInterest sıfırlandı, ${matchIds.length} maç ve ${mediaPosts.length} medya postu silindi.`);
    await prisma.$disconnect();
}

main().catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
});
