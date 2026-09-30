import { useState } from 'react';
import {
    View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput, Image,
    Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '../../services/api';
import colors from '../../theme/colors';
import useT from '../../hooks/useT';
import CityAutocomplete from '../../components/CityAutocomplete';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { pickAndUploadMedia } from '../../utils/travelMedia';
import { parseGpxSegments, segmentsLengthKm } from '../../utils/travelOffline';
import { travelStyles as ts } from './TravelExploreHomeScreen';

export function MediaStrip({ media, onRemove }) {
    if (!media?.length) return null;
    return (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }} keyboardShouldPersistTaps="handled">
            {media.map((m, i) => (
                <View key={`${m.url}-${i}`} style={s.thumbWrap}>
                    {m.type === 'image'
                        ? <Image source={{ uri: m.url }} style={s.thumb} />
                        : <View style={[s.thumb, s.videoThumb]}><Text style={{ fontSize: 26 }}>🎬</Text></View>}
                    {onRemove ? (
                        <TouchableOpacity style={s.removeBtn} onPress={() => onRemove(i)}>
                            <Text style={s.removeText}>✕</Text>
                        </TouchableOpacity>
                    ) : null}
                </View>
            ))}
        </ScrollView>
    );
}

export default function TravelRouteCreateScreen({ navigation }) {
    const t = useT();
    const insets = useSafeAreaInsets();
    const [title, setTitle] = useState('');
    const [startPlace, setStartPlace] = useState('');
    const [endPlace, setEndPlace] = useState('');
    const [stops, setStops] = useState([]);
    const [distanceKm, setDistanceKm] = useState('');
    const [durationText, setDurationText] = useState('');
    const [difficulty, setDifficulty] = useState(null);
    const [experience, setExperience] = useState('');
    const [media, setMedia] = useState([]);
    const [uploading, setUploading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [gpsPath, setGpsPath] = useState(null);
    const [parsingGpx, setParsingGpx] = useState(false);

    const importGpx = async () => {
        const result = await DocumentPicker.getDocumentAsync({ type: ['application/gpx+xml', 'application/xml', 'text/xml', '*/*'], copyToCacheDirectory: true });
        if (result.canceled || !result.assets?.[0]) return;
        setParsingGpx(true);
        try {
            const segs = parseGpxSegments(await FileSystem.readAsStringAsync(result.assets[0].uri));
            if (!segs.length) { Alert.alert('', t.tvGpxInvalid); return; }
            setGpsPath(segs);
            if (!distanceKm) setDistanceKm(String(segmentsLengthKm(segs)));
        } catch {
            Alert.alert('', t.tvGpxInvalid);
        } finally { setParsingGpx(false); }
    };

    const addMedia = async () => {
        if (uploading) return;
        setUploading(true);
        try {
            const added = await pickAndUploadMedia(t);
            if (added.length) setMedia(prev => [...prev, ...added].slice(0, 20));
        } catch (e) {
            Alert.alert(t.error, e?.response?.data?.message || t.actionFailed);
        } finally { setUploading(false); }
    };

    const submit = async () => {
        if (!title.trim() || !startPlace.trim()) { Alert.alert('', t.tvRequiredRoute); return; }
        setSaving(true);
        try {
            const { data } = await api.post('/travel/routes', {
                title, startPlace, endPlace, stops: stops.filter(x => x.trim()),
                distanceKm: distanceKm.replace(',', '.'), durationText, difficulty, experience, media,
                path: gpsPath || undefined,
            });
            Alert.alert('', t.tvRouteCreated);
            navigation.replace('TravelRouteDetail', { routeId: data.id });
        } catch (e) {
            Alert.alert(t.error, e?.response?.data?.message || t.actionFailed);
        } finally { setSaving(false); }
    };

    return (
        <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={[ts.header, { paddingTop: Math.max(insets.top, 12) + 6 }]}>
                <TouchableOpacity onPress={() => navigation.goBack()}><Text style={ts.backText}>{t.back}</Text></TouchableOpacity>
                <Text style={ts.title} numberOfLines={1}>{t.tvCreateRoute.replace('+ ', '')}</Text>
                <View style={{ width: 50 }} />
            </View>
            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 60 }} keyboardShouldPersistTaps="always">
                <Text style={ts.label}>{t.tvRouteName} *</Text>
                <TextInput style={ts.input} value={title} onChangeText={setTitle} placeholder={t.tvRouteNamePh} placeholderTextColor={colors.textMuted} />

                <Text style={ts.label}>{t.tvStart} *</Text>
                <CityAutocomplete value={startPlace} onChangeText={setStartPlace} placeholder={t.tvPlacePh} inputStyle={ts.input} style={{ zIndex: 40 }} />

                <Text style={ts.label}>{t.tvEnd}</Text>
                <CityAutocomplete value={endPlace} onChangeText={setEndPlace} placeholder={t.tvPlacePh} inputStyle={ts.input} style={{ zIndex: 30 }} />

                <Text style={ts.label}>{t.tvStops}</Text>
                {stops.map((st, i) => (
                    <View key={i} style={s.stopRow}>
                        <TextInput
                            style={[ts.input, { flex: 1 }]}
                            value={st}
                            onChangeText={(v) => setStops(prev => prev.map((x, j) => (j === i ? v : x)))}
                            placeholder={t.tvStopPh}
                            placeholderTextColor={colors.textMuted}
                        />
                        <TouchableOpacity onPress={() => setStops(prev => prev.filter((_, j) => j !== i))} style={s.stopDel}>
                            <Text style={s.removeText}>✕</Text>
                        </TouchableOpacity>
                    </View>
                ))}
                <TouchableOpacity onPress={() => setStops(prev => [...prev, ''])}><Text style={s.link}>{t.tvAddStop}</Text></TouchableOpacity>

                <TouchableOpacity style={s.gpxBtn} onPress={importGpx} disabled={parsingGpx}>
                    {parsingGpx ? <ActivityIndicator color="#0ea5e9" />
                        : <Text style={s.link}>{gpsPath ? t.tvGpxLoaded(gpsPath.reduce((n, sg) => n + sg.length, 0), segmentsLengthKm(gpsPath)) : t.tvImportGpx}</Text>}
                </TouchableOpacity>
                {gpsPath ? (
                    <TouchableOpacity onPress={() => setGpsPath(null)}><Text style={[s.link, { color: colors.red, marginTop: 4 }]}>✕ {t.tvRemoveGpx}</Text></TouchableOpacity>
                ) : null}

                <View style={{ flexDirection: 'row', gap: 10 }}>
                    <View style={{ flex: 1 }}>
                        <Text style={ts.label}>{t.tvDistance}</Text>
                        <TextInput style={ts.input} value={distanceKm} onChangeText={setDistanceKm} keyboardType="decimal-pad" placeholder="12" placeholderTextColor={colors.textMuted} />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={ts.label}>{t.tvDuration}</Text>
                        <TextInput style={ts.input} value={durationText} onChangeText={setDurationText} placeholder={t.tvDurationPh} placeholderTextColor={colors.textMuted} />
                    </View>
                </View>

                <Text style={ts.label}>{t.tvDifficulty}</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                    {['EASY', 'MEDIUM', 'HARD'].map(k => (
                        <TouchableOpacity key={k} style={[ts.chip, difficulty === k && ts.chipActive]} onPress={() => setDifficulty(difficulty === k ? null : k)}>
                            <Text style={[ts.chipText, difficulty === k && ts.chipTextActive]}>{t[`tvDiff${k}`]}</Text>
                        </TouchableOpacity>
                    ))}
                </View>

                <Text style={ts.label}>{t.tvMedia}</Text>
                <TouchableOpacity style={s.mediaBtn} onPress={addMedia} disabled={uploading}>
                    {uploading ? <ActivityIndicator color="#0ea5e9" /> : <Text style={s.link}>{t.tvAddMedia}</Text>}
                </TouchableOpacity>
                <MediaStrip media={media} onRemove={(i) => setMedia(prev => prev.filter((_, j) => j !== i))} />

                <Text style={ts.label}>{t.tvExperience}</Text>
                <TextInput
                    style={[ts.input, { minHeight: 110, textAlignVertical: 'top' }]}
                    value={experience}
                    onChangeText={setExperience}
                    placeholder={t.tvExperiencePh}
                    placeholderTextColor={colors.textMuted}
                    multiline
                />

                <TouchableOpacity style={[ts.primaryBtn, { marginTop: 20, opacity: saving || uploading ? 0.6 : 1 }]} onPress={submit} disabled={saving || uploading}>
                    {saving ? <ActivityIndicator color="#fff" /> : <Text style={ts.primaryBtnText}>{t.tvShare}</Text>}
                </TouchableOpacity>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const s = StyleSheet.create({
    stopRow:   { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
    stopDel:   { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
    link:      { color: '#0ea5e9', fontWeight: '800', fontSize: 14, paddingVertical: 4 },
    gpxBtn:    { borderWidth: 1, borderStyle: 'dashed', borderColor: '#0ea5e9', borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 14 },
    mediaBtn:  { borderWidth: 1, borderStyle: 'dashed', borderColor: '#0ea5e9', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
    thumbWrap: { marginRight: 8 },
    thumb:     { width: 84, height: 84, borderRadius: 10 },
    videoThumb:{ backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
    removeBtn: { position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 11, backgroundColor: '#000a', alignItems: 'center', justifyContent: 'center' },
    removeText:{ color: '#fff', fontSize: 12, fontWeight: '900' },
});
