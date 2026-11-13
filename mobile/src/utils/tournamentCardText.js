/** Turnuva ilan kartı / paylaşım — play-off öncesi maç + kalan sayısı cümlesi. */
export function tournPlayoffCardText(item, t) {
    const x = item?.matchesBeforePlayoff ? parseInt(item.matchesBeforePlayoff, 10) : 0;
    const y = item?.playoffQualifiers ? parseInt(item.playoffQualifiers, 10) : 0;
    if (!x && !y) return null;
    const type = String(item?.type || '');
    const swissLike = type === '5' || type === '7';
    const doubles = type === '2' || type === '4' || item?.entryType === 'DOUBLES';
    if (swissLike && x) return t.sc_1199(x);
    if (x && y) return doubles ? t.sc_1198(x, y) : t.sc_1197(x, y);
    if (x) return t.sc_1200(x);
    return doubles ? t.sc_1202(y) : t.sc_1201(y);
}
