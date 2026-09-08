// Yeni görsel dildeki kategori / dal fotoğrafları. Fotoğrafı olmayan dal
// CategoryScreen'de kategori görseline (veya büyük emoji kartına) düşer.
export const CAT_PHOTOS = {
    SPORTS: require('../../assets/visual/cat-sports.png'),
    SOCIAL: require('../../assets/visual/cat-social.png'),
    ARTS:   require('../../assets/visual/cat-arts.png'),
    GAMES:  require('../../assets/visual/cat-games.png'),
};

export const SUB_PHOTOS = {
    tennis:     require('../../assets/visual/sub-tennis.png'),
    padel:      require('../../assets/visual/sub-padel.png'),
    football:   require('../../assets/visual/sub-football.png'),
    wellness:   require('../../assets/visual/sub-yoga.png'),
    basketball: require('../../assets/visual/sub-basketball.png'),
    running:    require('../../assets/visual/sub-running.png'),
    climbing:   require('../../assets/visual/sub-climbing.png'),
    volleyball: require('../../assets/visual/sub-volleyball.png'),
};

export function photoForSub(subId, category) {
    return SUB_PHOTOS[subId] || CAT_PHOTOS[category] || null;
}
