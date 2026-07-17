const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
const SHARE_HOST = API_URL.replace(/\/api\/?$/, '');

async function shareUrl(url, title, text) {
    if (navigator.share) {
        try {
            await navigator.share({ title, text, url });
        } catch { /* kullanıcı paylaşımı iptal etti */ }
        return;
    }
    try {
        await navigator.clipboard.writeText(url);
        alert('Link kopyalandı!');
    } catch {
        window.prompt('Linki kopyalayın:', url);
    }
}

export function shareRival(rival) {
    const url = `${SHARE_HOST}/share/rival/${rival.id}`;
    const place = rival.courtName || rival.location;
    shareUrl(url, 'Rakip Bul İlanı', `Rakip arıyorum${place ? ' · ' + place : ''}`);
}

export function shareTournament(tournament) {
    const url = `${SHARE_HOST}/share/tournament/${tournament.id}`;
    shareUrl(url, tournament.name || 'Turnuva', `${tournament.name || 'Turnuva'} — katıl!`);
}
