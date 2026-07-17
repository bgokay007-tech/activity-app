const EARTH_RADIUS_KM = 6371;

function toRad(deg) {
    return (deg * Math.PI) / 180;
}

// İki koordinat arası kuş uçuşu mesafe (km)
export function haversineKm(lat1, lng1, lat2, lng2) {
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return EARTH_RADIUS_KM * c;
}

// Verilen yarıçap için ucuz bir ön filtre olarak lat/lng aralığı üretir.
// Kesin mesafe hesabı (haversineKm) sonuç kümesi üzerinde ayrıca uygulanmalı.
export function boundingBox(lat, lng, radiusKm) {
    const latDelta = radiusKm / EARTH_RADIUS_KM * (180 / Math.PI);
    const lngDelta = radiusKm / (EARTH_RADIUS_KM * Math.cos(toRad(lat))) * (180 / Math.PI);
    return {
        minLat: lat - latDelta,
        maxLat: lat + latDelta,
        minLng: lng - lngDelta,
        maxLng: lng + lngDelta,
    };
}
