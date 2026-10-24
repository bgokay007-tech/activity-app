// Videolar uygulamaya inmez. YouTube'un herkese açık kanal akışından (anahtar
// gerektirmeyen RSS) yalnız başlık, küçük kapak ve link alınır. Arama akışı
// YouTube tarafında 400 döndüğü için her dalın kendi resmi kanalları duruyor —
// padel listesine tenis düşmesin diye bilinmeyen dal tenis'e düşürülmez.
// Aynı istek 30 dk bellekte tutulur; sekme açılmadan hiç çekilmez.

const SPORT_CHANNELS = {
    tennis: [
        { id: 'UCY_5h5zaSwN7Or4kIJDYNXA', name: 'ATP Tour' },
        { id: 'UCaBIVVpHjq6j3tSyxwTE-8Q', name: 'WTA' },
        { id: 'UCbcxFkd6B9xUU54InHv4Tig', name: 'Tennis TV' },
        { id: 'UCDitdIjOjS9Myza9I21IqzQ', name: 'Tennis Channel' },
        { id: 'UCF3K1Jf8hjFW8qliei8fQ3A', name: 'Roland-Garros' },
    ],
    padel: [
        { id: 'UCK59dYVs3Wgwoe73nDTH6jw', name: 'Premier Padel' },
    ],
    pickleball: [
        { id: 'UC2HmpKPxdCOF0tuYgFjzXxw', name: 'USA Pickleball' },
    ],
    volleyball: [
        { id: 'UCNMg6XDhRZI2QzL4pWOvP_w', name: 'Volleyball World' },
    ],
    football: [
        { id: 'UCG5qGWdu8nIRZqJ_GgDwQ-w', name: 'Premier League' },
        { id: 'UC6UL29enLNe4mqwTfAyeNuw', name: 'Bundesliga' },
        { id: 'UCTv-XvfzLX3i4IGWAm4sbmA', name: 'LALIGA' },
        { id: 'UCpcTrCXblq78GZrTUTLWeBw', name: 'FIFA' },
    ],
    basketball: [
        { id: 'UCWJ2lWNubArHWmf3FIHbfcQ', name: 'NBA' },
        { id: 'UCGr3nR_XH9r6E5b09ZJAT9w', name: 'EUROLEAGUE BASKETBALL' },
        { id: 'UCtInrnU3QbWqFGsdKT1GZtg', name: 'FIBA Basketball' },
    ],
    badminton: [
        { id: 'UCOtZGk1PM25x-Z6Xuf_xYDQ', name: 'Badminton World' },
    ],
    table_tennis: [
        { id: 'UC2ySPiV4DZp58qQ4KES2o1g', name: 'ITTFWorld' },
        { id: 'UC9ckyA_A3MfXUa0ttxMoIZw', name: 'World Table Tennis' },
    ],
    handball: [
        { id: 'UCKFu5qzCVByhFF5EtAoFCvw', name: 'IHF Handball' },
    ],
    running: [
        { id: 'UCQk7fWv15ChjMJLCRVmtApw', name: 'World Athletics' },
        { id: 'UCx2Xqm8S3Ghqn5puhSKWH4Q', name: "Runner's World" },
    ],
    walking: [
        { id: 'UCQk7fWv15ChjMJLCRVmtApw', name: 'World Athletics' },
    ],
    hiking: [
        { id: 'UCwZcNfPpV9CXSVbpH1ckVmw', name: 'REI' },
    ],
    golf: [
        { id: 'UCKwGZZMrhNYKzucCtTPY2Nw', name: 'PGA Tour' },
        { id: 'UCvZwbZt6YZQ4wj_7qyjPDZw', name: 'DP World Tour' },
    ],
    wellness: [
        { id: 'UCFKE7WVJfvaHW5q283SxchA', name: 'Yoga With Adriene' },
        { id: 'UCIJwWYOfsCfz6PjxbONYXSg', name: 'Blogilates' },
    ],
    fitness_gym: [
        { id: 'UCe0TLA0EsQbE-MjuHXevj2A', name: 'ATHLEAN-X' },
        { id: 'UCIJwWYOfsCfz6PjxbONYXSg', name: 'Blogilates' },
    ],
    skiing_snowboard: [
        { id: 'UCa9XKkObeDzAyNVXVOvUemA', name: 'Freeride World Tour' },
    ],
    equestrian: [
        { id: 'UCb3uedNKWKG7gGDYQJ1VsWg', name: 'FEI' },
    ],
    extreme_sports: [
        { id: 'UCblfuW_4rakIf2h6aqANefA', name: 'Red Bull' },
        { id: 'UCqhnX4jA0A5paNd1v-zEysw', name: 'GoPro' },
    ],
    camping: [
        { id: 'UCwZcNfPpV9CXSVbpH1ckVmw', name: 'REI' },
    ],
    motorcycle: [
        { id: 'UC8pYaQzbBBXg9GIOHRvTmDQ', name: 'MotoGP' },
    ],
    paintball: [
        { id: 'UCr2xUH5UaGtTxk3cYvJN-EQ', name: 'paintball' },
    ],
    airsoft: [
        { id: 'UCSIwQ7kxJktHlEIVWie8iDA', name: 'Airsoft GI' },
    ],
    shooting_hunting: [
        { id: 'UCcFugrtlMtDmX1yMp6x_C0Q', name: 'ISSF' },
    ],
    cycling: [
        { id: 'UCSpycUnuU0IVF7gGIhGojhg', name: 'Tour de France' },
    ],
    boxing: [
        { id: 'UC7LReVje9aPB4B6XAsXX8WQ', name: 'Matchroom Boxing' },
        { id: 'UCurvRE5fGcdUgCYWgh-BDsg', name: 'DAZN Boxing' },
    ],
    martial_arts: [
        { id: 'UCvgfXK4nTYKudb0rFR6noLA', name: 'UFC' },
    ],
    ice_hockey: [
        { id: 'UCqFMzb-4AUf6WAIbl132QKA', name: 'NHL' },
    ],
    foot_tennis: [
        { id: 'UCPBmgjwNZLq-kqozA6TNo3A', name: 'Fut Table' },
    ],
};

const CACHE_MS = 30 * 60 * 1000;
const cache = new Map();
const inflight = new Map();

function decodeXml(value) {
    return String(value || '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function parseEntries(xml, channelName) {
    const out = [];
    const re = /<entry>([\s\S]*?)<\/entry>/g;
    let m;
    while ((m = re.exec(xml)) && out.length < 3) {
        const block = m[1];
        const grab = (tag) => {
            const mm = block.match(new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`));
            return mm ? mm[1].trim() : '';
        };
        const videoId = grab('yt:videoId');
        if (!videoId) continue;
        const thumb = (block.match(/<media:thumbnail[^>]*url="([^"]+)"/) || [])[1]
            || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
        const author = (block.match(/<author>[\s\S]*?<name>([^<]*)<\/name>/) || [])[1] || channelName;
        out.push({
            videoId,
            title: decodeXml(grab('title')),
            author: decodeXml(author),
            published: grab('published'),
            thumb,
            url: `https://www.youtube.com/watch?v=${videoId}`,
        });
    }
    return out;
}

async function fetchChannel(channel) {
    const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${channel.id}`;
    const r = await fetch(url, {
        headers: { 'User-Agent': 'AcTiViTy-App/1.0' },
        signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return [];
    return parseEntries(await r.text(), channel.name);
}

async function loadSport(sport) {
    const channels = SPORT_CHANNELS[sport] || [];
    if (!channels.length) return { channels: [], videos: [] };
    const lists = await Promise.all(channels.map(ch => fetchChannel(ch).catch(() => [])));
    const videos = lists.flat()
        .sort((a, b) => String(b.published).localeCompare(String(a.published)))
        .slice(0, 12);
    return {
        channels: channels.map((ch, i) => ({
            id: ch.id,
            name: ch.name,
            url: `https://www.youtube.com/channel/${ch.id}`,
            thumb: lists[i][0]?.thumb || '',
        })),
        videos,
    };
}

export const getSportMedia = async (req, res, next) => {
    try {
        const sport = String(req.params.sport || '');
        const hit = cache.get(sport);
        if (hit && Date.now() - hit.at < CACHE_MS) return res.json(hit.data);
        let pending = inflight.get(sport);
        if (!pending) {
            pending = loadSport(sport).finally(() => inflight.delete(sport));
            inflight.set(sport, pending);
        }
        const data = await pending;
        cache.set(sport, { at: Date.now(), data });
        res.json(data);
    } catch (error) {
        next(error);
    }
};
