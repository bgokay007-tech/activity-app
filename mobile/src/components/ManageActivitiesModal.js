import { useEffect, useState } from 'react';
import {
    Modal, View, Text, TouchableOpacity, StyleSheet,
    ScrollView, ActivityIndicator,
} from 'react-native';
import { useSelector } from 'react-redux';
import api from '../services/api';
import colors from '../theme/colors';
import AssessmentModal from './AssessmentModal';
import useT from '../hooks/useT';

const ENABLED_SUBS = new Set(['tennis', 'padel', 'volleyball']);

export default function ManageActivitiesModal({ visible, interests, onClose, onInterestsChange, privacyEmojiIcon, onPrivacyPress }) {
    const t = useT();
    const lang = useSelector(s => s.lang?.lang || 'en');
    const CATEGORY_TABS = [
        { id: 'SPORTS', label: t.sportsTab, color: '#16a34a' },
        { id: 'ARTS',   label: t.artsTab,   color: '#db2777' },
        { id: 'GAMES',  label: t.gamesTab,  color: '#2563eb' },
    ];
    const [categories, setCategories]       = useState([]);
    const [activeTab, setActiveTab]         = useState('SPORTS');
    const [loadingId, setLoadingId]         = useState(null);
    const [localInterests, setLocalInterests] = useState(interests || []);

    // Assessment state
    const [assessTarget, setAssessTarget]   = useState(null); // { interestId, subCategory }

    useEffect(() => {
        if (!visible) return;
        setLocalInterests(interests || []);
        api.get('/interests/categories')
            .then(({ data }) => setCategories(data.categories || []))
            .catch(console.error);
    }, [visible, interests]);

    const addedMap = {};
    localInterests.forEach(i => { addedMap[`${i.category}__${i.subCategory}`] = i; });

    const handleAdd = async (category, subCategory) => {
        const key = `${category}__${subCategory}`;
        setLoadingId(key);
        try {
            const { data } = await api.post('/interests/add', { category, subCategory });
            const updated = [...localInterests, data];
            setLocalInterests(updated);
            onInterestsChange?.(updated);
            // trigger assessment immediately
            setAssessTarget({ interestId: data.id, subCategory });
        } catch (e) { console.error(e); }
        finally { setLoadingId(null); }
    };

    const handleRemove = async (interestId, category, subCategory) => {
        const key = `${category}__${subCategory}`;
        setLoadingId(key);
        try {
            await api.delete(`/interests/${interestId}`);
            const updated = localInterests.filter(i => i.id !== interestId);
            setLocalInterests(updated);
            onInterestsChange?.(updated);
        } catch (e) { console.error(e); }
        finally { setLoadingId(null); }
    };

    const handleAssessComplete = (result) => {
        if (!result || !assessTarget) return;
        const updated = localInterests.map(i =>
            i.id === assessTarget.interestId
                ? { ...i, skillRating: result.skillRating, level: result.level }
                : i
        );
        setLocalInterests(updated);
        onInterestsChange?.(updated);
        setAssessTarget(null);
    };

    const activeCat = categories.find(c => c.id === activeTab);
    const activeColor = CATEGORY_TABS.find(tab => tab.id === activeTab)?.color || colors.purple;

    return (
        <>
            <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
                <View style={s.overlay}>
                    <View style={s.box}>
                        {/* Header */}
                        <View style={s.header}>
                            <Text style={[s.title, { flex: 1 }]}>{t.manageTitle}</Text>
                            {onPrivacyPress && (
                                <TouchableOpacity onPress={onPrivacyPress} style={{ marginRight: 14 }}>
                                    <Text style={{ fontSize: 18 }}>{privacyEmojiIcon || '🔒'}</Text>
                                </TouchableOpacity>
                            )}
                            <TouchableOpacity onPress={onClose}><Text style={s.close}>✕</Text></TouchableOpacity>
                        </View>

                        {/* Category tabs */}
                        <View style={s.tabRow}>
                            {CATEGORY_TABS.map(tab => (
                                <TouchableOpacity
                                    key={tab.id}
                                    style={[s.tab, activeTab === tab.id && { backgroundColor: tab.color }]}
                                    onPress={() => setActiveTab(tab.id)}
                                >
                                    <Text style={[s.tabText, activeTab === tab.id && { color: '#fff' }]}>{tab.label}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        {/* Sub-category list */}
                        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.list}>
                            {!activeCat ? (
                                <ActivityIndicator color={colors.purple} style={{ marginTop: 40 }} />
                            ) : (activeCat.subCategories || []).length === 0 ? (
                                <Text style={s.emptyText}>{t.noBranches}</Text>
                            ) : (
                                (activeCat.subCategories || []).map(sub => {
                                    const key = `${activeTab}__${sub.id}`;
                                    const existing = addedMap[key];
                                    const isLoading = loadingId === key;
                                    const enabled = ENABLED_SUBS.has(sub.id);

                                    return (
                                        <View key={sub.id} style={[s.subRow, !enabled && { opacity: 0.5 }]}>
                                            <Text style={s.subEmoji}>{sub.emoji || '🏅'}</Text>
                                            <View style={{ flex: 1 }}>
                                                <Text style={s.subName}>{sub.label || sub.id}</Text>
                                                {existing?.assessmentCompleted && (
                                                    <Text style={[s.subRating, { color: activeColor }]}>
                                                        {Number(existing.skillRating).toFixed(2)} ★
                                                    </Text>
                                                )}
                                            </View>
                                            {!enabled ? (
                                                <View style={s.maintBadge}>
                                                    <Text style={s.maintText}>{t.maintenance}</Text>
                                                </View>
                                            ) : isLoading ? (
                                                <ActivityIndicator size="small" color={activeColor} />
                                            ) : existing ? (
                                                <View style={s.addedBtns}>
                                                    {((existing.wins || 0) + (existing.losses || 0)) < 3 && (
                                                        <TouchableOpacity
                                                            style={[s.assessBtn, { borderColor: activeColor + '60' }]}
                                                            onPress={() => setAssessTarget({ interestId: existing.id, subCategory: sub.id })}
                                                        >
                                                            <Text style={[s.assessBtnText, { color: activeColor }]}>{t.assessBtn}</Text>
                                                        </TouchableOpacity>
                                                    )}
                                                    <TouchableOpacity
                                                        style={s.removeBtn}
                                                        onPress={() => handleRemove(existing.id, activeTab, sub.id)}
                                                    >
                                                        <Text style={s.removeBtnText}>−</Text>
                                                    </TouchableOpacity>
                                                </View>
                                            ) : (
                                                <TouchableOpacity
                                                    style={[s.addBtn, { backgroundColor: activeColor }]}
                                                    onPress={() => handleAdd(activeTab, sub.id)}
                                                >
                                                    <Text style={s.addBtnText}>{t.addBtn}</Text>
                                                </TouchableOpacity>
                                            )}
                                        </View>
                                    );
                                })
                            )}
                        </ScrollView>

                        {/* Done button */}
                        <View style={s.footer}>
                            <TouchableOpacity style={s.doneBtn} onPress={onClose}>
                                <Text style={s.doneBtnText}>{t.doneBtn}</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Assessment modal — opens on top */}
            <AssessmentModal
                visible={!!assessTarget}
                interestId={assessTarget?.interestId}
                subCategory={assessTarget?.subCategory}
                lang={lang}
                onClose={() => setAssessTarget(null)}
                onComplete={handleAssessComplete}
            />
        </>
    );
}

const s = StyleSheet.create({
    overlay:        { flex: 1, backgroundColor: '#000000bb', justifyContent: 'flex-end', paddingTop: '15%' },
    box:            { flex: 1, backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24 },

    header:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 17, paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: colors.border },
    title:          { color: '#fff', fontSize: 17, fontWeight: '900' },
    close:          { color: colors.textMuted, fontSize: 22 },

    tabRow:         { flexDirection: 'row', gap: 3, paddingHorizontal: 13, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: colors.border },
    tab:            { flex: 1, paddingVertical: 5, borderRadius: 12, backgroundColor: colors.surface2, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
    tabText:        { color: colors.textSecondary, fontSize: 12, fontWeight: '800' },

    list:           { paddingHorizontal: 13, paddingTop: 5, paddingBottom: 17, gap: 3 },
    emptyText:      { color: colors.textMuted, textAlign: 'center', marginTop: 40 },

    subRow:         { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface2, borderRadius: 14, padding: 11, gap: 3, borderWidth: 1, borderColor: colors.border },
    subEmoji:       { fontSize: 24 },
    subName:        { color: '#fff', fontSize: 14, fontWeight: '700' },
    subRating:      { fontSize: 12, fontWeight: '700', marginTop: 2 },

    addBtn:         { borderRadius: 10, paddingHorizontal: 11, paddingVertical: 4 },
    addBtnText:     { color: '#fff', fontSize: 12, fontWeight: '800' },

    addedBtns:      { flexDirection: 'row', alignItems: 'center', gap: 3 },
    assessBtn:      { borderRadius: 10, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1 },
    assessBtnText:  { fontSize: 11, fontWeight: '700' },
    removeBtn:      { width: 30, height: 30, borderRadius: 8, backgroundColor: '#dc262625', borderWidth: 1, borderColor: '#dc262650', justifyContent: 'center', alignItems: 'center' },
    removeBtnText:  { color: '#f87171', fontSize: 18, fontWeight: '700', lineHeight: 22 },
    maintBadge:     { backgroundColor: '#37415150', borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1, borderWidth: 1, borderColor: '#4b556350' },
    maintText:      { color: '#9ca3af', fontSize: 10, fontWeight: '700' },

    footer:         { paddingHorizontal: 13, paddingVertical: 11, borderTopWidth: 1, borderTopColor: colors.border },
    doneBtn:        { backgroundColor: colors.surface2, borderRadius: 14, paddingVertical: 11, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
    doneBtnText:    { color: '#fff', fontWeight: '800', fontSize: 15 },
});
