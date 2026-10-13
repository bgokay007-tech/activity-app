import axios from 'axios';
import { store } from '../store/index.js';
import { logout } from '../store/slices/authSlice';

const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
});

api.interceptors.request.use((config) => {
    const token = localStorage.getItem('activity_token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// Uzun süre açık kalan sekmede token'ın süresi dolunca istekler 401 dönüyor, sayfalar
// bunu "boş liste" sanıp "maç ilanı yok" gösteriyordu. Token'lı bir istek 401 alırsa
// oturumu kapatıp girişe yönlendiriyoruz. Token'sız 401 (yanlış şifreyle login) hariç.
api.interceptors.response.use(
    (res) => res,
    (error) => {
        const sentToken = !!error.config?.headers?.Authorization;
        if (error.response?.status === 401 && sentToken && store.getState().auth.token) {
            sessionStorage.setItem('activity_session_expired', window.location.pathname + window.location.search);
            store.dispatch(logout());
        }
        return Promise.reject(error);
    }
);

export default api;
