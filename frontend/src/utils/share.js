import i18n from '../i18n';
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
        alert(i18n.t('shell.sh_0285'));
    } catch {
        window.prompt(i18n.t('shell.sh_0286'), url);
    }
}

export function shareRival(rival) {
    const url = `${SHARE_HOST}/share/rival/${rival.id}`;
    const place = rival.courtName || rival.location;
    shareUrl(url, i18n.t('shell.sh_0323'), i18n.t('shell.sh_0656', { p0: place ? ' · ' + place : '' }));
}

export function shareTournament(tournament) {
    const url = `${SHARE_HOST}/share/tournament/${tournament.id}`;
    shareUrl(url, tournament.name || i18n.t('shell.sh_0662'), i18n.t('shell.sh_0648', { p0: tournament.name || 'Turnuva' }));
}
