// English RSS feeds (BBC Sport)
const RSS_FEEDS_EN = {
    tennis:     'https://feeds.bbci.co.uk/sport/tennis/rss.xml',
    football:   'https://feeds.bbci.co.uk/sport/football/rss.xml',
    basketball: 'https://feeds.bbci.co.uk/sport/basketball/rss.xml',
    padel:      'https://news.google.com/rss/search?q=padel+sport&hl=en-US&gl=US&ceid=US:en',
    volleyball: 'https://news.google.com/rss/search?q=volleyball&hl=en-US&gl=US&ceid=US:en',
    // Basitleştirilmiş sekme setiyle açılan yeni dallar — dedike bir spor feed'i yok,
    // Google News arama sorgusu kullanılıyor (padel/volleyball ile aynı desen).
    airsoft:        'https://news.google.com/rss/search?q=airsoft&hl=en-US&gl=US&ceid=US:en',
    archery:        'https://news.google.com/rss/search?q=archery&hl=en-US&gl=US&ceid=US:en',
    camping:        'https://news.google.com/rss/search?q=camping&hl=en-US&gl=US&ceid=US:en',
    climbing:       'https://news.google.com/rss/search?q=rock+climbing&hl=en-US&gl=US&ceid=US:en',
    equestrian:     'https://news.google.com/rss/search?q=equestrian+horse+riding&hl=en-US&gl=US&ceid=US:en',
    extreme_sports: 'https://news.google.com/rss/search?q=extreme+sports&hl=en-US&gl=US&ceid=US:en',
    fitness_gym:    'https://news.google.com/rss/search?q=fitness+gym&hl=en-US&gl=US&ceid=US:en',
    foot_tennis:    'https://news.google.com/rss/search?q=foot+tennis&hl=en-US&gl=US&ceid=US:en',
    paintball:      'https://news.google.com/rss/search?q=paintball&hl=en-US&gl=US&ceid=US:en',
    sup_kano:       'https://news.google.com/rss/search?q=stand+up+paddle+kayak+canoe&hl=en-US&gl=US&ceid=US:en',
    running:        'https://news.google.com/rss/search?q=running+marathon&hl=en-US&gl=US&ceid=US:en',
    walking:        'https://news.google.com/rss/search?q=walking+fitness&hl=en-US&gl=US&ceid=US:en',
    hiking:         'https://news.google.com/rss/search?q=hiking+trail&hl=en-US&gl=US&ceid=US:en',
};

// Turkish Google News RSS feeds
const RSS_FEEDS_TR = {
    tennis:     'https://news.google.com/rss/search?q=tenis+spor&hl=tr&gl=TR&ceid=TR:tr',
    football:   'https://news.google.com/rss/search?q=futbol+spor&hl=tr&gl=TR&ceid=TR:tr',
    basketball: 'https://news.google.com/rss/search?q=basketbol+spor&hl=tr&gl=TR&ceid=TR:tr',
    padel:      'https://news.google.com/rss/search?q=padel+tenis&hl=tr&gl=TR&ceid=TR:tr',
    volleyball: 'https://news.google.com/rss/search?q=voleybol+spor&hl=tr&gl=TR&ceid=TR:tr',
    airsoft:        'https://news.google.com/rss/search?q=airsoft&hl=tr&gl=TR&ceid=TR:tr',
    archery:        'https://news.google.com/rss/search?q=okçuluk+spor&hl=tr&gl=TR&ceid=TR:tr',
    camping:        'https://news.google.com/rss/search?q=kamp&hl=tr&gl=TR&ceid=TR:tr',
    climbing:       'https://news.google.com/rss/search?q=tırmanış+spor&hl=tr&gl=TR&ceid=TR:tr',
    equestrian:     'https://news.google.com/rss/search?q=binicilik+at+sporu&hl=tr&gl=TR&ceid=TR:tr',
    extreme_sports: 'https://news.google.com/rss/search?q=ekstrem+spor&hl=tr&gl=TR&ceid=TR:tr',
    fitness_gym:    'https://news.google.com/rss/search?q=fitness+spor+salonu&hl=tr&gl=TR&ceid=TR:tr',
    foot_tennis:    'https://news.google.com/rss/search?q=ayak+tenisi&hl=tr&gl=TR&ceid=TR:tr',
    paintball:      'https://news.google.com/rss/search?q=paintball&hl=tr&gl=TR&ceid=TR:tr',
    sup_kano:       'https://news.google.com/rss/search?q=sup+kano+kürek&hl=tr&gl=TR&ceid=TR:tr',
    running:        'https://news.google.com/rss/search?q=koşu+maraton&hl=tr&gl=TR&ceid=TR:tr',
    walking:        'https://news.google.com/rss/search?q=yürüyüş+spor&hl=tr&gl=TR&ceid=TR:tr',
    hiking:         'https://news.google.com/rss/search?q=doğa+yürüyüşü&hl=tr&gl=TR&ceid=TR:tr',
};

const WELLNESS_QUERIES = {
    en: ['yoga+pilates+reformer', 'yoga+workout+fitness', 'pilates+exercise'],
    tr: ['yoga+pilates+spor', 'yoga+egzersiz+fitness', 'pilates+spor+turkey'],
};
const WELLNESS_LOCALE = {
    en: 'hl=en-US&gl=US&ceid=US:en',
    tr: 'hl=tr&gl=TR&ceid=TR:tr',
};

const WELLNESS_BRANCHES = new Set(['yoga', 'pilates', 'reformer', 'wellness']);

function parseRSS(xml) {
    const items = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;
    while ((match = itemRegex.exec(xml)) !== null) {
        const block = match[1];
        const get = (tag) => {
            const m = block.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}[^>]*>([^<]*)<\\/${tag}>`));
            return m ? (m[1] || m[2] || '').trim() : '';
        };
        const thumbMatch = block.match(/url="([^"]+)"[^/]*\/>/);
        const linkMatch  = block.match(/<link>([^<]+)<\/link>|<link\/>([^<]*)/);
        items.push({
            title:       get('title'),
            link:        linkMatch ? (linkMatch[1] || '').trim() : '',
            description: get('description'),
            pubDate:     get('pubDate'),
            thumbnail:   thumbMatch ? thumbMatch[1] : '',
        });
    }
    return items;
}

async function fetchFeed(url) {
    try {
        const r = await fetch(url, { headers: { 'User-Agent': 'AcTiViTy-App/1.0' } });
        if (!r.ok) return [];
        return parseRSS(await r.text());
    } catch { return []; }
}

export const getNews = async (req, res, next) => {
    try {
        const { sport = 'tennis' } = req.params;
        const lang = (req.query.lang === 'tr') ? 'tr' : 'en';

        if (WELLNESS_BRANCHES.has(sport)) {
            const queries  = WELLNESS_QUERIES[lang];
            const locale   = WELLNESS_LOCALE[lang];
            const feeds    = queries.map(q => `https://news.google.com/rss/search?q=${q}&${locale}`);
            const allItems = (await Promise.all(feeds.map(fetchFeed))).flat();

            const seen = new Set();
            const unique = allItems.filter(item => {
                if (!item.title || seen.has(item.title)) return false;
                seen.add(item.title);
                return true;
            });

            return res.json(unique.slice(0, 30));
        }

        const feeds = lang === 'tr' ? RSS_FEEDS_TR : RSS_FEEDS_EN;
        const feedUrl = feeds[sport] || feeds.tennis;
        const response = await fetch(feedUrl, { headers: { 'User-Agent': 'AcTiViTy-App/1.0' } });
        if (!response.ok) return res.status(502).json({ message: 'Failed to fetch news feed' });

        const xml   = await response.text();
        const items = parseRSS(xml);
        res.json(items);
    } catch (error) {
        next(error);
    }
};
