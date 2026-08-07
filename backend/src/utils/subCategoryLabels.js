// Türkçe bildirim metinlerinde ham (İngilizce) subCategory değerinin ("volleyball" gibi)
// doğrudan görünmesini önlemek için — Türkçe kullanan kullanıcı bildirimde "voleybol"
// görmesi gerekirken "volleyball" görüyordu. mobile/src/utils/subCategoryLabels.js'teki
// aynı çevirilerin Türkçe tarafı.
const SUB_NAMES_TR = {
    tennis: 'Tenis', padel: 'Padel', volleyball: 'Voleybol', football: 'Futbol', basketball: 'Basketbol',
    running: 'Koşu', wellness: 'Yoga / Pilates / Reformer', table_tennis: 'Masa Tenisi', climbing: 'Tırmanış',
    archery: 'Okçuluk', walking: 'Yürüyüş', foot_tennis: 'Ayak Tenisi', sup_kano: 'SUP & Kano',
    handball: 'Hentbol', badminton: 'Badminton', shooting_hunting: 'Atıcılık & Avcılık', equestrian: 'Binicilik',
    golf: 'Golf', fitness_gym: 'Fitness & Spor Salonu', skiing_snowboard: 'Kayak & Snowboard',
    ice_skating: 'Buz Pateni', hiking: 'Doğa Yürüyüşü', camping: 'Kamp', motorcycle: 'Motosiklet',
    extreme_sports: 'Ekstrem Sporlar', paintball: 'Paintball', airsoft: 'Airsoft', swimming: 'Yüzme',
    cycling: 'Bisiklet', boxing: 'Boks', martial_arts: 'Dövüş Sanatları',
    friend_finding: 'Arkadaş Bulma', sanal_alem: 'Sanal Alem',
    painting: 'Resim', music: 'Müzik', theater: 'Tiyatro', cinema: 'Sinema', literature: 'Edebiyat',
    writing: 'Yazarlık', sculpture: 'Heykel', architecture: 'Mimari', opera: 'Opera', ceramics: 'Seramik',
    poetry: 'Şiir', photography: 'Fotoğrafçılık', illustration: 'İllüstrasyon', dance: 'Dans',
    fps: 'FPS', moba: 'MOBA', strategy: 'Strateji', sports_games: 'Spor Oyunları', boardgames: 'Kutu Oyunları',
    battle_royale: 'Battle Royale', simulation: 'Simülasyon', puzzle: 'Bulmaca', racing: 'Yarış',
    card_games: 'Kart Oyunları', batak: 'Batak', okey: 'Okey', chess: 'Satranç', tavla: 'Tavla',
};

export function subCategoryTR(subCategory) {
    return SUB_NAMES_TR[subCategory] || subCategory;
}
