import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Change this to your machine's local IP when testing on a physical device
const BASE_URL = 'http://192.168.1.18:5000/api';

const api = axios.create({ baseURL: BASE_URL, headers: { 'bypass-tunnel-reminder': 'true' } });

api.interceptors.request.use(async (config) => {
    const token = await AsyncStorage.getItem('activity_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
});

export default api;
export { BASE_URL };
