---
name: activity-app
description: AcTiViTy monorepo (backend Express+Prisma, mobile Expo/React Native, frontend React+Vite) üzerinde çalışırken kullanılacak mimari, kod stili, uçtan uca özellik ekleme, test/build/deploy rehberi. Bu skill'i AcTiViTy / activity-app deposunda yapılan HER işte kullan — yeni endpoint veya ekran ekleme, yeni spor/aktivite dalı açma, Prisma şema değişikliği, bildirim veya socket olayı ekleme, i18n metni ekleme, rezervasyon/turnuva/ilan (rival) akışlarına dokunma, hata ayıklama, commit atma, Railway veya EAS'e deploy etme dahil. Kullanıcı "ekran", "endpoint", "controller", "rezervasyon", "turnuva", "ilan", "dal ekle", "expo", "railway", "prisma migration" gibi şeylerden bahsettiğinde de, projeyi açıkça adıyla anmasa bile bu skill'i kullan.
---

# AcTiViTy — proje rehberi

Claude: `CLAUDE.md` + bu skill. Cursor: `.cursor/skills/activity-app` (bu dosyaya pointer) +
`.cursor/rules/*.mdc`. Kullanıcı sohbette yeni komut/kural verirse rule veya skill olarak
depoya yaz; sadece sohbette bırakma.

Bu depo tek bir üründür: spor/sanat/oyun/sosyal aktiviteler için kullanıcıları buluşturan
bir platform. Dört paket var ve **aynı özellik genellikle üçüne birden dokunur** — burada en
sık yapılan hata, backend'e alan eklendikten sonra mobil ve web tarafının unutulmasıdır.

| Paket | Ne | Yığın |
|---|---|---|
| `backend/` | REST API + socket + cron job'lar | Node 20, Express 4, Prisma 5, PostgreSQL, ESM (`"type": "module"`) |
| `mobile/` | Asıl ürün. Kullanıcıların kullandığı uygulama | Expo SDK 54, React Native 0.81, Redux Toolkit, React Navigation 7 |
| `frontend/` | Admin paneli + web sürümü | React 19, Vite, TailwindCSS, react-i18next |
| `shared/` | Boş (sadece README) — kullanma |

Mobil öncelikli düşün. Bir özellik istendiğinde varsayılan hedef `mobile/`'dır; `frontend/`
karşılığı sadece kullanıcı web/admin tarafını da isterse veya ekran zaten web'de varsa yapılır.

**Telefon anında görsün.** Kullanıcı APK’yi (dev client) kullanır; her `mobile/` UI
değişikliğinde Metro tüneli açık olmalı. Komut (CI değişkeni YOK):
`cd mobile && npx expo start --dev-client --tunnel --port 8081`.
Kapalıysa oturumun başında aç, kapatma. EAS Update / git push “anında görme” değildir.
Detay: `references/deploy.md` → Canlı Metro.

**KAZINDI — canlı için her zaman push.** Kullanıcı “push edeyim mi?” istemez. İş bitince
ilgili dosyaları commit et, `git push -u origin HEAD` (`main`). Railway backend’i oradan
alır. `mobile/` UI için ayrıca EAS Update (`canli-metro.mdc`). Sorma. Force-push yok.

## Önce oku, sonra yaz

Bu depoda dosyalar çok büyük ve kalıplar tutarlı. Yeni bir şey yazmadan önce **aynı işi yapan
en yakın mevcut dosyayı oku ve onu taklit et.** Örnek: yeni bir liste ekranı için
`mobile/src/screens/main/MyReservationsScreen.js`, yeni bir CRUD kaynağı için
`backend/src/controllers/equipment.controller.js` + `routes/equipment.routes.js` iyi
şablonlardır. Sıfırdan kendi kalıbını uydurma — kod tabanı kendi içinde tutarlı ve
tutarsızlık burada en pahalı hata türü.

### Dev boyutlu dosyalar — asla tümünü okuma

Bunlar bağlamı tek başına doldurur. `grep`/`Glob` ile ilgili bölümü bul, sadece o aralığı oku:

- `mobile/src/screens/main/SubCategoryScreen.js` — **~16.500 satır.** Bir dalın tüm sekmeleri
  (ilanlar, turnuvalar, ekipman, koçlar, hakemler, arşiv, gönderiler…) burada.
- `frontend/src/pages/SubCategoryPage.jsx` — ~9.700 satır, yukarıdakinin web ikizi.
- `mobile/src/screens/business/BusinessHomeScreen.js` — ~5.000 satır (işletme paneli).
- `mobile/src/screens/main/ProfileScreen.js` — ~4.800 satır.
- `backend/src/controllers/rival.controller.js` — ~3.900 satır (ilan/eşleşme mantığı).
- `backend/prisma/schema.prisma` — ~1.640 satır, 76 model.

## Uçtan uca özellik akışı

Yeni bir alan veya özellik eklerken sıra şudur. Ara adımlardan biri atlanırsa özellik
sessizce yarım kalır — özellikle i18n ve mobil tarafı.

1. **Prisma şeması** — `backend/prisma/schema.prisma`'ya alan/model ekle.
2. **Migration** — `backend/prisma/migrations/<YYYYMMDDHHMMSS>_kisa_ad/migration.sql`
   klasörünü elle oluştur ve SQL'i yaz. Detay: `references/backend.md`.
3. **Controller** — `backend/src/controllers/<kaynak>.controller.js`.
4. **Route** — `backend/src/routes/<kaynak>.routes.js`.
5. **app.js** — yeni bir kaynak dosyası açtıysan `backend/src/app.js`'e import + `app.use('/api/...')` ekle.
6. **Mobil çağrı** — `mobile/src/services/api.js` üzerinden (`api.get/post/patch/delete`).
7. **Mobil ekran** — `mobile/src/screens/...`, gerekiyorsa `mobile/src/navigation/index.js`'e kayıt.
8. **i18n** — `mobile/src/i18n/index.js` içindeki **hem `en` hem `tr`** nesnesine anahtar ekle.
9. **Web karşılığı** (isteniyorsa) — `frontend/src/pages/...` + `frontend/src/locales/{en,tr}.json`.

Bildirim, socket olayı veya cron job da gerekiyorsa `references/backend.md`'ye bak.

Detaylı kalıplar:

- Backend (controller/route/bildirim/socket/job/migration) → `references/backend.md`
- Mobil (ekran/stil/i18n/navigasyon/state) → `references/mobile.md`
- **Alt gezinme çubuğu çakışması ve klavyenin formu kapatması** → `references/ekran-guvenli-alan.md`
  (ekranın altına bir şey sabitliyorsan veya ekranda `TextInput` varsa bu dosyayı oku)
- **İl/ilçe veya kişi adı alanı** → `references/otomatik-tamamlama.md`. Bu alanlar asla düz
  `TextInput` olmaz; yazdıkça daralan öneri listesi zorunlu. Nereye koyarsan koy geçerli.
- Yeni spor veya aktivite dalı açma (en sık tekrarlanan iş) → `references/yeni-dal.md`
- Çalıştırma, build, deploy, hata ayıklama → `references/deploy.md`

## Kod stili

Bu kurallar mevcut koddan çıkarıldı; yeni kod okunduğunda eskisinden ayırt edilememeli.

**Genel**

- 4 boşluk girinti. Tek tırnak. Noktalı virgül var.
- ESM her yerde. Backend'de relatif import'larda **`.js` uzantısı zorunlu** (`'../config/prisma.js'`).
- TypeScript yok, PropTypes yok, test dosyası yok. Öyle bir altyapı varmış gibi davranma.
- **Dokunmadığın satırları değiştirme.** Dosyayı baştan sona yeniden biçimlendirmek, satır
  sonlarını (LF ↔ CRLF) çevirmek veya girintileri toplu düzeltmek tek satırlık bir
  değişikliği yüzlerce satırlık bir diff'e çevirir ve gözden geçirmeyi imkânsız kılar.
  Bittiğinde `git diff --stat` ile değişen satır sayısının yaptığın işle orantılı olduğunu
  doğrula.
- Kısa satırlarda tek satırlık `if (!x) return res.status(400).json(...)` yaygın ve tercih edilir.

**Yorumlar — bu projenin ayırt edici özelliği**

Yorumlar **Türkçe** ve *ne* yaptığını değil **neden** öyle yapıldığını anlatır; genelde
düzeltilen gerçek bir hatayı belgeler. Bir davranış ilk bakışta tuhaf görünüyorsa nedenini
oraya yaz — bu depoda gelecekteki hata ayıklamanın en değerli girdisi bu.

```js
// Sadece tarihe değil, bitiş saatine de bakılmalı — bugünkü ama saati geçmiş bir
// rezervasyon "saat değişikliği talep et" gibi butonları göstermeye devam ediyordu.
const isPast = item.date < today || (item.date === today && ...);
```

Böyle bir neden yoksa yorum yazma. Kendini tekrar eden `// kullanıcıyı getir` tarzı yorumlar
istenmez.

**Kullanıcıya görünen metin — iki dil, istisnasız**

Uygulama Türkçe ve İngilizce çalışıyor ve dil, kullanıcı tarafından anlık değiştirilebiliyor.
Bu yüzden **eklediğin veya değiştirdiğin her kullanıcı metni iki dilde de var olmalı.** Tek
dile ekleme yapmak diğer dilde ham anahtar adının ekranda görünmesi demek — bu depoda
defalarca yaşanmış bir hata ("dal ekranina girince baslik hep Ingilizce gosteriyordu",
"aktivite ekleme listesindeki dal isimleri Türkçe'de de İngilizce görünüyordu").

Pratikte:

- Mobil: `mobile/src/i18n/index.js` içindeki **`en` ve `tr` nesnelerinin ikisine birden**
  anahtarı ekle, sonra `const t = useT()` ile `t.anahtar` kullan.
- Web: `frontend/src/locales/en.json` **ve** `tr.json`.
- Dal/kategori adları: i18n'e değil `subCategoryLabels.js` → `{ en: ..., tr: ... }` ve
  `CategoryScreen.js`'teki `SUB_MAP` → `label` + `labelTR` çiftine.
- Mevcut bir metni değiştiriyorsan diğer dildeki karşılığını da güncelle; sadece Türkçesini
  düzeltip İngilizcesini eski haliyle bırakma.

Mevcut kodda sabit Türkçe string'ler var (`Alert.alert('Hata', 'Talep gönderilemedi')`) —
bunlar borç, kopyalanacak örnek değil. Yeni kodda i18n anahtarı kullan.

İşin sonunda "eklediğim her metin hem `en` hem `tr`'de var mı?" diye tek tek geç. Bu kontrolü
atlama.

Backend hata mesajları ise sabit Türkçe: `res.status(400).json({ message: 'Fiyat zorunludur' })`.
Bu bilinçli, aynen devam et.

**Commit mesajları**

`feat:` veya `fix:` ile başlar, ardından **Türkçe**, kullanıcının gördüğü davranışı anlatan
bir cümle. Dosya adı veya teknik jargon değil, ne değiştiği yazılır. Uzun olabilir.

```
fix: rezervasyon bildirimlerinde aktivite dalı (subCategory) hiç gönderilmiyordu
feat: Sosyal kategorisine Sanal Alem dali eklendi, Dil Degisimi kaldirildi
fix: turnuva olustur formunda belli bir noktadan asagi kaydirilamama sorunu
```

## Dikkat edilecek tuzaklar

**`api.js`'de `validateStatus: () => true`.** Mobil axios örneği hiçbir HTTP durumunu kendi
başına reddetmez; 401 ve 4xx/5xx'i response interceptor'ı `throw` eder. Yani `try/catch`
çalışır ama hata nesnesi `err.response.data.message` üzerinden okunur:
`catch (e) { Alert.alert(t.error, e?.response?.data?.message || t.somethingWrong) }`.
401 geldiğinde token silinip otomatik logout dispatch edilir — ayrıca ele alma.

**Kategori/dal kimlikleri üç yerde birden tanımlı.** `CategoryScreen.js`'teki `SUB_MAP`,
`mobile/src/utils/subCategoryLabels.js`'teki `LABELS` ve backend'deki
`interest.controller.js` listesi senkron olmak zorunda. Biri unutulursa dal ya listede
görünmez ya da bildirimlerde İngilizce id olarak çıkar. Bkz. `references/yeni-dal.md`.

**`ENABLED_SUBS`.** `CategoryScreen.js`'te bir dalın gerçekten açık olup olmadığını bu Set
belirler. `SUB_MAP`'e eklemek yetmez.

**Migration'lar elle yazılır.** `prisma migrate dev` kullanılmıyor; production'da
`prisma db push --accept-data-loss` çalışıyor. Bu yüzden yıkıcı şema değişikliklerinde
(sütun silme/yeniden adlandırma) veri kaybı gerçek bir risk. Detay: `references/backend.md`.

**Frontend build'i Railway'de otomatik değil.** `frontend/` değiştiyse yerelde
`vite build --outDir ../backend/public` çalıştırıp çıktıyı commit'lemek gerekir. Nedeni ve
denenmiş tüm yollar `railway.toml` + `nixpacks.toml` içinde belgeli — orayı okumadan
"otomatikleştireyim" deme.

**Expo sürümü kritik.** `mobile/AGENTS.md` şunu der: Expo değişti, kod yazmadan önce
sürüme özel dokümanı oku. Paket sürümlerini `mobile/package.json`'daki pinlere göre kullan,
tahmin etme.

**Metro tüneli yoksa kullanıcı yeni UI’yı görmez.** APK yereldeki dosyayı kendiliğinden
izlemez. `npx expo start --dev-client --tunnel --port 8081` (CI yok) açık olmalı.

## İş bitince — kontrol listesi

Otomatik test yok, bu yüzden bu liste tek güvenlik ağı:

- [ ] **Her yeni/değişen metin hem `en` hem `tr`'de var mı?** En sık atlanan adım.
- [ ] Formda il/ilçe veya kişi adı alanı var mı? Varsa otomatik tamamlamalı mı
      (`references/otomatik-tamamlama.md`)?
- [ ] Değişiklik mobil tarafında tamamlandı mı; web karşılığı gerekiyor muydu?
- [ ] Ekranın altına bir şey eklediysen `insets.bottom`, forma dokunduysan klavye davranışı
      kontrol edildi mi (`references/ekran-guvenli-alan.md` kontrol listesi)?
- [ ] Şema değiştiyse migration klasörü yazıldı ve `npx prisma generate` çalıştırıldı mı?
- [ ] `backend/`'de değişiklik varsa `cd backend && node --check src/<dosya>.js` temiz mi?
- [ ] Commit mesajı `feat:`/`fix:` + Türkçe, kullanıcının gördüğü davranışı anlatıyor mu?
