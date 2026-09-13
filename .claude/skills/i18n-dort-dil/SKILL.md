---
name: i18n-dort-dil
description: >-
  Kullanıcıya görünen her metin için en, tr, ru, de zorunlu. Yeni ekran, buton,
  Alert, placeholder, dal adı, bildirim metni, i18n anahtarı veya mevcut metin
  değişikliğinde kullan. "çeviri", "dil", "i18n", "rusça", "almanca" denince de.
---

# Dört dil eksiksiz (KAZINDI)

Uygulamaya **ne eklenirse / ne değişirse** kullanıcıya görünen metin şu **4 dilde**
olmalı — eksik dil **yasak**:

| Kod | Dil |
|-----|-----|
| `en` | İngilizce |
| `tr` | Türkçe |
| `ru` | Rusça |
| `de` | Almanca |

Sadece `en`+`tr` yetmez. Tek dile eklemek veya bir dilde düzeltip diğerlerini eski
bırakmak defalarca ekranda ham anahtar / yanlış dil gösterdi.

## Mobil

Dosya: `mobile/src/i18n/index.js` — **`en`, `tr`, `ru`, `de` nesnelerinin dördüne**
aynı anahtarı ekle/güncelle. Sonra `useT()` → `t.anahtar`.

Dal/kategori adları (i18n dışı):

- `mobile/src/utils/subCategoryLabels.js` → `{ en, tr, ru, de }`
- `CategoryScreen.js` `SUB_MAP` → `label` + `labelTR` + `labelRU` + `labelDE`

## Web / frontend

`frontend/src/locales/en.json`, `tr.json`, `ru.json`, `de.json` — **dördü birden**.

## Yapma

- Sabit tek dil string (`Alert.alert('Hata', ...)`) — borç; yeni kodda i18n.
- Bir dilde düzeltip diğer üçünü unutma.
- `ru`/`de` için İngilizce kopyala-yapıştır bırakma (geçici bile); gerçek çeviri yaz.
- Backend API hata mesajları bilinçli sabit Türkçe kalabilir (`res.status(400).json({ message: '...' })`) — bu istisna skill `activity-app` ile aynı.

## İş bitince (zorunlu kontrol)

- [ ] Yeni/değişen her anahtar **en + tr + ru + de**?
- [ ] Dal ise `subCategoryLabels` + `SUB_MAP` dört dil?
- [ ] Web’e de metin gittiyse dört JSON?

Eksik dil varsa iş **bitmiş sayılmaz** — commit öncesi tamamla.
