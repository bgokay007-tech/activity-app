// Admin'e giden kullanıcı talebi / onay kuyruğu bildirimleri — tıklanınca AdminPortal
// sekmesine yönlendirilir (NotificationsScreen uygulama-içi + navigation/index.js OS push).
// Anahtarlar AdminPortalScreen TABS.key ile birebir aynı olmalı.

export const ADMIN_PORTAL_TAB_BY_NOTIF = {
    PROFILE_CHANGE_REQUEST: 'profilechanges',
    SUPPORT_MESSAGE: 'support',
    VENUE_REQUEST: 'venues',
    VENUE_EDIT_REQUEST: 'venues',
    VENUE_SUBMISSION: 'courts',
    COURT_EDIT_REQUEST: 'courts',
    SUBSCRIPTION_REQUEST: 'subscriptions',
    SUBSCRIPTION_RECEIPT: 'subscriptions',
    VENUE_REVIEW_PENDING: 'venuereviews',
    REVIEW_APPEAL: 'venuereviews',
    TOURNAMENT_PERMISSION_REQUEST: 'tourperms',
    COACH_LISTING_SUBMITTED: 'coachListingApproval',
    REFEREE_LISTING_SUBMITTED: 'refereeApproval',
    TEAM_NAME_REQUEST: 'teamNameApproval',
    NO_SHOW_REPORT: 'noshow',
    LISTING_FLAGGED: 'flagged',
    CITY_PENDING: 'cities',
    CLUB_LISTING_SUBMITTED: 'clubApproval',
    FAKE_SPECTATOR_REPORTED: 'disputes',
};

export function adminPortalParamsForNotif(type, data = {}) {
    const tab = ADMIN_PORTAL_TAB_BY_NOTIF[type];
    if (!tab) return null;
    const params = { tab };
    if (type === 'SUPPORT_MESSAGE') {
        if (data.ticketId) params.openTicketId = data.ticketId;
        if (data.messageId) params.openMessageId = data.messageId;
    }
    return params;
}
