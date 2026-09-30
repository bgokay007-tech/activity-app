// Mobildeki CategoryScreen.js (SUB_MAP, SPORT_GROUPS, SUB_TINT) ve theme/visualAssets.js'in
// web ikizi. Backend /interests/categories sadece İngilizce isim döndürdüğü için web'de dal
// adları dil değişince çevrilmiyordu — etiketler buradan okunur. Mobilde değişirse burayı da güncelle.

const PHOTO_FILES = import.meta.glob('../assets/visual/*.jpg', { eager: true, import: 'default' });
const photo = (name) => PHOTO_FILES[`../assets/visual/${name}.jpg`] || null;

export const CAT_PHOTOS = {
    SPORTS: photo('cat-sports'),
    SOCIAL: photo('cat-social'),
    ARTS:   photo('cat-arts'),
    GAMES:  photo('cat-games'),
};

const SUB_PHOTO_FILE = {
    tennis: 'sub-tennis', padel: 'sub-padel', pickleball: 'sub-pickleball', football: 'sub-football',
    wellness: 'sub-yoga', basketball: 'sub-basketball', running: 'sub-running', climbing: 'sub-climbing',
    volleyball: 'sub-volleyball', badminton: 'sub-badminton', table_tennis: 'sub-table-tennis',
    foot_tennis: 'sub-foot-tennis', handball: 'sub-handball', golf: 'sub-golf', hiking: 'sub-hiking',
    camping: 'sub-camping', walking: 'sub-walking', archery: 'sub-archery', equestrian: 'sub-equestrian',
    sup_kano: 'sub-sup-kano', fitness_gym: 'sub-fitness', ice_skating: 'sub-ice-skating',
    skiing_snowboard: 'sub-skiing', motorcycle: 'sub-motorcycle', extreme_sports: 'sub-extreme',
    paintball: 'sub-paintball', airsoft: 'sub-airsoft', shooting_hunting: 'sub-shooting',
    painting: 'sub-painting', music: 'sub-music', theater: 'sub-theater', cinema: 'sub-cinema',
    literature: 'sub-literature', sculpture: 'sub-sculpture', architecture: 'sub-architecture',
    opera: 'sub-opera', ceramics: 'sub-ceramics', poetry: 'sub-poetry', photography: 'sub-photography',
    travel_explore: 'sub-travel-explore',
    batak: 'sub-batak', okey: 'sub-okey', chess: 'sub-chess', tavla: 'sub-tavla', fps: 'sub-fps',
    moba: 'sub-moba', strategy: 'sub-strategy', sports_games: 'sub-sports-games', boardgames: 'sub-boardgames',
};

// Spor dalında kategori stoğu (futbol sahası) fallback olmaz — kart renk+emoji kullanır.
export function photoForSub(subId, category) {
    if (SUB_PHOTO_FILE[subId]) return photo(SUB_PHOTO_FILE[subId]);
    const cat = String(category || '').toUpperCase();
    if (cat && cat !== 'SPORTS') return CAT_PHOTOS[cat] || null;
    return null;
}

// ids sırası = ilan sayısı eşitken popülerlik (soldan sağa).
export const SPORT_GROUPS = [
    { id: 'racket',  key: 'sport_group_racket',  ids: ['tennis', 'padel', 'table_tennis', 'badminton', 'pickleball'] },
    { id: 'team',    key: 'sport_group_team',    ids: ['volleyball', 'football', 'basketball', 'foot_tennis', 'handball'] },
    { id: 'outdoor', key: 'sport_group_outdoor', ids: ['running', 'camping', 'climbing', 'golf', 'equestrian', 'archery', 'sup_kano'] },
    { id: 'studio',  key: 'sport_group_studio',  ids: ['wellness', 'fitness_gym', 'ice_skating'] },
    { id: 'motor',   key: 'sport_group_motor',   ids: ['motorcycle', 'skiing_snowboard', 'paintball', 'airsoft', 'extreme_sports', 'shooting_hunting'] },
];

export const COURT_SUBS = new Set([
    'tennis', 'padel', 'badminton', 'table_tennis', 'pickleball', 'football', 'basketball',
    'volleyball', 'handball', 'golf', 'ice_skating', 'wellness', 'fitness_gym',
]);

export const SUB_TINT = {
    tennis: '#166534', padel: '#3f6212', badminton: '#115e59', table_tennis: '#1e3a8a', pickleball: '#4d7c0f', foot_tennis: '#365314',
    football: '#14532d', basketball: '#7c2d12', volleyball: '#1e40af', handball: '#9a3412',
    running: '#854d0e', walking: '#57534e', hiking: '#3f6212', camping: '#44403c', climbing: '#9a3412',
    sup_kano: '#0e7490', archery: '#7f1d1d', equestrian: '#78350f', golf: '#166534',
    wellness: '#6b21a8', fitness_gym: '#334155', ice_skating: '#1e3a5f',
    motorcycle: '#1c1917', extreme_sports: '#9f1239', paintball: '#3f3f46', airsoft: '#365314',
    skiing_snowboard: '#164e63', shooting_hunting: '#44403c',
};

export const SUB_MAP = {
    SPORTS: [
        { id: 'tennis',           en: 'Tennis',             tr: 'Tenis',                 ru: 'Теннис',                    de: 'Tennis',                  emoji: '🎾' },
        { id: 'padel',            en: 'Padel',              tr: 'Padel',                 ru: 'Падел',                     de: 'Padel',                   emoji: '🏓' },
        { id: 'pickleball',       en: 'Pickleball',         tr: 'Pickleball',            ru: 'Пиклбол',                   de: 'Pickleball',              emoji: '🏓' },
        { id: 'volleyball',       en: 'Volleyball',         tr: 'Voleybol',              ru: 'Волейбол',                  de: 'Volleyball',              emoji: '🏐' },
        { id: 'football',         en: 'Football',           tr: 'Futbol',                ru: 'Футбол',                    de: 'Fußball',                 emoji: '⚽' },
        { id: 'basketball',       en: 'Basketball',         tr: 'Basketbol',             ru: 'Баскетбол',                 de: 'Basketball',              emoji: '🏀' },
        { id: 'running',          en: 'Running & Walking',  tr: 'Koşu & Yürüyüş',        ru: 'Бег и ходьба',              de: 'Laufen & Gehen',          emoji: '🏃' },
        { id: 'wellness',         en: 'Yoga / Pilates / Reformer', tr: 'Yoga / Pilates / Reformer', ru: 'Йога / Пилатес / Реформер', de: 'Yoga / Pilates / Reformer', emoji: '🧘' },
        { id: 'table_tennis',     en: 'Table Tennis',       tr: 'Masa Tenisi',           ru: 'Настольный теннис',         de: 'Tischtennis',             emoji: '🏓' },
        { id: 'climbing',         en: 'Climbing',           tr: 'Tırmanış',              ru: 'Скалолазание',              de: 'Klettern',                emoji: '🧗' },
        { id: 'archery',          en: 'Archery',            tr: 'Okçuluk',               ru: 'Стрельба из лука',          de: 'Bogenschießen',           emoji: '🏹' },
        { id: 'foot_tennis',      en: 'Foot Tennis',        tr: 'Ayak Tenisi',           ru: 'Футбольный теннис',         de: 'Fußtennis',               emoji: '🦶' },
        { id: 'sup_kano',         en: 'SUP & Canoe',        tr: 'SUP & Kano',            ru: 'SUP и каноэ',               de: 'SUP & Kanu',              emoji: '🛶' },
        { id: 'handball',         en: 'Handball',           tr: 'Hentbol',               ru: 'Гандбол',                   de: 'Handball',                emoji: '🤾' },
        { id: 'badminton',        en: 'Badminton',          tr: 'Badminton',             ru: 'Бадминтон',                 de: 'Badminton',               emoji: '🏸' },
        { id: 'shooting_hunting', en: 'Shooting & Hunting', tr: 'Atıcılık & Avcılık',    ru: 'Стрельба и охота',          de: 'Schießen & Jagen',        emoji: '🔫' },
        { id: 'equestrian',       en: 'Equestrian',         tr: 'Binicilik',             ru: 'Конный спорт',              de: 'Reiten',                  emoji: '🐎' },
        { id: 'golf',             en: 'Golf',               tr: 'Golf',                  ru: 'Гольф',                     de: 'Golf',                    emoji: '⛳' },
        { id: 'fitness_gym',      en: 'Fitness & Gym',      tr: 'Fitness & Spor Salonu', ru: 'Фитнес и тренажёрный зал',  de: 'Fitness & Fitnessstudio', emoji: '🏋️' },
        { id: 'skiing_snowboard', en: 'Skiing & Snowboard', tr: 'Kayak & Snowboard',     ru: 'Лыжи и сноуборд',           de: 'Skifahren & Snowboard',   emoji: '⛷️' },
        { id: 'ice_skating',      en: 'Ice Skating',        tr: 'Buz Pateni',            ru: 'Катание на коньках',        de: 'Eislaufen',               emoji: '⛸️' },
        { id: 'camping',          en: 'Camping',            tr: 'Kamp',                  ru: 'Кемпинг',                   de: 'Camping',                 emoji: '🏕️' },
        { id: 'motorcycle',       en: 'Motorcycle Riding',  tr: 'Motosiklet',            ru: 'Мотоцикл',                  de: 'Motorradfahren',          emoji: '🏍️' },
        { id: 'extreme_sports',   en: 'Extreme Sports',     tr: 'Ekstrem Sporlar',       ru: 'Экстремальные виды спорта', de: 'Extremsport',             emoji: '🪂' },
        { id: 'paintball',        en: 'Paintball',          tr: 'Paintball',             ru: 'Пейнтбол',                  de: 'Paintball',               emoji: '🔫' },
        { id: 'airsoft',          en: 'Airsoft',            tr: 'Airsoft',               ru: 'Страйкбол',                 de: 'Airsoft',                 emoji: '🪖' },
    ],
    SOCIAL: [
        { id: 'friend_finding', en: 'Friend Finding',   tr: 'Arkadaş Bulma',      ru: 'Поиск друзей',           de: 'Freunde finden',     emoji: '🎉' },
        { id: 'travel_explore', en: 'Travel / Explore', tr: 'Seyahat / Keşfetme', ru: 'Путешествия / Открытия', de: 'Reisen / Entdecken', emoji: '✈️' },
        { id: 'sanal_alem',     en: 'Virtual World',    tr: 'Sanal Alem',         ru: 'Виртуальный мир',        de: 'Virtuelle Welt',     emoji: '🌐' },
    ],
    ARTS: [
        { id: 'painting',     en: 'Painting',     tr: 'Resim',         ru: 'Живопись',    de: 'Malerei',     emoji: '🎨' },
        { id: 'music',        en: 'Music',        tr: 'Müzik',         ru: 'Музыка',      de: 'Musik',       emoji: '🎵' },
        { id: 'theater',      en: 'Theater',      tr: 'Tiyatro',       ru: 'Театр',       de: 'Theater',     emoji: '🎭' },
        { id: 'cinema',       en: 'Cinema',       tr: 'Sinema',        ru: 'Кино',        de: 'Kino',        emoji: '🎬' },
        { id: 'literature',   en: 'Literature',   tr: 'Edebiyat',      ru: 'Литература',  de: 'Literatur',   emoji: '📚' },
        { id: 'sculpture',    en: 'Sculpture',    tr: 'Heykel',        ru: 'Скульптура',  de: 'Bildhauerei', emoji: '🗿' },
        { id: 'architecture', en: 'Architecture', tr: 'Mimari',        ru: 'Архитектура', de: 'Architektur', emoji: '🏛️' },
        { id: 'opera',        en: 'Opera',        tr: 'Opera',         ru: 'Опера',       de: 'Oper',        emoji: '🎼' },
        { id: 'ceramics',     en: 'Ceramics',     tr: 'Seramik',       ru: 'Керамика',    de: 'Keramik',     emoji: '🏺' },
        { id: 'poetry',       en: 'Poetry',       tr: 'Şiir',          ru: 'Поэзия',      de: 'Poesie',      emoji: '✍️' },
        { id: 'photography',  en: 'Photography',  tr: 'Fotoğrafçılık', ru: 'Фотография',  de: 'Fotografie',  emoji: '📷' },
    ],
    GAMES: [
        { id: 'fps',          en: 'FPS',          tr: 'FPS',           ru: 'Шутер от первого лица', de: 'Ego-Shooter', emoji: '🎯' },
        { id: 'moba',         en: 'MOBA',         tr: 'MOBA',          ru: 'MOBA',            de: 'MOBA',        emoji: '⚔️' },
        { id: 'strategy',     en: 'Strategy',     tr: 'Strateji',      ru: 'Стратегия',       de: 'Strategie',   emoji: '♟️' },
        { id: 'sports_games', en: 'Sports Games', tr: 'Spor Oyunları', ru: 'Спортивные игры', de: 'Sportspiele', emoji: '🎮' },
        { id: 'boardgames',   en: 'Board Games',  tr: 'Kutu Oyunları', ru: 'Настольные игры', de: 'Brettspiele', emoji: '🎲' },
        { id: 'batak',        en: 'Batak',        tr: 'Batak',         ru: 'Батак',           de: 'Batak',       emoji: '🃏' },
        { id: 'okey',         en: 'Okey',         tr: 'Okey',          ru: 'Окей',            de: 'Okey',        emoji: '🀄' },
        { id: 'chess',        en: 'Chess',        tr: 'Satranç',       ru: 'Шахматы',         de: 'Schach',      emoji: '♞' },
        { id: 'tavla',        en: 'Backgammon',   tr: 'Tavla',         ru: 'Нарды',           de: 'Backgammon',  emoji: '🎲' },
    ],
};

const ALL_SUBS = Object.values(SUB_MAP).flat();

export function subLabel(subOrId, lang = 'en') {
    const sub = typeof subOrId === 'string' ? ALL_SUBS.find(s => s.id === subOrId) : subOrId;
    if (!sub) {
        const id = String(subOrId || '');
        return id.charAt(0).toUpperCase() + id.slice(1).replace(/_/g, ' ');
    }
    return sub[lang] || sub.en;
}

export const LANGUAGES = [
    { code: 'tr', flag: '🇹🇷', name: 'Türkçe' },
    { code: 'en', flag: '🇬🇧', name: 'English' },
    { code: 'de', flag: '🇩🇪', name: 'Deutsch' },
    { code: 'ru', flag: '🇷🇺', name: 'Русский' },
];
