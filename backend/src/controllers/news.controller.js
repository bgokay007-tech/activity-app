// English RSS feeds (BBC Sport)
const RSS_FEEDS_EN = {
    tennis:     'https://feeds.bbci.co.uk/sport/tennis/rss.xml',
    football:   'https://feeds.bbci.co.uk/sport/football/rss.xml',
    basketball: 'https://feeds.bbci.co.uk/sport/basketball/rss.xml',
    padel:      'https://news.google.com/rss/search?q=padel+sport&hl=en-US&gl=US&ceid=US:en',
    volleyball: 'https://news.google.com/rss/search?q=volleyball&hl=en-US&gl=US&ceid=US:en',
};

// Turkish Google News RSS feeds
const RSS_FEEDS_TR = {
    tennis:     'https://news.google.com/rss/search?q=tenis+spor&hl=tr&gl=TR&ceid=TR:tr',
    football:   'https://news.google.com/rss/search?q=futbol+spor&hl=tr&gl=TR&ceid=TR:tr',
    basketball: 'https://news.google.com/rss/search?q=basketbol+spor&hl=tr&gl=TR&ceid=TR:tr',
    padel:      'https://news.google.com/rss/search?q=padel+tenis&hl=tr&gl=TR&ceid=TR:tr',
    volleyball: 'https://news.google.com/rss/search?q=voleybol+spor&hl=tr&gl=TR&ceid=TR:tr',
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
