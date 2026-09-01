// TEK SEFERLİK backfill — tenis/padel'de anket tamamlandığında skillRating (aynalanmış alan,
// mobildeki onlarca kozmetik gösterim noktasının okuduğu yer) hiç güncellenmiyordu, sadece
// gerçek bir maç oynanınca yazılıyordu (bkz. interest.controller.js/padelRating.js düzeltmesi).
// Bu script, düzeltmeden ÖNCE anket tamamlamış (ama henüz hiç/az maç oynamış) kullanıcıların
// skillRating'ini geriye dönük olarak doğru değere çeker. Kullanıcı raporu: anketi doldurup
// 2.75 aldı ama ilan kartı/detayında hâlâ 0.00 görünüyordu.
//
// Mantık: singles ve doubles için "en son dokunulan" zaman damgası (gerçek maç varsa
// *LastMatchAt, yoksa *AssessmentCompletedAt) karşılaştırılır, hangisi daha yeniyse o
// disiplinin görüntülenen puanı (getDisplayRating ile aynı formül) skillRating'e yazılır.
//
// Varsayılan mod: DRY-RUN (sadece rapor, hiçbir şey değiştirilmez).
// Gerçek çalıştırmak için --confirm bayrağı ZORUNLU.
//
// Çalıştır (backend/ içinden):
//   railway run node scripts/backfillSkillRatingMirror.js            (dry-run — sadece rapor)
//   railway run node scripts/backfillSkillRatingMirror.js --confirm  (gerçek yazma)
import prisma from '../src/config/prisma.js';
import { getDisplayRating } from '../src/utils/utrRating.js';

const UTR_SUBCATEGORIES = ['tennis', 'padel'];
const CONFIRM = process.argv.includes('--confirm');

function mostRecentDisplayRating(interest) {
    const singlesTouch = interest.singlesLastMatchAt || interest.assessmentCompletedAt;
    const doublesTouch = interest.doublesLastMatchAt || interest.doublesAssessmentCompletedAt;
    if (!singlesTouch && !doublesTouch) return null;
    const useDoubles = doublesTouch && (!singlesTouch || doublesTouch > singlesTouch);
    return getDisplayRating(interest, interest.subCategory, useDoubles);
}

async function main() {
    const interests = await prisma.userInterest.findMany({
        where: {
            subCategory: { in: UTR_SUBCATEGORIES },
            OR: [{ assessmentCompleted: true }, { doublesAssessmentCompleted: true }],
        },
    });

    console.log('--- skillRating Aynası Backfill ---');
    console.log(`Mod: ${CONFIRM ? 'GERÇEK ÇALIŞTIRMA (--confirm)' : 'DRY-RUN (rapor, hiçbir şey yazılmıyor)'}`);
    console.log(`Aday satır (anket tamamlanmış): ${interests.length}`);

    let toFix = 0;
    for (const i of interests) {
        const correct = mostRecentDisplayRating(i);
        if (correct == null) continue;
        const rounded = parseFloat(correct.toFixed(2));
        if (Math.abs((i.skillRating ?? 0) - rounded) < 0.005) continue;
        toFix++;
        console.log(`  ${i.userId} / ${i.subCategory}: skillRating ${i.skillRating} -> ${rounded}`);
        if (CONFIRM) {
            await prisma.userInterest.update({ where: { id: i.id }, data: { skillRating: rounded } });
        }
    }

    console.log(`\n${CONFIRM ? 'Güncellendi' : 'Güncellenecek'}: ${toFix} satır.`);
    if (!CONFIRM) console.log('\nGerçekten yazmak için: node scripts/backfillSkillRatingMirror.js --confirm');
    await prisma.$disconnect();
}

main().catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
});
