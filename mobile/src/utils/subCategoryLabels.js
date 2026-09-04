// Alt dal (subCategory) id'sinden okunabilir isim üretir — bildirimlerde ve
// rezervasyon kartlarında "hangi aktivite" rozetini göstermek için kullanılır.
// (mobile/src/screens/main/CategoryScreen.js'teki SUB_MAP ile aynı çeviriler.)
const LABELS = {
    // SPORTS
    tennis: { en: 'Tennis', tr: 'Tenis', ru: 'Теннис' },
    padel: { en: 'Padel', tr: 'Padel', ru: 'Падел' },
    volleyball: { en: 'Volleyball', tr: 'Voleybol', ru: 'Волейбол' },
    football: { en: 'Football', tr: 'Futbol', ru: 'Футбол' },
    basketball: { en: 'Basketball', tr: 'Basketbol', ru: 'Баскетбол' },
    running: { en: 'Running', tr: 'Koşu', ru: 'Бег' },
    wellness: { en: 'Yoga / Pilates / Reformer', tr: 'Yoga / Pilates / Reformer', ru: 'Йога / Пилатес / Реформер' },
    table_tennis: { en: 'Table Tennis', tr: 'Masa Tenisi', ru: 'Настольный теннис' },
    climbing: { en: 'Climbing', tr: 'Tırmanış', ru: 'Скалолазание' },
    archery: { en: 'Archery', tr: 'Okçuluk', ru: 'Стрельба из лука' },
    walking: { en: 'Walking', tr: 'Yürüyüş', ru: 'Ходьба' },
    foot_tennis: { en: 'Foot Tennis', tr: 'Ayak Tenisi', ru: 'Футбольный теннис' },
    sup_kano: { en: 'SUP & Canoe', tr: 'SUP & Kano', ru: 'SUP и каноэ' },
    handball: { en: 'Handball', tr: 'Hentbol', ru: 'Гандбол' },
    badminton: { en: 'Badminton', tr: 'Badminton', ru: 'Бадминтон' },
    shooting_hunting: { en: 'Shooting & Hunting', tr: 'Atıcılık & Avcılık', ru: 'Стрельба и охота' },
    equestrian: { en: 'Equestrian', tr: 'Binicilik', ru: 'Конный спорт' },
    golf: { en: 'Golf', tr: 'Golf', ru: 'Гольф' },
    fitness_gym: { en: 'Fitness & Gym', tr: 'Fitness & Spor Salonu', ru: 'Фитнес и тренажёрный зал' },
    skiing_snowboard: { en: 'Skiing & Snowboard', tr: 'Kayak & Snowboard', ru: 'Лыжи и сноуборд' },
    ice_skating: { en: 'Ice Skating', tr: 'Buz Pateni', ru: 'Катание на коньках' },
    hiking: { en: 'Hiking', tr: 'Doğa Yürüyüşü', ru: 'Пеший туризм' },
    camping: { en: 'Camping', tr: 'Kamp', ru: 'Кемпинг' },
    motorcycle: { en: 'Motorcycle Riding', tr: 'Motosiklet', ru: 'Мотоцикл' },
    extreme_sports: { en: 'Extreme Sports', tr: 'Ekstrem Sporlar', ru: 'Экстремальные виды спорта' },
    paintball: { en: 'Paintball', tr: 'Paintball', ru: 'Пейнтбол' },
    airsoft: { en: 'Airsoft', tr: 'Airsoft', ru: 'Страйкбол' },
    swimming: { en: 'Swimming', tr: 'Yüzme', ru: 'Плавание' },
    cycling: { en: 'Cycling', tr: 'Bisiklet', ru: 'Велоспорт' },
    boxing: { en: 'Boxing', tr: 'Boks', ru: 'Бокс' },
    martial_arts: { en: 'Martial Arts', tr: 'Dövüş Sanatları', ru: 'Боевые искусства' },
    // SOCIAL
    friend_finding: { en: 'Friend Finding', tr: 'Arkadaş Bulma', ru: 'Поиск друзей' },
    sanal_alem: { en: 'Virtual World', tr: 'Sanal Alem', ru: 'Виртуальный мир' },
    // ARTS
    painting: { en: 'Painting', tr: 'Resim', ru: 'Живопись' },
    music: { en: 'Music', tr: 'Müzik', ru: 'Музыка' },
    theater: { en: 'Theater', tr: 'Tiyatro', ru: 'Театр' },
    cinema: { en: 'Cinema', tr: 'Sinema', ru: 'Кино' },
    literature: { en: 'Literature', tr: 'Edebiyat', ru: 'Литература' },
    writing: { en: 'Writing', tr: 'Yazarlık', ru: 'Писательство' },
    sculpture: { en: 'Sculpture', tr: 'Heykel', ru: 'Скульптура' },
    architecture: { en: 'Architecture', tr: 'Mimari', ru: 'Архитектура' },
    opera: { en: 'Opera', tr: 'Opera', ru: 'Опера' },
    ceramics: { en: 'Ceramics', tr: 'Seramik', ru: 'Керамика' },
    poetry: { en: 'Poetry', tr: 'Şiir', ru: 'Поэзия' },
    photography: { en: 'Photography', tr: 'Fotoğrafçılık', ru: 'Фотография' },
    illustration: { en: 'Illustration', tr: 'İllüstrasyon', ru: 'Иллюстрация' },
    dance: { en: 'Dance', tr: 'Dans', ru: 'Танцы' },
    // GAMES
    fps: { en: 'FPS', tr: 'FPS', ru: 'Шутер от первого лица' },
    moba: { en: 'MOBA', tr: 'MOBA', ru: 'MOBA' },
    strategy: { en: 'Strategy', tr: 'Strateji', ru: 'Стратегия' },
    sports_games: { en: 'Sports Games', tr: 'Spor Oyunları', ru: 'Спортивные игры' },
    boardgames: { en: 'Board Games', tr: 'Kutu Oyunları', ru: 'Настольные игры' },
    battle_royale: { en: 'Battle Royale', tr: 'Battle Royale', ru: 'Королевская битва' },
    simulation: { en: 'Simulation', tr: 'Simülasyon', ru: 'Симулятор' },
    puzzle: { en: 'Puzzle', tr: 'Bulmaca', ru: 'Головоломка' },
    racing: { en: 'Racing', tr: 'Yarış', ru: 'Гонки' },
    card_games: { en: 'Card Games', tr: 'Kart Oyunları', ru: 'Карточные игры' },
    batak: { en: 'Batak', tr: 'Batak', ru: 'Батак' },
    okey: { en: 'Okey', tr: 'Okey', ru: 'Окей' },
    chess: { en: 'Chess', tr: 'Satranç', ru: 'Шахматы' },
    tavla: { en: 'Backgammon', tr: 'Tavla', ru: 'Нарды' },
};

export function getSubCategoryLabel(subCategory, lang = 'tr') {
    if (!subCategory) return '';
    const entry = LABELS[subCategory];
    if (entry) return lang === 'tr' ? entry.tr : lang === 'ru' ? entry.ru : entry.en;
    return subCategory.charAt(0).toUpperCase() + subCategory.slice(1).replace(/_/g, ' ');
}
