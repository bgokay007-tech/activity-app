import { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, ScrollView, Image, Alert, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import MapView, { Polyline, PROVIDER_DEFAULT } from 'react-native-maps';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '../../services/api';
import colors from '../../theme/colors';
import { moderateScale } from '../../theme/scale';
import {
    requestTrailLocationPermissions, startRecording, stopRecording,
    getLivePoints, pathDistanceKm,
} from '../../services/trailTracking';

const DIFFICULTIES = [
    { id: 'EASY', label: 'Kolay' },
    { id: 'MEDIUM', label: 'Orta' },
    { id: 'HARD', label: 'Zor' },
];

export default function RecordTrailScreen({ navigation, route }) {
    const insets = useSafeAreaInsets();
    const [recording, setRecording] = useState(false);
    const [points, setPoints] = useState([]);
    const [startedAt, setStartedAt] = useState(null);
    const [finished, setFinished] = useState(false);
    const pollRef = useRef(null);

    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [difficulty, setDifficulty] = useState('MEDIUM');
    const [photos, setPhotos] = useState([]);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

    const handleStart = async () => {
        const perm = await requestTrailLocationPermissions();
        if (!perm.granted) {
            Alert.alert('İzin gerekli', 'Rota kaydedebilmek için konum iznine ihtiyacımız var.');
            return;
        }
        if (!perm.background) {
            Alert.alert(
                'Arka plan konumu kapalı',
                'Telefon kilitliyken/ekran kapalıyken kaydın devam etmesi için "Her Zaman İzin Ver" seçeneğini seçmen gerekiyor. Yine de sadece ekran açıkken kayıt başlatılacak.'
            );
        }
        await startRecording();
        setStartedAt(Date.now());
        setRecording(true);
        setPoints([]);
        pollRef.current = setInterval(async () => {
            const pts = await getLivePoints();
            setPoints(pts);
        }, 3000);
    };

    const handleStop = async () => {
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
        const finalPoints = await stopRecording();
        setPoints(finalPoints);
        setRecording(false);
        setFinished(true);
    };

    const addPhoto = async () => {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) { Alert.alert('İzin gerekli', 'Galeri erişimine izin verin.'); return; }
        const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85 });
        if (!result.canceled) setPhotos(p => [...p, result.assets[0]]);
    };

    const submit = async () => {
        if (!title.trim()) { Alert.alert('', 'Rota için bir başlık gir.'); return; }
        if (points.length < 2) { Alert.alert('', 'Kaydedilen rota çok kısa, en az birkaç nokta gerekiyor.'); return; }
        setSubmitting(true);
        try {
            const images = [];
            for (const photo of photos) {
                const filename = photo.uri.split('/').pop();
                const ext = filename.split('.').pop()?.toLowerCase() || 'jpg';
                const formData = new FormData();
                formData.append('file', { uri: photo.uri, type: `image/${ext}`, name: filename });
                const { data } = await api.post('/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
                images.push(data.url);
            }
            const durationMin = startedAt ? Math.round((Date.now() - startedAt) / 60000) : undefined;
            await api.post('/trails', {
                subCategory: 'hiking',
                title: title.trim(),
                description: description.trim() || undefined,
                difficulty,
                path: points,
                distanceKm: pathDistanceKm(points),
                durationMin,
                images,
            });
            route.params?.onDone?.();
            navigation.goBack();
        } catch (e) {
            Alert.alert('', e?.response?.data?.message || 'Rota kaydedilemedi');
        } finally { setSubmitting(false); }
    };

    const coords = points.map(p => ({ latitude: p.lat, longitude: p.lng }));
    const elapsedMin = startedAt ? Math.round((Date.now() - startedAt) / 60000) : 0;

    return (
        <View style={{ flex: 1, backgroundColor: colors.bg }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingTop: insets.top + 8, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginRight: 10 }}>
                    <Text style={{ color: colors.textMuted, fontSize: 22 }}>‹</Text>
                </TouchableOpacity>
                <Text style={{ color: '#fff', fontSize: 16, fontWeight: '800' }}>🥾 Rota Kaydet</Text>
            </View>

            {!finished ? (
                <View style={{ flex: 1 }}>
                    <MapView
                        provider={PROVIDER_DEFAULT}
                        style={{ flex: 1 }}
                        showsUserLocation
                        initialRegion={{
                            latitude: coords[0]?.latitude || 41.015137,
                            longitude: coords[0]?.longitude || 28.97953,
                            latitudeDelta: 0.05, longitudeDelta: 0.05,
                        }}
                        region={coords.length > 0 ? { latitude: coords[coords.length - 1].latitude, longitude: coords[coords.length - 1].longitude, latitudeDelta: 0.02, longitudeDelta: 0.02 } : undefined}
                    >
                        {coords.length > 1 && <Polyline coordinates={coords} strokeColor="#65a30d" strokeWidth={4} />}
                    </MapView>
                    <View style={{ padding: 14, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginBottom: 12 }}>
                            <Text style={{ color: '#fff', fontSize: 13 }}>📏 {pathDistanceKm(points).toFixed(2)} km</Text>
                            <Text style={{ color: '#fff', fontSize: 13 }}>⏱️ {elapsedMin} dk</Text>
                            <Text style={{ color: '#fff', fontSize: 13 }}>📍 {points.length} nokta</Text>
                        </View>
                        {!recording ? (
                            <TouchableOpacity onPress={handleStart} style={{ backgroundColor: '#65a30d', borderRadius: moderateScale(10), paddingVertical: 12, alignItems: 'center' }}>
                                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>▶ Kayda Başla</Text>
                            </TouchableOpacity>
                        ) : (
                            <TouchableOpacity onPress={handleStop} style={{ backgroundColor: '#dc2626', borderRadius: moderateScale(10), paddingVertical: 12, alignItems: 'center' }}>
                                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>■ Kaydı Bitir</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </View>
            ) : (
                <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                    <ScrollView contentContainerStyle={{ padding: 14 }}>
                        <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 10 }}>
                            📏 {pathDistanceKm(points).toFixed(2)} km · ⏱️ {elapsedMin} dk · 📍 {points.length} nokta
                        </Text>
                        <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 4 }}>Başlık</Text>
                        <TextInput style={{ backgroundColor: colors.surface2, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, color: '#fff', fontSize: 14, borderWidth: 1, borderColor: colors.border, marginBottom: 12 }}
                            value={title} onChangeText={setTitle} placeholder="Örn. Belgrad Ormanı Turu" placeholderTextColor={colors.textMuted} />
                        <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 4 }}>Açıklama</Text>
                        <TextInput style={{ backgroundColor: colors.surface2, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, color: '#fff', fontSize: 14, borderWidth: 1, borderColor: colors.border, marginBottom: 12, height: 80, textAlignVertical: 'top' }}
                            value={description} onChangeText={setDescription} placeholder="Rota hakkında birkaç cümle..." placeholderTextColor={colors.textMuted} multiline />
                        <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 4 }}>Zorluk</Text>
                        <View style={{ flexDirection: 'row', gap: 6, marginBottom: 14 }}>
                            {DIFFICULTIES.map(d => (
                                <TouchableOpacity key={d.id} onPress={() => setDifficulty(d.id)}
                                    style={{ flex: 1, paddingVertical: 7, borderRadius: 8, alignItems: 'center', backgroundColor: difficulty === d.id ? '#65a30d' : colors.surface2, borderWidth: 1, borderColor: difficulty === d.id ? '#65a30d' : colors.border }}>
                                    <Text style={{ color: difficulty === d.id ? '#fff' : colors.textSecondary, fontSize: 12, fontWeight: '700' }}>{d.label}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                        <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 4 }}>Fotoğraflar</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
                            {photos.map((p, i) => (
                                <Image key={i} source={{ uri: p.uri }} style={{ width: 70, height: 70, borderRadius: 8, marginRight: 6 }} />
                            ))}
                            <TouchableOpacity onPress={addPhoto} style={{ width: 70, height: 70, borderRadius: 8, borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' }}>
                                <Text style={{ color: colors.textMuted, fontSize: 22 }}>+</Text>
                            </TouchableOpacity>
                        </ScrollView>
                        <TouchableOpacity disabled={submitting} onPress={submit} style={{ backgroundColor: '#65a30d', borderRadius: moderateScale(10), paddingVertical: 12, alignItems: 'center', opacity: submitting ? 0.6 : 1 }}>
                            {submitting ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>Rotayı Paylaş</Text>}
                        </TouchableOpacity>
                    </ScrollView>
                </KeyboardAvoidingView>
            )}
        </View>
    );
}
