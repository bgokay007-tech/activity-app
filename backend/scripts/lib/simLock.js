// Simülasyon scriptleri için tek-çalıştırma kilidi.
//
// Neden gerekli: bütün simülasyonlar AYNI yerel veritabanını ve sabit kullanıcı adlarını
// (sim_tr_c1_p1 gibi) kullanıyor, ayrıca açılışta kendi önekindeki kullanıcıları siliyor.
// İki koşu aynı anda çalışırsa birbirinin oyuncularını ve UserInterest satırlarını siler:
// sonuç ya anlamsız FAIL yığını ya da "Cannot read properties of null" çökmesi olur —
// ürün hatası sanılıp saatler harcanır. Bu gerçekten yaşandı: arka planda tam C koşusu
// varken başka bir koşu araya girdi, C1 484 maçın 284'ünde FAIL verdi ve C3 çöktü;
// tek başına çalıştırınca 484/484 PASS.
//
// Postgres advisory lock kullanıyoruz: bağlantı kapanınca otomatik bırakılır, yani
// script çökse bile ortada asılı kilit kalmaz.
const LOCK_KEY = 828141; // rastgele ama sabit — tüm simülasyon scriptleri aynı anahtarı paylaşır

export async function acquireSimLock(prisma) {
    const [{ pg_try_advisory_lock: ok }] = await prisma.$queryRaw`SELECT pg_try_advisory_lock(${LOCK_KEY}::bigint)`;
    if (!ok) {
        console.error('DURDURULDU: Başka bir simülasyon aynı veritabanında çalışıyor.');
        console.error('Simülasyonlar sabit kullanıcı adları paylaşıyor — paralel koşu sonuçları bozar.');
        console.error('Diğer koşunun bitmesini bekleyin, sonra tekrar deneyin.');
        process.exit(1);
    }
}
