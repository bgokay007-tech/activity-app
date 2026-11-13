/** Spor rehberi dünya sıralaması — ESPN HTML'den ATP/WTA (6 saat cache). */

const TTL_MS = 6 * 60 * 60 * 1000;
const cache = {
    at: 0,
    atp: [],
    wta: [],
};

const UA = 'Mozilla/5.0 (compatible; AcTiViTyBot/1.0)';

function parseEspnRankings(html) {
    const re = /<span class="rank_column">(\d+)<\/span>[\s\S]*?tennis\/player\/_\/id\/\d+\/([^"]+)">([^<]+)</gi;
    const out = [];
    const seen = new Set();
    let m;
    while ((m = re.exec(html))) {
        const rank = Number(m[1]);
        const slug = String(m[2] || '').trim();
        const name = String(m[3] || '').trim();
        if (!rank || !name || seen.has(slug)) continue;
        seen.add(slug);
        out.push({
            rank,
            name,
            slug,
            key: name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''),
        });
        if (out.length >= 100) break;
    }
    return out;
}

async function fetchEspn(url) {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html' } });
    if (!res.ok) throw new Error(`espn ${res.status}`);
    return parseEspnRankings(await res.text());
}

async function refreshTennisRankings(force = false) {
    if (!force && cache.at && Date.now() - cache.at < TTL_MS && cache.atp.length) return cache;
    try {
        const [atp, wta] = await Promise.all([
            fetchEspn('https://www.espn.com/tennis/rankings'),
            fetchEspn('https://www.espn.com/tennis/rankings/_/type/wta'),
        ]);
        if (atp.length) cache.atp = atp;
        if (wta.length) cache.wta = wta;
        cache.at = Date.now();
    } catch (e) {
        // Eski cache varsa onu kullan; yoksa boş dön — mobil fallbackRank ile idare eder.
        console.warn('[sportGuide] ranking fetch failed:', e?.message || e);
        if (!cache.at) cache.at = Date.now();
    }
    return cache;
}

/** GET /api/sport-guide/rankings/:sub */
export async function getWorldRankings(req, res) {
    try {
        const sub = String(req.params.sub || '').toLowerCase();
        if (sub === 'tennis') {
            const data = await refreshTennisRankings(false);
            return res.json({
                sub,
                updatedAt: data.at || null,
                tours: {
                    ATP: data.atp,
                    WTA: data.wta,
                },
            });
        }
        // Diğer dallar için henüz canlı kaynak yok — boş tours.
        return res.json({ sub, updatedAt: null, tours: {} });
    } catch (e) {
        console.error('getWorldRankings', e);
        return res.status(500).json({ message: 'Sıralama alınamadı' });
    }
}
