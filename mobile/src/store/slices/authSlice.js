import { createSlice } from '@reduxjs/toolkit';
import AsyncStorage from '@react-native-async-storage/async-storage';

const authSlice = createSlice({
    name: 'auth',
    initialState: { user: null, token: null },
    reducers: {
        setCredentials: (state, action) => {
            state.user = action.payload.user;
            state.token = action.payload.token;
            AsyncStorage.setItem('activity_token', action.payload.token);
        },
        logout: (state) => {
            state.user = null;
            state.token = null;
            AsyncStorage.removeItem('activity_token');
        },
        setUser: (state, action) => { state.user = action.payload; },
    },
});

export const { setCredentials, logout, setUser } = authSlice.actions;
export default authSlice.reducer;
