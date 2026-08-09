import { useEffect, useRef, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Animated, PanResponder, Dimensions } from 'react-native';
import { mediaDevices, RTCPeerConnection, RTCView, RTCIceCandidate, RTCSessionDescription } from 'react-native-webrtc';
import * as Location from 'expo-location';
import api from '../../services/api';
import { getSocket, onSocket } from '../../services/socket';
import colors from '../../theme/colors';
import useT from '../../hooks/useT';

// Arkadaş Bulma — Canlı Eşleş: kamera izni veren iki kullanıcı, mevcut Arkadaş Bulma
// filtreleriyle (mesafe/yaş/cinsiyet/"Ne Arıyorlar") eşleşince WebRTC üzerinden CANLI
// görüntülü bağlanıyor (medya akışı P2P, sunucudan geçmiyor — sunucu sadece SDP/ICE
// sinyallerini iletiyor, bkz. backend/src/sockets/friendFindingLive.js). Sağa kaydırmak
// ya da "Geç" butonu mevcut görüşmeyi PASS olarak kaydedip sıradaki adaya geçer; "Eşleş"
// butonuna ikisi de basarsa normal Arkadaş Bulma eşleşmesi (mesajlaşma) oluşur.
const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];
const SCREEN_W = Dimensions.get('window').width;

export default function FriendFindingLiveScreen({ navigation }) {
    const t = useT();
    const [phase, setPhase] = useState('starting'); // starting | queued | connecting | connected | ended-mutual
    const [partner, setPartner] = useState(null);
    const [remoteStream, setRemoteStream] = useState(null);
    const [errorMsg, setErrorMsg] = useState(null);

    const localStreamRef = useRef(null);
    const pcRef = useRef(null);
    const isInitiatorRef = useRef(false);

    const translateX = useRef(new Animated.Value(0)).current;

    const cleanupSession = useCallback(() => {
        pcRef.current?.close();
        pcRef.current = null;
        setRemoteStream(null);
        setPartner(null);
    }, []);

    const cleanupAll = useCallback(() => {
        cleanupSession();
        localStreamRef.current?.getTracks().forEach(tr => tr.stop());
        localStreamRef.current = null;
        getSocket()?.emit('ff:live:cancel');
    }, [cleanupSession]);

    const requeue = useCallback(() => {
        cleanupSession();
        setPhase('queued');
        getSocket()?.emit('ff:live:ready');
    }, [cleanupSession]);

    const setupPeerConnection = useCallback((sessionPartnerId) => {
        const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
        pcRef.current = pc;
        localStreamRef.current?.getTracks().forEach(track => pc.addTrack(track, localStreamRef.current));
        pc.onicecandidate = (e) => {
            if (e.candidate) getSocket()?.emit('ff:live:ice-candidate', { candidate: e.candidate });
        };
        pc.ontrack = (e) => {
            if (e.streams?.[0]) setRemoteStream(e.streams[0]);
        };
        pc.onconnectionstatechange = () => {
            if (pc.connectionState === 'connected') setPhase('connected');
        };
        return pc;
    }, []);

    // İlk açılış: konum + kamera/mikrofon izni + yerel akış, sonra kuyruğa gir. Konum
    // burada da (Arkadaş Bulma ana ekranındaki ensureLocation ile aynı şekilde) tazeden
    // alınıp sunucuya gönderiliyor — kullanıcı bu ekrana ana ekrana hiç uğramadan direkt
    // gelirse sunucudaki konum boş kalıp eşleştirme hiç tetiklenmiyordu.
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const locPerm = await Location.requestForegroundPermissionsAsync();
                if (!locPerm.granted) { if (!cancelled) setErrorMsg(t.ffLocationRequired || 'Konum izni gerekiyor.'); return; }
                const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
                if (cancelled) return;
                await api.post('/friend-finding/location', { lat: pos.coords.latitude, lng: pos.coords.longitude });

                const stream = await mediaDevices.getUserMedia({ audio: true, video: { facingMode: 'user' } });
                if (cancelled) { stream.getTracks().forEach(tr => tr.stop()); return; }
                localStreamRef.current = stream;
                setPhase('queued');
                getSocket()?.emit('ff:live:ready');
            } catch {
                if (!cancelled) setErrorMsg(t.ffLocationFailed || t.ffLiveCameraDenied || 'Konum/kamera alınamadı.');
            }
        })();
        return () => { cancelled = true; cleanupAll(); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        const offs = [
            onSocket('ff:live:queued', () => setPhase('queued')),
            onSocket('ff:live:error', (data) => setErrorMsg(data?.message || t.actionFailed)),
            onSocket('ff:live:matched', async ({ partner: p, isInitiator }) => {
                setPartner(p);
                setPhase('connecting');
                isInitiatorRef.current = isInitiator;
                const pc = setupPeerConnection(p.id);
                if (isInitiator) {
                    const offer = await pc.createOffer();
                    await pc.setLocalDescription(offer);
                    getSocket()?.emit('ff:live:offer', { sdp: pc.localDescription });
                }
            }),
            onSocket('ff:live:offer', async ({ sdp }) => {
                const pc = pcRef.current;
                if (!pc) return;
                await pc.setRemoteDescription(new RTCSessionDescription(sdp));
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                getSocket()?.emit('ff:live:answer', { sdp: pc.localDescription });
            }),
            onSocket('ff:live:answer', async ({ sdp }) => {
                await pcRef.current?.setRemoteDescription(new RTCSessionDescription(sdp));
            }),
            onSocket('ff:live:ice-candidate', async ({ candidate }) => {
                try { await pcRef.current?.addIceCandidate(new RTCIceCandidate(candidate)); } catch { /* geç gelen aday yutulur */ }
            }),
            onSocket('ff:live:ended', () => {
                Alert.alert('', t.ffLivePartnerLeft || 'Karşı taraf ayrıldı, yeni biri aranıyor...');
                requeue();
            }),
            onSocket('ff:live:partner-liked', () => {
                // Sessiz ipucu — istenirse burada küçük bir rozet gösterilebilir, şimdilik no-op.
            }),
            onSocket('ff:live:matched-mutual', ({ otherUserId }) => {
                cleanupAll();
                setPhase('ended-mutual');
                Alert.alert(t.ffMatchTitle || '🎉 Eşleştiniz!', t.ffMatchDescWith ? t.ffMatchDescWith(partner?.fullName || partner?.username || '') : '', [
                    { text: 'Tamam', onPress: () => navigation.replace('FriendFindingMatches') },
                ]);
            }),
        ];
        return () => offs.forEach(off => off());
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [setupPeerConnection, requeue, cleanupAll, partner]);

    const doSkip = useCallback(() => {
        if (phase !== 'connecting' && phase !== 'connected') return;
        getSocket()?.emit('ff:live:skip');
        requeue();
    }, [phase, requeue]);

    const doLike = useCallback(() => {
        if (phase !== 'connected' && phase !== 'connecting') return;
        getSocket()?.emit('ff:live:like');
    }, [phase]);

    const panResponder = useRef(PanResponder.create({
        onStartShouldSetPanResponder: () => phase === 'connected' || phase === 'connecting',
        onPanResponderMove: (_, g) => { if (g.dx > 0) translateX.setValue(g.dx); },
        onPanResponderRelease: (_, g) => {
            if (g.dx > SCREEN_W * 0.3) {
                Animated.timing(translateX, { toValue: SCREEN_W, duration: 200, useNativeDriver: true }).start(() => {
                    translateX.setValue(0);
                    doSkip();
                });
            } else {
                Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
            }
        },
    })).current;

    if (errorMsg) {
        return (
            <View style={s.centerBox}>
                <Text style={s.errorText}>{errorMsg}</Text>
                <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
                    <Text style={s.backBtnText}>{t.back}</Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <View style={s.container}>
            <TouchableOpacity style={s.closeBtn} onPress={() => { cleanupAll(); navigation.goBack(); }}>
                <Text style={s.closeBtnText}>✕</Text>
            </TouchableOpacity>

            {(phase === 'starting' || phase === 'queued') && (
                <View style={s.centerBox}>
                    <ActivityIndicator color="#d97706" size="large" />
                    <Text style={s.waitingText}>
                        {phase === 'starting' ? (t.ffLivePreparing || 'Kamera hazırlanıyor...') : (t.ffLiveSearching || 'Yakınlarda uygun biri aranıyor...')}
                    </Text>
                </View>
            )}

            {(phase === 'connecting' || phase === 'connected') && (
                <Animated.View style={[s.videoArea, { transform: [{ translateX }] }]} {...panResponder.panHandlers}>
                    {remoteStream ? (
                        <RTCView streamURL={remoteStream.toURL()} style={s.remoteVideo} objectFit="cover" />
                    ) : (
                        <View style={[s.remoteVideo, s.remotePlaceholder]}>
                            <ActivityIndicator color="#d97706" />
                            <Text style={s.waitingText}>{t.ffLiveConnecting || 'Bağlanıyor...'}</Text>
                        </View>
                    )}
                    {!!partner && (
                        <View style={s.partnerBadge}>
                            <Text style={s.partnerName}>{partner.fullName || partner.username}</Text>
                        </View>
                    )}
                    {localStreamRef.current && (
                        <RTCView streamURL={localStreamRef.current.toURL()} style={s.localVideo} objectFit="cover" mirror zOrder={1} />
                    )}
                </Animated.View>
            )}

            {(phase === 'connecting' || phase === 'connected') && (
                <View style={s.actionsRow}>
                    <TouchableOpacity style={[s.actionBtn, s.skipBtn]} onPress={doSkip}>
                        <Text style={s.skipBtnText}>→ {t.ffLiveSkipBtn || 'Geç'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[s.actionBtn, s.likeBtn]} onPress={doLike}>
                        <Text style={s.likeBtnText}>♥ {t.ffLikeBtn || 'Eşleş'}</Text>
                    </TouchableOpacity>
                </View>
            )}
        </View>
    );
}

const s = StyleSheet.create({
    container:        { flex: 1, backgroundColor: '#000' },
    closeBtn:          { position: 'absolute', top: 53, left: 17, zIndex: 10, width: 36, height: 36, borderRadius: 18, backgroundColor: '#00000080', alignItems: 'center', justifyContent: 'center' },
    closeBtnText:      { color: '#fff', fontSize: 18, fontWeight: '700' },
    centerBox:         { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 27, gap: 13 },
    waitingText:       { color: colors.textMuted, fontSize: 14, textAlign: 'center', marginTop: 8 },
    errorText:         { color: '#fff', fontSize: 15, textAlign: 'center' },
    backBtn:           { marginTop: 13, backgroundColor: colors.surface2, borderRadius: 12, paddingHorizontal: 21, paddingVertical: 9 },
    backBtnText:       { color: '#fff', fontWeight: '700' },
    videoArea:         { flex: 1 },
    remoteVideo:       { flex: 1, backgroundColor: '#111' },
    remotePlaceholder: { alignItems: 'center', justifyContent: 'center' },
    localVideo:        { position: 'absolute', bottom: 130, right: 17, width: 110, height: 150, borderRadius: 14, borderWidth: 2, borderColor: '#fff' },
    partnerBadge:      { position: 'absolute', top: 53, alignSelf: 'center', backgroundColor: '#00000080', borderRadius: 12, paddingHorizontal: 13, paddingVertical: 6 },
    partnerName:       { color: '#fff', fontWeight: '800', fontSize: 15 },
    actionsRow:        { flexDirection: 'row', gap: 11, padding: 17, paddingBottom: 37 },
    actionBtn:         { flex: 1, borderRadius: 16, paddingVertical: 15, alignItems: 'center', borderWidth: 1 },
    skipBtn:           { backgroundColor: '#ffffff10', borderColor: '#ffffff30' },
    skipBtnText:       { color: '#fff', fontWeight: '800', fontSize: 15 },
    likeBtn:           { backgroundColor: '#d9770630', borderColor: '#d97706' },
    likeBtnText:       { color: '#d97706', fontWeight: '800', fontSize: 15 },
});
