import { createSlice } from '@reduxjs/toolkit';

const saved = localStorage.getItem('activity_lang');

const langSlice = createSlice({
    name: 'lang',
    initialState: { lang: saved === 'tr' ? 'tr' : 'en' },
    reducers: {
        setLang(state, action) {
            state.lang = action.payload;
            localStorage.setItem('activity_lang', action.payload);
        },
    },
});

export const { setLang } = langSlice.actions;
export default langSlice.reducer;
