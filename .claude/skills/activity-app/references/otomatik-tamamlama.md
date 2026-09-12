# Otomatik tamamlama: il/ilçe ve kişi adı alanları

Bu projede iki tür alan **asla düz `TextInput` olarak bırakılmaz**: konum (il/ilçe) ve kişi
adı (rakip, takım arkadaşı, katılımcı, oyuncu, hakem, partner…). İkisi de veritabanında
kayıtlı; kullanıcı harf yazdıkça eşleşenler öneri olarak çıkmalı, yazdıkça liste daralmalı,
listeden seçebilmeli.

Sebep tek bir kelime: **tutarlılık.** Serbest metin bırakılan her alan veritabanına
"İstanbul", "istanbul", "Istanbul", "İST" gibi dört ayrı kayıt sokar; sonra o ile göre
filtreleme, bildirim gönderme, şehir bazlı ilan eşleştirme çalışmaz. Aynı şey oyuncu için de
geçerli — serbest yazılan isim gerçek kullanıcıya bağlanmaz, o kişiye bildirim gitmez,
puanı/geçmişi güncellenmez.

**Yeni bir yere il/ilçe veya kişi adı alanı koyuyorsan bu dosyadaki bileşenleri kullan.**
Yenisini yazma — hepsi hazır ve davranışları birbiriyle uyumlu olmalı.

## Ortak davranış

Tüm otomatik tamamlama alanları aynı şekilde davranır; yeni bir tane yazmak zorunda
kalırsan bunlara uy:

- **En az 2 karakter** yazılınca arama başlar (`if (text.trim().length < 2) return`).
  Tek harfte arama yapmak her tuşta yüzlerce sonuç çeker, anlamsız.
- **300 ms debounce** — her tuşta istek atma:

  ```js
  const timer = useRef(null);
  clearTimeout(timer.current);
  timer.current = setTimeout(async () => { /* api.get(...) */ }, 300);
  ```

- Sonuç listesi **kısa** tutulur (6–20 satır); backend zaten `take` ile sınırlıyor.
- Arama **büyük/küçük harf duyarsız** (`mode: 'insensitive'`) — backend hallediyor.
- Listeyi saran `ScrollView`/`FlatList`'te **`keyboardShouldPersistTaps="handled"`** şart;
  yoksa klavye açıkken öneriye ilk dokunuş sadece klavyeyi kapatır, seçim yapılmaz.

## İl / ilçe

### Hangi bileşen nerede

| Bileşen | Ne zaman |
|---|---|
| `components/CityAutocomplete.js` | Form içinde satır arası alan. Yazdıkça altında açılan dropdown. İl ve ilçeyi tek alanda arar. |
| `components/CityPickerModal.js` | Butona basınca açılan tam liste. 81 il statik olarak gömülü, arama yapılınca canlı `/cities` sonuçlarına geçer. `provinceOnly` ile sadece il seviyesi. `onNearMe` ile "yakınımdakiler". |
| `components/DistrictPickerModal.js` | İlçe seçimi. **`province` prop'u zorunlu** — ilçeler sadece seçili ilin içinden aranır. |

İl + ilçe birlikte isteniyorsa akış iki aşamalı: önce `CityPickerModal` (`provinceOnly`),
seçilen il `DistrictPickerModal`'a `province` olarak geçilir.

### Veri kaynağı

`GET /api/cities?q=<metin>&province=<il>` — sadece `status: 'APPROVED'` kayıtlar, il ve ilçe
alanlarında `contains` araması, `take: 20`, il→ilçe sıralı.

Veri durumu: 81 il `CityPickerModal` içinde statik liste olarak da var (veritabanı boş
dönerse ona düşülür). İlçeler **eksik** — sabit ve tam bir ilçe veri seti yok, kullanıcıdan
toplanıyor.

### Listede olmayan ilçe — "olarak ekle" akışı

İlçeler eksik olduğu için `DistrictPickerModal` eşleşme yoksa listenin başına şunu koyar:

```
＋ "Çekmeköy" olarak ekle
```

Kullanıcı buna basınca yazdığı metin seçilmiş sayılır; kayıt gönderilirken
`POST /api/cities` ile `status: 'PENDING'` olarak kaydedilir ve admin onayına düşer.
Onaylanınca herkesin aramasında çıkmaya başlar. Yeni bir ilçe alanı eklerken bu akışı da
bağla — yoksa kullanıcı kendi ilçesini hiç seçemez ve form tıkanır.

Aynı mantığın mekan adı sürümü `components/VenueNameAutocomplete.js`'te var
(`/courts/search?verifiedOnly=true`, seçilince il/ilçe/adres otomatik dolar). Konum bilgisi
bir tesisten geliyorsa il/ilçeyi kullanıcıya elle yazdırma, oradan doldur.

## Kişi adı (oyuncu / rakip / takım arkadaşı / katılımcı)

### Veri kaynağı

```js
api.get(`/users/search?q=${encodeURIComponent(q)}&subCategory=${sub}&category=${cat}`)
```

`backend/src/controllers/user.controller.js` → `searchUsers`:

- `q` en az 2 karakter, yoksa boş dizi döner.
- `username` **ve** `fullName` içinde arar — kullanıcı ister kullanıcı adını ister gerçek
  adını yazsın bulsun.
- Karşılıklı engellenmiş kullanıcılar ve kişinin kendisi listeden düşer.
- `take: 10`.
- `subCategory` verirsen o daldaki `skillRating`/`level`/`alias` da gelir — davet listesinde
  seviyeyi göstermek için bunu geç, kullanıcı kimi davet ettiğini görebilsin.

Bir daldaki **tüm** oyuncuları listelemek için (davet ekranındaki "Tüm X'ciler" sekmesi)
`getUsersBySport` var; `q` verilirse baştan eşleşenlerle daralır, boşsa dal içindeki herkes
alfabetik gelir.

Mevcut kullanım örnekleri: `SubCategoryScreen.js` içindeki davet, partner seçme ve "kime
satıldı" akışları; `ProfileScreen.js` kullanıcı arama.

### Kayıtlı olmayan kişi — `manualName`

Aranan kişi uygulamada kayıtlı değilse kullanıcı **serbest isim yazıp devam edebilmeli.**
Şema bunu zaten destekliyor; uydurma bir alan açma, mevcut kalıbı kullan:

| Yer | Alan |
|---|---|
| Turnuva katılımcısı | `TournamentParticipant.manualName` (`userId` null ise dolu) |
| Takım arkadaşı / yedek | `ActivityRequest.senderTeam`, `substitutePlayers` → `[{ manualName }]` |
| Hakem | `ActivityRequest.manualRefereeName` |
| Tesis adisyonu | `VenueBillItem` tarafındaki `manualName` |

Kural: `userId` doluysa gerçek kullanıcıdır — bildirim gider, puanı işlenir. `userId` null +
`manualName` dolu ise sadece görünen bir isimdir. Arayüzde bu ikisini ayırt et (gerçek
kullanıcıya avatar, misafire baş harf rozeti gibi) ki kullanıcı kime bildirim gideceğini
bilsin.

Serbest isim **her yerde geçerli değil**: rakip eşleştirme, puan/derece hesabı ve maç
onayı gerçek kullanıcı gerektirir. Yeni bir alan eklerken "bu kişiye bildirim gitmesi veya
puanının işlenmesi gerekiyor mu?" diye sor — cevap evetse serbest isim seçeneği koyma.

## Web tarafı

`frontend/src/pages/SubCategoryPage.jsx` aynı `/users/search` ve `/cities` uçlarını
kullanıyor. Mobilde bir otomatik tamamlama alanı eklerken web'de aynı form varsa orayı da
güncelle — biri serbest metin kalırsa aynı veri kirliliği oradan girer.

## Kontrol listesi

Yeni bir il/ilçe veya kişi alanı eklediysen:

- [ ] Düz `TextInput` bırakmadın; ilgili hazır bileşeni veya `/users/search` çağrısını kullandın.
- [ ] En az 2 karakter + 300 ms debounce var.
- [ ] Öneri listesini saran kapsayıcıda `keyboardShouldPersistTaps="handled"` var.
- [ ] İlçe alanına `province` prop'u geçildi (ilçeler ile bağlı aranır).
- [ ] İlçe için "＋ olarak ekle" akışı ve `POST /cities` (PENDING) bağlandı.
- [ ] Kişi alanında kayıtlı olmayan biri gerekiyorsa `manualName` kalıbı kullanıldı; gerçek
      kullanıcı ile misafir arayüzde ayırt edilebiliyor.
- [ ] Placeholder ve buton metinleri `t.anahtar` üzerinden, anahtar hem `en` hem `tr`'de.
- [ ] Aynı form web'de de varsa orası da güncellendi.
