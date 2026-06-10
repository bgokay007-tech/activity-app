import { createSlice } from '@reduxjs/toolkit';
import AsyncStorage from '@react-native-async-storage/async-storage';

const langSlice = createSlice({
    name: 'lang',
    initialState: { lang: 'en' },
    reducers: {
        setLang(state, action) {
            state.lang = action.payload;
            AsyncStorage.setItem('activity_lang', action.payload);
        },
    },
});

export const { setLang } = langSlice.actions;
export default langSlice.reducer;
