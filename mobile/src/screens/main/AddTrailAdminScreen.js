import { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, ScrollView, Image, Alert, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import MapView, { Polyline, PROVIDER_DEFAULT } from 'react-native-maps';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '../../services/api';
import colors from '../../theme/colors';
import { moderateScale } from '../../theme/scale';
import { pathDistanceKm } from '../../services/trailTracking';

const DIFFICULTIES = [
    { id: 'EASY', label: 'Kolay' },
    { id: 'MEDIUM', label: 'Orta' },
    { id: 'HARD', label: 'Zor' },
];

// Basit, regex tabanlı GPX ayrıştırıcı — ağır bir XML kütüphanesi eklemeden
// <trkpt lat lon><ele>/<time> etiketlerini çeker (backend'deki news.controller.js
// parseRSS'iyle aynı yaklaşım).
function parseGpx(xml) {
    const points = [];
    const trkptRegex = /<trkpt\s+lat="([-0-9.]+)"\s+lon="([-0-9.]+)"[^>]*>([\s\S]*?)<\/trkpt>/g;
    let match;
    while ((match = trkptRegex.exec(xml)) !== null) {
        const [, lat, lng, inner] = match;
        const eleMatch = inner.match(/<ele>([-0-9.]+)<\/ele>/);
        const timeMatch = inner.match(/<time>([^<]+)<\/time>/);
        points.push({
            lat: parseFloat(lat),
            lng: parseFloat(lng),
            ele: eleMatch ? parseFloat(eleMatch[1]) : undefined,
            t: timeMatch ? timeMatch[1] : undefined,
        });
    }
    return points;
}

export default function AddTrailAdminScreen({ navigation, route }) {
    const sub = route.params?.sub || 'hiking';
    const insets = useSafeAreaInsets();
    const [points, setPoints] = useState([]);
    const [fileName, setFileName] = useState('');
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [city, setCity] = useState('');
    const [difficulty, setDifficulty] = useState('MEDIUM');
    const [photos, setPhotos] = useState([]);
    const [parsing, setParsing] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    const pickGpx = async () => {
        const result = await DocumentPicker.getDocumentAsync({ type: ['application/gpx+xml', 'application/xml', 'text/xml', '*/*'], copyToCacheDirectory: true });
        if (result.canceled || !result.assets?.[0]) return;
        const asset = result.assets[0];
        setParsing(true);
        try {
            const text = await FileSystem.readAsStringAsync(asset.uri);
            const parsed = parseGpx(text);
            if (parsed.length < 2) {
                Alert.alert('', 'Bu dosyada geçerli bir GPS rotası bulunamadı.');
                return;
            }
            setPoints(parsed);
            setFileName(asset.name);
        } catch (e) {
            Alert.alert('', 'GPX dosyası okunamadı.');
        } finally { setParsing(false); }
    };

    const addPhoto = async () => {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) { Alert.alert('İzin gerekli', 'Galeri erişimine izin verin.'); return; }
        const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85 });
        if (!result.canceled) setPhotos(p => [...p, result.assets[0]]);
    };

    const submit = async () => {
        if (!title.trim()) { Alert.alert('', 'Rota için bir başlık gir.'); return; }
        if (points.length < 2) { Alert.alert('', 'Önce bir GPX dosyası seç.'); return; }
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
            await api.post('/trails', {
                subCategory: sub,
                title: title.trim(),
                description: description.trim() || undefined,
                city: city.trim() || undefined,
                difficulty,
                path: points,
                distanceKm: pathDistanceKm(points),
                images,
                source: 'CURATED',
            });
            route.params?.onDone?.();
            navigation.goBack();
        } catch (e) {
            Alert.alert('', e?.response?.data?.message || 'Rota kaydedilemedi');
        } finally { setSubmitting(false); }
    };

    const coords = points.map(p => ({ latitude: p.lat, longitude: p.lng }));

    return (
        <View style={{ flex: 1, backgroundColor: colors.bg }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingTop: insets.top + 8, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginRight: 10 }}>
                    <Text style={{ color: colors.textMuted, fontSize: 22 }}>‹</Text>
                </TouchableOpacity>
                <Text style={{ color: '#fff', fontSize: 16, fontWeight: '800' }}>📥 GPX ile Rota Ekle</Text>
            </View>

            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <ScrollView contentContainerStyle={{ padding: 14 }}>
                    <TouchableOpacity onPress={pickGpx} disabled={parsing} style={{ backgroundColor: colors.surface2, borderRadius: moderateScale(10), paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed', marginBottom: 12 }}>
                        {parsing ? <ActivityIndicator color={colors.purple} /> : (
                            <Text style={{ color: colors.purple, fontWeight: '800', fontSize: 13 }}>
                                {fileName ? `✓ ${fileName} (${points.length} nokta)` : '📂 .gpx Dosyası Seç'}
                            </Text>
                        )}
                    </TouchableOpacity>

                    {coords.length > 1 && (
                        <MapView
                            provider={PROVIDER_DEFAULT}
                            style={{ width: '100%', height: 180, borderRadius: 10, marginBottom: 12 }}
                            initialRegion={{ latitude: coords[0].latitude, longitude: coords[0].longitude, latitudeDelta: 0.05, longitudeDelta: 0.05 }}
                        >
                            <Polyline coordinates={coords} strokeColor="#65a30d" strokeWidth={4} />
                        </MapView>
                    )}

                    <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 4 }}>Başlık</Text>
                    <TextInput style={{ backgroundColor: colors.surface2, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, color: '#fff', fontSize: 14, borderWidth: 1, borderColor: colors.border, marginBottom: 12 }}
                        value={title} onChangeText={setTitle} placeholder="Örn. Kaçkar Dağı Yaylalar Rotası" placeholderTextColor={colors.textMuted} />
                    <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 4 }}>Açıklama</Text>
                    <TextInput style={{ backgroundColor: colors.surface2, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, color: '#fff', fontSize: 14, borderWidth: 1, borderColor: colors.border, marginBottom: 12, height: 80, textAlignVertical: 'top' }}
                        value={description} onChangeText={setDescription} placeholder="Rota hakkında bilgi..." placeholderTextColor={colors.textMuted} multiline />
                    <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 4 }}>İl</Text>
                    <TextInput style={{ backgroundColor: colors.surface2, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, color: '#fff', fontSize: 14, borderWidth: 1, borderColor: colors.border, marginBottom: 12 }}
                        value={city} onChangeText={setCity} placeholder="Örn. Rize" placeholderTextColor={colors.textMuted} />
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
                    <TouchableOpacity disabled={submitting} onPress={submit} style={{ backgroundColor: colors.purple, borderRadius: moderateScale(10), paddingVertical: 12, alignItems: 'center', opacity: submitting ? 0.6 : 1 }}>
                        {submitting ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>✓ Onaylı Rota Olarak Yayınla</Text>}
                    </TouchableOpacity>
                </ScrollView>
            </KeyboardAvoidingView>
        </View>
    );
}
