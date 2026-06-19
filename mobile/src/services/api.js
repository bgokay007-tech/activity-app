import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const BASE_URL = 'https://activity-app-production-f4c2.up.railway.app/api';

const api = axios.create({ baseURL: BASE_URL, timeout: 30000, headers: { 'bypass-tunnel-reminder': 'true' } });

api.interceptors.request.use(async (config) => {
    const token = await AsyncStorage.getItem('activity_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
});

// Token süresi dolunca otomatik logout
api.interceptors.response.use(
    res => res,
    async err => {
        if (err?.response?.status === 401) {
            await AsyncStorage.removeItem('activity_token');
            // store'u lazy import ile çek (circular dependency önlemek için)
            const { store } = await import('../store/index');
            const { logout } = await import('../store/slices/authSlice');
            store.dispatch(logout());
        }
        return Promise.reject(err);
    }
);

export default api;
export { BASE_URL };
