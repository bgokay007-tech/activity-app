import { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, TextInput } from 'react-native';
import TrailCard from '../../components/TrailCard';
import TrailDetailModal from './TrailDetailModal';
import colors from '../../theme/colors';
import { moderateScale } from '../../theme/scale';

const DIFFICULTIES = [
    { id: null, label: 'Hepsi' },
    { id: 'EASY', label: 'Kolay' },
    { id: 'MEDIUM', label: 'Orta' },
    { id: 'HARD', label: 'Zor' },
];

export default function TrailsTab({ trails, loading, onRefresh, myId, myIsAdmin, navigation, sub }) {
    const [difficulty, setDifficulty] = useState(null);
    const [cityQuery, setCityQuery] = useState('');
    const [openTrailId, setOpenTrailId] = useState(null);

    const filtered = trails.filter(t => {
        if (difficulty && t.difficulty !== difficulty) return false;
        if (cityQuery.trim() && !(t.city || '').toLowerCase().includes(cityQuery.trim().toLowerCase())) return false;
        return true;
    });

    return (
        <View>
            <View style={{ flexDirection: 'row', gap: 6, marginBottom: 10 }}>
                <TouchableOpacity
                    onPress={() => navigation.navigate('RecordTrail', { sub, onDone: onRefresh })}
                    style={{ flex: 1, backgroundColor: '#65a30d20', borderRadius: moderateScale(8), paddingVertical: moderateScale(7), alignItems: 'center', borderWidth: 1, borderColor: '#65a30d60' }}
                >
                    <Text style={{ color: '#84cc16', fontWeight: '800', fontSize: moderateScale(12) }}>🥾 Rota Kaydet</Text>
                </TouchableOpacity>
                {myIsAdmin && (
                    <TouchableOpacity
                        onPress={() => navigation.navigate('AddTrailAdmin', { sub, onDone: onRefresh })}
                        style={{ flex: 1, backgroundColor: colors.purple + '20', borderRadius: moderateScale(8), paddingVertical: moderateScale(7), alignItems: 'center', borderWidth: 1, borderColor: colors.purple + '60' }}
                    >
                        <Text style={{ color: colors.purple, fontWeight: '800', fontSize: moderateScale(12) }}>📥 GPX ile Rota Ekle</Text>
                    </TouchableOpacity>
                )}
            </View>

            <TextInput
                style={{ backgroundColor: colors.surface2, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 6, color: '#fff', fontSize: 12, borderWidth: 1, borderColor: colors.border, marginBottom: 8 }}
                placeholder="📍 İl ile filtrele"
                placeholderTextColor={colors.textMuted}
                value={cityQuery}
                onChangeText={setCityQuery}
            />
            <View style={{ flexDirection: 'row', gap: 4, marginBottom: 12 }}>
                {DIFFICULTIES.map(d => (
                    <TouchableOpacity
                        key={d.id || 'all'}
                        onPress={() => setDifficulty(d.id)}
                        style={{ flex: 1, paddingVertical: 5, borderRadius: 8, alignItems: 'center', backgroundColor: difficulty === d.id ? '#65a30d' : colors.surface2, borderWidth: 1, borderColor: difficulty === d.id ? '#65a30d' : colors.border }}
                    >
                        <Text style={{ color: difficulty === d.id ? '#fff' : colors.textSecondary, fontSize: 11, fontWeight: '700' }}>{d.label}</Text>
                    </TouchableOpacity>
                ))}
            </View>

            {loading ? (
                <ActivityIndicator color="#65a30d" style={{ marginTop: 30 }} />
            ) : filtered.length === 0 ? (
                <Text style={{ color: colors.textMuted, fontSize: 13, textAlign: 'center', marginTop: 30 }}>Henüz rota yok — ilk rotayı sen ekle!</Text>
            ) : (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
                    {filtered.map(trail => (
                        <TrailCard key={trail.id} trail={trail} onPress={() => setOpenTrailId(trail.id)} />
                    ))}
                </View>
            )}

            <TrailDetailModal
                visible={!!openTrailId}
                trailId={openTrailId}
                myId={myId}
                navigation={navigation}
                onClose={() => { setOpenTrailId(null); onRefresh(); }}
            />
        </View>
    );
}
