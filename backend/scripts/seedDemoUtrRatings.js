// TEK SEFERLİK backfill — kullanıcı isteği: demo oyunculara tenis/padel'de HEM tekli HEM
// çiftler ELO puanı verilsin (test/demo ortamında rakip/davet listelerinde "T ELO -" / boş
// görünmesin diye). Daha önce bu istek üzerine sadece 3 demo hesaba (ikisi de AYNI değerle)
// yama yapılmış, geri kalan ~175 demo hesap hâlâ hiç değerlendirme yapmamış durumdaydı —
// kullanıcı raporu ("Ç ELO yazıyor, T ELO yok") bu eksikliği doğruladı.
//
// Sadece ZATEN VAR OLAN tennis/padel UserInterest satırları güncellenir (yeni ilgi alanı
// oluşturulmaz) — bir demo hesap bu dala hiç eklenmemişse dokunulmaz. Halihazırda anket
// tamamlamış (assessmentCompleted VEYA doublesAssessmentCompleted true) satırlar da
// ATLANIR — gerçek/kasıtlı bir değeri ezmemek için.
//
// Tekli/çiftli DEĞERLERİ kasıtlı olarak FARKLI (çiftler ±0.6'ya kadar sapabiliyor) — ikisi
// hep aynıymış gibi görünmesin diye (önceki yamanın yaptığı hata).
//
// Varsayılan mod: DRY-RUN (sadece rapor, hiçbir şey yazılmaz).
// Gerçek çalıştırmak için --confirm bayrağı ZORUNLU.
//
// Çalıştır (backend/ içinden, production DB'ye DATABASE_URL override ile):
//   DATABASE_URL="<public proxy url>" node scripts/seedDemoUtrRatings.js            (dry-run)
//   DATABASE_URL="<public proxy url>" node scripts/seedDemoUtrRatings.js --confirm  (gerçek)
import prisma from '../src/config/prisma.js';

const UTR_SUBCATEGORIES = ['tennis', 'padel'];
const CONFIRM = process.argv.includes('--confirm');

// Basit deterministik-ish rastgelelik: 0.5–4.5 arası, hafçe çan eğrisine yakın (3 zar ortalaması).
function randomSingles() {
    const r = (Math.random() + Math.random() + Math.random()) / 3; // 0-1, ortada yoğun
    return Math.round((0.5 + r * 4) * 100) / 100; // 0.5 - 4.5
}
function randomDoublesFrom(singles) {
    const delta = (Math.random() * 1.2 - 0.6); // ±0.6
    return Math.round(Math.max(0.5, Math.min(5, singles + delta)) * 100) / 100;
}

async function main() {
    const demoUsers = await prisma.user.findMany({
        where: { username: { startsWith: 'demo_' } },
        select: { id: true },
    });
    const ids = demoUsers.map(u => u.id);
    const interests = await prisma.userInterest.findMany({
        where: { userId: { in: ids }, subCategory: { in: UTR_SUBCATEGORIES } },
    });
    const toFix = interests.filter(i => !i.assessmentCompleted && !i.doublesAssessmentCompleted);

    console.log('--- Demo Oyuncu Tekli+Çiftler ELO Backfill ---');
    console.log(`Mod: ${CONFIRM ? 'GERÇEK ÇALIŞTIRMA (--confirm)' : 'DRY-RUN (rapor, hiçbir şey yazılmıyor)'}`);
    console.log(`Demo kullanıcı sayısı: ${ids.length}`);
    console.log(`Tennis/padel ilgi alanı satırı: ${interests.length}`);
    console.log(`Değerlendirmesi eksik (doldurulacak): ${toFix.length}`);

    let done = 0;
    for (const i of toFix) {
        const singles = randomSingles();
        const doubles = randomDoublesFrom(singles);
        if (done < 5) console.log(`  ${i.userId} / ${i.subCategory}: tekli=${singles} çiftler=${doubles}`);
        if (CONFIRM) {
            const now = new Date();
            await prisma.userInterest.update({
                where: { id: i.id },
                data: {
                    assessmentCompleted: true, assessmentCompletedAt: now, singlesSeedRating: singles,
                    doublesAssessmentCompleted: true, doublesAssessmentCompletedAt: now, doublesSeedRating: doubles,
                    // Aynalanmış alan (bkz. utrRating.js getDisplayRating yorumu) — kozmetik
                    // gösterim noktaları için de bir değer bulunsun diye tekli ile mirrorlanır.
                    skillRating: singles, level: singles >= 3.5 ? 'ADVANCED' : singles >= 2 ? 'INTERMEDIATE' : 'BEGINNER',
                },
            });
        }
        done++;
    }

    console.log(`\n${CONFIRM ? 'Güncellendi' : 'Güncellenecek'}: ${done} satır.`);
    if (!CONFIRM) console.log('\nGerçekten yazmak için: node scripts/seedDemoUtrRatings.js --confirm');
    await prisma.$disconnect();
}

main().catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
});
