# Çalıştırma, build, deploy ve hata ayıklama

## Yerelde çalıştırma

```bash
cd backend  && npm install && npm run dev      # nodemon src/server.js, PORT=5000
cd frontend && npm install && npm run dev      # vite, :5174
cd mobile   && npx expo start --dev-client --tunnel --port 8081
```

## Canlı Metro (kullanıcı her değişikliği telefonda anında görür)

APK bir **dev client**. JS, Expo OTA’dan değil bu makinedeki Metro’dan gelir.
`CI=true` koyma (watch kapanır). Port 8081 zaten Metro ise ikinci kez açma.
Tünel `Tunnel ready` olunca kullanıcı uygulamayı açar; gelmezse salla → Reload.
`git push` / `eas update` bunun yerine geçmez.

`backend/.env` gerekir (`.env.example`'a bak): `DATABASE_URL`, `JWT_SECRET`, `CLIENT_URL`,
Cloudinary / Resend / Twilio anahtarları.

**Mobil, yereldeki backend'e bağlanmaz.** `mobile/src/services/api.js`'te `BASE_URL` sabit
olarak production Railway adresine bakıyor. Yerel API'ye bağlanmak için bu satırı geçici
olarak değiştirmen gerekir — ve **commit'lememeye dikkat et**, bu değişikliğin yanlışlıkla
gitmesi tüm mobil istemcileri kırar.

## Test

Otomatik test yok — test kütüphanesi, test dosyası, `npm test` script'i yok. Doğrulama
elle yapılır. Yapabileceğin en yakın şey:

```bash
cd backend  && node --check src/controllers/x.controller.js   # sözdizimi
cd frontend && npm run lint                                    # eslint (sadece frontend'de var)
```

Backend uçlarını hızlıca denemek için `/health` açık ve kimlik doğrulaması istemez:

```bash
curl https://activity-app-production-f4c2.up.railway.app/health
```

Diğer uçlar `Authorization: Bearer <token>` ister.

## Backend deploy (Railway)

**KAZINDI:** iş bitince sormadan `main`'e pushla. Kullanıcı canlıyı böyle görür.

`main`'e push → Railway otomatik build alır. Gerçekte çalışan komut `railway.toml`
içindeki `[deploy].startCommand`'dır (`nixpacks.toml`'daki `[start]` bloğu **override
edilir**, ikisi elle senkron tutulmalı):

```
cd backend && node_modules/.bin/prisma db push --skip-generate --accept-data-loss && node src/server.js
```

Yani şema değişikliğin her deploy'da `db push` ile uygulanır. `--accept-data-loss` açık
olduğu için şemadan sütun silmek production verisini sorgusuz siler.

## Frontend deploy — otomatik değil

`frontend/` altında bir şey değiştirdiysen build'i **yerelde** alıp çıktıyı commit'lemen
gerekir:

```bash
cd frontend && npx vite build --outDir ../backend/public
```

`backend/public` express tarafından statik servis ediliyor ve git'e commit'li.

Nedeni `railway.toml` ve `nixpacks.toml` başındaki uzun yorumlarda ayrıntısıyla yazılı: dört
ayrı gerçek engel (nixpacks'in `NODE_ENV=production` yüzünden devDependency'leri atlaması,
üretilen Dockerfile'ın son `COPY . /app` ile build çıktısını ezmesi, vite@8/rolldown'ın o
nixpkgs anlık görüntüsündeki Node 20.6'da hiç çalışmaması, ardından rolldown'ın native
binding'inin `MODULE_NOT_FOUND` vermesi) üst üste çıktı. Bunu otomatikleştirmeye
girişmeden önce o yorumları oku — çözüm ya rolldown'ın native binding'ini eşleşen hedefe
derlemek ya da rolldown kullanmayan bir vite sürümüne inmek, tahminle çözülmüyor.

## Mobil deploy (Expo / EAS)

`mobile/**` altında bir değişiklik `main`'e push edilince `.github/workflows/eas-update.yml`
otomatik olarak `development` ve `preview` kanallarına OTA update yayınlar. Commit mesajı
update mesajı olarak kullanılır — bu yüzden mesajın anlamlı olması ayrıca önemli.

Kanallar (`mobile/eas.json`):

| Profil | Dağıtım | Kanal |
|---|---|---|
| `development` | internal, dev client | `development` |
| `preview` | internal, Android APK | `development` |
| `production` | app bundle | `production` |

`preview` profilinin `development` kanalına bağlı olması bilinçli; geçmişte iki kez
yanlışlıkla değiştirilip geri alınmış ("eas.json preview build profili yanlışlıkla
development kanalına bağlanmıştı" / "preview build profili tekrar development kanalina
baglandi"). Dokunmadan önce sor.

Native bağımlılık ekleyen değişiklikler OTA ile gitmez, yeni build gerekir:
`npx eas-cli build --profile preview --platform android`.

## Hata ayıklama ipuçları

**Push bildirimi gelmiyor.** `notification.controller.js` içindeki `sendPush` token
`ExponentPushToken` ile başlamıyorsa sessizce çıkar ve `[push] invalid token:` yazar.
Railway loglarında `[push]` öneklerini ara.

**Bildirime tıklanınca hiçbir şey olmuyor.** Backend'in gönderdiği `type` için
`mobile/src/navigation/index.js` → `navigateFromNotif` içinde bir dal yoktur.

**Resimler yüklenmiyor.** `app.js`'teki helmet CSP'sinde `img-src` ayarı Cloudinary için
genişletilmiş durumda; helmet ayarlarına dokunduysan oraya bak. Belirtisi sadece network
sekmesinde görünür, hata mesajı çıkmaz.

**Mobilde istek hata veriyor ama catch'e düşmüyor.** `validateStatus: () => true` yüzünden
axios reddetmiyor; hatayı interceptor fırlatıyor. Mesaj `e.response.data.message`'ta.

**Dal listede yok / İngilizce görünüyor.** `references/yeni-dal.md` — muhtemelen üç
listeden biri güncellenmemiş.
