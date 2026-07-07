import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const BASE_URL = 'https://activity-app-production-f4c2.up.railway.app/api';

// validateStatus: tüm HTTP yanıtları (4xx dahil) success path'e gelir; sadece ağ hataları reject olur
const api = axios.create({
    baseURL: BASE_URL,
    timeout: 30000,
    headers: { 'bypass-tunnel-reminder': 'true' },
    validateStatus: () => true,
});

api.interceptors.request.use(async (config) => {
    const token = await AsyncStorage.getItem('activity_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
});

// HTTP hataları (4xx/5xx) ve 401 logout
api.interceptors.response.use(
    async res => {
        if (res.status === 401) {
            await AsyncStorage.removeItem('activity_token');
            const { store } = await import('../store/index');
            const { logout } = await import('../store/slices/authSlice');
            store.dispatch(logout());
            const err = new Error(res.data?.message || 'Unauthorized');
            err.response = res;
            throw err;
        }
        if (res.status >= 400) {
            const err = new Error(res.data?.message || 'İstek başarısız');
            err.response = res;
            throw err;
        }
        return res;
    }
);

export default api;
export { BASE_URL };
