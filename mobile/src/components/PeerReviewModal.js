import { useEffect, useState } from 'react';
import {
    Modal, View, Text, TouchableOpacity, StyleSheet,
    ScrollView, ActivityIndicator, Image,
} from 'react-native';
import api from '../services/api';
import colors from '../theme/colors';
import useT from '../hooks/useT';

function StarRow({ value, onChange, size = 22 }) {
    return (
        <View style={{ flexDirection: 'row', gap: 4 }}>
            {[1, 2, 3, 4, 5].map(n => (
                <TouchableOpacity key={n} onPress={() => onChange(n)} activeOpacity={0.7}>
                    <Text style={{ fontSize: size, color: n <= value ? '#fbbf24' : colors.border }}>★</Text>
                </TouchableOpacity>
            ))}
        </View>
    );
}

export default function PeerReviewModal({ visible, rivalId, onClose }) {
    const t = useT();
    const [loading, setLoading] = useState(false);
    const [targets, setTargets] = useState([]);
    const [ratings, setRatings] = useState({}); // { [userId]: { technical, mental } }
    const [submittedIds, setSubmittedIds] = useState(new Set());
    const [submittingId, setSubmittingId] = useState(null);

    const loadTargets = () => {
        if (!rivalId) return;
        setLoading(true);
        api.get(`/rivals/${rivalId}/peer-review-targets`)
            .then(({ data }) => setTargets(data.targets || []))
            .catch(console.error)
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        if (!visible) return;
        setTargets([]);
        setRatings({});
        setSubmittedIds(new Set());
        loadTargets();
    }, [visible, rivalId]);

    const setRating = (userId, field, value) => {
        setRatings(p => ({ ...p, [userId]: { ...p[userId], [field]: value } }));
    };

    const submitFor = async (userId) => {
        const r = ratings[userId];
        if (!r?.technical || !r?.mental) return;
        setSubmittingId(userId);
        try {
            await api.post(`/rivals/${rivalId}/peer-review`, {
                revieweeId: userId,
                technicalStars: r.technical,
                mentalStars: r.mental,
            });
            setSubmittedIds(prev => new Set([...prev, userId]));
        } catch (e) { console.error(e); }
        finally { setSubmittingId(null); }
    };

    const allDone = !loading && targets.length > 0 && targets.every(u => submittedIds.has(u.id));

    return (
        <Modal visible={!!visible} animationType="slide" transparent onRequestClose={onClose}>
            <View style={s.overlay}>
                <View style={s.box}>
                    <View style={s.header}>
                        <View style={{ flex: 1 }}>
                            <Text style={s.title}>{t.peerReviewTitle}</Text>
                            <Text style={s.subtitle}>{t.peerReviewSubtitle}</Text>
                        </View>
                        <TouchableOpacity onPress={onClose}><Text style={s.close}>✕</Text></TouchableOpacity>
                    </View>

                    <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
                        {loading && <ActivityIndicator color={colors.purple} style={{ marginTop: 40 }} />}

                        {!loading && targets.length === 0 && (
                            <Text style={s.emptyText}>{t.peerReviewNoTargets}</Text>
                        )}

                        {!loading && targets.map(u => {
                            const done = submittedIds.has(u.id);
                            const r = ratings[u.id] || {};
                            return (
                                <View key={u.id} style={[s.card, done && s.cardDone]}>
                                    <View style={s.cardHeader}>
                                        {u.avatar
                                            ? <Image source={{ uri: u.avatar }} style={s.avatar} />
                                            : <View style={s.avatarPlaceholder}><Text style={s.avatarInitial}>{(u.fullName || u.username || '?')[0]?.toUpperCase()}</Text></View>
                                        }
                                        <Text style={s.name}>{u.fullName || u.username}</Text>
                                        {done && <Text style={s.doneBadge}>{t.peerReviewSubmittedMsg}</Text>}
                                    </View>

                                    {!done && (
                                        <>
                                            <View style={s.ratingRow}>
                                                <Text style={s.ratingLabel}>{t.peerReviewTechnicalLabel}</Text>
                                                <StarRow value={r.technical || 0} onChange={v => setRating(u.id, 'technical', v)} />
                                            </View>
                                            <View style={s.ratingRow}>
                                                <Text style={s.ratingLabel}>{t.peerReviewMentalLabel}</Text>
                                                <StarRow value={r.mental || 0} onChange={v => setRating(u.id, 'mental', v)} />
                                            </View>
                                            <TouchableOpacity
                                                style={[s.submitBtn, (!r.technical || !r.mental || submittingId === u.id) && s.submitBtnDisabled]}
                                                onPress={() => submitFor(u.id)}
                                                disabled={!r.technical || !r.mental || submittingId === u.id}
                                            >
                                                {submittingId === u.id
                                                    ? <ActivityIndicator color="#fff" size="small" />
                                                    : <Text style={s.submitBtnText}>{t.peerReviewSubmitBtn}</Text>
                                                }
                                            </TouchableOpacity>
                                        </>
                                    )}
                                </View>
                            );
                        })}

                        {allDone && (
                            <View style={s.allDoneBox}>
                                <Text style={s.allDoneText}>{t.peerReviewAllDoneMsg}</Text>
                                <TouchableOpacity style={s.doneBtn} onPress={onClose}>
                                    <Text style={s.doneBtnText}>✓ {t.doneBtn}</Text>
                                </TouchableOpacity>
                            </View>
                        )}
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
}

const s = StyleSheet.create({
    overlay:            { flex: 1, backgroundColor: '#000000bb', justifyContent: 'flex-end', paddingTop: '15%' },
    box:                 { flex: 1, backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
    header:              { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 17, paddingTop: 17, paddingBottom: 11, borderBottomWidth: 1, borderBottomColor: colors.border },
    title:               { color: '#fff', fontSize: 17, fontWeight: '900' },
    subtitle:            { color: colors.textMuted, fontSize: 12, marginTop: 4, lineHeight: 17 },
    close:               { color: colors.textMuted, fontSize: 22, paddingLeft: 3 },
    body:                { padding: 17, paddingBottom: 37, gap: 11 },
    emptyText:           { color: colors.textMuted, fontSize: 13, textAlign: 'center', marginTop: 40 },

    card:                { backgroundColor: colors.surface2, borderRadius: 14, padding: 13, borderWidth: 1, borderColor: colors.border, gap: 9 },
    cardDone:            { opacity: 0.6 },
    cardHeader:          { flexDirection: 'row', alignItems: 'center', gap: 9 },
    avatar:              { width: 34, height: 34, borderRadius: 17 },
    avatarPlaceholder:   { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.purple + '30', alignItems: 'center', justifyContent: 'center' },
    avatarInitial:       { color: colors.purple, fontWeight: '900', fontSize: 15 },
    name:                { color: '#fff', fontSize: 14, fontWeight: '700', flex: 1 },
    doneBadge:           { color: '#4ade80', fontSize: 12, fontWeight: '700' },

    ratingRow:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    ratingLabel:         { color: colors.textSecondary, fontSize: 12, fontWeight: '600', flex: 1 },

    submitBtn:           { backgroundColor: colors.purple, borderRadius: 12, paddingVertical: 9, alignItems: 'center', marginTop: 2 },
    submitBtnDisabled:   { opacity: 0.4 },
    submitBtnText:       { color: '#fff', fontWeight: '800', fontSize: 13 },

    allDoneBox:          { alignItems: 'center', gap: 11, paddingTop: 15 },
    allDoneText:         { color: colors.textSecondary, fontSize: 13, textAlign: 'center' },
    doneBtn:             { backgroundColor: colors.purple, borderRadius: 14, paddingVertical: 11, paddingHorizontal: 37, alignItems: 'center' },
    doneBtnText:         { color: '#fff', fontWeight: '800', fontSize: 15 },
});
