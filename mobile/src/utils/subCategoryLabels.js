// Alt dal (subCategory) id'sinden okunabilir isim üretir — bildirimlerde ve
// rezervasyon kartlarında "hangi aktivite" rozetini göstermek için kullanılır.
// (mobile/src/screens/main/CategoryScreen.js'teki SUB_MAP ile aynı çeviriler.)
const LABELS = {
    // SPORTS
    tennis: { en: 'Tennis', tr: 'Tenis', ru: 'Теннис', de: 'Tennis' },
    padel: { en: 'Padel', tr: 'Padel', ru: 'Падел', de: 'Padel' },
    volleyball: { en: 'Volleyball', tr: 'Voleybol', ru: 'Волейбол', de: 'Volleyball' },
    football: { en: 'Football', tr: 'Futbol', ru: 'Футбол', de: 'Fußball' },
    basketball: { en: 'Basketball', tr: 'Basketbol', ru: 'Баскетбол', de: 'Basketball' },
    running: { en: 'Running', tr: 'Koşu', ru: 'Бег', de: 'Laufen' },
    wellness: { en: 'Yoga / Pilates / Reformer', tr: 'Yoga / Pilates / Reformer', ru: 'Йога / Пилатес / Реформер', de: 'Yoga / Pilates / Reformer' },
    table_tennis: { en: 'Table Tennis', tr: 'Masa Tenisi', ru: 'Настольный теннис', de: 'Tischtennis' },
    climbing: { en: 'Climbing', tr: 'Tırmanış', ru: 'Скалолазание', de: 'Klettern' },
    archery: { en: 'Archery', tr: 'Okçuluk', ru: 'Стрельба из лука', de: 'Bogenschießen' },
    walking: { en: 'Walking', tr: 'Yürüyüş', ru: 'Ходьба', de: 'Spazieren' },
    foot_tennis: { en: 'Foot Tennis', tr: 'Ayak Tenisi', ru: 'Футбольный теннис', de: 'Fußtennis' },
    sup_kano: { en: 'SUP & Canoe', tr: 'SUP & Kano', ru: 'SUP и каноэ', de: 'SUP & Kanu' },
    handball: { en: 'Handball', tr: 'Hentbol', ru: 'Гандбол', de: 'Handball' },
    badminton: { en: 'Badminton', tr: 'Badminton', ru: 'Бадминтон', de: 'Badminton' },
    shooting_hunting: { en: 'Shooting & Hunting', tr: 'Atıcılık & Avcılık', ru: 'Стрельба и охота', de: 'Schießen & Jagen' },
    equestrian: { en: 'Equestrian', tr: 'Binicilik', ru: 'Конный спорт', de: 'Reiten' },
    golf: { en: 'Golf', tr: 'Golf', ru: 'Гольф', de: 'Golf' },
    fitness_gym: { en: 'Fitness & Gym', tr: 'Fitness & Spor Salonu', ru: 'Фитнес и тренажёрный зал', de: 'Fitness & Fitnessstudio' },
    skiing_snowboard: { en: 'Skiing & Snowboard', tr: 'Kayak & Snowboard', ru: 'Лыжи и сноуборд', de: 'Skifahren & Snowboard' },
    ice_skating: { en: 'Ice Skating', tr: 'Buz Pateni', ru: 'Катание на коньках', de: 'Eislaufen' },
    hiking: { en: 'Hiking', tr: 'Doğa Yürüyüşü', ru: 'Пеший туризм', de: 'Wandern' },
    camping: { en: 'Camping', tr: 'Kamp', ru: 'Кемпинг', de: 'Camping' },
    motorcycle: { en: 'Motorcycle Riding', tr: 'Motosiklet', ru: 'Мотоцикл', de: 'Motorradfahren' },
    extreme_sports: { en: 'Extreme Sports', tr: 'Ekstrem Sporlar', ru: 'Экстремальные виды спорта', de: 'Extremsport' },
    paintball: { en: 'Paintball', tr: 'Paintball', ru: 'Пейнтбол', de: 'Paintball' },
    airsoft: { en: 'Airsoft', tr: 'Airsoft', ru: 'Страйкбол', de: 'Airsoft' },
    swimming: { en: 'Swimming', tr: 'Yüzme', ru: 'Плавание', de: 'Schwimmen' },
    cycling: { en: 'Cycling', tr: 'Bisiklet', ru: 'Велоспорт', de: 'Radfahren' },
    boxing: { en: 'Boxing', tr: 'Boks', ru: 'Бокс', de: 'Boxen' },
    martial_arts: { en: 'Martial Arts', tr: 'Dövüş Sanatları', ru: 'Боевые искусства', de: 'Kampfsport' },
    // SOCIAL
    friend_finding: { en: 'Friend Finding', tr: 'Arkadaş Bulma', ru: 'Поиск друзей', de: 'Freunde finden' },
    sanal_alem: { en: 'Virtual World', tr: 'Sanal Alem', ru: 'Виртуальный мир', de: 'Virtuelle Welt' },
    // ARTS
    painting: { en: 'Painting', tr: 'Resim', ru: 'Живопись', de: 'Malerei' },
    music: { en: 'Music', tr: 'Müzik', ru: 'Музыка', de: 'Musik' },
    theater: { en: 'Theater', tr: 'Tiyatro', ru: 'Театр', de: 'Theater' },
    cinema: { en: 'Cinema', tr: 'Sinema', ru: 'Кино', de: 'Kino' },
    literature: { en: 'Literature', tr: 'Edebiyat', ru: 'Литература', de: 'Literatur' },
    writing: { en: 'Writing', tr: 'Yazarlık', ru: 'Писательство', de: 'Schreiben' },
    sculpture: { en: 'Sculpture', tr: 'Heykel', ru: 'Скульптура', de: 'Bildhauerei' },
    architecture: { en: 'Architecture', tr: 'Mimari', ru: 'Архитектура', de: 'Architektur' },
    opera: { en: 'Opera', tr: 'Opera', ru: 'Опера', de: 'Oper' },
    ceramics: { en: 'Ceramics', tr: 'Seramik', ru: 'Керамика', de: 'Keramik' },
    poetry: { en: 'Poetry', tr: 'Şiir', ru: 'Поэзия', de: 'Poesie' },
    photography: { en: 'Photography', tr: 'Fotoğrafçılık', ru: 'Фотография', de: 'Fotografie' },
    illustration: { en: 'Illustration', tr: 'İllüstrasyon', ru: 'Иллюстрация', de: 'Illustration' },
    dance: { en: 'Dance', tr: 'Dans', ru: 'Танцы', de: 'Tanz' },
    // GAMES
    fps: { en: 'FPS', tr: 'FPS', ru: 'Шутер от первого лица', de: 'Ego-Shooter' },
    moba: { en: 'MOBA', tr: 'MOBA', ru: 'MOBA', de: 'MOBA' },
    strategy: { en: 'Strategy', tr: 'Strateji', ru: 'Стратегия', de: 'Strategie' },
    sports_games: { en: 'Sports Games', tr: 'Spor Oyunları', ru: 'Спортивные игры', de: 'Sportspiele' },
    boardgames: { en: 'Board Games', tr: 'Kutu Oyunları', ru: 'Настольные игры', de: 'Brettspiele' },
    battle_royale: { en: 'Battle Royale', tr: 'Battle Royale', ru: 'Королевская битва', de: 'Battle Royale' },
    simulation: { en: 'Simulation', tr: 'Simülasyon', ru: 'Симулятор', de: 'Simulation' },
    puzzle: { en: 'Puzzle', tr: 'Bulmaca', ru: 'Головоломка', de: 'Puzzle' },
    racing: { en: 'Racing', tr: 'Yarış', ru: 'Гонки', de: 'Rennspiele' },
    card_games: { en: 'Card Games', tr: 'Kart Oyunları', ru: 'Карточные игры', de: 'Kartenspiele' },
    batak: { en: 'Batak', tr: 'Batak', ru: 'Батак', de: 'Batak' },
    okey: { en: 'Okey', tr: 'Okey', ru: 'Окей', de: 'Okey' },
    chess: { en: 'Chess', tr: 'Satranç', ru: 'Шахматы', de: 'Schach' },
    tavla: { en: 'Backgammon', tr: 'Tavla', ru: 'Нарды', de: 'Backgammon' },
};

export function getSubCategoryLabel(subCategory, lang = 'tr') {
    if (!subCategory) return '';
    const entry = LABELS[subCategory];
    if (entry) return lang === 'tr' ? entry.tr : lang === 'ru' ? entry.ru : lang === 'de' ? entry.de : entry.en;
    return subCategory.charAt(0).toUpperCase() + subCategory.slice(1).replace(/_/g, ' ');
}
