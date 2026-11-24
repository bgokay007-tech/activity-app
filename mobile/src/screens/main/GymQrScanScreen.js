import { useCallback, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import colors from '../../theme/colors';
import api from '../../services/api';
import useT from '../../hooks/useT';

export default function GymQrScanScreen({ route, navigation }) {
    const t = useT();
    const insets = useSafeAreaInsets();
    const { gymId, gymName } = route.params || {};
    const [permission, requestPermission] = useCameraPermissions();
    const [busy, setBusy] = useState(false);
    const [lastMsg, setLastMsg] = useState('');
    const lockRef = useRef(false);

    const onBarcode = useCallback(async ({ data }) => {
        if (!gymId || lockRef.current || busy) return;
        const payload = String(data || '').trim();
        if (!payload) return;
        lockRef.current = true;
        setBusy(true);
        try {
            const { data: res } = await api.post(`/gyms/${gymId}/scan`, {
                qrPayload: payload,
                type: 'AUTO',
            });
            const who = res?.member?.fullName || res?.member?.username || '';
            const msg = `${res?.message || ''}${who ? ` — ${who}` : ''}`;
            setLastMsg(msg);
            Alert.alert(t.gymScanResultTitle, msg);
        } catch (e) {
            Alert.alert(t.error, e?.response?.data?.message || t.actionFailed);
        } finally {
            setBusy(false);
            // Ardışık taramalar için kısa kilit
            setTimeout(() => { lockRef.current = false; }, 1800);
        }
    }, [gymId, busy, t]);

    if (!permission) {
        return (
            <View style={s.center}>
                <ActivityIndicator color="#f97316" />
            </View>
        );
    }

    if (!permission.granted) {
        return (
            <View style={[s.center, { padding: 24 }]}>
                <Text style={s.hint}>{t.gymCameraPermission}</Text>
                <TouchableOpacity style={s.btn} onPress={requestPermission}>
                    <Text style={s.btnText}>{t.gymAllowCamera}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginTop: 16 }}>
                    <Text style={{ color: colors.textMuted }}>{t.cancelBtn}</Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <View style={s.root}>
            <CameraView
                style={StyleSheet.absoluteFill}
                facing="back"
                barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                onBarcodeScanned={busy ? undefined : onBarcode}
            />
            <View style={[s.top, { paddingTop: insets.top + 8 }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={s.close}>
                    <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800' }}>✕</Text>
                </TouchableOpacity>
                <Text style={s.title} numberOfLines={1}>{gymName || t.gymScanQrBtn}</Text>
            </View>
            <View style={[s.bottom, { paddingBottom: insets.bottom + 16 }]}>
                <Text style={s.hint}>{t.gymScanHint}</Text>
                {busy && <ActivityIndicator color="#fff" style={{ marginTop: 8 }} />}
                {!!lastMsg && <Text style={s.last}>{lastMsg}</Text>}
            </View>
        </View>
    );
}

const s = StyleSheet.create({
    root: { flex: 1, backgroundColor: '#000' },
    center: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
    top: {
        position: 'absolute', top: 0, left: 0, right: 0,
        flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingBottom: 10,
        backgroundColor: 'rgba(0,0,0,0.45)',
    },
    close: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.15)' },
    title: { color: '#fff', fontSize: 15, fontWeight: '800', flex: 1 },
    bottom: {
        position: 'absolute', left: 0, right: 0, bottom: 0,
        paddingHorizontal: 16, paddingTop: 14, backgroundColor: 'rgba(0,0,0,0.55)',
    },
    hint: { color: '#e5e7eb', fontSize: 13, textAlign: 'center', fontWeight: '600' },
    last: { color: '#4ade80', fontSize: 12, textAlign: 'center', marginTop: 8, fontWeight: '700' },
    btn: { backgroundColor: '#f97316', paddingHorizontal: 18, paddingVertical: 12, borderRadius: 10, marginTop: 14 },
    btnText: { color: '#fff', fontWeight: '900' },
});
