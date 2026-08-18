import { Share } from 'react-native';
import { BASE_URL } from '../services/api';

const SHARE_HOST = BASE_URL.replace(/\/api\/?$/, '');

export async function shareRival(rival, t) {
    const url = `${SHARE_HOST}/share/rival/${rival.id}`;
    const place = rival.courtName || rival.location;
    // Kullanıcı isteği: voleybolde "Oyuncu Ara" ve "Rakip Ara" sekmelerinin etiketleri diğer
    // dallara göre TERS (bkz. tabLabel/sub==='volleyball' — "rivals" sekmesi orada "Oyuncu Ara",
    // "player_wanted" sekmesi "Rakip Ara" olarak gösteriliyor). Paylaşım metni de buna uysun:
    // voleybolde matchType PLAYER_WANTED DEĞİLSE (yani "Oyuncu Ara" sekmesinden açılan bir kadro
    // ilanıysa) "Oyuncu arıyorum", PLAYER_WANTED ise (Rakip Ara) "Rakip arıyorum" yazsın. Diğer
    // dallarda eskisi gibi hep "Rakip arıyorum".
    const isVolleyballPlayerAd = rival.subCategory === 'volleyball' && rival.matchType !== 'PLAYER_WANTED';
    const intro = isVolleyballPlayerAd
        ? (t?.sharePlayerWantedIntro || 'Oyuncu arıyorum, katılmak ister misin?')
        : (t?.shareRivalIntro || 'Rakip arıyorum, katılmak ister misin?');
    const parts = [intro];
    if (place) parts.push(`📍 ${place}`);
    if (rival.matchDate) parts.push(`📅 ${new Date(rival.matchDate).toLocaleDateString('tr-TR')}${rival.matchTime ? ' ' + rival.matchTime : ''}`);
    if (rival.duration) parts.push(`⏱ ${rival.duration} ${t?.timeMinSuffix || 'dk'}`);

    // Onaylanmış katılımcılar — takımlar (kim rakip 1/2) henüz kesin belli olmadığı için
    // (bkz. RivalCard'daki aynı gerekçe) kaçıncı sırada kabul edildikleri (Katılımcı 1/2/3)
    // olarak gösterilir, "Rakip 1"/"Rakip 2" gibi kesin bir koltuğa atanmış gibi değil.
    const nameOf = (p) => p?.fullName || p?.username || '';
    const label = (n) => t?.cardParticipantLabel ? t.cardParticipantLabel(n) : `Katılımcı ${n}`;
    const confirmed = [];
    if (rival.matchType === 'DOUBLE') {
        const partner = Array.isArray(rival.senderTeam) ? rival.senderTeam[0] : null;
        const slots = [partner, rival.participants?.[0], rival.participants?.[1]].filter(p => p?.id);
        slots.forEach((p, i) => confirmed.push(`${label(i + 1)}: ${nameOf(p)}`));
    } else {
        // Takım sporları (voleybol vb.): kurucunun takım arkadaşları + rakip tarafa atananlar +
        // henüz bir tarafa atanmamış ama katılımı kabul edilmiş oyuncular — kullanıcı isteği:
        // "katılan oyuncular varsa paylaşımda da gözüksün" (önceden sadece rival.participants
        // gösteriliyordu, "Oyuncu Ara" ilanlarında kabul edilenler çoğunlukla senderTeam/
        // unassignedPlayers'a düştüğü için hiç görünmüyordu).
        const teamPlayers = [
            ...(Array.isArray(rival.senderTeam) ? rival.senderTeam : []),
            ...(Array.isArray(rival.participants) ? rival.participants : []),
            ...(Array.isArray(rival.unassignedPlayers) ? rival.unassignedPlayers : []),
        ].filter(p => p?.id);
        teamPlayers.forEach((p, i) => confirmed.push(`${label(i + 1)}: ${nameOf(p)}`));
    }
    if (confirmed.length > 0) parts.push(`👥 ${confirmed.join(', ')}`);

    parts.push(url);
    try {
        await Share.share({ message: parts.join('\n'), url });
    } catch { /* kullanıcı paylaşımı iptal etti */ }
}

export async function shareTournament(tournament, t) {
    const url = `${SHARE_HOST}/share/tournament/${tournament.id}`;
    const place = tournament.location || tournament.city;
    const parts = [`${t?.shareTournamentIntro || 'Turnuvaya katıl!'} 🏆 ${tournament.name || ''}`.trim()];
    if (place) parts.push(`📍 ${place}`);
    if (tournament.eventDate) parts.push(`📅 ${new Date(tournament.eventDate).toLocaleDateString('tr-TR')}${tournament.eventTime ? ' ' + tournament.eventTime : ''}`);
    parts.push(url);
    try {
        await Share.share({ message: parts.join('\n'), url });
    } catch { /* kullanıcı paylaşımı iptal etti */ }
}
