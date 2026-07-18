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
