import { useEffect, useState } from 'react';
import {
    Modal, View, Text, TouchableOpacity, StyleSheet,
    ScrollView, ActivityIndicator, Alert, Image,
} from 'react-native';
import { useSelector } from 'react-redux';
import api from '../services/api';
import colors from '../theme/colors';
import AssessmentModal from './AssessmentModal';
import FriendFindingSurveyModal from './FriendFindingSurveyModal';
import { getSubCategoryLabel } from '../utils/subCategoryLabels';
import useT from '../hooks/useT';

// Padel, table tennis ile aynı 🏓 emojisini paylaşıyor — Sports ekranındaki (CategoryScreen)
// ayrım için kullanılan özel logo burada da aynı görünsün diye reuse ediliyor.
const SUB_IMAGES = {
    padel: require('../../assets/padel.png'),
};

// Puanlı (bahisli) oyunlar — geçmiş maç sayısına bakılmaksızın tamamen
// silinemez (puan/geçmiş sıfırlayıp yeniden anket doldurma istismarını
// engellemek için), sadece gizlenebilir.
const WAGERED_GAMES = new Set(['okey', 'batak']);

// Bu dallarda derece anketi zorunlu — eklerken açılan anket kapatılamaz/atlanamaz
// (backend'de de requireActiveInterest ile ayrıca korunuyor, bkz. rival.controller.js).
const RATING_REQUIRED_SUBS = new Set([
    'tennis', 'padel', 'volleyball', 'basketball', 'football',
    'badminton', 'golf', 'handball', 'table_tennis',
]);

export default function ManageActivitiesModal({ visible, interests, onClose, onInterestsChange, privacyEmojiIcon, onPrivacyPress }) {
    const t = useT();
    const lang = useSelector(s => s.lang?.lang || 'en');
    const CATEGORY_TABS = [
        { id: 'SPORTS', label: t.sportsTab, color: '#16a34a' },
        { id: 'SOCIAL', label: t.socialTab, color: '#d97706' },
        { id: 'ARTS',   label: t.artsTab,   color: '#db2777' },
        { id: 'GAMES',  label: t.gamesTab,  color: '#2563eb' },
    ];
    const [categories, setCategories]       = useState([]);
    const [activeTab, setActiveTab]         = useState('SPORTS');
    const [loadingId, setLoadingId]         = useState(null);
    const [localInterests, setLocalInterests] = useState(interests || []);

    // Assessment state
    const [assessTarget, setAssessTarget]   = useState(null); // { interestId, subCategory }
    const [ffSurveyOpen, setFfSurveyOpen]   = useState(false);

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
            if (subCategory === 'friend_finding') {
                setFfSurveyOpen(true);
            } else if (!data.assessmentCompleted) {
                // Daha once gizlenmis (ama 3+ mac gecmisi oldugu icin silinmemis) bir brans
                // tekrar eklendiyse anketi tekrar acmiyoruz - puan/gecmis zaten korunuyor.
                setAssessTarget({ interestId: data.id, subCategory, category, mandatory: RATING_REQUIRED_SUBS.has(subCategory) });
            }
        } catch (e) { console.error(e); }
        finally { setLoadingId(null); }
    };

    const doRemove = async (interestId, category, subCategory) => {
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

    const doHide = async (interestId, category, subCategory) => {
        const key = `${category}__${subCategory}`;
        setLoadingId(key);
        try {
            await api.patch(`/interests/${interestId}/hide`);
            // ÖNEMLİ: gizlenen branş listeden TAMAMEN kaldırılmıyor artık, sadece hidden:true
            // işaretleniyor — önceden burada .filter() ile diziden komple siliniyordu, bu
            // yüzden gizlenen bir branş (ör. puanlı oyunlar okey/batak, gerçekten silinemediği
            // için buraya düşüyor) "hiç eklenmemiş" ile birebir aynı görünüyordu, kullanıcı
            // "nereye gitti" diye şaşırıyordu ve geri getirmenin tek yolu (tekrar "Ekle") hiç
            // belli değildi (kullanıcı raporu).
            const updated = localInterests.map(i => i.id === interestId ? { ...i, hidden: true } : i);
            setLocalInterests(updated);
            onInterestsChange?.(updated);
        } catch (e) { console.error(e); }
        finally { setLoadingId(null); }
    };

    // 3+ mac oynanmis branslar tamamen silinemez (puan/gecmis sifirlayip yeniden anket
    // doldurma istismarini engellemek icin) - onun yerine gizlenir, tekrar eklenince
    // puan/gecmis aynen geri gelir. Puanli oyunlar (okey/batak) icin bu kural mac
    // sayisina bakilmaksizin gecerlidir (hic oynanmamis olsa bile).
    const handleRemove = (interest, category, subCategory) => {
        const matchCount = (interest.wins || 0) + (interest.losses || 0);
        const isWagered = category === 'GAMES' && WAGERED_GAMES.has(subCategory);
        if (isWagered || matchCount >= 3) {
            Alert.alert(
                t.hideInsteadTitle || 'Branş Silinemez',
                isWagered
                    ? (t.hideInsteadWageredMsg || 'Puanlı oyun aktiviteleri tamamen silinemez, sadece gizlenebilir. Tekrar eklediğinizde puanınız aynen geri gelir.')
                    : (t.hideInsteadMsg || `Bu branşta ${matchCount} maç oynadınız, puan/geçmişiniz kaybolmasın diye tamamen silinemez. Bunun yerine gizleyebilirsiniz — tekrar eklediğinizde puanınız aynen geri gelir.`),
                [
                    { text: t.cancelBtn || 'Vazgeç', style: 'cancel' },
                    { text: t.hideBtn || 'Gizle', style: 'destructive', onPress: () => doHide(interest.id, category, subCategory) },
                ]
            );
            return;
        }
        doRemove(interest.id, category, subCategory);
    };

    const handleAssessComplete = (result) => {
        if (!result || !assessTarget) return;
        const updated = localInterests.map(i =>
            i.id === assessTarget.interestId
                ? { ...i, skillRating: result.skillRating, level: result.level, assessmentCompleted: true }
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
                                [...(activeCat.subCategories || [])]
                                .sort((a, b) => {
                                    // Sıra: aktif eklenmiş > gizli > hiç eklenmemiş — gizliler artık
                                    // listede kalıyor (bkz. doHide), en üstte aktiflerle karışmasın diye
                                    // ayrı bir katman.
                                    const rank = (id) => {
                                        const e = addedMap[`${activeTab}__${id}`];
                                        if (!e) return 2;
                                        return e.hidden ? 1 : 0;
                                    };
                                    const rA = rank(a.id), rB = rank(b.id);
                                    if (rA !== rB) return rA - rB;
                                    return getSubCategoryLabel(a.id, lang).localeCompare(getSubCategoryLabel(b.id, lang));
                                })
                                .map(sub => {
                                    const key = `${activeTab}__${sub.id}`;
                                    const existing = addedMap[key];
                                    const isLoading = loadingId === key;

                                    return (
                                        <View key={sub.id} style={[s.subRow, existing?.hidden && { opacity: 0.55 }]}>
                                            {SUB_IMAGES[sub.id] ? (
                                                <Image source={SUB_IMAGES[sub.id]} style={s.subEmojiImage} resizeMode="contain" />
                                            ) : (
                                                <Text style={s.subEmoji}>{sub.emoji || '🏅'}</Text>
                                            )}
                                            <View style={{ flex: 1 }}>
                                                <Text style={s.subName}>{getSubCategoryLabel(sub.id, lang)}</Text>
                                                {/* Gizli branşlar burada artık listeden KAYBOLMUYOR — dokunarak geri
                                                    getirilebilsin diye "Gizli" etiketiyle görünür kalıyor (kullanıcı
                                                    raporu: "nereye gittiler", eskiden hiç eklenmemiş gibi görünüyordu). */}
                                                {existing?.hidden ? (
                                                    <Text style={[s.subRating, { color: colors.textMuted }]}>{t.hiddenLabel || 'Gizli'}</Text>
                                                ) : existing?.assessmentCompleted && (
                                                    <Text style={[s.subRating, { color: activeColor }]}>
                                                        {Number(existing.skillRating).toFixed(2)} ★
                                                    </Text>
                                                )}
                                            </View>
                                            {isLoading ? (
                                                <ActivityIndicator size="small" color={activeColor} />
                                            ) : existing?.hidden ? (
                                                <TouchableOpacity
                                                    style={[s.addBtn, { backgroundColor: activeColor }]}
                                                    onPress={() => handleAdd(activeTab, sub.id)}
                                                >
                                                    <Text style={s.addBtnText}>{t.showBtn || 'Göster'}</Text>
                                                </TouchableOpacity>
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
                                                        onPress={() => handleRemove(existing, activeTab, sub.id)}
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
                mandatory={!!assessTarget?.mandatory}
                onClose={(hasProgress) => {
                    // En az bir soru cevaplanmadıysa kaybedilecek bir şey yok, direkt kapat.
                    if (!hasProgress) { setAssessTarget(null); return; }
                    // Soru cevaplanmışken çıkılırsa uyar — zorunlu dallarda (RATING_REQUIRED_SUBS)
                    // yarım kalan (puansız) aktivite geri alınır, isteğe bağlı dallarda (ör. airsoft,
                    // ayak tenisi) aktivite kalır ama puansız kalır — daha önce burada uyarı hiç
                    // çıkmıyordu, kullanıcı anketi bitirdiğini sanıp çıkıyor, puan hiç kaydedilmiyordu.
                    const target = assessTarget;
                    const mandatory = !!target?.mandatory;
                    Alert.alert(
                        t.assessCancelTitle || 'Anketten Vazgeç',
                        mandatory
                            ? (t.assessCancelMsg || 'Anketi tamamlamazsan bu dal aktivitelerinden kaldırılacak. Vazgeçmek istediğine emin misin?')
                            : (t.assessCancelMsgOptional || 'Anketi tamamlamazsan puan kaydedilmeyecek — istediğin zaman "Değerlendir" ile tekrar deneyebilirsin. Vazgeçmek istediğine emin misin?'),
                        [
                            { text: t.assessKeepGoingBtn || 'Devam Et', style: 'cancel' },
                            { text: t.assessGiveUpBtn || 'Vazgeç', style: 'destructive', onPress: () => {
                                setAssessTarget(null);
                                if (mandatory) doRemove(target.interestId, target.category, target.subCategory);
                            }},
                        ]
                    );
                }}
                onComplete={handleAssessComplete}
            />

            {/* Arkadaş Bulma anketi — opens on top */}
            <FriendFindingSurveyModal
                visible={ffSurveyOpen}
                onClose={() => setFfSurveyOpen(false)}
                onComplete={() => setFfSurveyOpen(false)}
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
    subEmojiImage:  { width: 26, height: 26 },
    subName:        { color: '#fff', fontSize: 14, fontWeight: '700' },
    subRating:      { fontSize: 12, fontWeight: '700', marginTop: 2 },

    addBtn:         { borderRadius: 10, paddingHorizontal: 11, paddingVertical: 4 },
    addBtnText:     { color: '#fff', fontSize: 12, fontWeight: '800' },

    addedBtns:      { flexDirection: 'row', alignItems: 'center', gap: 3 },
    assessBtn:      { borderRadius: 10, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1 },
    assessBtnText:  { fontSize: 11, fontWeight: '700' },
    removeBtn:      { width: 30, height: 30, borderRadius: 8, backgroundColor: '#dc262625', borderWidth: 1, borderColor: '#dc262650', justifyContent: 'center', alignItems: 'center' },
    removeBtnText:  { color: '#f87171', fontSize: 18, fontWeight: '700', lineHeight: 22 },

    footer:         { paddingHorizontal: 13, paddingVertical: 11, borderTopWidth: 1, borderTopColor: colors.border },
    doneBtn:        { backgroundColor: colors.surface2, borderRadius: 14, paddingVertical: 11, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
    doneBtnText:    { color: '#fff', fontWeight: '800', fontSize: 15 },
});
