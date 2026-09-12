# Backend kalıpları

`backend/` — Express 4 + Prisma 5 + PostgreSQL, saf ESM. Referans olarak
`controllers/equipment.controller.js` (453 satır, tam CRUD + teklif akışı + bildirim +
socket) ve `routes/equipment.routes.js` iyi bir çift; yeni bir kaynak açarken bunları oku.

## Klasör düzeni

```
backend/src/
├── app.js              Express kurulumu, tüm route mount'ları, 404 + hata middleware'i
├── server.js           http + socket.io ayağa kaldırma, cron job kayıtları
├── config/             prisma.js, socket.js, env.js, assessments.js, friendFindingQuestions.js
├── middlewares/        auth.middleware.js (authenticate), admin.middleware.js (requireAdmin)
├── controllers/        iş mantığı — dosya başına bir kaynak
├── routes/             ince router'lar, sadece yol → controller eşlemesi
├── services/           harici entegrasyonlar (şu an sadece friendFindingAi.js)
├── jobs/               node-cron ile çalışan zamanlanmış işler
├── sockets/            gerçek zamanlı oyun mantığı (okey.js, batak.js…)
└── utils/              saf yardımcılar (tennisElo.js, geo.js, privacy.js, priceProration…)
```

## Controller kalıbı

Her handler `async (req, res, next)` ve **hatayı `next(err)`'e devreder** — kendi
`try/catch` bloğunda `res.status(500)` yazma, `app.js`'teki merkezî hata middleware'i
bunu zaten yapıyor.

```js
import prisma from '../config/prisma.js';
import { createNotification } from './notification.controller.js';
import { emitToUser, broadcast } from '../config/socket.js';

// İlişkili kullanıcıyı her yerde aynı alanlarla döndürmek için tek bir select sabiti
const USER_SELECT = { id: true, username: true, fullName: true, avatar: true };

export const createListing = async (req, res, next) => {
    try {
        const { title, price } = req.body;

        // Doğrulama: express-validator kurulu ama controller'larda elle kontrol
        // yapılıyor, mesajlar Türkçe. Aynı şekilde devam et.
        if (!title) return res.status(400).json({ message: 'Zorunlu alanlar eksik' });
        if (!parseInt(price) || parseInt(price) <= 0)
            return res.status(400).json({ message: 'Fiyat zorunludur' });

        const listing = await prisma.equipmentListing.create({
            data: { ...req.body, userId: req.userId },
            include: { user: { select: USER_SELECT } },
        });

        res.status(201).json(listing);
    } catch (err) { next(err); }
};
```

Bilinmesi gerekenler:

- **`req.userId`** — `authenticate` middleware'i JWT'den koyar. `req.user` diye bir şey yok.
- **Gizlilik alan kırpmayla yapılır.** Bir alan sadece sahibine gösterilecekse response
  map'inde `undefined` yap: `soldToUser: l.userId === req.userId ? l.soldToUser : undefined`.
  Ayrıca `utils/privacy.js` içinde kullanıcı profili için hazır yardımcılar var.
- **`select` yerine `include` + sabit `USER_SELECT`** yaygın kalıp; e-posta/telefon gibi
  alanların yanlışlıkla sızmasını bu engelliyor.

## Route kalıbı

Router ince tutulur; iş mantığı yok. Dosyanın başında `router.use(authenticate)` ile tüm
kaynak korunur, açık uçlar varsa onlar bu satırın üstüne yazılır.

```js
import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware.js';
import { requireAdmin } from '../middlewares/admin.middleware.js';
import { getListings, createListing, deleteListing } from '../controllers/equipment.controller.js';

const router = Router();
router.use(authenticate);

router.get('/',            getListings);
router.post('/',           createListing);
router.delete('/:id',      deleteListing);

// Dinamik `/:id` her zaman EN SONA — yoksa '/mine' gibi sabit yollar onun içine düşer
router.get('/:id',         getListing);

export default router;
```

`/:id`'yi sona koymak gerçek bir kural: `equipment.routes.js` ve `venue.routes.js` bilinçli
olarak böyle sıralanmış.

Yeni bir route dosyası açtıysan `app.js`'e iki satır ekle:

```js
import equipmentRoutes from './routes/equipment.routes.js';
app.use('/api/equipment', equipmentRoutes);
```

Yol adları çoğul ve kebab-case: `/api/equipment`, `/api/city-alerts`, `/api/sports-tickets`.

## Bildirim gönderme

`createNotification` hem DB kaydı atar hem Expo push gönderir hem socket'e yayınlar. Tek
çağrı yeterli.

```js
import { createNotification } from './notification.controller.js';

await createNotification(
    targetUserId,
    'RESERVATION',                      // type — mobil navigasyonu bunu okur
    'Rezervasyon onaylandı',            // title
    `${venue.name} — ${date} ${time}`,  // body
    { venueId: venue.id, category: 'SPORTS', subCategory: 'tennis' },  // data
);
```

`data` içeriği kritik: `mobile/src/navigation/index.js` içindeki `navigateFromNotif`
bildirime tıklanınca nereye gidileceğini `type` + `data` alanlarından çözer. Yeni bir
bildirim türü eklerken **oradaki `if/else` zincirine de bir dal ekle**, yoksa bildirime
tıklandığında hiçbir şey olmaz. `category` + `subCategory` gönderirsen genel dal ekranına
düşer — çoğu durumda bu yeterli.

## Socket

```js
import { emitToUser, broadcast } from '../config/socket.js';

emitToUser(userId, 'reservation:updated', { id });   // tek kullanıcı ('user:<id>' odası)
broadcast('rivals:changed', { subCategory });         // herkese
```

Mobil tarafta karşılığı `mobile/src/services/socket.js`'teki `onSocket(event, handler)`.

## Cron job

`jobs/` altında `export async function xxx()` yazılır, `server.js`'te `node-cron` ile
kaydedilir. Tüm gövde `try/catch` içinde olmalı — job'da fırlayan hata süreci düşürebilir.
Örnek: `jobs/cleanupRivals.js`.

## Prisma migration

**`prisma migrate dev` çalıştırma.** Bu depoda migration klasörleri elle yazılıyor ve
production'da (`railway.toml` startCommand) `prisma db push --skip-generate
--accept-data-loss` çalışıyor.

Yeni migration:

```
backend/prisma/migrations/20260802143000_add_venue_rating/migration.sql
```

Klasör adı `<zaman damgası>_<kısa_ingilizce_ad>`. Mevcut klasörlerde iki biçim var
(`20260605043133_...` gerçek zaman damgası ve `20260611000000_...` elle verilmiş) — ikisi de
kabul, ama sıralama bozulmasın diye yeni klasör mutlaka son klasörden büyük olmalı.

SQL doğrudan yazılır:

```sql
-- AlterTable
ALTER TABLE "BusinessVenue" ADD COLUMN "ratingAvg" DOUBLE PRECISION;
```

Sonra `cd backend && npx prisma generate` ile client'ı tazele.

**Yıkıcı değişikliklerde dikkat:** `--accept-data-loss` açık olduğu için şemadan bir sütunu
silmek production verisini sessizce siler. Sütun adı değiştirmek gerekiyorsa yeni sütun ekle
+ veri kopyala + eskiyi ayrı bir adımda kaldır; tek seferde yeniden adlandırma yapma.

## Şema notları

- `CategoryType` enum'u: `SPORTS | SOCIAL | ARTS | GAMES`. Alt dallar (`subCategory`) enum
  değil, serbest string — kimlikleri `yeni-dal.md`'de anlatılan üç listede tanımlı.
- Id'ler `String @id @default(uuid())`.
- 76 model var; yeni model eklemeden önce mevcut bir modele alan eklemekle çözülüp
  çözülmediğine bak — `ActivityRequest` (ilanlar) ve `Tournament` zaten çok esnek.
