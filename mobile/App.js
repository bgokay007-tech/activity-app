import { Component, useEffect } from 'react';
import { View, Text, LogBox, Alert, AppState } from 'react-native';
import * as Updates from 'expo-updates';

LogBox.ignoreLogs(['expo-notifications']);
import { StatusBar } from 'expo-status-bar';
import { Provider } from 'react-redux';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { store } from './src/store';
import Navigation from './src/navigation';
import { addMatchUpdateListener } from './modules/wear-bridge';

// Bazı Android cihazlar "kapat" hareketinde uygulamayı gerçekten öldürmüyor,
// arka planda canlı tutuyor — bu yüzden expo-updates'in varsayılan "sadece
// soğuk başlatmada kontrol et" davranışı hiç tetiklenmeyebiliyor ve kullanıcı
// onlarca kez kapatıp açsa bile güncelleme gelmiyor. Bunun yerine uygulama
// her açıldığında VE her ön plana her geldiğinde aktif olarak kontrol edip
// varsa indirip otomatik uyguluyoruz.
function useAutoUpdate() {
    useEffect(() => {
        if (__DEV__ || !Updates.isEnabled) return;
        let cancelled = false;
        const checkAndApply = async () => {
            try {
                const result = await Updates.checkForUpdateAsync();
                if (!result.isAvailable || cancelled) return;
                await Updates.fetchUpdateAsync();
                if (!cancelled) await Updates.reloadAsync();
            } catch (e) {
                // güncelleme kontrolü başarısız olursa sessizce yut, uygulama normal akışına devam etsin
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
