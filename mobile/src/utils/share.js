import { Share } from 'react-native';
import { shellT } from '../i18n/packs/shell';
import { BASE_URL } from '../services/api';
import { tryOpenEntityShare } from './entityShareBridge';
import { buildEntitySharePayload } from './entityShareCard';

const SHARE_HOST = BASE_URL.replace(/\/api\/?$/, '');

async function shareTextFallback(payload) {
    if (!payload) return;
    try {
        await Share.share({ message: payload.message, url: payload.url });
    } catch { /* iptal */ }
}

export async function shareRival(rival, t) {
    if (tryOpenEntityShare('rival', rival)) return;
    await shareTextFallback(buildEntitySharePayload('rival', rival, t));
}

export async function shareTournament(tournament, t) {
    if (tryOpenEntityShare('tournament', tournament)) return;
    await shareTextFallback(buildEntitySharePayload('tournament', tournament, t));
}

export async function shareEquipment(eq, t) {
    if (tryOpenEntityShare('equipment', eq)) return;
    await shareTextFallback(buildEntitySharePayload('equipment', eq, t));
}

export async function shareCoach(listing, t, { asCourse = false } = {}) {
    const kind = asCourse ? 'course' : 'coach';
    if (tryOpenEntityShare(kind, listing)) return;
    await shareTextFallback(buildEntitySharePayload(kind, listing, t));
}

export async function shareClub(club, t) {
    if (tryOpenEntityShare('club', club)) return;
    await shareTextFallback(buildEntitySharePayload('club', club, t));
}

export async function shareMatchResult(match, t) {
    const { buildMatchSharePayload, matchShareMessage } = await import('./matchShareCard.js');
    const payload = buildMatchSharePayload(match, t);
    if (!payload) return;
    const message = matchShareMessage(payload, t);
    try {
        await Share.share({ message, url: payload.url });
    } catch { /* iptal */ }
}

export async function sharePost(post, t) {
    if (!post?.id) return;
    const url = `${SHARE_HOST}/share/post/${post.id}`;
    const author = post.user?.fullName || post.user?.username || '';
    const kind = post.type === 'REEL'
        ? (t?.shareReelKind || 'reel')
        : post.type === 'STORY'
            ? (t?.shareStoryKind || shellT('sh_0664'))
            : (t?.sharePostKind || shellT('sh_0054'));
    const parts = [
        t?.sharePostIntro
            ? t.sharePostIntro(author, kind)
            : (author ? shellT('sh_0637', author, kind) : `AcTiViTy ${kind}`),
    ];
    const snippet = String(post.content || '').trim();
    if (snippet) parts.push(snippet.slice(0, 160));
    parts.push(url);
    try {
        await Share.share({ message: parts.join('\n'), url });
    } catch { /* kullanıcı paylaşımı iptal etti */ }
}
