import prisma from '../config/prisma.js';
import { createNotification } from './notification.controller.js';
import { emitToUser } from '../config/socket.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────
export const toMins = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
export const toTime = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
export const overlaps = (as, ae, bs, be) => as < be && ae > bs;

// Türkiye saatiyle "şu an" — tarih (YYYY-MM-DD) ve gün içi dakika olarak.
function nowIstanbul() {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(new Date());
    const get = type => parts.find(p => p.type === type)?.value;
    return { dateStr: `${get('year')}-${get('month')}-${get('day')}`, mins: Number(get('hour')) * 60 + Number(get('minute')) };
}

// date/startTime geçmişte mi? (Türkiye saati baz alınır)
export function isPastDateTime(date, startTime) {
    const { dateStr: today, mins: nowMins } = nowIstanbul();
    if (date < today) return true;
    if (date > today) return false;
    return toMins(startTime) < nowMins;
}

// Tesisin onay moduna ve ödeme yöntemine göre bir rezervasyonun başlangıç durumunu belirler.
// Hem yeni rezervasyon oluştururken hem de (politika dahilinde) saat değiştirirken kullanılır —
// FULL_AUTO'da (Tümünü Otomatik Onayla) ikisi de doğrudan CONFIRMED olmalı, işletmeci tekrar
// elle onaylamak zorunda kalmamalı.
export function computeReservationStatus(court, venue, paymentMethod) {
    const effectiveMode = court?.approvalMode || venue?.approvalMode || 'FULL_AUTO';
    const pm = paymentMethod || 'CASH';
    if (effectiveMode === 'FULL_AUTO') return 'CONFIRMED';
    if (effectiveMode === 'EFT_TIMED') return pm === 'EFT' ? 'PENDING' : 'CONFIRMED';
    if (effectiveMode === 'PAYMENT_AUTO') return ['CASH', 'ONLINE', 'CREDIT_CARD'].includes(pm) ? 'CONFIRMED' : 'PENDING';
    return 'PENDING'; // MANUAL
}

async function autoConfirmPastCash(venueId) {
    const now = new Date();
    const pending = await prisma.courtReservation.findMany({
        where: { venueId, status: 'PENDING', paymentMethod: 'CASH' },
    });
    const toConfirm = pending.filter(r => {
        const resStart = new Date(`${r.date}T${r.startTime}:00`);
        return (now - resStart) / 3600000 >= 4;
    });
    if (toConfirm.length > 0) {
        await prisma.courtReservation.updateMany({
            where: { id: { in: toConfirm.map(r => r.id) } },
            data: { status: 'CONFIRMED' },
        });
    }
}

// Gece yarısını geçen pencereleri (ör: 16:00–04:00) gece yarısında ikiye böler
function splitOvernight(windows) {
    const result = [];
    for (const w of windows) {
        const open  = toMins(w.from);
        const close = toMins(w.to);
        if (close < open) {
            // 16:00→1440(24:00) + 00:00→close
            if (open < 1440)  result.push({ from: w.from,  to: '24:00' });
            if (close > 0)    result.push({ from: '00:00', to: w.to });
        } else {
            result.push(w);
        }
    }
    return result.length > 0 ? result : [{ from: '00:00', to: '24:00' }];
}

// Bakım kaydı normalizer — eski { from, to } formatını ve yeni { fromDate, toDate, fromTime?, toTime? } formatını destekler
const normMaint = m => ({
    fromDate: m.fromDate || m.from || null,
    toDate:   m.toDate   || m.to   || null,
    fromTime: m.fromTime || null,
    toTime:   m.toTime   || null,
});

// openSlots format: { "0":[global şablon], "1":[Pzt override], "courtId_1":[Pzt+Kort override] }
// Öncelik: kort+gün > gün > global şablon('0') > tesis varsayılanı
// Kapalı: ilgili key = [] (boş dizi)
function getOpenWindows(venue, date, courtId = null, keepOvernight = false) {
    const os = venue.openSlots;
    let raw;
    if (os && !Array.isArray(os) && typeof os === 'object') {
        const dow = new Date(date + 'T12:00:00').getDay();
        const key = String(dow === 0 ? 7 : dow);
        const courtDayKey = courtId ? `${courtId}_${key}` : null;

        let entry;
        if (courtDayKey && os[courtDayKey] !== undefined) entry = os[courtDayKey];
        else if (os[key] !== undefined)                   entry = os[key];
        else if (os['0'] !== undefined)                   entry = os['0'];

        if (entry !== undefined) {
            if (Array.isArray(entry) && entry.length === 0) return []; // Kapalı
            raw = (Array.isArray(entry) && entry.length > 0) ? entry : [{ from: venue.openTime, to: venue.closeTime }];
        } else {
            raw = [{ from: venue.openTime, to: venue.closeTime }];
        }
    } else if (Array.isArray(os) && os.length > 0) {
        raw = os;
    } else {
        raw = [{ from: venue.openTime, to: venue.closeTime }];
    }
    // keepOvernight: VAR_DURATION pencereleri için — gece yarısını geçen bir pencereyi
    // (ör. 17:00–01:00) 00:00'da ikiye BÖLMEDEN, "to" değerini 1440'ın üzerine taşıyarak
    // (ör. "25:00" = ertesi gün 01:00) TEK pencere olarak döner; böylece kullanıcı esnek
    // saat seçiminde tüm aralığı tek "17:00–01:00" bloğu olarak görür ve seçebilir.
    if (keepOvernight) {
        return raw
            .map(w => {
                const open = toMins(w.from);
                let close = toMins(w.to);
                if (close <= open) close += 1440;
                return { from: w.from, to: toTime(close) };
            })
            .sort((a, b) => toMins(a.from) - toMins(b.from));
    }
    // Gece yarısını geçen pencereler bölündükten sonra başlangıç saatine göre sırala — böylece
    // ör. 23:00–01:00 gibi bir pencerenin 00:00–01:00 parçası, takvimde günün EN BAŞINDA
    // (06:00, 16:00 gibi diğer pencerelerden önce) gösterilir; sondaki 23:00–24:00'ten sonra değil.
    return splitOvernight(raw).sort((a, b) => toMins(a.from) - toMins(b.from));
}

// reservationOpenDaysBefore=N ise, `date` günü için rezervasyon, o günden (N-1) gün önce
// reservationOpenTime saatinde (yoksa 00:00) açılır. Örn. N=3, hedef Salı → açılış Pazar 00:00.
// N ayarlanmamışsa (null) sınırsız — her zaman açık, null döner.
export function getReservationOpensAt(venue, date) {
    if (!venue.reservationOpenDaysBefore) return null;
    // Tarih-only aritmetik: takvim günü hesaplaması saat dilimi kaymasından etkilenmesin diye
    // önce saf UTC takvim tarihi üzerinde çıkarma yapılır, +03:00 sadece sonuçta eklenir.
    const [y, m, d] = date.split('-').map(Number);
    const target = new Date(Date.UTC(y, m - 1, d));
    target.setUTCDate(target.getUTCDate() - (venue.reservationOpenDaysBefore - 1));
    const oy = target.getUTCFullYear();
    const om = String(target.getUTCMonth() + 1).padStart(2, '0');
    const od = String(target.getUTCDate()).padStart(2, '0');
    const time = venue.reservationOpenTime || '00:00';
    return new Date(`${oy}-${om}-${od}T${time}:00+03:00`);
}

// Öncelik: kort+saat aralığı > tüm kurtlar saat aralığı > kort varsayılanı > tesis varsayılanı
// Fiyat penceresi gece yarısını geçebilir (ör. 20:00–05:00) — bu durumda "to" sayıca
// "from"dan küçük/eşit olur, normal aralık karşılaştırması hiç eşleşmez.
const inPriceWindow = (sm, from, to) => {
    const f = toMins(from), t = toMins(to);
    if (t <= f) return sm >= f || sm < t;
    return sm >= f && sm < t;
};

// Uygulanacak saat aralığı kuralını (varsa) bulur — fiyat VE o kurala özel
// ödeme yöntemi farkları (paymentDeltas) birlikte döner, ikisi de aynı kuraldan gelir.
function resolvePriceRule(venue, court, startTime) {
    const sm = toMins(startTime);
    const pw = venue.pricingWindows;
    let basePrice, paymentDeltas = null;
    if (Array.isArray(pw) && pw.length > 0) {
        const cw = pw.find(w => w.courtId === court?.id && inPriceWindow(sm, w.from, w.to));
        if (cw) { basePrice = cw.price; paymentDeltas = cw.paymentDeltas || null; }
        else {
            const vw = pw.find(w => !w.courtId && inPriceWindow(sm, w.from, w.to));
            if (vw) { basePrice = vw.price; paymentDeltas = vw.paymentDeltas || null; }
        }
    }
    if (basePrice == null) basePrice = court?.pricePerSlot ?? venue.pricePerSlot ?? 0;
    return { basePrice, paymentDeltas };
}

// Bir [rangeStartMins, rangeEndMins) aralığını, işletmecinin pricingWindows'ta belirlediği
// (slot ızgarasıyla hizalı olmak zorunda olmayan — ör. gün batımına göre 20:30) fiyat
// sınırlarına göre alt parçalara böler. Her parça kendi resolvePriceRule sonucunu taşır —
// böylece bir fiyat sınırının ortasına düşen rezervasyonlar (ör. 20:00-21:00, sınır 20:30)
// tek bir uçtaki fiyattan değil, süre ağırlıklı gerçek karışım fiyatından hesaplanır.
function splitPriceSegments(venue, court, rangeStartMins, rangeEndMins) {
    const pw = Array.isArray(venue.pricingWindows) ? venue.pricingWindows : [];
    const points = new Set([rangeStartMins, rangeEndMins]);
    for (const w of pw) {
        if (w.courtId && w.courtId !== court?.id) continue; // sadece bu kort veya tesis geneli kural
        for (const raw of [toMins(w.from), toMins(w.to)]) {
            if (raw > rangeStartMins && raw < rangeEndMins) points.add(raw);
        }
    }
    const sorted = [...points].sort((a, b) => a - b);
    const segments = [];
    for (let i = 0; i < sorted.length - 1; i++) {
        const segStart = sorted[i], segEnd = sorted[i + 1];
        if (segEnd <= segStart) continue;
        const { basePrice, paymentDeltas } = resolvePriceRule(venue, court, toTime(segStart));
        segments.push({ startMins: segStart, endMins: segEnd, basePrice, paymentDeltas });
    }
    return segments;
}

function getSlotPrice(venue, court, startTime, durationMins = 60) {
    const segs = splitPriceSegments(venue, court, toMins(startTime), toMins(startTime) + durationMins);
    const total = segs.reduce((sum, seg) => sum + seg.basePrice * ((seg.endMins - seg.startMins) / 60), 0);
    return Math.round(total);
}

const PAYMENT_METHODS = ['CASH', 'EFT', 'ONLINE', 'CREDIT_CARD'];

// paymentDeltas[method] o yöntemle ödendiğinde saat başı geçerli olacak NİHAİ fiyattır
// (kuralın taban fiyatına eklenen bir fark değil) — boşsa taban fiyat (basePricePerHour) kullanılır.
function resolveMethodRate(basePricePerHour, paymentDeltas, method) {
    const raw = paymentDeltas?.[method];
    return (raw != null && !isNaN(parseInt(raw))) ? Math.max(0, parseInt(raw)) : basePricePerHour;
}

// Tek bir ödeme yöntemi için, fiyat sınırlarına bölünerek hesaplanmış nihai tutar.
function getMethodPrice(venue, court, startTime, durationMins, method) {
    const segs = splitPriceSegments(venue, court, toMins(startTime), toMins(startTime) + durationMins);
    const total = segs.reduce((sum, seg) => sum + resolveMethodRate(seg.basePrice, seg.paymentDeltas, method) * ((seg.endMins - seg.startMins) / 60), 0);
    return Math.round(total);
}

function buildPriceByMethod(venue, court, startTime, durationMins = 60) {
    const out = {};
    for (const m of PAYMENT_METHODS) out[m] = getMethodPrice(venue, court, startTime, durationMins, m);
    return out;
}

function computeSlots(venue, reservations, date, courtId = null, maintWindows = []) {
    const openWindows = getOpenWindows(venue, date, courtId);

    // Bugünse, geçmişte kalan saatler seçilemesin diye "şu an"ı dakika cinsinden al.
    const { dateStr: todayStr, mins: nowMins } = nowIstanbul();
    const isToday = date === todayStr;
    const isPastMin = t => isToday && t < nowMins;

    const taken = [];
    for (const r of reservations.filter(r => r.date === date && r.status !== 'CANCELLED')) {
        const s = toMins(r.startTime), e = toMins(r.endTime);
        if (e < s) { taken.push({ s, e: 1440, status: r.status }); taken.push({ s: 0, e, status: r.status }); }
        else taken.push({ s, e, status: r.status });
    }
    taken.sort((a, b) => a.s - b.s);

    const isFree     = (s, e) => !taken.some(r => overlaps(s, e, r.s, r.e));
    const isMaint    = (s, e) => maintWindows.some(m => overlaps(s, e, m.s, m.e));
    const slotStatus = (s, e) => taken.find(r => overlaps(s, e, r.s, r.e))?.status;

    if (venue.slotType === 'FULL_HOUR') {
        const slots = [];
        for (const w of openWindows) {
            const open = toMins(w.from), close = toMins(w.to);
            for (let t = open; t + 60 <= close; t += 60) {
                const remaining = close - (t + 60);
                if (remaining > 0 && remaining < 60) continue; // kapanışta kullanılamaz boşluk bırakır
                const maint = isMaint(t, t + 60);
                const past  = isPastMin(t);
                const free  = !maint && !past && isFree(t, t + 60);
                slots.push({ start: toTime(t), end: toTime(t + 60), free, ...(maint ? { maintenance: true } : {}), ...(past ? { past: true } : {}), ...(!free && !maint && !past ? { status: slotStatus(t, t + 60) } : {}) });
            }
        }
        return { type: 'FULL_HOUR', slots };
    }

    if (venue.slotType === 'HALF_HOUR') {
        const slots = [];
        // Gece yarısını geçen pencereler (ör. 08:00–01:00) burada TEK parça olarak, "to"
        // 1440'ın üzerine taşınmış halde gelir (keepOvernight) — splitOvernight'ın çıktısını
        // sonradan "bir sonraki pencere 00:00'dan mı başlıyor" diye tahmin etmeye çalışmak
        // (eski yaklaşım) yanlıştı: pencereler from'a göre sıralandığı için 00:00 parçası
        // dizinin BAŞINA düşüyor, ardışık (wi+1) değil — bu yüzden kapanışa yakın slotlar
        // (ör. 22:30–23:30, 23:30–00:30) hiç üretilmiyordu.
        const hhWindows = getOpenWindows(venue, date, courtId, true);
        for (const w of hhWindows) {
            let open = toMins(w.from);
            const close = toMins(w.to); // gece yarısını geçiyorsa >1440 olabilir
            // Buçuklu saat: slotlar her zaman :30 dakikasında başlar
            if (open % 60 !== 30) { open = Math.floor(open / 60) * 60 + 30; if (open < toMins(w.from)) open += 60; }
            for (let t = open; t + 60 <= close; t += 60) {
                const endT = t + 60;
                const rem = close - endT;
                if (rem > 0 && rem < 60) continue; // kapanışta kullanılamaz boşluk bırakır
                const midnight = endT > 1440;
                const s = t, e = midnight ? endT - 1440 : endT;
                const maint = midnight ? (isMaint(s, 1440) || isMaint(0, e)) : isMaint(s, e);
                const past  = isPastMin(s);
                const free  = !maint && !past && (midnight ? (isFree(s, 1440) && isFree(0, e)) : isFree(s, e));
                const st    = !free && !maint && !past ? (midnight ? (slotStatus(s, 1440) || slotStatus(0, e)) : slotStatus(s, e)) : undefined;
                slots.push({ start: toTime(s), end: toTime(e), free, ...(maint ? { maintenance: true } : {}), ...(past ? { past: true } : {}), ...(!free && !maint && !past ? { status: st } : {}) });
            }
        }
        return { type: 'HALF_HOUR', slots };
    }

    if (venue.slotType === 'NINETY_MIN') {
        const slots = [];
        for (const w of openWindows) {
            const open = toMins(w.from), close = toMins(w.to);
            for (let t = open; t + 90 <= close; t += 120) {
                const remaining = close - (t + 90);
                if (remaining > 0 && remaining < 90) continue; // kapanışta kullanılamaz boşluk bırakır
                const maint = isMaint(t, t + 90);
                const past  = isPastMin(t);
                const free  = !maint && !past && isFree(t, t + 90);
                slots.push({ start: toTime(t), end: toTime(t + 90), free, ...(maint ? { maintenance: true } : {}), ...(past ? { past: true } : {}), ...(!free && !maint && !past ? { status: slotStatus(t, t + 90) } : {}) });
            }
        }
        return { type: 'NINETY_MIN', slots };
    }

    // VAR_DURATION ve FLEXIBLE için bakım pencereleri alınan zaman gibi davranır
    const allTaken = [...taken, ...maintWindows].sort((a, b) => a.s - b.s);

    if (venue.slotType === 'VAR_DURATION') {
        // Esnek saatte gece yarısını geçen pencere (ör. 17:00–01:00) BÖLÜNMEDEN tek blok
        // olarak gelir (keepOvernight) — "to" 1440'ı geçebilir (ör. "25:00" = ertesi 01:00).
        const varWindows = getOpenWindows(venue, date, courtId, true);
        const windows = [];
        for (const w of varWindows) {
            const open = toMins(w.from);
            const close = toMins(w.to); // >1440 olabilir
            const overnight = close > 1440;
            // Gece yarısını geçen pencerede, 00:00 sonrasına düşen alınan/bakım kayıtları da
            // aynı sürekli sayı uzayına (+1440) taşınır ki köprüleme doğru karşılaştırılsın.
            const wTaken = allTaken
                .map(r => (overnight && r.s < open ? { ...r, s: r.s + 1440, e: r.e + 1440 } : r))
                .filter(r => r.s < close && r.e > open)
                .sort((a, b) => a.s - b.s);
            let prev = isToday ? Math.max(open, nowMins) : open;
            for (const r of wTaken) {
                if (r.s > prev && r.s - prev >= 60)
                    windows.push({ start: toTime(prev % 1440), end: toTime(r.s % 1440), durationMins: r.s - prev });
                prev = Math.max(prev, r.e);
            }
            if (prev < close && close - prev >= 60)
                windows.push({ start: toTime(prev % 1440), end: toTime(close % 1440), durationMins: close - prev });
        }
        return {
            type: 'VAR_DURATION',
            windows,
            taken: taken.map(r => ({ start: toTime(r.s), end: toTime(r.e), status: r.status })),
        };
    }

    // FLEXIBLE
    const windows = [];
    for (const w of openWindows) {
        const open = toMins(w.from), close = toMins(w.to);
        const wTaken = allTaken.filter(r => r.s < close && r.e > open).sort((a, b) => a.s - b.s);
        let prev = isToday ? Math.max(open, nowMins) : open;
        for (const r of wTaken) {
            if (r.s > prev) windows.push({ start: toTime(prev), end: toTime(r.s), durationMins: r.s - prev });
            prev = Math.max(prev, r.e);
        }
        if (prev < close) windows.push({ start: toTime(prev), end: toTime(close), durationMins: close - prev });
    }
    return {
        type: 'FLEXIBLE',
        windows: windows.filter(w => w.durationMins >= 60),
        taken: taken.map(r => ({ start: toTime(r.s), end: toTime(r.e), status: r.status })),
    };
}

// ─── İşletme sahibi ───────────────────────────────────────────────────────────

const VENUE_ALLOWED_PACKAGES = ['RAHATLATICI', 'PRO', 'PREMIUM'];

export const createVenue = async (req, res, next) => {
    try {
        const { name, branch, city, district, address, phone, openTime, closeTime, openDays, slotType, pricePerSlot, courts } = req.body;

        const now = new Date();
        const sub = await prisma.businessSubscription.findFirst({
            where: { userId: req.userId, status: 'ACTIVE', endDate: { gt: now } },
        });
        console.log('[createVenue] userId:', req.userId, 'sub:', sub?.packageType ?? 'YOK', 'branch:', branch);
        if (!sub) return res.status(403).json({ message: 'Tesis eklemek için aktif abonelik gerekli' });
        if (!VENUE_ALLOWED_PACKAGES.includes(sub.packageType))
            return res.status(403).json({ message: 'Tesis eklemek için en az Rahatlatıcı paket gereklidir' });

        const PACKAGE_LIMITS = { RAHATLATICI: { venues: 1, courts: 3 }, PRO: { venues: 2, courts: 8 }, PREMIUM: { venues: 3, courts: 15 } };
        const limit = PACKAGE_LIMITS[sub.packageType];
        if (limit) {
            const venueCount = await prisma.businessVenue.count({ where: { userId: req.userId } });
            console.log('[createVenue] venueCount:', venueCount, 'limit.venues:', limit.venues);
            if (venueCount >= limit.venues)
                return res.status(403).json({ message: `${sub.packageType === 'PRO' ? 'Pro' : sub.packageType === 'PREMIUM' ? 'Premium' : 'Rahatlatıcı'} pakette en fazla ${limit.venues} tesis ekleyebilirsiniz.` });
            if (limit.courts !== null) {
                const existingCourts = await prisma.venueCourt.count({ where: { venue: { userId: req.userId } } });
                const newCourts = courts?.length || 0;
                console.log('[createVenue] existingCourts:', existingCourts, 'newCourts:', newCourts, 'limit.courts:', limit.courts);
                if (existingCourts + newCourts > limit.courts)
                    return res.status(403).json({ message: `${sub.packageType === 'PRO' ? 'Pro' : 'Premium'} pakette toplam en fazla ${limit.courts} kort ekleyebilirsiniz. Mevcut: ${existingCourts}` });
            }
        }

        const VALID_BRANCHES = ['football','tennis','padel','basketball','volleyball','badminton','swimming','boxing','martial_arts','wellness','cycling','running',
            'table_tennis','climbing','archery','walking','foot_tennis','sup_kano','handball','shooting_hunting','equestrian','golf',
            'fitness_gym','skiing_snowboard','ice_skating','hiking','camping','motorcycle','extreme_sports','paintball','airsoft'];
        if (!name || !branch || !city) return res.status(400).json({ message: 'İsim, spor dalı ve şehir zorunludur' });
        if (!VALID_BRANCHES.includes(branch)) return res.status(400).json({ message: 'Geçersiz spor dalı. Lütfen listeden seçin.' });
        if (!courts?.length) return res.status(400).json({ message: 'En az bir kort/saha girmelisiniz' });

        const venue = await prisma.businessVenue.create({
            data: {
                userId: req.userId, name, branch, city,
                district: district || null,
                address: address || null,
                phone: phone || null,
                openTime: openTime || '08:00',
                closeTime: closeTime || '22:00',
                openDays: openDays ?? [1, 2, 3, 4, 5, 6, 7],
                slotType: slotType || 'FULL_HOUR',
                pricePerSlot: pricePerSlot ? parseInt(pricePerSlot) : 0,
                courts: { create: courts.map(c => ({ name: c })) },
            },
            include: { courts: true },
        });

        res.status(201).json({ venue });

        prisma.user.findMany({ where: { isAdmin: true }, select: { id: true } }).then(async admins => {
            const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { username: true, businessName: true } });
            await Promise.all(admins.map(a =>
                createNotification(a.id, 'VENUE_REQUEST', '🏟️ Yeni Tesis Başvurusu',
                    `${user?.businessName || user?.username} tarafından "${name}" tesisi eklendi. Onay bekliyor.`,
                    { venueId: venue.id }
                ).then(() => emitToUser(a.id, 'notification', {})).catch(() => {})
            ));
        }).catch(() => {});
    } catch (error) { next(error); }
};

export const getMyVenues = async (req, res, next) => {
    try {
        const venues = await prisma.businessVenue.findMany({
            where: { userId: req.userId },
            include: { courts: { orderBy: { name: 'asc' } } },
            orderBy: { createdAt: 'desc' },
        });
        res.json(venues);
    } catch (error) { next(error); }
};

export const deleteVenue = async (req, res, next) => {
    try {
        const { id } = req.params;
        const venue = await prisma.businessVenue.findUnique({ where: { id } });
        if (!venue || venue.userId !== req.userId) return res.status(404).json({ message: 'Bulunamadı' });
        await prisma.businessVenue.delete({ where: { id } });
        res.json({ message: 'Silindi' });
    } catch (error) { next(error); }
};

export const updateIban = async (req, res, next) => {
    try {
        const { businessIban, businessIbanHolder } = req.body;
        const user = await prisma.user.findUnique({ where: { id: req.userId } });
        if (!user?.isBusiness) return res.status(403).json({ message: 'Yalnızca işletme hesapları' });
        const updated = await prisma.user.update({
            where: { id: req.userId },
            data: { businessIban, businessIbanHolder: businessIbanHolder || null },
        });
        res.json({ businessIban: updated.businessIban, businessIbanHolder: updated.businessIbanHolder });
    } catch (error) { next(error); }
};

// ─── Slot hesaplama ve rezervasyon ────────────────────────────────────────────

export const getVenueSlots = async (req, res, next) => {
    try {
        const { id, courtId } = req.params;
        const { date, excludeReservationId } = req.query;
        if (!date) return res.status(400).json({ message: 'date parametresi gerekli (YYYY-MM-DD)' });

        const [venue, court] = await Promise.all([
            prisma.businessVenue.findUnique({ where: { id } }),
            prisma.venueCourt.findUnique({ where: { id: courtId } }),
        ]);
        if (!venue || venue.status !== 'APPROVED') return res.status(404).json({ message: 'Tesis bulunamadı' });

        // Rezervasyon açılış penceresi kontrolü
        const opensAt = getReservationOpensAt(venue, date);
        if (opensAt && new Date() < opensAt) {
            return res.json({ type: 'NOT_YET_OPEN', opensAt: opensAt.toISOString(), message: 'Bu tarih için rezervasyonlar henüz açılmadı.' });
        }

        // Bakım kontrolü
        const maintDates = (Array.isArray(court?.maintenanceDates) ? court.maintenanceDates : []).map(normMaint);
        const fullDayMaint = maintDates.some(m => m.fromDate && m.toDate && date >= m.fromDate && date <= m.toDate && !m.fromTime && !m.toTime);
        if (fullDayMaint) return res.json({ type: 'MAINTENANCE', message: 'Bu kort seçilen tarihte bakım sürecinde. Rezervasyon yapılamaz.' });
        const maintWindows = maintDates
            .filter(m => m.fromDate && m.toDate && date >= m.fromDate && date <= m.toDate && m.fromTime && m.toTime)
            .map(m => ({ s: toMins(m.fromTime), e: toMins(m.toTime) }));

        // Değiştir (reschedule) akışında: kullanıcı kendi rezervasyonunun saatlerini tekrar
        // görüp seçebilsin diye, o rezervasyon (sadece kendisine aitse) "dolu" listesinden
        // hariç tutulur — gerçek çakışma/politika kontrolü zaten reschedule endpoint'inde ayrıca yapılıyor.
        let excludeId = null;
        if (excludeReservationId) {
            const excludeRes = await prisma.courtReservation.findUnique({ where: { id: excludeReservationId } });
            if (excludeRes && excludeRes.userId === req.userId) excludeId = excludeReservationId;
        }
        const reservations = await prisma.courtReservation.findMany({
            where: { venueId: id, courtId, ...(excludeId ? { NOT: { id: excludeId } } : {}) },
        });

        const VALID_SLOT_TYPES = ['FULL_HOUR', 'HALF_HOUR', 'NINETY_MIN', 'VAR_DURATION'];
        const courtSlotType = VALID_SLOT_TYPES.includes(court?.slotType) ? court.slotType : null;
        // VAR_DURATION tesis düzeyinden miras alınmaz — sadece kortun kendisi VAR_DURATION ise geçerli
        const venueSlotFallback = venue.slotType === 'VAR_DURATION' ? 'FULL_HOUR' : (venue.slotType || 'FULL_HOUR');
        const effectiveVenue = { ...venue, slotType: courtSlotType || venueSlotFallback };
        const slotsResult = computeSlots(effectiveVenue, reservations, date, courtId, maintWindows);
        const addSlotPrice = arr => (arr || []).map(s => {
            // Gece yarısını geçen slotlarda (ör. 23:30 başlayıp 00:30 biten) end < start olur —
            // düzeltilmezse süre negatif çıkar ve fiyat da negatife düşüp "ücretsiz" görünür.
            const dur = s.start && s.end
                ? (() => { const d = toMins(s.end) - toMins(s.start); return d > 0 ? d : d + 1440; })()
                : 60;
            return { ...s, price: getSlotPrice(venue, court, s.start, dur), priceByMethod: buildPriceByMethod(venue, court, s.start, dur) };
        });
        // VAR_DURATION pencereleri için: pencere başındaki saatlik baz fiyat (basit gösterim/
        // geriye dönük uyumluluk) YANINDA, pencere içindeki fiyat sınırlarına göre bölünmüş
        // priceSegments de döner — frontend seçtiği [başlangıç, süre) aralığını bu segmentlere
        // göre ağırlıklı toplayarak hesaplar, tek bir uçtaki fiyattan hesaplamaz.
        const addWindowPrice = arr => (arr || []).map(s => {
            const { basePrice, paymentDeltas } = resolvePriceRule(venue, court, s.start);
            const segs = splitPriceSegments(venue, court, toMins(s.start), toMins(s.end));
            const priceSegments = segs.map(seg => {
                const pricePerHourByMethod = {};
                for (const m of PAYMENT_METHODS) pricePerHourByMethod[m] = resolveMethodRate(seg.basePrice, seg.paymentDeltas, m);
                return { from: toTime(seg.startMins), to: toTime(seg.endMins), pricePerHour: seg.basePrice, pricePerHourByMethod };
            });
            return { ...s, pricePerHour: basePrice, pricePerHourByMethod: buildPriceByMethod(venue, court, s.start, 60), priceSegments };
        });
        const resultWithPrice = slotsResult.slots
            ? { ...slotsResult, slots: addSlotPrice(slotsResult.slots) }
            : { ...slotsResult, windows: addWindowPrice(slotsResult.windows) };
        const accepted = Array.isArray(venue.acceptedPayments) ? venue.acceptedPayments : ['CASH', 'EFT'];
        res.json({ ...resultWithPrice, acceptedPayments: accepted });
    } catch (error) { next(error); }
};

export const updateCourtSettings = async (req, res, next) => {
    try {
        const { id, courtId } = req.params;
        const { slotType, surface, indoor, lightsFrom, pricePerSlot, maintenanceDates, approvalMode } = req.body;
        const VALID_TYPES    = ['FULL_HOUR', 'HALF_HOUR', 'VAR_DURATION'];
        const VALID_SURFACES = ['CLAY', 'HARD', 'CARPET', 'GRASS', 'PARQUET', 'SYNTHETIC'];
        const VALID_APPROVAL = ['FULL_AUTO', 'EFT_TIMED', 'PAYMENT_AUTO', 'MANUAL'];
        if (slotType && !VALID_TYPES.includes(slotType))
            return res.status(400).json({ message: 'Geçersiz slot tipi' });
        if (surface && !VALID_SURFACES.includes(surface))
            return res.status(400).json({ message: 'Geçersiz zemin tipi' });
        if (lightsFrom !== undefined && lightsFrom !== null && !/^\d{2}:\d{2}$/.test(lightsFrom))
            return res.status(400).json({ message: 'Geçersiz ışık saati formatı (HH:MM)' });
        if (approvalMode !== undefined && approvalMode !== null && !VALID_APPROVAL.includes(approvalMode))
            return res.status(400).json({ message: 'Geçersiz onay modu' });

        const venue = await prisma.businessVenue.findUnique({ where: { id } });
        if (!venue || venue.userId !== req.userId) return res.status(403).json({ message: 'Yetkisiz' });

        const data = {};
        if (slotType          !== undefined) data.slotType          = slotType          || null;
        if (surface           !== undefined) data.surface           = surface           || null;
        if (indoor            !== undefined) data.indoor            = indoor === null ? null : Boolean(indoor);
        if (lightsFrom        !== undefined) data.lightsFrom        = lightsFrom        || null;
        if (pricePerSlot      !== undefined) data.pricePerSlot      = pricePerSlot === null ? null : (parseInt(pricePerSlot) || 0);
        if (maintenanceDates  !== undefined) data.maintenanceDates  = Array.isArray(maintenanceDates) ? maintenanceDates : null;
        if (approvalMode      !== undefined) data.approvalMode      = approvalMode || null;

        const court = await prisma.venueCourt.update({ where: { id: courtId }, data });
        res.json({ court });
    } catch (e) { next(e); }
};

// Bakım/çakışma/boşluk kontrolleri — hem kullanıcı rezervasyonunda (makeReservation) hem de
// işletmecinin manuel (telefonla gelen) rezervasyonunda (createManualReservation) ortak.
// Sorun yoksa null, varsa { status, message } döner.
export async function validateReservationSlot(venue, courtId, date, startTime, endTime, paymentMethod) {
    // Tüm-gün bakım kontrolü
    const courtCheck = await prisma.venueCourt.findUnique({ where: { id: courtId } });
    const mDates = (Array.isArray(courtCheck?.maintenanceDates) ? courtCheck.maintenanceDates : []).map(normMaint);
    if (mDates.some(m => m.fromDate && m.toDate && date >= m.fromDate && date <= m.toDate && !m.fromTime && !m.toTime))
        return { status: 400, message: 'Bu kort seçilen tarihte bakımda. Rezervasyon yapılamaz.' };

    if (paymentMethod === 'ONLINE')
        return { status: 400, message: 'Online ödeme şu anda bakımda, kullanılamıyor.' };

    const accepted = Array.isArray(venue.acceptedPayments) ? venue.acceptedPayments : ['CASH', 'EFT'];
    if (paymentMethod && !accepted.includes(paymentMethod))
        return { status: 400, message: 'Bu tesis seçilen ödeme yöntemini kabul etmiyor' };

    const startMins = toMins(startTime);
    // Gece yarısını geçen rezervasyon (ör. 23:00–01:00): endTime sayıca startTime'dan
    // küçük/eşit çıkar — bu durumda ertesi güne taştığı kabul edilip +1440 ile normalize edilir.
    const endMins = toMins(endTime) <= startMins ? toMins(endTime) + 1440 : toMins(endTime);
    if (endMins - startMins < 60) return { status: 400, message: 'Minimum rezervasyon süresi 1 saattir' };

    // Saat aralığı bakım kontrolü
    for (const m of mDates) {
        if (!m.fromDate || !m.toDate || date < m.fromDate || date > m.toDate) continue;
        if (!m.fromTime || !m.toTime) continue;
        const ms = toMins(m.fromTime), me = toMins(m.toTime);
        if (overlaps(startMins, endMins, ms, me))
            return { status: 400, message: `Bu kort ${m.fromTime}–${m.toTime} saatleri arası bakımda. Rezervasyon yapılamaz.` };
    }

    // Çakışma kontrolü
    const existing = await prisma.courtReservation.findMany({
        where: { venueId: venue.id, courtId, date, status: { not: 'CANCELLED' } },
    });
    const hasConflict = existing.some(r => {
        const rs = toMins(r.startTime);
        const re = toMins(r.endTime) <= rs ? toMins(r.endTime) + 1440 : toMins(r.endTime);
        return overlaps(startMins, endMins, rs, re);
    });
    if (hasConflict) return { status: 409, message: 'Bu saat aralığı dolu' };

    // Boşluk kontrolü: VAR_DURATION esnek saatlerde uygulanmaz; diğerleri için <minGap dk boşluk bırakamaz
    {
        const courtInfo = await prisma.venueCourt.findUnique({ where: { id: courtId } });
        const VSGT = ['FULL_HOUR', 'HALF_HOUR', 'NINETY_MIN', 'VAR_DURATION'];
        const effType = (VSGT.includes(courtInfo?.slotType) ? courtInfo.slotType : null)
            || (venue.slotType === 'VAR_DURATION' ? 'FULL_HOUR' : venue.slotType)
            || 'FULL_HOUR';

        {
            const minGap = effType === 'NINETY_MIN' ? 90 : 60;
            const openWins = getOpenWindows(venue, date, courtId);
            const allBooked = [
                ...existing.map(r => ({ s: toMins(r.startTime), e: toMins(r.endTime) })),
                { s: startMins, e: endMins },
            ].sort((a, b) => a.s - b.s);

            for (const w of openWins) {
                const wS = toMins(w.from), wE = toMins(w.to);
                let cur = wS;
                let effectiveWE = wE;
                if (effType === 'HALF_HOUR') {
                    if (cur % 60 !== 30) { cur = Math.floor(cur / 60) * 60 + 30; if (cur < wS) cur += 60; }
                    effectiveWE = cur + Math.floor((wE - cur) / 60) * 60;
                }
                for (const b of allBooked) {
                    if (b.e <= wS || b.s >= effectiveWE) continue;
                    const gap = Math.min(b.s, effectiveWE) - cur;
                    if (gap > 0 && gap < minGap)
                        return { status: 400, message: `Bu rezervasyon ${toTime(cur)}–${toTime(Math.min(b.s, effectiveWE))} arasında ${gap} dk'lık kullanılamaz boşluk oluşturuyor. En az ${minGap} dk gerekli. Lütfen farklı bir saat seçin.` };
                    cur = Math.max(cur, b.e);
                }
                const tail = effectiveWE - cur;
                if (tail > 0 && tail < minGap)
                    return { status: 400, message: `Bu rezervasyon sonrasında ${toTime(cur)}–${toTime(effectiveWE)} arasında ${tail} dk'lık boşluk kalır. En az ${minGap} dk gerekli. Lütfen farklı bir saat seçin.` };
            }
        }
    }
    return null;
}

// Gerçek rezervasyon oluşturmadan aynı doğrulamaları (geçmiş tarih, açılış penceresi,
// çakışma, <dakikalık kullanılamaz boşluk) çalıştırır — kort/saat seçimi sırasında hemen
// hata gösterip kullanıcının ilanın geri kalanını doldurmadan önce fark etmesini sağlar.
export const validateSlot = async (req, res, next) => {
    try {
        const { id, courtId } = req.params;
        const { date, startTime, endTime, paymentMethod } = req.body;

        const venue = await prisma.businessVenue.findUnique({ where: { id } });
        if (!venue || venue.status !== 'APPROVED') return res.status(404).json({ message: 'Tesis bulunamadı' });

        const isBlocked = await prisma.venueBlock.findUnique({
            where: { venueId_userId: { venueId: id, userId: req.userId } },
        });
        if (isBlocked) return res.status(403).json({ message: 'Bu tesiste rezervasyon yapamazsınız' });

        if (!date || !startTime || !endTime) return res.status(400).json({ message: 'Tarih, başlangıç ve bitiş saati zorunludur' });
        if (isPastDateTime(date, startTime)) return res.status(400).json({ message: 'Geçmiş bir tarih/saate rezervasyon yapılamaz' });

        const opensAt = getReservationOpensAt(venue, date);
        if (opensAt && new Date() < opensAt) {
            return res.status(403).json({ message: `Bu tarih için rezervasyonlar henüz açılmadı. Açılış: ${opensAt.toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })}` });
        }

        const slotErr = await validateReservationSlot(venue, courtId, date, startTime, endTime, paymentMethod);
        if (slotErr) return res.status(slotErr.status).json({ message: slotErr.message });

        res.json({ ok: true });
    } catch (error) { next(error); }
};

export const makeReservation = async (req, res, next) => {
    try {
        const { id, courtId } = req.params;
        const { date, startTime, endTime, paymentMethod, notes } = req.body;

        const venue = await prisma.businessVenue.findUnique({ where: { id } });
        if (!venue || venue.status !== 'APPROVED') return res.status(404).json({ message: 'Tesis bulunamadı' });

        const isBlocked = await prisma.venueBlock.findUnique({
            where: { venueId_userId: { venueId: id, userId: req.userId } },
        });
        if (isBlocked) return res.status(403).json({ message: 'Bu tesiste rezervasyon yapamazsınız' });

        if (!date || !startTime || !endTime) return res.status(400).json({ message: 'Tarih, başlangıç ve bitiş saati zorunludur' });
        if (isPastDateTime(date, startTime)) return res.status(400).json({ message: 'Geçmiş bir tarih/saate rezervasyon yapılamaz' });

        // Rezervasyon açılış penceresi kontrolü
        const opensAt = getReservationOpensAt(venue, date);
        if (opensAt && new Date() < opensAt) {
            return res.status(403).json({ message: `Bu tarih için rezervasyonlar henüz açılmadı. Açılış: ${opensAt.toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })}` });
        }

        const slotErr = await validateReservationSlot(venue, courtId, date, startTime, endTime, paymentMethod);
        if (slotErr) return res.status(slotErr.status).json({ message: slotErr.message });

        const courtForApproval = await prisma.venueCourt.findUnique({ where: { id: courtId } });
        const pm = paymentMethod || 'CASH';
        const initialStatus = computeReservationStatus(courtForApproval, venue, pm);

        const reservation = await prisma.courtReservation.create({
            data: { venueId: id, courtId, userId: req.userId, date, startTime, endTime,
                    paymentMethod: pm, notes: notes || null, status: initialStatus },
        });

        const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { username: true } });
        const court = await prisma.venueCourt.findUnique({ where: { id: courtId } });
        const pmLabel = { CASH: 'Kortta Öde', EFT: 'EFT/Havale', CREDIT_CARD: 'Kortta Kredi Kartı', ONLINE: 'Online' }[pm] || pm;

        if (initialStatus === 'CONFIRMED') {
            // İşletmeye bilgi bildirimi
            createNotification(venue.userId, 'RESERVATION', '✅ Otomatik Onaylı Rezervasyon',
                `${user?.username}, ${venue.name} — ${court?.name || 'Kort'} için ${date} tarihinde ${startTime}–${endTime} rezervasyon yaptı. Ödeme yöntemi: ${pmLabel}. (Otomatik onaylandı)`,
                { reservationId: reservation.id }
            ).catch(() => {});
            // Müşteriye onay bildirimi
            createNotification(req.userId, 'RESERVATION', '✅ Rezervasyonunuz Onaylandı',
                `${venue.name} — ${court?.name || 'Kort'} için ${date} ${startTime}–${endTime} rezervasyonunuz onaylandı. Ödeme yöntemi: ${pmLabel}.`,
                { reservationId: reservation.id }
            ).catch(() => {});
            emitToUser(req.userId, 'reservationUpdate', { reservationId: reservation.id, status: 'CONFIRMED' });
        } else {
            await createNotification(venue.userId, 'RESERVATION', '📅 Yeni Rezervasyon',
                `${user?.username}, ${venue.name} — ${court?.name || 'Kort'} için ${date} tarihinde ${startTime}–${endTime} rezervasyon yaptı. Ödeme yöntemi: ${pmLabel}.`,
                { reservationId: reservation.id }
            );
        }
        emitToUser(venue.userId, 'notification', {});

        res.status(201).json({ reservation });
    } catch (error) { next(error); }
};

// İşletmecinin, uygulamayı kullanmayan (telefonla arayan) bir müşteri için doğrudan takvimden
// oluşturduğu manuel rezervasyon — her zaman CONFIRMED, gerçek User hesabı olmadan `manualName`
// ile saklanır.
export const createManualReservation = async (req, res, next) => {
    try {
        const { id, courtId } = req.params;
        const { date, startTime, endTime, paymentMethod, customerName, notes } = req.body;

        const venue = await prisma.businessVenue.findUnique({ where: { id } });
        if (!venue || venue.userId !== req.userId) return res.status(403).json({ message: 'Yetkisiz' });

        if (!date || !startTime || !endTime) return res.status(400).json({ message: 'Tarih, başlangıç ve bitiş saati zorunludur' });
        if (!customerName || !customerName.trim()) return res.status(400).json({ message: 'Müşteri adı zorunludur' });
        if (isPastDateTime(date, startTime)) return res.status(400).json({ message: 'Geçmiş bir tarih/saate rezervasyon oluşturamazsınız' });

        const slotErr = await validateReservationSlot(venue, courtId, date, startTime, endTime, paymentMethod);
        if (slotErr) return res.status(slotErr.status).json({ message: slotErr.message });

        const reservation = await prisma.courtReservation.create({
            data: { venueId: id, courtId, userId: null, manualName: customerName.trim(), date, startTime, endTime,
                    paymentMethod: paymentMethod || 'CASH', notes: notes || null, status: 'CONFIRMED' },
        });

        res.status(201).json({ reservation });
    } catch (error) { next(error); }
};

export const getVenueReservations = async (req, res, next) => {
    try {
        const { id } = req.params;
        const venue = await prisma.businessVenue.findUnique({ where: { id } });
        if (!venue || venue.userId !== req.userId) return res.status(403).json({ message: 'Yetkisiz' });

        const reservations = await prisma.courtReservation.findMany({
            where: { venueId: id },
            include: {
                user:  { select: { id: true, username: true, fullName: true, avatar: true } },
                court: true,
            },
            orderBy: [{ date: 'desc' }, { startTime: 'asc' }],
        });
        res.json(reservations);
    } catch (error) { next(error); }
};

export const updateVenueSettings = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { slotType, pricePerSlot, openSlots, cancelHoursBefore, rescheduleHoursBefore, acceptedPayments, pricingWindows, contactLinks, lat, lng, approvalMode, courtIndoorDefault, businessIban, businessIbanHolder, reservationOpenDaysBefore, reservationOpenTime } = req.body;
        const VALID_TYPES    = ['FULL_HOUR', 'HALF_HOUR', 'VAR_DURATION'];
        const VALID_PAY      = ['CASH', 'EFT', 'CREDIT_CARD']; // ONLINE şu anda bakımda, kabul edilen yöntemlere eklenemez
        const VALID_APPROVAL = ['FULL_AUTO', 'EFT_TIMED', 'PAYMENT_AUTO', 'MANUAL'];
        const VALID_OPEN_DAYS_BEFORE = [3, 5, 7, 10, 14];
        if (slotType && !VALID_TYPES.includes(slotType))
            return res.status(400).json({ message: 'Geçersiz slot tipi' });
        if (acceptedPayments !== undefined) {
            if (!Array.isArray(acceptedPayments) || acceptedPayments.length === 0 || acceptedPayments.some(m => !VALID_PAY.includes(m)))
                return res.status(400).json({ message: 'Geçersiz ödeme yöntemi' });
        }
        if (pricingWindows !== undefined) {
            if (!Array.isArray(pricingWindows))
                return res.status(400).json({ message: 'Geçersiz saat aralığı kuralı' });
            const invalidDeltas = pricingWindows.some(w => w.paymentDeltas != null && (
                typeof w.paymentDeltas !== 'object' || Array.isArray(w.paymentDeltas)
                || Object.keys(w.paymentDeltas).some(k => !VALID_PAY.includes(k) || !Number.isInteger(w.paymentDeltas[k]))
            ));
            if (invalidDeltas) return res.status(400).json({ message: 'Geçersiz ödeme yöntemi fiyat farkı' });
            const hasPaymentDeltas = pricingWindows.some(w => w.paymentDeltas && Object.keys(w.paymentDeltas).length > 0);
            if (hasPaymentDeltas) {
                const check = await assertProVenueOwner(id, req.userId, 'Ödeme yöntemine göre fiyat farkı');
                if (check.error) return res.status(check.status).json({ message: check.error });
            }
        }
        if (approvalMode !== undefined && !VALID_APPROVAL.includes(approvalMode))
            return res.status(400).json({ message: 'Geçersiz onay modu' });
        if (reservationOpenDaysBefore !== undefined && reservationOpenDaysBefore !== null && !VALID_OPEN_DAYS_BEFORE.includes(parseInt(reservationOpenDaysBefore)))
            return res.status(400).json({ message: 'Geçersiz rezervasyon açılış süresi (3, 5, 7, 10 veya 14 gün olmalı)' });
        if (reservationOpenTime !== undefined && reservationOpenTime !== null && !/^\d{2}:\d{2}$/.test(reservationOpenTime))
            return res.status(400).json({ message: 'Geçersiz saat formatı (HH:MM)' });

        const venue = await prisma.businessVenue.findUnique({ where: { id } });
        if (!venue || venue.userId !== req.userId) return res.status(403).json({ message: 'Yetkisiz' });

        const data = {};
        if (slotType !== undefined)              data.slotType             = slotType;
        if (pricePerSlot !== undefined)          data.pricePerSlot         = parseInt(pricePerSlot) || 0;
        if (openSlots !== undefined)             data.openSlots            = openSlots;
        if (acceptedPayments !== undefined)      data.acceptedPayments     = acceptedPayments;
        if (pricingWindows !== undefined)        data.pricingWindows       = pricingWindows;
        if (contactLinks !== undefined)          data.contactLinks         = contactLinks;
        if (lat !== undefined)                   data.lat                  = lat !== null ? parseFloat(lat) : null;
        if (lng !== undefined)                   data.lng                  = lng !== null ? parseFloat(lng) : null;
        if (cancelHoursBefore !== undefined)     data.cancelHoursBefore    = cancelHoursBefore === null ? null : parseInt(cancelHoursBefore);
        if (rescheduleHoursBefore !== undefined) data.rescheduleHoursBefore = rescheduleHoursBefore === null ? null : parseInt(rescheduleHoursBefore);
        if (approvalMode !== undefined)          data.approvalMode          = approvalMode;
        if (courtIndoorDefault !== undefined)   data.courtIndoorDefault    = Boolean(courtIndoorDefault);
        if (businessIban !== undefined)         data.businessIban          = businessIban || null;
        if (businessIbanHolder !== undefined)   data.businessIbanHolder    = businessIbanHolder || null;
        if (reservationOpenDaysBefore !== undefined) data.reservationOpenDaysBefore = reservationOpenDaysBefore === null ? null : parseInt(reservationOpenDaysBefore);
        if (reservationOpenTime !== undefined)       data.reservationOpenTime       = reservationOpenTime || null;

        const updated = await prisma.businessVenue.update({ where: { id }, data });
        res.json({ venue: updated });
    } catch (error) { next(error); }
};

export const getOwnerSchedule = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { date } = req.query;
        if (!date) return res.status(400).json({ message: 'date parametresi gerekli (YYYY-MM-DD)' });

        const venue = await prisma.businessVenue.findUnique({
            where: { id },
            include: { courts: { orderBy: { name: 'asc' } } },
        });
        if (!venue || venue.userId !== req.userId) return res.status(403).json({ message: 'Yetkisiz' });

        const allRes = await prisma.courtReservation.findMany({
            where: { venueId: id, date, status: { not: 'CANCELLED' } },
            include: { user: { select: { id: true, username: true, fullName: true } } },
        });

        const findRes = (courtId, s, e) =>
            allRes.filter(r => {
                if (r.courtId !== courtId) return false;
                const rs = toMins(r.startTime), re = toMins(r.endTime);
                if (re < rs) return overlaps(s, e, rs, 1440) || overlaps(s, e, 0, re);
                return overlaps(s, e, rs, re);
            });

        // Bugünse, geçmişte kalan saatler işaretlensin diye "şu an"ı dakika cinsinden al —
        // işletmeci geçmiş bir saate manuel rezervasyon giremesin (mobil tarafta uyarı gösterilir).
        const { dateStr: todayStr, mins: nowMins } = nowIstanbul();
        const isToday = date === todayStr;
        const isPastMin = t => isToday && t < nowMins;

        const VALID_SLOT_TYPES = ['FULL_HOUR', 'HALF_HOUR', 'NINETY_MIN', 'VAR_DURATION'];
        const buildSlots = (court) => {
            const effectiveSlotType = (VALID_SLOT_TYPES.includes(court.slotType) ? court.slotType : null) || venue.slotType || 'FULL_HOUR';
            const courtWindows = getOpenWindows(venue, date, court.id); // kort bazlı windows
            const slots = [];

            for (let wi = 0; wi < courtWindows.length; wi++) {
                const w = courtWindows[wi];
                const open = toMins(w.from), close = toMins(w.to);

                if (effectiveSlotType === 'FULL_HOUR') {
                    for (let t = open; t + 60 <= close; t += 60) {
                        if (close - (t + 60) > 0 && close - (t + 60) < 60) continue;
                        const rs = findRes(court.id, t, t + 60);
                        slots.push({ start: toTime(t), end: toTime(t + 60), status: rs[0]?.status || 'FREE', user: rs[0]?.user || null, manualName: rs[0]?.manualName || null, reservationId: rs[0]?.id || null, paymentMethod: rs[0]?.paymentMethod || null, paymentConfirmStatus: rs[0]?.paymentConfirmStatus || null, past: isPastMin(t), price: getMethodPrice(venue, court, toTime(t), 60, rs[0]?.paymentMethod || 'CASH') });
                    }
                } else if (effectiveSlotType === 'HALF_HOUR') {
                    let start = open;
                    if (start % 60 !== 30) { start = Math.floor(start / 60) * 60 + 30; if (start < open) start += 60; }
                    const nextW = courtWindows[wi + 1];
                    const effectiveClose = (close === 1440 && nextW && toMins(nextW.from) === 0) ? 1470 : close;
                    for (let t = start; t + 60 <= effectiveClose; t += 60) {
                        const endT = t + 60;
                        const midnight = endT > 1440;
                        if (!midnight) { const rem = effectiveClose - endT; if (rem > 0 && rem < 60) continue; }
                        const rs = findRes(court.id, t, midnight ? 1470 : endT);
                        slots.push({ start: toTime(t), end: midnight ? toTime(endT - 1440) : toTime(endT), status: rs[0]?.status || 'FREE', user: rs[0]?.user || null, manualName: rs[0]?.manualName || null, reservationId: rs[0]?.id || null, paymentMethod: rs[0]?.paymentMethod || null, paymentConfirmStatus: rs[0]?.paymentConfirmStatus || null, past: isPastMin(t), price: getMethodPrice(venue, court, toTime(t), 60, rs[0]?.paymentMethod || 'CASH') });
                    }
                } else if (effectiveSlotType === 'NINETY_MIN') {
                    for (let t = open; t + 90 <= close; t += 120) {
                        if (close - (t + 90) > 0 && close - (t + 90) < 90) continue;
                        const rs = findRes(court.id, t, t + 90);
                        slots.push({ start: toTime(t), end: toTime(t + 90), status: rs[0]?.status || 'FREE', user: rs[0]?.user || null, manualName: rs[0]?.manualName || null, reservationId: rs[0]?.id || null, paymentMethod: rs[0]?.paymentMethod || null, paymentConfirmStatus: rs[0]?.paymentConfirmStatus || null, past: isPastMin(t), price: getMethodPrice(venue, court, toTime(t), 90, rs[0]?.paymentMethod || 'CASH') });
                    }
                } else {
                    // VAR_DURATION: gerçek rezervasyon bloklarını ve boş pencereleri göster (saatlik grid değil)
                    const courtRes = allRes.filter(r => r.courtId === court.id)
                        .map(r => ({ s: toMins(r.startTime), e: toMins(r.endTime), r }))
                        .sort((a, b) => a.s - b.s)
                        .filter(r => r.s < close && r.e > open);
                    let cur = open;
                    for (const { s, e, r } of courtRes) {
                        if (s > cur) slots.push({ start: toTime(cur), end: toTime(s), status: 'FREE', user: null, reservationId: null, paymentMethod: null, past: isPastMin(cur), price: 0 });
                        slots.push({ start: toTime(Math.max(s, open)), end: toTime(Math.min(e, close)), status: r.status, user: r.user, manualName: r.manualName || null, reservationId: r.id, paymentMethod: r.paymentMethod, paymentConfirmStatus: r.paymentConfirmStatus, price: null });
                        cur = Math.max(cur, e);
                    }
                    if (cur < close) slots.push({ start: toTime(cur), end: toTime(close), status: 'FREE', user: null, reservationId: null, paymentMethod: null, past: isPastMin(cur), price: 0 });
                }
            }
            return slots;
        };

        const courts = venue.courts.map(court => {
            const courtWindows = getOpenWindows(venue, date, court.id);
            const closed = courtWindows.length === 0;
            return {
                courtId:   court.id,
                courtName: court.name,
                slotType:  (VALID_SLOT_TYPES.includes(court.slotType) ? court.slotType : null) || venue.slotType,
                surface:   court.surface || null,
                closed,
                slots:     closed ? [] : buildSlots(court),
            };
        });

        res.json({ slotType: venue.slotType, openTime: venue.openTime, closeTime: venue.closeTime, courts });
    } catch (error) { next(error); }
};

export const getVenueAnalytics = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { from, to } = req.query;
        if (!from || !to) return res.status(400).json({ message: 'from ve to parametreleri gerekli (YYYY-MM-DD)' });

        const venue = await prisma.businessVenue.findUnique({
            where: { id },
            include: { courts: true },
        });
        if (!venue || venue.userId !== req.userId) return res.status(403).json({ message: 'Yetkisiz' });

        const reservations = await prisma.courtReservation.findMany({
            where: { venueId: id, date: { gte: from, lte: to }, status: { not: 'CANCELLED' } },
        });

        // Gün sayısı
        const msPerDay = 86400000;
        const numDays  = Math.round((new Date(to) - new Date(from)) / msPerDay) + 1;
        const numCourts = venue.courts.length;

        // Her gün için gerçek slot kapasitesini hesapla (openSlots + kapalı günler dikkate alınır)
        const slotMins = venue.slotType === 'NINETY_MIN' ? 120 : 60;
        let totalPossible = 0;
        for (let i = 0; i < numDays; i++) {
            const d = new Date(new Date(from + 'T12:00:00').getTime() + i * msPerDay);
            const dayStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
            const windows = getOpenWindows(venue, dayStr); // venue-wide windows for this day
            if (windows.length === 0) continue; // kapalı gün
            let daySlots = 0;
            for (const w of windows) {
                const wOpen = toMins(w.from), wClose = toMins(w.to);
                daySlots += Math.floor((wClose - wOpen) / slotMins);
            }
            totalPossible += numCourts * Math.max(0, daySlots);
        }
        const totalBooked   = reservations.length;
        const occupancyRate = totalPossible > 0 ? Math.round((totalBooked / totalPossible) * 1000) / 10 : 0;

        // Saatlere göre yoğunluk
        const hourMap = {};
        reservations.forEach(r => {
            const h = r.startTime.slice(0, 2) + ':00';
            hourMap[h] = (hourMap[h] || 0) + 1;
        });
        const busyHours = Object.entries(hourMap)
            .map(([hour, count]) => ({ hour, count }))
            .sort((a, b) => b.count - a.count);

        // Haftanın günlerine göre yoğunluk
        const DAY_NAMES = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
        const dayMap = {};
        reservations.forEach(r => {
            const d = DAY_NAMES[new Date(r.date + 'T12:00:00').getDay()];
            dayMap[d] = (dayMap[d] || 0) + 1;
        });
        const busyDays = Object.entries(dayMap)
            .map(([day, count]) => ({ day, count }))
            .sort((a, b) => b.count - a.count);

        // Günlük dağılım
        const dailyMap = {};
        reservations.forEach(r => { dailyMap[r.date] = (dailyMap[r.date] || 0) + 1; });
        const daily = Object.entries(dailyMap)
            .map(([date, count]) => ({ date, count }))
            .sort((a, b) => a.date.localeCompare(b.date));

        // Tahmini gelir
        const totalRevenue = totalBooked * (venue.pricePerSlot || 0);

        res.json({
            occupancyRate, totalBooked, totalPossible, totalRevenue,
            busyHours, busyDays, daily,
            meta: { from, to, numDays, numCourts },
        });
    } catch (error) { next(error); }
};

export const getMyReservations = async (req, res, next) => {
    try {
        const reservations = await prisma.courtReservation.findMany({
            where: { userId: req.userId },
            include: {
                venue: { select: { id: true, name: true, branch: true, city: true, district: true, address: true, phone: true, pricePerSlot: true, pricingWindows: true, courtIndoorDefault: true, cancelHoursBefore: true, rescheduleHoursBefore: true, acceptedPayments: true } },
                court: true,
            },
            orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
        });
        // Her rezervasyona, ondan zaten oluşturulmuş bir "rakip bul" ilanı varsa bağlanır —
        // frontend'de "İlan Aç" butonu, ilan zaten varken kafa karıştırmasın diye "İlana Git"e dönüşsün diye.
        const linkedRivals = await prisma.activityRequest.findMany({
            where: { venueReservationId: { in: reservations.map(r => r.id) }, senderId: req.userId, status: { not: 'CANCELLED' } },
            select: { id: true, venueReservationId: true, category: true, subCategory: true },
        });
        const withLinks = reservations.map(r => {
            // Rezervasyonun kendi anlık ücreti hiçbir yerde saklanmıyor — "Rakip Bul'da İlan Aç"
            // önizlemesi için, kortun kendi fiyat kuralı yoksa tesisin fiyat pencerelerine
            // (pricingWindows) göre aynı hesaplama tekrar yapılır (bkz. getSlotPrice), böylece
            // sadece düz pricePerSlot kullanan tesislerle sınırlı kalınmaz.
            let durationMins = 60;
            if (r.startTime && r.endTime) {
                const d = toMins(r.endTime) - toMins(r.startTime);
                durationMins = d > 0 ? d : d + 1440;
            }
            const estimatedFee = getSlotPrice(r.venue, r.court, r.startTime, durationMins);
            return {
                ...r,
                estimatedFee,
                linkedRival: linkedRivals.find(a => a.venueReservationId === r.id) || null,
            };
        });
        res.json(withLinks);
    } catch (error) { next(error); }
};

export const getUnlistedReservations = async (req, res, next) => {
    try {
        const { branch } = req.query;
        const { dateStr: today } = nowIstanbul();
        const reservations = await prisma.courtReservation.findMany({
            where: {
                userId: req.userId, status: { not: 'CANCELLED' }, date: { gte: today },
                ...(branch ? { venue: { branch } } : {}),
            },
            include: {
                venue: { select: { id: true, name: true, branch: true, city: true, pricePerSlot: true, pricingWindows: true, courtIndoorDefault: true } },
                court: true,
            },
            orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
        });

        const linked = await prisma.activityRequest.findMany({
            where: { senderId: req.userId, venueCourtId: { not: null }, status: { not: 'CANCELLED' } },
            select: { venueCourtId: true, matchTime: true, matchDate: true },
        });

        const unlisted = reservations
            .filter(r => !isPastDateTime(r.date, r.startTime))
            .filter(r =>
                !linked.some(a =>
                    a.venueCourtId === r.courtId &&
                    a.matchTime === r.startTime &&
                    a.matchDate &&
                    new Date(a.matchDate).toISOString().slice(0, 10) === r.date
                )
            )
            // "Mevcut rezervasyonlarından seç" hızlı seçiminde kişi başı ücret otomatik
            // dolabilsin diye (bkz. getMyReservations'daki aynı hesaplama) — reservation'ın
            // kendi ücreti hiçbir yerde saklanmıyor, tesisin güncel fiyat kuralına göre yeniden hesaplanır.
            .map(r => {
                let durationMins = 60;
                if (r.startTime && r.endTime) {
                    const d = toMins(r.endTime) - toMins(r.startTime);
                    durationMins = d > 0 ? d : d + 1440;
                }
                return { ...r, estimatedFee: getSlotPrice(r.venue, r.court, r.startTime, durationMins) };
            });

        res.json(unlisted);
    } catch (error) { next(error); }
};

export const cancelReservation = async (req, res, next) => {
    try {
        const { resId } = req.params;
        const res_ = await prisma.courtReservation.findUnique({
            where: { id: resId },
            include: { venue: true },
        });
        if (!res_) return res.status(404).json({ message: 'Rezervasyon bulunamadı' });
        const isOwner      = res_.userId === req.userId;
        const isVenueOwner = res_.venue?.userId === req.userId;
        if (!isOwner && !isVenueOwner) return res.status(403).json({ message: 'Yetkisiz' });

        // Kullanıcı iptal ediyorsa politika kontrolü
        if (isOwner && !isVenueOwner) {
            const cb = res_.venue?.cancelHoursBefore;
            if (cb !== null && cb !== undefined) {
                if (cb < 0) return res.status(403).json({ message: 'Bu tesis rezervasyon iptale izin vermiyor' });
                const resDate = new Date(`${res_.date}T${res_.startTime}:00`);
                const hoursLeft = (resDate - new Date()) / 3600000;
                if (hoursLeft < cb)
                    return res.status(403).json({ message: `Rezervasyondan ${cb} saat öncesine kadar iptal yapılabilir` });
            }
        }

        await prisma.courtReservation.update({ where: { id: resId }, data: { status: 'CANCELLED' } });
        res.json({ message: 'İptal edildi' });
    } catch (error) { next(error); }
};

export const updateReservationStatus = async (req, res, next) => {
    try {
        const { resId } = req.params;
        const { action } = req.body; // 'confirm' | 'noshow'
        const res_ = await prisma.courtReservation.findUnique({
            where: { id: resId },
            include: {
                venue: { select: { userId: true, name: true } },
                court: { select: { name: true } },
            },
        });
        if (!res_) return res.status(404).json({ message: 'Rezervasyon bulunamadı' });
        if (res_.venue?.userId !== req.userId) return res.status(403).json({ message: 'Yetkisiz' });

        const venueName  = res_.venue?.name || 'Tesis';
        const courtName  = res_.court?.name || 'Kort';
        const dateStr    = `${res_.date} ${res_.startTime}–${res_.endTime}`;
        const customerId = res_.userId;

        if (action === 'payment_confirm') {
            // Kort saati geçti, işletmeci müşterinin geldiğini ve ödemeyi aldığını onayladı.
            // slotStart/slotEnd = takvimde tıklanan tek saatlik kutunun aralığı. Rezervasyon
            // bundan daha uzunsa (ör. 6-8 rezervasyonda sadece 6-7 tıklandıysa), rezervasyon
            // tıklanan saate daraltılır ve o kısım ödendi olarak işaretlenir; kalan saat(ler)
            // ayrı, hâlâ ödenmemiş bir rezervasyon olarak kalır.
            const { slotStart, slotEnd } = req.body;
            if (slotStart && slotEnd && (slotStart !== res_.startTime || slotEnd !== res_.endTime)) {
                const rs = toMins(res_.startTime), re = toMins(res_.endTime);
                const ss = toMins(slotStart), se = toMins(slotEnd);
                const remainders = [];
                if (ss > rs) remainders.push({ startTime: res_.startTime, endTime: slotStart });
                if (se < re) remainders.push({ startTime: slotEnd, endTime: res_.endTime });

                if (remainders.length > 0) {
                    await prisma.$transaction([
                        ...remainders.map(rr => prisma.courtReservation.create({
                            data: {
                                venueId: res_.venueId, courtId: res_.courtId, userId: res_.userId,
                                manualName: res_.manualName,
                                date: res_.date, startTime: rr.startTime, endTime: rr.endTime,
                                paymentMethod: res_.paymentMethod, status: res_.status,
                                notes: res_.notes,
                            },
                        })),
                        prisma.courtReservation.update({
                            where: { id: resId },
                            data: { startTime: slotStart, endTime: slotEnd, paymentConfirmStatus: 'CONFIRMED' },
                        }),
                    ]);
                    const updated = await prisma.courtReservation.findUnique({ where: { id: resId } });
                    return res.json({ reservation: updated });
                }
            }

            const updated = await prisma.courtReservation.update({ where: { id: resId }, data: { paymentConfirmStatus: 'CONFIRMED' } });
            return res.json({ reservation: updated });
        }

        if (action === 'payment_not_collected') {
            // Müşteri gelmedi / ödeme alınamadı — adminleri bilgilendir
            const updated = await prisma.courtReservation.update({ where: { id: resId }, data: { paymentConfirmStatus: 'NOT_COLLECTED', noShow: true } });
            res.json({ reservation: updated });
            const admins = await prisma.user.findMany({ where: { isAdmin: true }, select: { id: true } });
            for (const admin of admins) {
                createNotification(admin.id, 'PAYMENT_ALERT', '🚨 Ödeme Tahsil Edilemedi',
                    `${venueName} — ${courtName}: ${dateStr} rezervasyonunda müşteri gelmedi / ödeme tahsil edilemedi.`,
                    { reservationId: resId }
                ).catch(() => {});
            }
            return;
        }

        if (action === 'no_payment') {
            // Ödeme alınmadı — iptal et + admini bildir
            const updated = await prisma.courtReservation.update({ where: { id: resId }, data: { status: 'CANCELLED', noShow: true } });
            res.json({ reservation: updated });
            const admins = await prisma.user.findMany({ where: { isAdmin: true }, select: { id: true } });
            for (const admin of admins) {
                createNotification(admin.id, 'PAYMENT_ALERT', '🚨 Ödeme Alınmadı Uyarısı',
                    `${venueName} — ${courtName}: ${dateStr} rezervasyonunda ödeme alınmadı!`,
                    { reservationId: resId }
                ).catch(() => {});
            }
            createNotification(customerId, 'RESERVATION', '❌ Rezervasyon İptal Edildi',
                `${venueName} · ${courtName} — ${dateStr} rezervasyonunuz iptal edildi (ödeme alınamadı).`,
                { reservationId: resId }
            ).catch(() => {});
            emitToUser(customerId, 'reservationUpdate', { reservationId: resId, status: 'CANCELLED' });
            return;
        }

        if (action === 'reject') {
            const updated = await prisma.courtReservation.update({ where: { id: resId }, data: { status: 'CANCELLED' } });
            res.json({ reservation: updated });
            createNotification(customerId, 'RESERVATION',
                '❌ Rezervasyon Reddedildi',
                `${venueName} · ${courtName} — ${dateStr} rezervasyonunuz reddedildi.`,
                { reservationId: resId }
            ).catch(() => {});
            emitToUser(customerId, 'reservationUpdate', { reservationId: resId, status: 'CANCELLED' });
            return;
        }

        const data = action === 'confirm'
            ? { status: 'CONFIRMED' }
            : { status: 'CANCELLED', noShow: true };
        const updated = await prisma.courtReservation.update({ where: { id: resId }, data });
        res.json({ reservation: updated });

        if (action === 'confirm') {
            createNotification(customerId, 'RESERVATION',
                '✅ Rezervasyonunuz Onaylandı',
                `${venueName} · ${courtName} — ${dateStr} rezervasyonunuz onaylandı.`,
                { reservationId: resId }
            ).catch(() => {});
            emitToUser(customerId, 'reservationUpdate', { reservationId: resId, status: 'CONFIRMED' });

            // Bu rezervasyona bağlı bir maç ilanı varsa, sadece rezervasyon sahibine değil
            // ilandaki tüm oyunculara (katılımcılar + bekleyen istek sahipleri) da onay bildirimi gider.
            prisma.activityRequest.findFirst({ where: { venueReservationId: resId } }).then(activity => {
                if (!activity) return;
                prisma.rivalJoinRequest.findMany({
                    where: { rivalId: activity.id, status: { in: ['PENDING', 'AWAITING_JOINER_CONFIRM'] } },
                    select: { userId: true },
                }).then(pendingReqs => {
                    const participantIds = Array.isArray(activity.participants) ? activity.participants.map(p => p?.id).filter(Boolean) : [];
                    const senderTeamIds = Array.isArray(activity.senderTeam) ? activity.senderTeam.map(p => p?.id).filter(Boolean) : [];
                    const recipients = new Set([
                        ...(activity.receiverId ? [activity.receiverId] : []),
                        ...participantIds, ...senderTeamIds,
                        ...pendingReqs.map(r => r.userId),
                    ]);
                    recipients.delete(customerId);
                    for (const uid of recipients) {
                        createNotification(uid, 'RESERVATION', '✅ Maç Kort/Saat Değişikliği Onaylandı',
                            `${venueName} · ${courtName} — ${dateStr} maç saati işletme tarafından onaylandı.`,
                            { rivalId: activity.id }
                        ).catch(() => {});
                        emitToUser(uid, 'rivalUpdate', activity);
                    }
                }).catch(() => {});
            }).catch(() => {});
        } else {
            createNotification(customerId, 'RESERVATION',
                '❌ Rezervasyon İptal Edildi',
                `${venueName} · ${courtName} — ${dateStr} rezervasyonunuz iptal edildi.`,
                { reservationId: resId }
            ).catch(() => {});
            emitToUser(customerId, 'reservationUpdate', { reservationId: resId, status: 'CANCELLED' });
        }
    } catch (e) { next(e); }
};

export const rescheduleReservation = async (req, res, next) => {
    try {
        const { resId } = req.params;
        const { newDate, newStartTime, newEndTime } = req.body;
        if (!newDate || !newStartTime || !newEndTime)
            return res.status(400).json({ message: 'newDate, newStartTime ve newEndTime zorunludur' });
        if (isPastDateTime(newDate, newStartTime))
            return res.status(400).json({ message: 'Geçmiş bir tarih/saate rezervasyon alınamaz' });

        const res_ = await prisma.courtReservation.findUnique({
            where: { id: resId },
            include: { venue: true },
        });
        if (!res_) return res.status(404).json({ message: 'Rezervasyon bulunamadı' });
        if (res_.userId !== req.userId) return res.status(403).json({ message: 'Yetkisiz' });
        if (res_.status === 'CANCELLED') return res.status(400).json({ message: 'İptal edilmiş rezervasyon değiştirilemez' });

        const rb = res_.venue?.rescheduleHoursBefore;
        if (rb !== null && rb !== undefined) {
            if (rb < 0) return res.status(403).json({ message: 'Bu tesis rezervasyon değişikliğine izin vermiyor' });
            const resDate  = new Date(`${res_.date}T${res_.startTime}:00`);
            const hoursLeft = (resDate - new Date()) / 3600000;
            if (hoursLeft < rb)
                return res.status(403).json({ message: `Rezervasyondan ${rb} saat öncesine kadar değişiklik yapılabilir` });
        }

        // Çakışma kontrolü
        const existing = await prisma.courtReservation.findMany({
            where: { venueId: res_.venueId, courtId: res_.courtId, date: newDate, status: { not: 'CANCELLED' }, NOT: { id: resId } },
        });
        const hasConflict = existing.some(r =>
            overlaps(toMins(newStartTime), toMins(newEndTime), toMins(r.startTime), toMins(r.endTime))
        );
        if (hasConflict) return res.status(409).json({ message: 'Seçilen saat aralığı dolu' });

        // Politika dahilinde (rescheduleHoursBefore kontrolünden geçti) yapılan bir değişiklik,
        // tesisin onay moduna göre doğrudan onaylanabilir — FULL_AUTO'da işletmecinin tekrar
        // elle onaylamasına gerek yok.
        const courtForApproval = await prisma.venueCourt.findUnique({ where: { id: res_.courtId } });
        const newStatus = computeReservationStatus(courtForApproval, res_.venue, res_.paymentMethod);

        const updated = await prisma.courtReservation.update({
            where: { id: resId },
            data: { date: newDate, startTime: newStartTime, endTime: newEndTime, status: newStatus },
        });

        await createNotification(res_.venue.userId, 'RESERVATION',
            newStatus === 'CONFIRMED' ? '✅ Rezervasyon Saati Değişti (Otomatik Onaylı)' : '📅 Rezervasyon Güncellendi',
            newStatus === 'CONFIRMED'
                ? `Rezervasyon ${newDate} ${newStartTime}–${newEndTime} olarak güncellendi ve otomatik onaylandı.`
                : `Rezervasyon tarihi değiştirildi: ${newDate} ${newStartTime}–${newEndTime}. Onayınız bekleniyor.`,
            { reservationId: resId }
        ).catch(() => {});
        emitToUser(res_.venue.userId, 'notification', {});
        if (newStatus === 'CONFIRMED') {
            createNotification(res_.userId, 'RESERVATION', '✅ Rezervasyonunuz Onaylandı',
                `${newDate} ${newStartTime}–${newEndTime} için değiştirdiğiniz rezervasyon otomatik onaylandı.`,
                { reservationId: resId }
            ).catch(() => {});
            emitToUser(res_.userId, 'reservationUpdate', { reservationId: resId, status: 'CONFIRMED' });
        }

        // Bu rezervasyondan oluşturulmuş bir ilan varsa (bkz. venueReservationId), ilanın
        // tarih/saatini de güncelle ve — henüz onaylanmamış katılma isteği bekleyenler dahil —
        // ilandaki herkese bildirim gönder.
        const activity = await prisma.activityRequest.findFirst({ where: { venueReservationId: resId } });
        if (activity) {
            const updatedActivity = await prisma.activityRequest.update({
                where: { id: activity.id },
                data: {
                    matchDate: new Date(`${newDate}T00:00:00`),
                    matchTime: newStartTime,
                    duration: toMins(newEndTime) - toMins(newStartTime),
                },
            });

            const pendingReqs = await prisma.rivalJoinRequest.findMany({
                where: { rivalId: activity.id, status: 'PENDING' },
                select: { userId: true },
            });
            const participantIds = Array.isArray(activity.participants)
                ? activity.participants.map(p => p?.id).filter(Boolean)
                : [];
            const recipients = new Set([
                ...(activity.receiverId ? [activity.receiverId] : []),
                ...participantIds,
                ...pendingReqs.map(r => r.userId),
            ]);
            recipients.delete(activity.senderId); // ilan sahibi zaten değişikliği yapan kişi

            for (const uid of recipients) {
                createNotification(
                    uid, 'RESERVATION', '📅 Maç Saati Değişti',
                    `"${activity.courtName || 'Kort'}" için maç ${newDate} ${newStartTime}–${newEndTime} olarak güncellendi.`,
                    { rivalId: activity.id }
                ).catch(() => {});
                emitToUser(uid, 'rivalUpdate', updatedActivity);
            }
        }

        res.json({ reservation: updated });
    } catch (error) { next(error); }
};

// ─── İptal talebi (kullanıcı → işletme) ─────────────────────────────────────

export const requestCancelReservation = async (req, res, next) => {
    try {
        const { resId } = req.params;
        const { note, requestType } = req.body; // requestType: 'CANCEL' | 'RESCHEDULE'
        const r = await prisma.courtReservation.findUnique({ where: { id: resId }, include: { venue: true } });
        if (!r) return res.status(404).json({ message: 'Rezervasyon bulunamadı' });
        if (r.userId !== req.userId) return res.status(403).json({ message: 'Yetkisiz' });
        if (r.status === 'CANCELLED') return res.status(400).json({ message: 'Rezervasyon zaten iptal edilmiş' });
        if (r.cancelRequested) return res.status(400).json({ message: 'Talep zaten gönderildi' });

        const isReschedule = requestType === 'RESCHEDULE';
        const storedNote = isReschedule ? `RESCHEDULE${note ? ':' + note : ''}` : (note || null);

        await prisma.courtReservation.update({
            where: { id: resId },
            data: { cancelRequested: true, cancelRequestNote: storedNote },
        });

        const notifTitle = isReschedule ? '🔄 Saat Değişikliği Talebi' : '📋 İptal Talebi';
        const notifBody  = isReschedule
            ? `${r.date} ${r.startTime}–${r.endTime} rezervasyonu için saat değişikliği talep edildi.`
            : `${r.date} ${r.startTime}–${r.endTime} rezervasyonu için iptal talebi gönderildi.`;

        await createNotification(r.venue.userId, 'RESERVATION', notifTitle, notifBody, { reservationId: resId }).catch(() => {});
        emitToUser(r.venue.userId, 'notification', {});

        res.json({ ok: true });
    } catch (error) { next(error); }
};

export const approveCancelRequest = async (req, res, next) => {
    try {
        const { resId } = req.params;
        const r = await prisma.courtReservation.findUnique({ where: { id: resId }, include: { venue: true } });
        if (!r) return res.status(404).json({ message: 'Rezervasyon bulunamadı' });

        const isOwner = r.venue.userId === req.userId;
        const isAdmin = req.isAdmin;
        if (!isOwner && !isAdmin) return res.status(403).json({ message: 'Yetkisiz' });
        if (r.status === 'CANCELLED') return res.status(400).json({ message: 'Zaten iptal edilmiş' });

        await prisma.courtReservation.update({
            where: { id: resId },
            data: { status: 'CANCELLED', cancelRequested: false },
        });

        await createNotification(r.userId, 'RESERVATION',
            '✅ İptal Talebiniz Onaylandı',
            `${r.date} ${r.startTime}–${r.endTime} rezervasyonunuz iptal edildi.`,
            { reservationId: resId }
        ).catch(() => {});
        emitToUser(r.userId, 'notification', {});
        emitToUser(r.userId, 'reservationUpdate', { reservationId: resId, status: 'CANCELLED' });

        res.json({ ok: true });
    } catch (error) { next(error); }
};

export const getCancelRequests = async (req, res, next) => {
    try {
        const venues = await prisma.businessVenue.findMany({
            where: { userId: req.userId },
            select: { id: true },
        });
        const venueIds = venues.map(v => v.id);
        const requests = await prisma.courtReservation.findMany({
            where: { venueId: { in: venueIds }, cancelRequested: true, status: { not: 'CANCELLED' } },
            include: {
                venue: { select: { name: true } },
                court: { select: { name: true } },
                user:  { select: { id: true, username: true, fullName: true } },
            },
            orderBy: { createdAt: 'desc' },
        });
        res.json(requests);
    } catch (error) { next(error); }
};

// ─── Genel arama (tüm kullanıcılar) ─────────────────────────────────────────

export const searchVenues = async (req, res, next) => {
    try {
        const { city, branch, name, ratingMode, skip: skipStr, take: takeStr } = req.query;
        const skip = parseInt(skipStr) || 0;
        const take = parseInt(takeStr) || (ratingMode ? 20 : 100);

        let proFilter = {};
        if (!ratingMode) {
            const now = new Date();
            const proSubs = await prisma.businessSubscription.findMany({
                where: { status: 'ACTIVE', endDate: { gt: now }, packageType: { in: ['PRO', 'PREMIUM'] } },
                select: { userId: true },
            });
            proFilter = { userId: { in: proSubs.map(s => s.userId) } };
        }

        const where = {
            ...(ratingMode ? {} : { status: 'APPROVED' }),
            ...proFilter,
            // ratingMode'da branch filtresi yok (tenis/tenis/tennis eşleşmesi sorunu)
            ...(!ratingMode && branch ? { branch: { contains: branch, mode: 'insensitive' } } : {}),
            ...(city ? { OR: [
                { city:     { contains: city, mode: 'insensitive' } },
                { district: { contains: city, mode: 'insensitive' } },
            ]} : {}),
            ...(name ? { OR: [
                { name:   { contains: name, mode: 'insensitive' } },
                { courts: { some: { name: { contains: name, mode: 'insensitive' } } } },
            ]} : {}),
        };

        const [total, venues] = await Promise.all([
            prisma.businessVenue.count({ where }),
            prisma.businessVenue.findMany({
                where,
                include: {
                    courts: { orderBy: { name: 'asc' } },
                    user: { select: { id: true, username: true, businessName: true } },
                },
                orderBy: { name: 'asc' },
                skip,
                take,
            }),
        ]);

        const venueIds = venues.map(v => v.id);
        const ratings = venueIds.length ? await prisma.venueReview.groupBy({
            by: ['venueId'],
            where: { venueId: { in: venueIds }, courtId: null, status: 'APPROVED' },
            _avg: { rating: true },
            _count: { id: true },
        }) : [];
        const ratingMap = Object.fromEntries(ratings.map(r => [r.venueId, { avg: r._avg.rating, count: r._count.id }]));

        res.json({
            items: venues.map(v => ({
                ...v,
                avgRating:   ratingMap[v.id]?.avg   ?? null,
                reviewCount: ratingMap[v.id]?.count  ?? 0,
            })),
            total,
            hasMore: skip + take < total,
        });
    } catch (error) { next(error); }
};

// Tarih + saat aralığı verilince o aralıkta müsait (boş) kort/slotu olan tesisleri bulur —
// sadece Pro ve üstü paketli işletmeler bu aramada görünür (searchVenues'daki proFilter ile
// aynı mantık). Her kort için computeSlots aynı motoru kullanır, sonuçlar istenen aralıkla
// kesişen boş slot/pencerelere daraltılır.
export const searchVenueAvailability = async (req, res, next) => {
    try {
        const { date, timeFrom, timeTo, city, branch, name } = req.query;
        if (!date || !timeFrom || !timeTo) return res.status(400).json({ message: 'date, timeFrom ve timeTo parametreleri gerekli' });
        const rangeFrom = toMins(timeFrom), rangeTo = toMins(timeTo);
        if (rangeTo <= rangeFrom) return res.status(400).json({ message: 'Bitiş saati başlangıçtan sonra olmalı' });

        const now = new Date();
        const proSubs = await prisma.businessSubscription.findMany({
            where: { status: 'ACTIVE', endDate: { gt: now }, packageType: { in: ['PRO', 'PREMIUM'] } },
            select: { userId: true },
        });
        const proUserIds = proSubs.map(s => s.userId);
        if (proUserIds.length === 0) return res.json({ items: [] });

        const where = {
            status: 'APPROVED',
            userId: { in: proUserIds },
            ...(branch ? { branch: { contains: branch, mode: 'insensitive' } } : {}),
            ...(city ? { OR: [
                { city:     { contains: city, mode: 'insensitive' } },
                { district: { contains: city, mode: 'insensitive' } },
            ] } : {}),
            ...(name ? { OR: [
                { name:   { contains: name, mode: 'insensitive' } },
                { courts: { some: { name: { contains: name, mode: 'insensitive' } } } },
            ] } : {}),
        };

        const venues = await prisma.businessVenue.findMany({
            where,
            include: { courts: { orderBy: { name: 'asc' } } },
            orderBy: { name: 'asc' },
            take: 60, // performans için makul bir üst sınır
        });

        const VALID_SLOT_TYPES = ['FULL_HOUR', 'HALF_HOUR', 'NINETY_MIN', 'VAR_DURATION'];
        const results = [];
        for (const venue of venues) {
            if (venue.courts.length === 0) continue;
            const opensAt = getReservationOpensAt(venue, date);
            if (opensAt && new Date() < opensAt) continue;

            const courtIds = venue.courts.map(c => c.id);
            const reservations = await prisma.courtReservation.findMany({
                where: { venueId: venue.id, courtId: { in: courtIds }, date },
            });
            const reservationsByCourtId = {};
            for (const r of reservations) (reservationsByCourtId[r.courtId] ??= []).push(r);

            const matchingCourts = [];
            for (const court of venue.courts) {
                const maintDates = (Array.isArray(court.maintenanceDates) ? court.maintenanceDates : []).map(normMaint);
                const fullDayMaint = maintDates.some(m => m.fromDate && m.toDate && date >= m.fromDate && date <= m.toDate && !m.fromTime && !m.toTime);
                if (fullDayMaint) continue;
                const maintWindows = maintDates
                    .filter(m => m.fromDate && m.toDate && date >= m.fromDate && date <= m.toDate && m.fromTime && m.toTime)
                    .map(m => ({ s: toMins(m.fromTime), e: toMins(m.toTime) }));

                const courtSlotType = VALID_SLOT_TYPES.includes(court.slotType) ? court.slotType : null;
                const venueSlotFallback = venue.slotType === 'VAR_DURATION' ? 'FULL_HOUR' : (venue.slotType || 'FULL_HOUR');
                const effectiveVenue = { ...venue, slotType: courtSlotType || venueSlotFallback };
                const slotsResult = computeSlots(effectiveVenue, reservationsByCourtId[court.id] || [], date, court.id, maintWindows);

                let matchingSlots = [];
                if (slotsResult.slots) {
                    matchingSlots = slotsResult.slots
                        .filter(s => s.free && toMins(s.start) < rangeTo && toMins(s.end) > rangeFrom)
                        .map(s => {
                            const d = toMins(s.end) - toMins(s.start);
                            const dur = d > 0 ? d : d + 1440;
                            return { start: s.start, end: s.end, price: getSlotPrice(venue, court, s.start, dur) };
                        });
                } else if (slotsResult.windows) {
                    matchingSlots = slotsResult.windows
                        .filter(w => toMins(w.start) < rangeTo && toMins(w.end) > rangeFrom)
                        .map(w => {
                            const overlapStart = Math.max(toMins(w.start), rangeFrom);
                            const overlapEnd = Math.min(toMins(w.end), rangeTo);
                            return { start: toTime(overlapStart), end: toTime(overlapEnd), flexible: true };
                        })
                        .filter(w => toMins(w.end) - toMins(w.start) >= 30);
                }
                if (matchingSlots.length > 0) {
                    matchingCourts.push({ court: { id: court.id, name: court.name, surface: court.surface, indoor: court.indoor }, slots: matchingSlots });
                }
            }
            if (matchingCourts.length > 0) {
                // Tam venue nesnesi (courts dahil) döner — mobil sonuca dokununca aynı
                // VenueBookingSheet'i ekstra fetch olmadan doğrudan açabilsin diye.
                results.push({ venue, matchingCourts });
            }
        }
        res.json({ items: results });
    } catch (error) { next(error); }
};

export const getVenueById = async (req, res, next) => {
    try {
        const venue = await prisma.businessVenue.findUnique({
            where: { id: req.params.id, status: 'APPROVED' },
            include: {
                courts: true,
                user: { select: { id: true, username: true, businessName: true, businessIban: true, businessIbanHolder: true } },
            },
        });
        if (!venue) return res.status(404).json({ message: 'Tesis bulunamadı' });
        res.json(venue);
    } catch (error) { next(error); }
};

// ─── Admin ────────────────────────────────────────────────────────────────────

export const getPendingVenues = async (req, res, next) => {
    try {
        const venues = await prisma.businessVenue.findMany({
            where: { status: 'PENDING' },
            include: {
                courts: true,
                user: { select: { id: true, username: true, businessName: true, email: true } },
            },
            orderBy: { createdAt: 'asc' },
        });
        res.json(venues);
    } catch (error) { next(error); }
};

export const approveVenue = async (req, res, next) => {
    try {
        const { id } = req.params;
        const venue = await prisma.businessVenue.findUnique({ where: { id } });
        if (!venue) return res.status(404).json({ message: 'Bulunamadı' });
        await prisma.businessVenue.update({ where: { id }, data: { status: 'APPROVED' } });
        await createNotification(venue.userId, 'VENUE_APPROVED', '✅ Tesis Onaylandı',
            `"${venue.name}" tesisi onaylandı. Kullanıcılar artık rezervasyon yapabilir.`,
            { venueId: id }
        );
        emitToUser(venue.userId, 'notification', {});
        res.json({ message: 'Onaylandı' });
    } catch (error) { next(error); }
};

export const rejectVenue = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { adminNote } = req.body;
        const venue = await prisma.businessVenue.findUnique({ where: { id } });
        if (!venue) return res.status(404).json({ message: 'Bulunamadı' });
        await prisma.businessVenue.update({ where: { id }, data: { status: 'REJECTED', adminNote: adminNote || null } });
        await createNotification(venue.userId, 'VENUE_REJECTED', '❌ Tesis Reddedildi',
            adminNote || `"${venue.name}" tesisi reddedildi. Bilgilerinizi kontrol ederek tekrar deneyin.`,
            { venueId: id }
        );
        emitToUser(venue.userId, 'notification', {});
        res.json({ message: 'Reddedildi' });
    } catch (error) { next(error); }
};

// ─── Kullanıcı Engelleme ──────────────────────────────────────────────────────

export const blockUser = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { username } = req.body;
        const venue = await prisma.businessVenue.findUnique({ where: { id } });
        if (!venue || venue.userId !== req.userId) return res.status(403).json({ message: 'Yetkisiz' });
        const target = await prisma.user.findUnique({ where: { username } });
        if (!target) return res.status(404).json({ message: 'Kullanıcı bulunamadı' });
        if (target.id === req.userId) return res.status(400).json({ message: 'Kendinizi engelleyemezsiniz' });
        const block = await prisma.venueBlock.upsert({
            where: { venueId_userId: { venueId: id, userId: target.id } },
            update: {},
            create: { venueId: id, userId: target.id },
        });
        res.status(201).json({ block, user: { id: target.id, username: target.username, avatar: target.avatar } });
    } catch (error) { next(error); }
};

export const unblockUser = async (req, res, next) => {
    try {
        const { id, userId } = req.params;
        const venue = await prisma.businessVenue.findUnique({ where: { id } });
        if (!venue || venue.userId !== req.userId) return res.status(403).json({ message: 'Yetkisiz' });
        await prisma.venueBlock.deleteMany({ where: { venueId: id, userId } });
        res.json({ message: 'Engel kaldırıldı' });
    } catch (error) { next(error); }
};

export const getBlockedUsers = async (req, res, next) => {
    try {
        const { id } = req.params;
        const venue = await prisma.businessVenue.findUnique({ where: { id } });
        if (!venue || venue.userId !== req.userId) return res.status(403).json({ message: 'Yetkisiz' });
        const blocks = await prisma.venueBlock.findMany({
            where: { venueId: id },
            include: { user: { select: { id: true, username: true, avatar: true, fullName: true } } },
            orderBy: { createdAt: 'desc' },
        });
        res.json(blocks);
    } catch (error) { next(error); }
};

// ─── Menü Yönetimi ────────────────────────────────────────────────────────────

export const PRO_PACKAGES = ['PRO', 'PREMIUM'];

const assertProVenueOwner = async (venueId, userId, featureLabel = 'Menü özelliği') => {
    const venue = await prisma.businessVenue.findUnique({ where: { id: venueId } });
    if (!venue || venue.userId !== userId) return { error: 'Yetkisiz', status: 403 };
    const now = new Date();
    const sub = await prisma.businessSubscription.findFirst({
        where: { userId, status: 'ACTIVE', endDate: { gt: now } },
    });
    if (!sub || !PRO_PACKAGES.includes(sub.packageType))
        return { error: `${featureLabel} için Pro veya Premium paket gereklidir`, status: 403 };
    return { venue, sub };
};

export const addMenuItem = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { name, price, category, unit } = req.body;
        const check = await assertProVenueOwner(id, req.userId);
        if (check.error) return res.status(check.status).json({ message: check.error });
        if (!name?.trim()) return res.status(400).json({ message: 'İsim zorunludur' });
        const item = await prisma.venueMenuItem.create({
            data: { venueId: id, name: name.trim(), price: parseInt(price) || 0, category: category || 'OTHER', unit: unit?.trim() || null },
        });
        res.status(201).json({ item });
    } catch (error) { next(error); }
};

export const updateMenuItem = async (req, res, next) => {
    try {
        const { id, itemId } = req.params;
        const { name, price, category, available, unit } = req.body;
        const venue = await prisma.businessVenue.findUnique({ where: { id } });
        if (!venue || venue.userId !== req.userId) return res.status(403).json({ message: 'Yetkisiz' });
        const item = await prisma.venueMenuItem.update({
            where: { id: itemId },
            data: {
                ...(name      !== undefined ? { name: name.trim() }           : {}),
                ...(price     !== undefined ? { price: parseInt(price) || 0 } : {}),
                ...(category  !== undefined ? { category }                    : {}),
                ...(available !== undefined ? { available }                   : {}),
                ...(unit      !== undefined ? { unit: unit?.trim() || null }  : {}),
            },
        });
        res.json({ item });
    } catch (error) { next(error); }
};

export const deleteMenuItem = async (req, res, next) => {
    try {
        const { id, itemId } = req.params;
        const venue = await prisma.businessVenue.findUnique({ where: { id } });
        if (!venue || venue.userId !== req.userId) return res.status(403).json({ message: 'Yetkisiz' });
        await prisma.venueMenuItem.delete({ where: { id: itemId } });
        res.json({ message: 'Silindi' });
    } catch (error) { next(error); }
};

export const getVenueMenu = async (req, res, next) => {
    try {
        const { id } = req.params;
        const venue = await prisma.businessVenue.findUnique({ where: { id } });
        if (!venue || venue.status !== 'APPROVED') return res.status(404).json({ message: 'Tesis bulunamadı' });

        const now = new Date();
        const sub = await prisma.businessSubscription.findFirst({
            where: { userId: venue.userId, status: 'ACTIVE', endDate: { gt: now } },
        });
        if (!sub || !PRO_PACKAGES.includes(sub.packageType))
            return res.json({ items: [], hasMenu: false });

        const items = await prisma.venueMenuItem.findMany({
            where: { venueId: id },
            orderBy: [{ category: 'asc' }, { name: 'asc' }],
        });
        res.json({ items, hasMenu: true });
    } catch (error) { next(error); }
};

// ─── Sipariş ──────────────────────────────────────────────────────────────────

export const placeOrder = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { items, notes } = req.body; // items: [{menuItemId, quantity}]
        if (!items?.length) return res.status(400).json({ message: 'En az bir ürün seçin' });

        const venue = await prisma.businessVenue.findUnique({ where: { id } });
        if (!venue || venue.status !== 'APPROVED') return res.status(404).json({ message: 'Tesis bulunamadı' });

        // Menü (dolayısıyla sipariş) özelliği sadece Pro/Premium pakette aktif
        const now = new Date();
        const sub = await prisma.businessSubscription.findFirst({
            where: { userId: venue.userId, status: 'ACTIVE', endDate: { gt: now } },
        });
        if (!sub || !PRO_PACKAGES.includes(sub.packageType))
            return res.status(403).json({ message: 'Bu tesis şu anda sipariş kabul etmiyor.' });

        // Blocked kontrolü
        const isBlocked = await prisma.venueBlock.findUnique({
            where: { venueId_userId: { venueId: id, userId: req.userId } },
        });
        if (isBlocked) return res.status(403).json({ message: 'Bu tesisten sipariş veremezsiniz' });

        // Sadece bu tesiste eşleşmiş (MATCHED) bir maçta yer alan kullanıcılar sipariş verebilir —
        // maç saati henüz gelmemiş olsa bile (maç MATCHED olduğu andan itibaren) sipariş verilebilir.
        const venueMatches = await prisma.activityRequest.findMany({
            where: { venueId: id, status: 'MATCHED' },
            select: { senderId: true, receiverId: true, participants: true, senderTeam: true, venueReservationId: true },
        });
        const myMatch = venueMatches.find(m => {
            if (m.senderId === req.userId || m.receiverId === req.userId) return true;
            const parts = Array.isArray(m.participants) ? m.participants : [];
            const team  = Array.isArray(m.senderTeam)   ? m.senderTeam   : [];
            return parts.some(p => p?.id === req.userId) || team.some(p => p?.id === req.userId);
        });
        if (!myMatch) return res.status(403).json({ message: 'Bu tesisten sipariş verebilmek için bu tesiste eşleşmiş bir maçınız olmalı.' });

        // Menu item fiyatlarını çek
        const menuItems = await prisma.venueMenuItem.findMany({
            where: { id: { in: items.map(i => i.menuItemId) }, venueId: id, available: true },
        });
        if (menuItems.length === 0) return res.status(400).json({ message: 'Seçilen ürünler mevcut değil' });

        const totalPrice = items.reduce((sum, i) => {
            const mi = menuItems.find(m => m.id === i.menuItemId);
            return mi ? sum + mi.price * (i.quantity || 1) : sum;
        }, 0);

        const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { username: true } });

        // İşletme, bu kullanıcının rezervasyonu için zaten bir adisyon açtıysa (VenueBill),
        // sipariş ayrı/bağlantısız bir kayıt olarak kalmasın — doğrudan aynı adisyona
        // eklensin (işletmeci tek yerden takip etsin).
        const existingBill = myMatch.venueReservationId
            ? await prisma.venueBill.findUnique({ where: { reservationId: myMatch.venueReservationId } })
            : null;

        if (existingBill && existingBill.status === 'OPEN') {
            for (const i of items) {
                const mi = menuItems.find(m => m.id === i.menuItemId);
                if (!mi) continue;
                const qty = i.quantity || 1;
                const existingItem = await prisma.venueBillItem.findFirst({ where: { billId: existingBill.id, menuItemId: mi.id } });
                if (existingItem) {
                    await prisma.venueBillItem.update({ where: { id: existingItem.id }, data: { quantity: existingItem.quantity + qty } });
                } else {
                    await prisma.venueBillItem.create({
                        data: { billId: existingBill.id, menuItemId: mi.id, name: mi.name, unitPrice: mi.price, quantity: qty, note: notes || null },
                    });
                }
            }
            const updatedBill = await recalcBillTotal(existingBill.id);
            await createNotification(venue.userId, 'VENUE_ORDER', '🛒 Adisyona Sipariş Eklendi',
                `${user?.username} adisyona ürün ekledi. Yeni toplam: ${updatedBill.totalPrice}₺`,
                { reservationId: myMatch.venueReservationId, venueId: id }
            );
            emitToUser(venue.userId, 'notification', {});
            return res.status(201).json({ addedToBill: true, bill: updatedBill });
        }

        const order = await prisma.venueOrder.create({
            data: {
                venueId: id, userId: req.userId,
                totalPrice, notes: notes || null,
                items: {
                    create: items.flatMap(i => {
                        const mi = menuItems.find(m => m.id === i.menuItemId);
                        if (!mi) return [];
                        return [{ menuItemId: i.menuItemId, quantity: i.quantity || 1, unitPrice: mi.price }];
                    }),
                },
            },
            include: { items: { include: { menuItem: true } } },
        });

        await createNotification(venue.userId, 'VENUE_ORDER', '🛒 Yeni Sipariş',
            `${user?.username} tesisinden sipariş verdi. Toplam: ${totalPrice}₺`,
            { orderId: order.id, venueId: id }
        );
        emitToUser(venue.userId, 'notification', {});

        res.status(201).json({ order });
    } catch (error) { next(error); }
};

export const getVenueOrders = async (req, res, next) => {
    try {
        const { id } = req.params;
        const venue = await prisma.businessVenue.findUnique({ where: { id } });
        if (!venue || venue.userId !== req.userId) return res.status(403).json({ message: 'Yetkisiz' });
        const orders = await prisma.venueOrder.findMany({
            where: { venueId: id },
            include: {
                user:  { select: { id: true, username: true, avatar: true } },
                items: { include: { menuItem: { select: { name: true, category: true } } } },
            },
            orderBy: { createdAt: 'desc' },
        });
        res.json(orders);
    } catch (error) { next(error); }
};

export const getUserOrders = async (req, res, next) => {
    try {
        const orders = await prisma.venueOrder.findMany({
            where: { userId: req.userId },
            include: {
                venue: { select: { id: true, name: true } },
                items: { include: { menuItem: { select: { name: true } } } },
            },
            orderBy: { createdAt: 'desc' },
            take: 20,
        });
        res.json(orders);
    } catch (error) { next(error); }
};

export const updateOrderStatus = async (req, res, next) => {
    try {
        const { orderId } = req.params;
        const { status } = req.body;
        const VALID = ['CONFIRMED', 'READY', 'CANCELLED'];
        if (!VALID.includes(status)) return res.status(400).json({ message: 'Geçersiz durum' });

        const order = await prisma.venueOrder.findUnique({ where: { id: orderId }, include: { venue: true } });
        if (!order) return res.status(404).json({ message: 'Sipariş bulunamadı' });
        if (order.venue.userId !== req.userId) return res.status(403).json({ message: 'Yetkisiz' });

        const updated = await prisma.venueOrder.update({ where: { id: orderId }, data: { status } });

        const statusMsg = { CONFIRMED: '✅ onaylandı', READY: '🟢 hazır', CANCELLED: '❌ iptal edildi' };
        await createNotification(order.userId, 'ORDER_STATUS', '📦 Sipariş Güncellendi',
            `${order.venue.name} siparişiniz ${statusMsg[status]}.`,
            { orderId, venueId: order.venueId }
        );
        emitToUser(order.userId, 'notification', {});

        res.json({ order: updated });
    } catch (error) { next(error); }
};

// ─── Adisyon ──────────────────────────────────────────────────────────────────

const assertBillReservationOwner = async (resId, userId) => {
    const reservation = await prisma.courtReservation.findUnique({ where: { id: resId }, include: { venue: true } });
    if (!reservation) return { error: 'Rezervasyon bulunamadı', status: 404 };
    if (reservation.venue.userId !== userId) return { error: 'Yetkisiz', status: 403 };
    const check = await assertProVenueOwner(reservation.venueId, userId, 'Adisyon özelliği');
    if (check.error) return check;
    return { reservation };
};

const recalcBillTotal = async (billId) => {
    const items = await prisma.venueBillItem.findMany({ where: { billId } });
    const totalPrice = items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
    return prisma.venueBill.update({ where: { id: billId }, data: { totalPrice }, include: { items: true } });
};

// Adisyonu getir (yoksa oluştur) — işletme sahibi, rezervasyon detayından
export const getOrCreateBill = async (req, res, next) => {
    try {
        const { resId } = req.params;
        const check = await assertBillReservationOwner(resId, req.userId);
        if (check.error) return res.status(check.status).json({ message: check.error });

        let bill = await prisma.venueBill.findUnique({
            where: { reservationId: resId },
            include: { items: { orderBy: { createdAt: 'asc' } } },
        });
        if (!bill) {
            bill = await prisma.venueBill.create({
                data: { venueId: check.reservation.venueId, reservationId: resId },
                include: { items: true },
            });
        }
        res.json({
            bill,
            reservation: {
                id: check.reservation.id,
                paymentMethod: check.reservation.paymentMethod,
                paymentConfirmStatus: check.reservation.paymentConfirmStatus,
            },
        });
    } catch (error) { next(error); }
};

export const addBillItem = async (req, res, next) => {
    try {
        const { billId } = req.params;
        const { menuItemId, quantity, name, unitPrice, note } = req.body;
        const qty = parseInt(quantity) || 1;

        const bill = await prisma.venueBill.findUnique({ where: { id: billId }, include: { venue: true } });
        if (!bill) return res.status(404).json({ message: 'Adisyon bulunamadı' });
        if (bill.venue.userId !== req.userId) return res.status(403).json({ message: 'Yetkisiz' });
        if (bill.status === 'PAID') return res.status(400).json({ message: 'Ödenmiş adisyon değiştirilemez' });

        if (menuItemId) {
            const menuItem = await prisma.venueMenuItem.findUnique({ where: { id: menuItemId } });
            if (!menuItem || menuItem.venueId !== bill.venueId) return res.status(400).json({ message: 'Ürün bulunamadı' });
            const existing = await prisma.venueBillItem.findFirst({ where: { billId, menuItemId } });
            if (existing) {
                await prisma.venueBillItem.update({ where: { id: existing.id }, data: { quantity: existing.quantity + qty } });
            } else {
                await prisma.venueBillItem.create({
                    data: { billId, menuItemId, name: menuItem.name, unitPrice: menuItem.price, quantity: qty },
                });
            }
        } else {
            if (!name?.trim()) return res.status(400).json({ message: 'İsim zorunludur' });
            const price = parseInt(unitPrice);
            if (!Number.isFinite(price) || price < 0) return res.status(400).json({ message: 'Geçersiz fiyat' });
            await prisma.venueBillItem.create({
                data: { billId, name: name.trim(), unitPrice: price, quantity: qty, note: note?.trim() || null },
            });
        }
        const updated = await recalcBillTotal(billId);
        res.status(201).json({ bill: updated });
    } catch (error) { next(error); }
};

export const updateBillItem = async (req, res, next) => {
    try {
        const { billId, itemId } = req.params;
        const { quantity } = req.body;
        const qty = parseInt(quantity) || 1;

        const bill = await prisma.venueBill.findUnique({ where: { id: billId }, include: { venue: true } });
        if (!bill) return res.status(404).json({ message: 'Adisyon bulunamadı' });
        if (bill.venue.userId !== req.userId) return res.status(403).json({ message: 'Yetkisiz' });
        if (bill.status === 'PAID') return res.status(400).json({ message: 'Ödenmiş adisyon değiştirilemez' });

        await prisma.venueBillItem.update({ where: { id: itemId }, data: { quantity: qty } });
        const updated = await recalcBillTotal(billId);
        res.json({ bill: updated });
    } catch (error) { next(error); }
};

export const removeBillItem = async (req, res, next) => {
    try {
        const { billId, itemId } = req.params;

        const bill = await prisma.venueBill.findUnique({ where: { id: billId }, include: { venue: true } });
        if (!bill) return res.status(404).json({ message: 'Adisyon bulunamadı' });
        if (bill.venue.userId !== req.userId) return res.status(403).json({ message: 'Yetkisiz' });
        if (bill.status === 'PAID') return res.status(400).json({ message: 'Ödenmiş adisyon değiştirilemez' });

        await prisma.venueBillItem.delete({ where: { id: itemId } });
        const updated = await recalcBillTotal(billId);
        res.json({ bill: updated });
    } catch (error) { next(error); }
};

export const markBillPaid = async (req, res, next) => {
    try {
        const { billId } = req.params;
        const paid = req.body?.paid !== false; // varsayılan true — eski istemcilerle uyumlu
        const bill = await prisma.venueBill.findUnique({ where: { id: billId }, include: { venue: true, reservation: true } });
        if (!bill) return res.status(404).json({ message: 'Adisyon bulunamadı' });
        if (bill.venue.userId !== req.userId) return res.status(403).json({ message: 'Yetkisiz' });

        const updated = await prisma.venueBill.update({
            where: { id: billId },
            data: paid ? { status: 'PAID', paidAt: new Date() } : { status: 'OPEN', paidAt: null },
            include: { items: true },
        });

        if (paid && bill.reservation.userId) {
            await createNotification(bill.reservation.userId, 'BILL_PAID', 'Adisyon Ödendi',
                `${bill.venue.name} adisyonunuz ödendi olarak işaretlendi.`,
                { billId, venueId: bill.venueId }
            );
            emitToUser(bill.reservation.userId, 'notification', {});
        }

        res.json({ bill: updated });
    } catch (error) { next(error); }
};

// Tesisin tüm adisyonları — "Adisyonlar" sekmesi
export const getVenueBills = async (req, res, next) => {
    try {
        const { id } = req.params;
        const venue = await prisma.businessVenue.findUnique({ where: { id } });
        if (!venue || venue.userId !== req.userId) return res.status(403).json({ message: 'Yetkisiz' });

        const bills = await prisma.venueBill.findMany({
            where: { venueId: id },
            include: {
                items: true,
                reservation: {
                    include: {
                        court: { select: { name: true } },
                        user: { select: { id: true, username: true, avatar: true } },
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
        });
        res.json(bills);
    } catch (error) { next(error); }
};
