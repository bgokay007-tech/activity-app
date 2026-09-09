// Yeni görsel dildeki kategori / dal fotoğrafları.
// Spor dalında kategori stoğu (futbol sahası) ASLA fallback olmaz —
// her dalın kendi görseli vardır; yoksa kart renk+emoji kullanır.
export const CAT_PHOTOS = {
    SPORTS: require('../../assets/visual/cat-sports.png'),
    SOCIAL: require('../../assets/visual/cat-social.jpg'),
    ARTS:   require('../../assets/visual/cat-arts.png'),
    GAMES:  require('../../assets/visual/cat-games.jpg'),
};

export const SUB_PHOTOS = {
    tennis:           require('../../assets/visual/sub-tennis.jpg'),
    padel:            require('../../assets/visual/sub-padel.jpg'),
    football:         require('../../assets/visual/sub-football.jpg'),
    wellness:         require('../../assets/visual/sub-yoga.jpg'),
    basketball:       require('../../assets/visual/sub-basketball.jpg'),
    running:          require('../../assets/visual/sub-running.jpg'),
    climbing:         require('../../assets/visual/sub-climbing.jpg'),
    volleyball:       require('../../assets/visual/sub-volleyball.jpg'),
    badminton:        require('../../assets/visual/sub-badminton.jpg'),
    table_tennis:     require('../../assets/visual/sub-table-tennis.jpg'),
    foot_tennis:      require('../../assets/visual/sub-foot-tennis.jpg'),
    handball:         require('../../assets/visual/sub-handball.jpg'),
    golf:             require('../../assets/visual/sub-golf.jpg'),
    hiking:           require('../../assets/visual/sub-hiking.jpg'),
    camping:          require('../../assets/visual/sub-camping.jpg'),
    walking:          require('../../assets/visual/sub-walking.jpg'),
    archery:          require('../../assets/visual/sub-archery.jpg'),
    equestrian:       require('../../assets/visual/sub-equestrian.jpg'),
    sup_kano:         require('../../assets/visual/sub-sup-kano.jpg'),
    fitness_gym:      require('../../assets/visual/sub-fitness.jpg'),
    ice_skating:      require('../../assets/visual/sub-ice-skating.jpg'),
    skiing_snowboard: require('../../assets/visual/sub-skiing.jpg'),
    motorcycle:       require('../../assets/visual/sub-motorcycle.jpg'),
    extreme_sports:   require('../../assets/visual/sub-extreme.jpg'),
    paintball:        require('../../assets/visual/sub-paintball.jpg'),
    airsoft:          require('../../assets/visual/sub-airsoft.jpg'),
    shooting_hunting: require('../../assets/visual/sub-shooting.jpg'),
    painting:         require('../../assets/visual/sub-painting.jpg'),
    music:            require('../../assets/visual/sub-music.jpg'),
    theater:          require('../../assets/visual/sub-theater.jpg'),
    cinema:           require('../../assets/visual/sub-cinema.jpg'),
    literature:       require('../../assets/visual/sub-literature.jpg'),
    sculpture:        require('../../assets/visual/sub-sculpture.jpg'),
    architecture:     require('../../assets/visual/sub-architecture.jpg'),
    opera:            require('../../assets/visual/sub-opera.jpg'),
    ceramics:         require('../../assets/visual/sub-ceramics.jpg'),
    poetry:           require('../../assets/visual/sub-poetry.jpg'),
    photography:      require('../../assets/visual/sub-photography.jpg'),
};

export function photoForSub(subId, category) {
    if (SUB_PHOTOS[subId]) return SUB_PHOTOS[subId];
    if (category && String(category).toUpperCase() !== 'SPORTS') return CAT_PHOTOS[category] || null;
    return null;
}
