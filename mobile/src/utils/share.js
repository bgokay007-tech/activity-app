import { Share } from 'react-native';
import { BASE_URL } from '../services/api';

const SHARE_HOST = BASE_URL.replace(/\/api\/?$/, '');

export async function shareRival(rival, t) {
    const url = `${SHARE_HOST}/share/rival/${rival.id}`;
    const place = rival.courtName || rival.location;
    const parts = [t?.shareRivalIntro || 'Rakip arıyorum, katılmak ister misin?'];
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
    } else if (Array.isArray(rival.participants)) {
        rival.participants.filter(p => p?.id).forEach((p, i) => confirmed.push(`${label(i + 1)}: ${nameOf(p)}`));
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
