import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/**
 * Dal bazlı ekipman kataloğu — başlıkta iddia edilen ürün ile fotoğrafın
 * eşleşmesi için AI'ya verilir. "raket" yazıp selfie koymak reddedilir.
 */
const EQUIPMENT_CATALOG = {
    tennis: [
        {
            keys: ['raket', 'racket', 'racquet', 'raketi'],
            label: 'tenis raketi',
            visuals: 'tennis racket / racquet frame, head, throat, handle, grip tape, or strings (kordaj) — not a selfie or unrelated object',
        },
        {
            keys: ['top', 'ball', 'toplar', 'balls'],
            label: 'tenis topu',
            visuals: 'yellow/optic tennis ball(s) with curved seam — not other balls unless clearly tennis',
        },
        {
            keys: ['grip', 'overgrip', 'over grip', 'sap', 'kabza'],
            label: 'grip / overgrip',
            visuals: 'racket grip tape, overgrip roll/pack, or handle wrap — not empty hands/selfie',
        },
        {
            keys: ['kordaj', 'string', 'tel', 'strings'],
            label: 'kordaj / tel',
            visuals: 'tennis string reel, set, or strung racket bed showing strings',
        },
        {
            keys: ['çanta', 'canta', 'bag', 'backpack', 'raket çantası'],
            label: 'raket çantası',
            visuals: 'tennis racket bag / backpack designed for rackets',
        },
        {
            keys: ['ayakkabı', 'ayakkabi', 'shoe', 'shoes', 'krampon'],
            label: 'tenis ayakkabısı',
            visuals: 'tennis shoes / court sneakers',
        },
        {
            keys: ['sallantı', 'sallanti', 'damper', 'titreşim', 'titresim', 'vibra'],
            label: 'titreşim önleyici',
            visuals: 'racket vibration dampener near strings',
        },
        {
            keys: ['bileklik', 'wristband', 'bandana', 'saç bandı', 'sac bandi'],
            label: 'bileklik / bandana',
            visuals: 'sports wristband or headband for tennis',
        },
        {
            keys: ['file', 'net'],
            label: 'tenis filesi',
            visuals: 'tennis net',
        },
        {
            keys: ['tırnak', 'tirnak', 'nail', 'şablon', 'sablon', 'stencil'],
            label: 'stencil / aksesuar',
            visuals: 'racket stencil or small tennis accessory clearly for tennis gear',
        },
    ],
    padel: [
        { keys: ['pala', 'raket', 'racket'], label: 'padel pala', visuals: 'padel racket/pala with holes' },
        { keys: ['top', 'ball'], label: 'padel topu', visuals: 'padel balls' },
        { keys: ['grip', 'overgrip'], label: 'grip', visuals: 'grip / overgrip' },
        { keys: ['çanta', 'canta', 'bag'], label: 'çanta', visuals: 'padel bag' },
    ],
    badminton: [
        { keys: ['raket', 'racket'], label: 'badminton raketi', visuals: 'badminton racket' },
        { keys: ['shuttle', 'tüy', 'tuy', 'top'], label: 'shuttlecock', visuals: 'shuttlecock / birdie' },
        { keys: ['grip'], label: 'grip', visuals: 'grip tape' },
        { keys: ['çanta', 'canta', 'bag'], label: 'çanta', visuals: 'badminton bag' },
    ],
    table_tennis: [
        { keys: ['raket', 'paddle', 'blade'], label: 'masa tenisi raketi', visuals: 'table tennis paddle/blade with rubber' },
        { keys: ['top', 'ball'], label: 'masa tenisi topu', visuals: 'small table tennis balls' },
        { keys: ['lastik', 'rubber'], label: 'lastik', visuals: 'TT rubber sheets' },
        { keys: ['masa', 'table'], label: 'masa', visuals: 'table tennis table' },
    ],
    pickleball: [
        { keys: ['paddle', 'raket'], label: 'pickleball paddle', visuals: 'pickleball paddle' },
        { keys: ['top', 'ball'], label: 'pickleball', visuals: 'perforated pickleball' },
    ],
    squash: [
        { keys: ['raket', 'racket'], label: 'squash raketi', visuals: 'squash racket' },
        { keys: ['top', 'ball'], label: 'squash topu', visuals: 'squash ball' },
        { keys: ['grip'], label: 'grip', visuals: 'grip tape' },
    ],
    football: [
        { keys: ['top', 'ball'], label: 'futbol topu', visuals: 'soccer/football ball' },
        { keys: ['krampon', 'cleat', 'ayakkabı', 'ayakkabi'], label: 'krampon', visuals: 'football cleats' },
        { keys: ['forma', 'jersey'], label: 'forma', visuals: 'football jersey' },
        { keys: ['eldiven', 'glove'], label: 'kaleci eldiveni', visuals: 'goalkeeper gloves' },
    ],
    basketball: [
        { keys: ['top', 'ball'], label: 'basketbol topu', visuals: 'basketball' },
        { keys: ['ayakkabı', 'ayakkabi', 'shoe'], label: 'basketbol ayakkabısı', visuals: 'basketball shoes' },
        { keys: ['file', 'hoop', 'pota'], label: 'pota/file', visuals: 'basketball hoop/net' },
    ],
    volleyball: [
        { keys: ['top', 'ball'], label: 'voleybol topu', visuals: 'volleyball' },
        { keys: ['dizlik', 'knee'], label: 'dizlik', visuals: 'volleyball knee pads' },
        { keys: ['ayakkabı', 'ayakkabi', 'shoe'], label: 'voleybol ayakkabısı', visuals: 'indoor volleyball shoes' },
    ],
};

/** Açıkça spor dışı / yemek vb. — AI yokken de engelle. */
const OBVIOUS_UNRELATED = /\b(menemen|lahmacun|pide|kebap|kebab|pizza|hamburger|burger|yemek|yeme[gğ]i|çorba|kahvalt[ıi]|breakfast|recipe|tarif|yemekleri|dessert|tatl[ıi]|cake|pasta|sushi|noodle|köfte|kofte|döner|doner|simit|börek|borek|baklava|makarna|salata|food|meal|cook|cooking|mutfak|selfie|otomobil|araba|telefon|iphone)\b/i;

function sportLabel(sub) {
    return String(sub || '').replace(/_/g, ' ');
}

function normalizeTr(s) {
    return String(s || '')
        .toLowerCase()
        .replace(/ı/g, 'i')
        .replace(/İ/g, 'i')
        .replace(/ş/g, 's')
        .replace(/ğ/g, 'g')
        .replace(/ü/g, 'u')
        .replace(/ö/g, 'o')
        .replace(/ç/g, 'c');
}

/** Başlıktan iddia edilen ekipman tipini çıkar. */
export function detectClaimedEquipment(subCategory, title, description = '') {
    const catalog = EQUIPMENT_CATALOG[subCategory] || [];
    const blob = normalizeTr(`${title} ${description}`);
    for (const item of catalog) {
        if (item.keys.some((k) => blob.includes(normalizeTr(k)))) {
            return item;
        }
    }
    return null;
}

async function loadImagesForVision(imageUrls, max = 3) {
    const out = [];
    const urls = (Array.isArray(imageUrls) ? imageUrls : [])
        .filter((u) => typeof u === 'string' && u.startsWith('http') && !u.includes('/video/'))
        .slice(0, max);

    for (const imageUrl of urls) {
        try {
            const imgResp = await fetch(imageUrl);
            if (!imgResp.ok) continue;
            const buffer = await imgResp.arrayBuffer();
            // Çok büyük dosyalar API'yi şişirmesin
            if (buffer.byteLength > 4_500_000) continue;
            const base64 = Buffer.from(buffer).toString('base64');
            const mime = imgResp.headers.get('content-type') || 'image/jpeg';
            const mediaType = mime.includes('png') ? 'image/png'
                : mime.includes('webp') ? 'image/webp'
                    : 'image/jpeg';
            out.push({
                type: 'image',
                source: { type: 'base64', media_type: mediaType, data: base64 },
            });
        } catch { /* skip */ }
    }
    return out;
}

/**
 * Başlık / açıklama + görsellerin dala ait ekipman olup olmadığını kontrol eder.
 * Fotoğraflarda iddia edilen ürün (raket, top, grip…) görünmezse reddeder.
 *
 * @returns {{ ok: boolean, reason?: string }}
 */
export async function validateEquipmentRelevance({
    category,
    subCategory,
    title,
    description,
    imageUrls = [],
}) {
    const t = String(title || '').trim();
    const d = String(description || '').trim();
    const blob = `${t} ${d}`;

    if (OBVIOUS_UNRELATED.test(blob)) {
        return {
            ok: false,
            reason: 'Bu ilan seçili spor dalıyla ilgili bir ekipman gibi görünmüyor. Lütfen dala uygun ürün adı ve fotoğraflar kullanın.',
        };
    }

    const claimed = detectClaimedEquipment(subCategory, t, d);
    const catalog = EQUIPMENT_CATALOG[subCategory] || [];
    const catalogHint = catalog.length
        ? catalog.map((c) => `- ${c.label}: ${c.visuals}`).join('\n')
        : '- Any legitimate sports equipment for this branch';

    const hasKey = process.env.ANTHROPIC_API_KEY
        && process.env.ANTHROPIC_API_KEY !== 'your_anthropic_api_key_here';

    if (!hasKey) {
        // Anahtar yoksa en azından bariz yemek/alakasız başlık engellendi; foto kontrolü yapılamaz
        return { ok: true };
    }

    const imageParts = await loadImagesForVision(imageUrls, 3);
    // Fotoğraf zorunlu — hiçbiri vision'a yüklenemediyse güvenli tarafta reddet
    if ((Array.isArray(imageUrls) ? imageUrls : []).some((u) => typeof u === 'string' && u.startsWith('http'))
        && imageParts.length === 0) {
        return {
            ok: false,
            reason: 'Fotoğraflar doğrulanamadı. Lütfen net ekipman fotoğrafları ekleyip tekrar deneyin.',
        };
    }

    try {
        const claimedBlock = claimed
            ? `Claimed product from title: "${claimed.label}".
Photos MUST clearly show that product (or its recognizable parts: ${claimed.visuals}).
If photos show a person/selfie, landscape, food, phone screen, or anything that is NOT this equipment → REJECT.`
            : `No specific product keyword detected. Photos must still show real ${sportLabel(subCategory)} sports EQUIPMENT / gear (not a selfie or unrelated object).`;

        const messageContent = [
            ...imageParts,
            {
                type: 'text',
                text: `You are a STRICT marketplace moderator for an activity app equipment listing.

Category: ${category || 'SPORTS'}
Sport / branch: ${sportLabel(subCategory)} (${subCategory})

Listing title: "${t}"
Listing description: "${d || '(empty)'}"

Known equipment types for this sport (what photos should look like):
${catalogHint}

${claimedBlock}

RULES (strict):
1. At least one uploaded photo must show the actual sports equipment being sold for this sport.
2. Title saying "raket/racket" while photos are selfies, faces, rooms, cars, food, memes → ok:false.
3. Title saying "tenis topu/ball" → photos must show tennis ball(s).
4. Title saying "grip/overgrip" → photos must show grip product or wrapped handle.
5. Parts of the equipment count (racket head, strings, grip, throat) — full product preferred.
6. REJECT if you cannot confidently see matching equipment in the images.
7. When unsure → REJECT (prefer false negatives over accepting fakes).

Respond ONLY with JSON:
{"ok":true} or {"ok":false,"reason":"short Turkish message telling the user to upload real equipment photos matching the title"}`,
            },
        ];

        const response = await anthropic.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 220,
            messages: [{ role: 'user', content: messageContent }],
        });
        const raw = (response.content?.[0]?.text || '').trim();
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            if (parsed && parsed.ok === false) {
                return {
                    ok: false,
                    reason: parsed.reason
                        || (claimed
                            ? `Fotoğraflarda ${claimed.label} görünmüyor. Lütfen ürünün net fotoğraflarını ekleyin.`
                            : 'Fotoğraflarda spor ekipmanı görünmüyor. Lütfen ürüne ait net fotoğraflar ekleyin.'),
                };
            }
            if (parsed && parsed.ok === true) return { ok: true };
        }
        // Belirsiz cevap → reddet
        return {
            ok: false,
            reason: 'Ekipman fotoğrafları doğrulanamadı. Lütfen başlıkla uyumlu net ürün fotoğrafları ekleyin.',
        };
    } catch (e) {
        console.warn('[equipmentRelevance] AI check failed:', e?.message || e);
        // AI hata verdiyse selfie + "raket" geçmesin diye güvenli reddet
        return {
            ok: false,
            reason: 'Ekipman kontrolü şu an tamamlanamadı. Lütfen biraz sonra net ürün fotoğraflarıyla tekrar deneyin.',
        };
    }
}
