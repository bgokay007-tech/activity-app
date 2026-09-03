// Bu modülün tamamı native tarafta (Android FirebaseMessagingService + BroadcastReceiver)
// çalışır, JS'e hiç ihtiyaç duymaz — "Okundu İşaretle"/"Cevapla" bildirim aksiyonları
// uygulama arka planda/kapalıyken bile doğrudan native koddan API çağrısı yapar. Bu dosya
// sadece autolinking'in "main" alanını çözebilmesi için var, hiçbir şey export etmiyor.
export {};
