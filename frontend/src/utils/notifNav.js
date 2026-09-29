import api from '../services/api';

export const TYPE_ICON = {
    JOIN_REQUEST:         '⚔️',
    RIVAL_JOIN_REQUEST:   '⚔️',
    TOURNAMENT_JOIN:      '🏆',
    TOURNAMENT_STARTED:   '🏆',
    TOURNAMENT_COMPLETED: '🥇',
    MATCH_CONFIRMED:      '🎉',
    MATCH_CANCELLED:      '❌',
    MATCH_COMPLETED:      '✅',
    SCORE_SUBMITTED:      '📝',
    SCORE_CONFIRMED:      '✅',
    SCORE_DISPUTED:       '⚖️',
    SCORE_ENTRY_REQUIRED: '📝',
    FRIEND_REQUEST:       '👋',
    FRIEND_ACCEPTED:      '🤝',
    FOLLOW_REQUEST:       '👋',
    FOLLOW_ACCEPTED:      '🤝',
    MESSAGE:              '💬',
    CANCELLATION_REQUEST: '⚠️',
    EQUIPMENT_OFFER:      '🛒',
    NEW_LISTING:          '📣',
    FRIEND_LISTING:       '📣',
    RESERVATION:          '📅',
    RESERVATION_UPDATE:   '📅',
    PAYMENT_ALERT:        '💳',
    VENUE_ORDER:          '🧾',
    ORDER_STATUS:         '🧾',
    POST_MENTION:         '🏷️',
    REEL_MENTION:         '🏷️',
    STORY_MENTION:        '🏷️',
    PEER_REVIEW_PROMPT:   '⭐',
    SUPPORT_MESSAGE:      '🛟',
};

export const ADMIN_TAB_BY_TYPE = {
    // VENUE_REQUEST: yeni İŞLETME tesisi başvurusu — 'biz-venues'; VENUE_SUBMISSION ise
    // topluluk Court kaydı — 'venues' (Salon/Kort/Saha bekleyenler).
    VENUE_REQUEST: 'biz-venues',
    VENUE_EDIT_REQUEST: 'biz-venues',
    COURT_EDIT_REQUEST: 'courts',
    VENUE_SUBMISSION: 'venues',
    SUBSCRIPTION_REQUEST: 'subscriptions',
    SUBSCRIPTION_RECEIPT: 'subscriptions',
    VENUE_REVIEW_PENDING: 'venue-reviews',
    REVIEW_APPEAL: 'venue-reviews',
    TOURNAMENT_PERMISSION_REQUEST: 'tournament-perms',
    PROFILE_CHANGE_REQUEST: 'profile-changes',
    COACH_LISTING_SUBMITTED: 'coach-listing-approval',
    REFEREE_LISTING_SUBMITTED: 'referee-approval',
    NO_SHOW_REPORT: 'noshow',
    LISTING_FLAGGED: 'flagged-listings',
    CITY_PENDING: 'cities',
    CLUB_LISTING_SUBMITTED: 'club-approval',
    FAKE_SPECTATOR_REPORTED: 'disputes',
    TEAM_NAME_REQUEST: 'team-name-approval',
    SUPPORT_MESSAGE: 'support',
};

const OUTCOME_TYPES = new Set([
    'VENUE_APPROVED', 'VENUE_REJECTED',
    'SUBSCRIPTION_APPROVED', 'SUBSCRIPTION_REJECTED', 'SUBSCRIPTION_CANCELLED', 'SUBSCRIPTION_WARNING',
    'TOURNAMENT_PERMISSION_APPROVED', 'TOURNAMENT_PERMISSION_REJECTED',
    'PROFILE_CHANGE_APPROVED', 'PROFILE_CHANGE_REJECTED',
    'APPEAL_RESOLVED', 'VENUE_REVIEW_APPROVED', 'VENUE_REVIEW_REJECTED', 'HOLIDAY_REMINDER',
]);

const REFEREE_TYPES = new Set(['MATCH_INVITE', 'MATCH_INVITE_DECLINED', 'RIVAL_JOIN_REQUEST']);

// Mobil NotificationsScreen'deki "hangi sekmeye" kararlarının web karşılığı —
// web SubCategoryPage yalnızca tab / coachSubTab / openEquipmentId / manageTournament okur.
const TAB_BY_TYPE = {
    SCORE_CONFIRMED: 'archive',
    MATCH_COMPLETED: 'archive',
    PEER_REVIEW_PROMPT: 'archive',
    TOURNAMENT_COMPLETED: 'archive',
    CANCELLATION_REQUEST: 'tournaments',
};

export function buildCatPath(data) {
    if (!data.category || !data.subCategory) return null;
    const path = `/category/${String(data.category).toLowerCase()}/${data.subCategory}`;
    const params = new URLSearchParams();
    if (data.tab) params.set('tab', data.tab);
    else if (data.refereeAd || (data.rivalId && REFEREE_TYPES.has(data.type))) { params.set('tab', 'coaches'); params.set('coachSubTab', 'referees'); }
    else if (data.clubs) { params.set('tab', 'coaches'); params.set('coachSubTab', 'clubs'); }
    else if (data.equipmentOffer || data.listingId) params.set('tab', 'equipment');
    if (data.listingId) params.set('openEquipmentId', data.listingId);
    const qs = params.toString();
    return qs ? `${path}?${qs}` : path;
}

// Bildirime tıklanınca gidilecek web yolu. Rakip ilanı bilgisi eksikse ilanı çekip
// gerçek spora yönlendirir (eskiden hep futbola gidiyordu).
export async function resolveNotificationPath(n, { isBusiness = false } = {}) {
    const { type } = n;
    const data = n.data || {};

    if (type === 'MESSAGE') {
        if (data.listingId && data.category && data.subCategory) return buildCatPath({ ...data, type });
        return data.senderId ? `/messages/${data.senderId}` : '/messages';
    }
    if (type?.startsWith('CHALLENGE_')) return data.senderId ? `/messages/${data.senderId}` : '/messages';
    if (['FRIEND_REQUEST', 'FRIEND_ACCEPTED', 'FOLLOW_REQUEST', 'FOLLOW_ACCEPTED'].includes(type)) {
        return data.senderId ? `/profile/${data.senderId}` : '/profile';
    }
    if (type?.startsWith('TRAVEL_')) {
        return data.routeId ? `/travel/routes/${data.routeId}` : data.tripId ? `/travel/trips/${data.tripId}` : '/travel?tab=travel';
    }
    if (type === 'SCORE_DISPUTED' && data.scoreAppeal) return '/admin?tab=disputes';
    if (ADMIN_TAB_BY_TYPE[type]) {
        return `/admin?tab=${ADMIN_TAB_BY_TYPE[type]}${data.ticketId ? `&ticketId=${data.ticketId}` : ''}`;
    }
    if (['RESERVATION', 'RESERVATION_UPDATE', 'PAYMENT_ALERT', 'VENUE_ORDER'].includes(type)) {
        return isBusiness ? '/business' : '/reservations';
    }
    if (type === 'CLUB_MEMBERSHIP') {
        if (isBusiness) return '/business';
        return buildCatPath({ ...data, type, clubs: true });
    }
    if (['POST_MENTION', 'REEL_MENTION', 'STORY_MENTION'].includes(type)) {
        if (data.authorId) return `/profile/${data.authorId}/posts`;
        return buildCatPath({ ...data, type, tab: 'posts' });
    }
    if (type === 'EQUIPMENT_OFFER' || type === 'EQUIPMENT_SOLD_CONFIRM') {
        return buildCatPath({ ...data, type, equipmentOffer: true });
    }
    if (TAB_BY_TYPE[type]) return buildCatPath({ ...data, type, tab: TAB_BY_TYPE[type] });
    if (type?.startsWith('TOURNAMENT') && data.tournamentId && data.category && data.subCategory) {
        return `/category/${String(data.category).toLowerCase()}/${data.subCategory}?tab=tournaments&manageTournament=${data.tournamentId}`;
    }
    const catPath = buildCatPath({ ...data, type });
    if (catPath) return catPath;
    if (data.rivalId) {
        try {
            const { data: rival } = await api.get(`/rivals/${data.rivalId}`);
            if (rival?.category && rival?.subCategory) {
                return buildCatPath({ ...data, type, category: rival.category, subCategory: rival.subCategory });
            }
        } catch { /* ilan artık yoksa sessizce vazgeç */ }
        return null;
    }
    if (OUTCOME_TYPES.has(type)) return '/profile';
    return null;
}
