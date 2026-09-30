import { createSlice } from '@reduxjs/toolkit';

const saved = localStorage.getItem('activity_lang');

const langSlice = createSlice({
    name: 'lang',
    // Sadece tr/en geri yükleniyordu — Rusça/Almanca seçen kullanıcı sayfayı yenileyince İngilizce'ye düşüyordu.
    initialState: { lang: ['en', 'tr', 'ru', 'de'].includes(saved) ? saved : 'en' },
    reducers: {
        setLang(state, action) {
            state.lang = action.payload;
            localStorage.setItem('activity_lang', action.payload);
        },
    },
});

export const { setLang } = langSlice.actions;
export default langSlice.reducer;
