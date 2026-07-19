import { createSlice } from '@reduxjs/toolkit';

// Bildirim rozeti (tab bar'daki sayı) tek bir yerden yönetilir — hem AppTabs (poll/socket ile
// senkronize eder) hem NotificationsScreen (okundu işaretlerken anında düşürür) aynı state'i
// paylaşır. Ayrı ayrı local state kullanmak, okundu işaretlendikten sonra bir sonraki 30sn'lik
// poll'a kadar rozetin eski sayıyı göstermesine sebep oluyordu.
const notificationSlice = createSlice({
    name: 'notifications',
    initialState: { unreadCount: 0 },
    reducers: {
        setUnreadCount(state, action) {
            state.unreadCount = Math.max(0, action.payload);
        },
        incrementUnread(state) {
            state.unreadCount += 1;
        },
        decrementUnread(state) {
            state.unreadCount = Math.max(0, state.unreadCount - 1);
        },
        clearUnread(state) {
            state.unreadCount = 0;
        },
    },
});

export const { setUnreadCount, incrementUnread, decrementUnread, clearUnread } = notificationSlice.actions;
export default notificationSlice.reducer;
