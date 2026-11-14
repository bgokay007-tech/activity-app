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
    pickleball:       require('../../assets/visual/sub-pickleball.jpg'),
    squash:           require('../../assets/visual/sub-squash.jpg'),
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
    dodgeball:        require('../../assets/visual/sub-dodgeball.jpg'),
    rugby:            require('../../assets/visual/sub-rugby.jpg'),
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
    // Sosyal
    travel_explore:   require('../../assets/visual/sub-travel-explore.jpg'),
    friend_finding:   require('../../assets/visual/sub-friend-finding.jpg'),
    // Oyunlar — her dalın kendi görseli (genel cat-games fallback yerine)
    batak:            require('../../assets/visual/sub-batak.jpg'),
    okey:             require('../../assets/visual/sub-okey.jpg'),
    chess:            require('../../assets/visual/sub-chess.jpg'),
    tavla:            require('../../assets/visual/sub-tavla.jpg'),
    fps:              require('../../assets/visual/sub-fps.jpg'),
    moba:             require('../../assets/visual/sub-moba.jpg'),
    strategy:         require('../../assets/visual/sub-strategy.jpg'),
    sports_games:     require('../../assets/visual/sub-sports-games.jpg'),
    boardgames:       require('../../assets/visual/sub-boardgames.jpg'),
};

export function photoForSub(subId, category) {
    if (SUB_PHOTOS[subId]) return SUB_PHOTOS[subId];
    if (category && String(category).toUpperCase() !== 'SPORTS') return CAT_PHOTOS[category] || null;
    return null;
}

/** Raket sporları — zemin belliyse o kort fotoğrafı; belirsizse yarı sert/toprak. */
const SURFACE_PHOTOS = {
    CLAY: require('../../assets/visual/share-bg/tennis-clay.jpg'),
    HARD: require('../../assets/visual/share-bg/tennis-hard.jpg'),
    GRASS: require('../../assets/visual/share-bg/tennis-grass.jpg'),
    PLAYERS_DECIDE: require('../../assets/visual/share-bg/tennis-players-decide.jpg'),
    VOLLEY_BEACH: require('../../assets/visual/share-bg/volleyball-beach.jpg'),
    VOLLEY_INDOOR: require('../../assets/visual/share-bg/volleyball-indoor.jpg'),
    PADEL: require('../../assets/visual/share-bg/padel.jpg'),
};

const RACKET_SUBS = new Set(['tennis', 'table_tennis', 'badminton', 'pickleball', 'squash', 'padel']);

/**
 * Ana sayfa açık ilan / yaklaşan satır fotoğrafı.
 * Nashira gibi toprak kort → clay; sert → hard; zemin yok/oyuncular seçer → yarı yarıya.
 */
export function photoForListing(item) {
    if (!item) return null;
    const sub = item.subCategory;
    const sf = String(item.surface || '').trim().toUpperCase();
    const undecided = !sf || sf === 'PLAYERS_DECIDE' || sf === 'UNKNOWN' || sf === 'ANY';

    if (RACKET_SUBS.has(sub)) {
        if (undecided) return SURFACE_PHOTOS.PLAYERS_DECIDE;
        if (sf === 'CLAY') return SURFACE_PHOTOS.CLAY;
        if (sf === 'GRASS') return SURFACE_PHOTOS.GRASS;
        if (sf === 'HARD' || sf === 'CARPET' || sf === 'ARTIFICIAL' || sf === 'OTHER') {
            return sub === 'padel' ? SURFACE_PHOTOS.PADEL : SURFACE_PHOTOS.HARD;
        }
        return SURFACE_PHOTOS.PLAYERS_DECIDE;
    }
    if (sub === 'volleyball') {
        if (sf === 'BEACH') return SURFACE_PHOTOS.VOLLEY_BEACH;
        if (sf === 'INDOOR' || sf === 'PARQUET' || sf === 'SYNTHETIC') return SURFACE_PHOTOS.VOLLEY_INDOOR;
        if (sf === 'CLAY') return SURFACE_PHOTOS.CLAY;
        if (sf === 'GRASS') return SURFACE_PHOTOS.GRASS;
        if (undecided) return SURFACE_PHOTOS.PLAYERS_DECIDE;
        return SURFACE_PHOTOS.VOLLEY_INDOOR;
    }
    return photoForSub(sub, item.category);
}
