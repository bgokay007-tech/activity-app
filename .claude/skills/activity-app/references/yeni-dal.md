# Yeni aktivite dalı (subCategory) ekleme

Git geçmişindeki en sık tekrarlanan iş bu ("Sosyal kategorisine Sanal Alem dali eklendi",
"yoga/pilates/reformer, kayak&snowboard, motosiklet, buz pateni, atıcılık&avcılık açıldı").
Dal kimliği **birbirinden bağımsız birkaç listede** tanımlı olduğu için tek yerde güncellemek
sessiz hatalara yol açar: dal ya hiç görünmez, ya kilitli görünür, ya da bildirimlerde ham
İngilizce id olarak çıkar.

## Kimlik kuralı

`snake_case`, İngilizce, çoğul değil: `tennis`, `foot_tennis`, `skiing_snowboard`,
`sanal_alem`. Bir kez yayına çıktıktan sonra **değiştirilemez** — veritabanındaki
`ActivityRequest`, `Tournament`, `UserInterest` satırları bu string'i taşıyor.

Kategori dört enum değerinden biri: `SPORTS`, `SOCIAL`, `ARTS`, `GAMES`.

## Değiştirilecek yerler

Sırayla git; hiçbirini atlama.

### 1. Backend — dal kataloğu

`backend/src/controllers/interest.controller.js` → `SUBCATEGORIES` nesnesi, ilgili kategori
dizisine ekle:

```js
{ id: 'ice_skating', name: 'Ice Skating', emoji: '⛸️' },
```

Bu liste `/api/interests/categories`'i besler; kullanıcı ilgi alanı seçme ekranında buradan
gelen veriyi görür.

### 2. Mobil — dal listesi

`mobile/src/screens/main/CategoryScreen.js` → `SUB_MAP` içindeki ilgili kategori dizisine:

```js
{ id: 'ice_skating', label: 'Ice Skating', labelTR: 'Buz Pateni', emoji: '⛸️' },
```

Özel bir görseli varsa `image: require('../../../assets/xxx.png')` de eklenebilir (padel
böyle yapılmış).

### 3. Mobil — dalı gerçekten aç

Aynı dosyadaki `ENABLED_SUBS` Set'ine id'yi ekle. **Bu adım atlanırsa dal listede kilitli
görünür.** `SUB_MAP`'e eklemek tek başına yetmez.

Dal standart ilan/rakip-bul akışına değil kendi özel ekranına gidecekse (`music`, `cinema`,
`chess` gibi) `SPECIAL_SCREENS` ve `SPECIAL_BADGE_EMOJI` haritalarına da ekle; aksi halde
`SubCategory` ekranına yönlenir ve bu çoğu dal için doğrudur.

### 4. Mobil — okunabilir etiket

`mobile/src/utils/subCategoryLabels.js` → `LABELS`:

```js
ice_skating: { en: 'Ice Skating', tr: 'Buz Pateni' },
```

Bu bildirim metinlerinde ve rezervasyon kartlarındaki dal rozetinde kullanılır. Atlanırsa
kullanıcı arayüzde ham `ice_skating` görür — geçmişte birden çok kez yaşanmış
("dal ekranina girince baslik hep Ingilizce gosteriyordu").

### 5. Web (isteniyorsa)

- `frontend/src/config/features.js` → `ENABLED_SUBS` (nesne; `false` ise kapalı, bilinmeyen
  id'ler varsayılan olarak açık).
- `frontend/src/pages/SelectInterestsPage.jsx` ve `ProfilePage.jsx` içinde **ayrı, kendi**
  `ENABLED_SUBS` Set'leri var — web tarafında dalı açacaksan bunlara da bakman gerekir.

### 6. Tesis/kort eşlemesi (sadece rezerve edilebilen sporlar)

Dal bir tesiste rezerve ediliyorsa `MyReservationsScreen.js`'teki `branchToSub()`
fonksiyonu tesisin `branch` metnini dal id'sine çeviriyor; yeni bir rezerve edilebilir spor
eklerken oraya da bir satır gerekir.

## Doğrulama

Bittiğinde şunları kontrol et:

- Dal, kategori ekranında **kilitsiz** görünüyor mu (`ENABLED_SUBS`).
- Türkçe ve İngilizce'de doğru isimle görünüyor mu (`SUB_MAP` + `LABELS`).
- İlgi alanı seçme ekranında listeleniyor mu (backend `SUBCATEGORIES`).
- Dala girince beklenen ekran mı açılıyor (`SPECIAL_SCREENS` gerekiyor muydu).

## Commit

```
feat: Sporlar kategorisine Buz Pateni dali eklendi
```
