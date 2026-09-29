import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import api from '../services/api';

const pad2 = (n) => String(n).padStart(2, '0');

export function formatTripDate(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

const mimeFor = (uri, kind) => {
    const ext = (uri.split('?')[0].split('.').pop() || '').toLowerCase();
    if (kind === 'video') return ext === 'mov' ? 'video/quicktime' : `video/${ext || 'mp4'}`;
    if (kind === 'pdf') return 'application/pdf';
    return `image/${ext === 'jpg' ? 'jpeg' : (ext || 'jpeg')}`;
};

export async function uploadFile(uri, kind, name) {
    const form = new FormData();
    form.append('file', { uri, type: mimeFor(uri, kind), name: name || uri.split('/').pop() });
    const { data } = await api.post('/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } });
    return { url: data.url, type: data.type === 'video' ? 'video' : data.type === 'pdf' ? 'pdf' : 'image' };
}

// Galeriden bir veya birden fazla foto/video seçip yükler; yüklenenleri [{url,type}] döner.
export async function pickAndUploadMedia(t, { allowVideo = true, multiple = true } = {}) {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('', t.tvPermissionGallery); return []; }
    const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: allowVideo ? ['images', 'videos'] : ['images'],
        allowsMultipleSelection: multiple,
        selectionLimit: multiple ? 10 : 1,
        quality: 0.8,
        videoMaxDuration: 120,
    });
    if (result.canceled) return [];
    const out = [];
    for (const a of result.assets || []) {
        out.push(await uploadFile(a.uri, a.type === 'video' ? 'video' : 'image', a.fileName));
    }
    return out;
}

// Adli sicil belgesi e-Devlet'ten PDF olarak da inebildiği için foto + PDF kabul edilir.
export async function pickAndUploadDocument() {
    const result = await DocumentPicker.getDocumentAsync({ type: ['image/*', 'application/pdf'], copyToCacheDirectory: true });
    if (result.canceled || !result.assets?.[0]) return null;
    const a = result.assets[0];
    const isPdf = (a.mimeType || '').includes('pdf') || /\.pdf$/i.test(a.name || '');
    return uploadFile(a.uri, isPdf ? 'pdf' : 'image', a.name);
}
