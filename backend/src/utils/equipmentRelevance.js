import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SPORT_HINTS = {
    tennis: ['tennis', 'tenis', 'racket', 'raket', 'racquet', 'ball', 'top', 'grip', 'string', 'kordaj', 'wilson', 'babolat', 'head', 'yonex'],
    padel: ['padel', 'racket', 'raket', 'pala'],
    badminton: ['badminton', 'shuttle', 'raket', 'yonex'],
    table_tennis: ['table tennis', 'masa tenisi', 'ping pong', 'pingpong', 'blade', 'rubber'],
    pickleball: ['pickleball', 'paddle'],
    squash: ['squash', 'raket'],
    football: ['football', 'futbol', 'soccer', 'cleat', 'krampon', 'ball', 'top'],
    basketball: ['basketball', 'basketbol', 'hoop', 'ball'],
    volleyball: ['volleyball', 'voleybol', 'ball'],
};

/** Açıkça spor dışı / yemek vb. — AI yokken de engelle. */
const OBVIOUS_UNRELATED = /\b(menemen|lahmacun|pide|kebap|kebab|pizza|hamburger|burger|yemek|yeme[gğ]i|çorba|kahvalt[ıi]|breakfast|recipe|tarif|yemekleri|dessert|tatl[ıi]|cake|pasta|sushi|noodle|köfte|kofte|döner|doner|simit|börek|borek|baklava|makarna|salata|food|meal|cook|cooking|mutfak)\b/i;

function sportLabel(sub) {
    return String(sub || '').replace(/_/g, ' ');
}

/**
 * Başlık / açıklama + (mümkünse) görsellerin dala ait ekipman olup olmadığını kontrol eder.
 * AI yoksa veya hata olursa kaba sezgisel kurallar uygulanır; menemen gibi açık
 * uyumsuzluklar yine de reddedilir.
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

    const hasKey = process.env.ANTHROPIC_API_KEY
        && process.env.ANTHROPIC_API_KEY !== 'your_anthropic_api_key_here';

    if (hasKey) {
        try {
            const messageContent = [];
            const urls = (Array.isArray(imageUrls) ? imageUrls : [])
                .filter((u) => typeof u === 'string' && u.startsWith('http') && !u.includes('/video/'))
                .slice(0, 2);

            for (const imageUrl of urls) {
                try {
                    const imgResp = await fetch(imageUrl);
                    if (!imgResp.ok) continue;
                    const buffer = await imgResp.arrayBuffer();
                    const base64 = Buffer.from(buffer).toString('base64');
                    const mime = imgResp.headers.get('content-type') || 'image/jpeg';
                    const mediaType = mime.includes('png') ? 'image/png'
                        : mime.includes('webp') ? 'image/webp'
                            : 'image/jpeg';
                    messageContent.push({
                        type: 'image',
                        source: { type: 'base64', media_type: mediaType, data: base64 },
                    });
                } catch { /* skip */ }
            }

            messageContent.push({
                type: 'text',
                text: `You moderate marketplace listings for an activity app.

Category: ${category || 'SPORTS'}
Sport / branch: ${sportLabel(subCategory)} (${subCategory})

Listing title: "${t}"
Listing description: "${d || '(empty)'}"

Decide if this listing is legitimate sports EQUIPMENT / gear for that branch
(rackets, balls, shoes, apparel for that sport, bags, grips, strings, etc.).

REJECT if:
- Food, meals, recipes (e.g. menemen), memes, unrelated products
- Photos clearly not showing equipment for this sport
- Title/description about something other than selling/renting gear for this sport

Respond ONLY with JSON:
{"ok":true} or {"ok":false,"reason":"short Turkish message for the user"}`,
            });

            const response = await anthropic.messages.create({
                model: 'claude-haiku-4-5-20251001',
                max_tokens: 200,
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
                            || 'İlan seçili spor dalıyla uyumlu görünmüyor. Uygun ekipman adı ve fotoğrafları kullanın.',
                    };
                }
                if (parsed && parsed.ok === true) return { ok: true };
            }
        } catch (e) {
            console.warn('[equipmentRelevance] AI check failed:', e?.message || e);
        }
    }

    // AI yok / başarısız: spor anahtar kelimesi varsa geç, yoksa yine de bariz yemek dışı bırak
    const hints = SPORT_HINTS[subCategory] || [];
    if (hints.length) {
        const lower = blob.toLowerCase();
        const hit = hints.some((h) => lower.includes(h.toLowerCase()));
        if (!hit && t.length >= 3) {
            // Anahtar kelime yoksa şüpheli — foto olmadan AI de yoksa yumuşak geç; ama
            // tamamen alakasız kısa saçma başlıkları engellemek için sadece OBVIOUS_UNRELATED yeterli.
        }
    }

    return { ok: true };
}
