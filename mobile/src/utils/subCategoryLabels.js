// Alt dal (subCategory) id'sinden okunabilir isim üretir — bildirimlerde ve
// rezervasyon kartlarında "hangi aktivite" rozetini göstermek için kullanılır.
// (mobile/src/screens/main/CategoryScreen.js'teki SUB_MAP ile aynı çeviriler.)
const LABELS = {
    // SPORTS
    tennis: { en: 'Tennis', tr: 'Tenis' },
    padel: { en: 'Padel', tr: 'Padel' },
    volleyball: { en: 'Volleyball', tr: 'Voleybol' },
    football: { en: 'Football', tr: 'Futbol' },
    basketball: { en: 'Basketball', tr: 'Basketbol' },
    running: { en: 'Running', tr: 'Koşu' },
    wellness: { en: 'Yoga / Pilates / Reformer', tr: 'Yoga / Pilates / Reformer' },
    table_tennis: { en: 'Table Tennis', tr: 'Masa Tenisi' },
    climbing: { en: 'Climbing', tr: 'Tırmanış' },
    archery: { en: 'Archery', tr: 'Okçuluk' },
    walking: { en: 'Walking', tr: 'Yürüyüş' },
    foot_tennis: { en: 'Foot Tennis', tr: 'Ayak Tenisi' },
    sup_kano: { en: 'SUP & Canoe', tr: 'SUP & Kano' },
    handball: { en: 'Handball', tr: 'Hentbol' },
    badminton: { en: 'Badminton', tr: 'Badminton' },
    shooting_hunting: { en: 'Shooting & Hunting', tr: 'Atıcılık & Avcılık' },
    equestrian: { en: 'Equestrian', tr: 'Binicilik' },
    golf: { en: 'Golf', tr: 'Golf' },
    fitness_gym: { en: 'Fitness & Gym', tr: 'Fitness & Spor Salonu' },
    skiing_snowboard: { en: 'Skiing & Snowboard', tr: 'Kayak & Snowboard' },
    ice_skating: { en: 'Ice Skating', tr: 'Buz Pateni' },
    hiking: { en: 'Hiking', tr: 'Doğa Yürüyüşü' },
    camping: { en: 'Camping', tr: 'Kamp' },
    motorcycle: { en: 'Motorcycle Riding', tr: 'Motosiklet' },
    extreme_sports: { en: 'Extreme Sports', tr: 'Ekstrem Sporlar' },
    paintball: { en: 'Paintball', tr: 'Paintball' },
    airsoft: { en: 'Airsoft', tr: 'Airsoft' },
    swimming: { en: 'Swimming', tr: 'Yüzme' },
    cycling: { en: 'Cycling', tr: 'Bisiklet' },
    boxing: { en: 'Boxing', tr: 'Boks' },
    martial_arts: { en: 'Martial Arts', tr: 'Dövüş Sanatları' },
    // SOCIAL
    friend_finding: { en: 'Friend Finding', tr: 'Arkadaş Bulma' },
    language: { en: 'Language Exchange', tr: 'Dil Değişimi' },
    // ARTS
    painting: { en: 'Painting', tr: 'Resim' },
    music: { en: 'Music', tr: 'Müzik' },
    theater: { en: 'Theater', tr: 'Tiyatro' },
    cinema: { en: 'Cinema', tr: 'Sinema' },
    literature: { en: 'Literature', tr: 'Edebiyat' },
    writing: { en: 'Writing', tr: 'Yazarlık' },
    sculpture: { en: 'Sculpture', tr: 'Heykel' },
    architecture: { en: 'Architecture', tr: 'Mimari' },
    opera: { en: 'Opera', tr: 'Opera' },
    ceramics: { en: 'Ceramics', tr: 'Seramik' },
    poetry: { en: 'Poetry', tr: 'Şiir' },
    photography: { en: 'Photography', tr: 'Fotoğrafçılık' },
    illustration: { en: 'Illustration', tr: 'İllüstrasyon' },
    dance: { en: 'Dance', tr: 'Dans' },
    // GAMES
    fps: { en: 'FPS', tr: 'FPS' },
    moba: { en: 'MOBA', tr: 'MOBA' },
    strategy: { en: 'Strategy', tr: 'Strateji' },
    sports_games: { en: 'Sports Games', tr: 'Spor Oyunları' },
    boardgames: { en: 'Board Games', tr: 'Kutu Oyunları' },
    battle_royale: { en: 'Battle Royale', tr: 'Battle Royale' },
    simulation: { en: 'Simulation', tr: 'Simülasyon' },
    puzzle: { en: 'Puzzle', tr: 'Bulmaca' },
    racing: { en: 'Racing', tr: 'Yarış' },
    card_games: { en: 'Card Games', tr: 'Kart Oyunları' },
    batak: { en: 'Batak', tr: 'Batak' },
    okey: { en: 'Okey', tr: 'Okey' },
    chess: { en: 'Chess', tr: 'Satranç' },
    tavla: { en: 'Backgammon', tr: 'Tavla' },
};

export function getSubCategoryLabel(subCategory, lang = 'tr') {
    if (!subCategory) return '';
    const entry = LABELS[subCategory];
    if (entry) return lang === 'tr' ? entry.tr : entry.en;
    return subCategory.charAt(0).toUpperCase() + subCategory.slice(1).replace(/_/g, ' ');
}
