import api from '../services/api';

// Aynı filme ikinci kez basınca (veya liste önden çekerken) archive.org metadata
// beklenmesin diye in-flight/cevap paylaşılır. Player ekranı da aynı Promise'i kullanır.
const inflight = new Map();

export function prefetchClassicStream(filmId) {
    if (!filmId) return Promise.reject(new Error('filmId yok'));
    if (!inflight.has(filmId)) {
        inflight.set(
            filmId,
            api.get(`/movies/classics/${filmId}/stream`)
                .then(({ data }) => data)
                .catch((err) => {
                    inflight.delete(filmId);
                    throw err;
                }),
        );
    }
    return inflight.get(filmId);
}
