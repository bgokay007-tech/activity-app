import { Component, useEffect } from 'react';
import { View, Text, LogBox, Alert, AppState } from 'react-native';
// Yerel (non-EAS) debug derlemelerinde ExpoUpdates native modülü linklenmeyebiliyor —
// import'un kendisi bu durumda senkron olarak fırlıyor (üsttekiler bunu try/catch ile
// yakalayamaz). EAS ile üretilen gerçek build'lerde modül her zaman mevcut, davranış
// değişmiyor; sadece yerel test derlemesinin açılışta çökmesini engelliyor.
let Updates;
try {
    Updates = require('expo-updates');
} catch {
    Updates = { isEnabled: false };
}

LogBox.ignoreLogs(['expo-notifications']);
import { StatusBar } from 'expo-status-bar';
import { Provider } from 'react-redux';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { store } from './src/store';
import Navigation from './src/navigation';
let addMatchUpdateListener = () => ({ remove() {} });
try {
    addMatchUpdateListener = require('./modules/wear-bridge').addMatchUpdateListener;
} catch {
    addMatchUpdateListener = () => ({ remove() {} });
}

// Bazı Android cihazlar "kapat" hareketinde uygulamayı gerçekten öldürmüyor,
// arka planda canlı tutuyor — bu yüzden expo-updates'in varsayılan "sadece
// soğuk başlatmada kontrol et" davranışı hiç tetiklenmeyebiliyor ve kullanıcı
// onlarca kez kapatıp açsa bile güncelleme gelmiyor. Bunun yerine uygulama
// her açıldığında VE her ön plana her geldiğinde aktif olarak kontrol edip
// varsa indirip otomatik uyguluyoruz.
function useAutoUpdate() {
    useEffect(() => {
        // Preview APK'da __DEV__ false; yine de isEnabled yoksa çık.
        if (!Updates.isEnabled) return;
        let cancelled = false;
        const checkAndApply = async () => {
            try {
                const result = await Updates.checkForUpdateAsync();
                if (!result.isAvailable || cancelled) return;
                await Updates.fetchUpdateAsync();
                if (cancelled) return;
                // Native soğuk açılış bazen indirmeyi uygalamadan bırakıyor —
                // her yeni pakette kısa gecikmeyle zorla yenile.
                setTimeout(() => { if (!cancelled) Updates.reloadAsync(); }, 1500);
            } catch (e) {
                // sessiz
            }
        };
        checkAndApply();
        const sub = AppState.addEventListener('change', (state) => {
            if (state === 'active') checkAndApply();
        });
        return () => { cancelled = true; sub.remove(); };
    }, []);
}

// Saatten (Wear OS) canlı maç güncellemesi geldiğini kanıtlayan basit bildirim —
// belirli bir maça (matchId) otomatik doldurma ayrı, daha büyük bir görev
// (saatin hangi maçı skorladığını bilmesi gerekiyor), bu sadece köprünün
// çalıştığını doğruluyor.
function useWearBridgeDebugAlert() {
    useEffect(() => {
        const sub = addMatchUpdateListener((update) => {
            const setsLine = `${update.setsA} - ${update.setsB}`;
            const pointsLine = `${update.pointLabelA} - ${update.pointLabelB}`;
            Alert.alert(
                '⌚ Saatten skor güncellemesi',
                `Set: ${setsLine}\nSayı: ${pointsLine}${update.matchWinner ? `\nKazanan: ${update.matchWinner}` : ''}`
            );
        });
        return () => sub.remove();
    }, []);
}

class ErrorBoundary extends Component {
    state = { error: null };
    static getDerivedStateFromError(error) { return { error }; }
    render() {
        if (this.state.error) {
            return (
                <View style={{ flex: 1, backgroundColor: '#0A0A0A', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
                    <Text style={{ color: '#f00', fontSize: 16, fontWeight: '700', marginBottom: 12 }}>Crash:</Text>
                    <Text style={{ color: '#fff', fontSize: 12 }}>{this.state.error?.message}</Text>
                    <Text style={{ color: '#aaa', fontSize: 10, marginTop: 8 }}>{this.state.error?.stack?.slice(0, 300)}</Text>
                </View>
            );
        }
        return this.props.children;
    }
}

export default function App() {
    useAutoUpdate();
    useWearBridgeDebugAlert();
    return (
        <ErrorBoundary>
            <SafeAreaProvider>
                <Provider store={store}>
                    <StatusBar style="light" />
                    <Navigation />
                </Provider>
            </SafeAreaProvider>
        </ErrorBoundary>
    );
}
