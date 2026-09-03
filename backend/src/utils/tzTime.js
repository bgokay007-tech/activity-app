// Türkiye saat dilimi sabit UTC+3'tür (2016'dan beri yaz saati uygulaması yok). Uygulamadaki
// matchDate (bir takvim gününü UTC gece yarısı olarak saklayan Date) + matchTime ("14:30" gibi,
// KULLANICININ GİRDİĞİ TÜRKİYE SAATİ) alanlarını birleştirip maçın GERÇEK UTC anını hesaplamak
// için kullanılır.
//
// Kullanıcı raporu: tenis ilanı için yeterli oyuncu bulunamadığı halde ne push bildirimi ne de
// uygulama içi bildirim geldi ("ilan kaldırıldı sanırım"). Kök neden: cleanupRivals.js/
// autoCompleteMatches.js/reservationPaymentConfirm.js gibi cron job'lar ve rival.controller.js'teki
// birkaç ceza-penceresi hesabı `new Date(matchDate); d.setHours(h, m, 0, 0)` (veya yanlışlıkla
// `setUTCHours`) kullanıyordu — bu, "14:30"u SUNUCUNUN KENDİ yerel saat dilimine (Railway
// konteynerlerinde varsayılan UTC, Türkiye DEĞİL) göre yorumluyordu. Sonuç: hesaplanan an gerçek
// maç saatinden 3 saat SONRAYA denk geliyordu — kadrosu dolmayan bir ilan gerçek saatinden 3 saat
// sonrasına kadar "süresi geçmiş" sayılmıyordu (o noktaya kadar hem otomatik iptal hem bildirim
// hiç tetiklenmiyordu), geç-iptal ceza pencereleri de aynı 3 saatlik kaymayla yanlış hesaplanıyordu.
const TURKEY_UTC_OFFSET_HOURS = 3;

// date: Date | string (ör. "2026-09-03" ya da UTC gece yarısı Date). time: "HH:MM" ya da null/undefined.
// time verilmemişse (saatsiz ilan) date'in kendisi (UTC gece yarısı) AYNEN döner — çağıranların
// kendi "saatsiz" varsayılanı (ör. günün sonu) varsa onu ayrıca time parametresi olarak geçmesi
// gerekir, burada gizli bir varsayılan UYGULANMAZ (eski çağıran-bazlı davranışlar korunsun diye).
export function turkeyDateTimeToUtc(date, time) {
    const base = new Date(date);
    if (!time) return base;
    const year = base.getUTCFullYear();
    const month = base.getUTCMonth();
    const day = base.getUTCDate();
    const [h, m] = time.split(':').map(Number);
    return new Date(Date.UTC(year, month, day, h - TURKEY_UTC_OFFSET_HOURS, m, 0, 0));
}
