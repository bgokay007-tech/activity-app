import { configureStore } from '@reduxjs/toolkit';
import authReducer from './slices/authSlice';
import langReducer from './slices/langSlice';

export const store = configureStore({
    reducer: {
        auth: authReducer,
        lang: langReducer,
    },
});