import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    View, Text, TouchableOpacity, TextInput, Image, ActivityIndicator,
    Alert, StyleSheet, ScrollView, Dimensions,
} from 'react-native';
import { useSelector } from 'react-redux';
import * as ImagePicker from 'expo-image-picker';
import colors from '../../theme/colors';
import api from '../../services/api';
import useT from '../../hooks/useT';
import KeyboardAwareForm from '../KeyboardAwareForm';
import KeyboardSafeModal from '../KeyboardSafeModal';

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const WIN_H = Dimensions.get('window').height;

function emptyWeeklyHours() {
    return Object.fromEntries(
        DAY_KEYS.map(d => [d, { open: '06:00', close: '23:00', closed: false }]),
    );
}

function emptyProduct() {
    return { name: '', weight: '', price: '', photoUrl: '' };
}

const INIT_FORM = {
    name: '', description: '', address: '', city: '', district: '',
    photos: [],
    monthlyFee: '', weeklyFee: '', dailyFee: '', memberCount: '',
    weeklyHours: emptyWeeklyHours(),
    squareMeters: '',
    lockerMale: '', lockerFemale: '', showerMale: '', showerFemale: '',
    wcMale: '', wcFemale: '', dressingRoomMale: '', dressingRoomFemale: '',
    equipmentList: '', salesProducts: [], amenities: '',
    contactPhone: '', website: '', instagram: '',
};

function Field({ label, value, onChangeText, placeholder, multiline, keyboardType, autoCapitalize }) {
    return (
        <View style={{ marginBottom: 8 }}>
            <Text style={s.label}>{label}</Text>
            <TextInput
                style={[s.input, multiline && { height: 72, textAlignVertical: 'top' }]}
                value={value}
                onChangeText={onChangeText}
                placeholder={placeholder}
                placeholderTextColor={colors.textMuted}
                multiline={!!multiline}
                keyboardType={keyboardType || 'default'}
                autoCapitalize={autoCapitalize}
            />
        </View>
    );
}

function PairRow({ left, right }) {
    return (
        <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}>{left}</View>
            <View style={{ flex: 1 }}>{right}</View>
        </View>
    );
}

function formatHoursLine(g, t) {
    const wh = g?.weeklyHours;
    if (wh && typeof wh === 'object') {
        const parts = DAY_KEYS.map(d => {
            const row = wh[d];
            if (!row) return null;
            const label = t[`gymDay_${d}`] || d;
            if (row.closed) return `${label}: ${t.gymDayClosed}`;
            return `${label} ${row.open || '?'}–${row.close || '?'}`;
        }).filter(Boolean);
        if (parts.length) return parts.join(' · ');
    }
    if (g?.openTime || g?.closeTime) return `${g.openTime || '?'} – ${g.closeTime || '?'}`;
    return null;
}

export default function GymSupportSection({
    category = 'SPORTS',
    sub = 'fitness_gym',
    cfg,
    cityFilter,
    feeMinFilter,
    feeMaxFilter,
    onOpenScan,
    CompactFilterSlot,
    hideCreateButton = false,
    createOpenTick = 0,
    onCountChange,
}) {
    const t = useT();
    const myId = useSelector(st => st.auth.user?.id);
    const [listings, setListings] = useState([]);
    const [loading, setLoading] = useState(false);
    const [showCreate, setShowCreate] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [editAppMemberCount, setEditAppMemberCount] = useState(0);
    const [submitting, setSubmitting] = useState(false);
    const [form, setForm] = useState(INIT_FORM);
    const [uploading, setUploading] = useState(false);
    const [detail, setDetail] = useState(null);
    const [detailIsOwner, setDetailIsOwner] = useState(false);
    const [apps, setApps] = useState([]);
    const [myQr, setMyQr] = useState(null);
    const [reviews, setReviews] = useState([]);
    const [avgRating, setAvgRating] = useState(null);
    const [canReview, setCanReview] = useState(false);
    const [myReview, setMyReview] = useState(null);
    const [reviewStars, setReviewStars] = useState(5);
    const [reviewComment, setReviewComment] = useState('');
    const [submittingReview, setSubmittingReview] = useState(false);

    const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

    const setDay = (day, patch) => {
        setForm(p => ({
            ...p,
            weeklyHours: {
                ...p.weeklyHours,
                [day]: { ...p.weeklyHours[day], ...patch },
            },
        }));
    };

    const setProduct = (idx, patch) => {
        setForm(p => {
            const next = [...(p.salesProducts || [])];
            next[idx] = { ...next[idx], ...patch };
            return { ...p, salesProducts: next };
        });
    };

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const params = { category, subCategory: sub };
            if (cityFilter) params.city = cityFilter;
            if (feeMinFilter) params.minMonthlyFee = feeMinFilter;
            if (feeMaxFilter) params.maxMonthlyFee = feeMaxFilter;
            const { data } = await api.get('/gyms', { params });
            const list = Array.isArray(data) ? data : [];
            setListings(list);
            onCountChange?.(list.filter(g => g.status === 'ACTIVE' || g.userId === myId).length);
        } catch (e) {
            Alert.alert(t.error, e?.response?.data?.message || t.actionFailed);
        } finally {
            setLoading(false);
        }
    }, [category, sub, cityFilter, feeMinFilter, feeMaxFilter, t.error, t.actionFailed, onCountChange, myId]);

    useEffect(() => { load(); }, [load]);

    useEffect(() => {
        if (createOpenTick > 0) {
            setEditingId(null);
            setEditAppMemberCount(0);
            setForm({ ...INIT_FORM, weeklyHours: emptyWeeklyHours(), salesProducts: [] });
            setShowCreate(true);
        }
    }, [createOpenTick]);

    const filtered = useMemo(() => {
        let list = listings;
        if (cityFilter) {
            const q = String(cityFilter).toLowerCase();
            list = list.filter(g =>
                (g.city || '').toLowerCase().includes(q)
                || (g.address || '').toLowerCase().includes(q)
                || (Array.isArray(g.cities) && g.cities.some(c => (c || '').toLowerCase().includes(q)))
            );
        }
        return list;
    }, [listings, cityFilter]);

    const reset = () => {
        setForm({ ...INIT_FORM, weeklyHours: emptyWeeklyHours(), salesProducts: [] });
        setEditingId(null);
        setEditAppMemberCount(0);
    };

    const closeForm = () => {
        setShowCreate(false);
        reset();
    };

    const uploadOne = async (asset, filename = 'gym.jpg') => {
        const fd = new FormData();
        fd.append('file', {
            uri: asset.uri,
            name: filename,
            type: 'image/jpeg',
        });
        const { data } = await api.post('/upload', fd, {
            headers: { 'Content-Type': 'multipart/form-data' },
        });
        return data?.url || null;
    };

    const pickPhotos = async () => {
        try {
            const res = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsMultipleSelection: true,
                quality: 0.7,
                selectionLimit: 6,
            });
            if (res.canceled) return;
            setUploading(true);
            const urls = [...form.photos];
            for (const asset of (res.assets || []).slice(0, 6 - urls.length)) {
                const url = await uploadOne(asset);
                if (url) urls.push(url);
            }
            set('photos', urls);
        } catch (e) {
            Alert.alert(t.error, e?.response?.data?.message || t.actionFailed);
        } finally {
            setUploading(false);
        }
    };

    const pickProductPhoto = async (idx) => {
        try {
            const res = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsMultipleSelection: false,
                quality: 0.7,
            });
            if (res.canceled || !res.assets?.[0]) return;
            setUploading(true);
            const url = await uploadOne(res.assets[0], 'product.jpg');
            if (url) setProduct(idx, { photoUrl: url });
        } catch (e) {
            Alert.alert(t.error, e?.response?.data?.message || t.actionFailed);
        } finally {
            setUploading(false);
        }
    };

    const listingToForm = (data) => {
        const wh = data.weeklyHours && typeof data.weeklyHours === 'object'
            ? { ...emptyWeeklyHours(), ...Object.fromEntries(
                DAY_KEYS.map(d => [d, {
                    open: data.weeklyHours[d]?.open || data.openTime || '06:00',
                    close: data.weeklyHours[d]?.close || data.closeTime || '23:00',
                    closed: !!data.weeklyHours[d]?.closed,
                }]),
            ) }
            : {
                ...emptyWeeklyHours(),
                ...Object.fromEntries(DAY_KEYS.map(d => [d, {
                    open: data.openTime || '06:00',
                    close: data.closeTime || '23:00',
                    closed: false,
                }])),
            };
        const products = Array.isArray(data.salesProducts)
            ? data.salesProducts.map(p => ({
                name: p.name || '',
                weight: p.weight || '',
                price: p.price != null ? String(p.price) : '',
                photoUrl: p.photoUrl || '',
            }))
            : [];
        return {
            name: data.name || '',
            description: data.description || '',
            address: data.address || '',
            city: data.city || '',
            district: data.district || '',
            photos: Array.isArray(data.photos) ? data.photos : [],
            monthlyFee: data.monthlyFee != null ? String(data.monthlyFee) : '',
            weeklyFee: data.weeklyFee != null ? String(data.weeklyFee) : '',
            dailyFee: data.dailyFee != null ? String(data.dailyFee) : '',
            memberCount: data.memberCount != null ? String(data.memberCount) : '',
            weeklyHours: wh,
            squareMeters: data.squareMeters != null ? String(data.squareMeters) : '',
            lockerMale: data.lockerMale != null ? String(data.lockerMale) : '',
            lockerFemale: data.lockerFemale != null ? String(data.lockerFemale) : '',
            showerMale: data.showerMale != null ? String(data.showerMale) : '',
            showerFemale: data.showerFemale != null ? String(data.showerFemale) : '',
            wcMale: data.wcMale != null ? String(data.wcMale) : '',
            wcFemale: data.wcFemale != null ? String(data.wcFemale) : '',
            dressingRoomMale: data.dressingRoomMale != null ? String(data.dressingRoomMale) : '',
            dressingRoomFemale: data.dressingRoomFemale != null ? String(data.dressingRoomFemale) : '',
            equipmentList: data.equipmentList || '',
            salesProducts: products,
            amenities: data.amenities || '',
            contactPhone: data.contactPhone || '',
            website: data.website || '',
            instagram: data.instagram || '',
        };
    };

    const openEdit = (data) => {
        setDetail(null);
        setDetailIsOwner(false);
        setEditingId(data.id);
        setEditAppMemberCount(data.appMemberCount || data.activeMemberCount || 0);
        setForm(listingToForm(data));
        setShowCreate(true);
    };

    const buildPayload = () => {
        const num = (v) => (v === '' || v == null ? undefined : parseInt(v, 10));
        const firstOpen = DAY_KEYS.map(d => form.weeklyHours[d]).find(h => h && !h.closed);
        return {
            category,
            subCategory: sub,
            name: form.name.trim(),
            description: form.description.trim() || undefined,
            address: form.address.trim() || undefined,
            city: form.city.trim(),
            cities: [form.city.trim()],
            district: form.district.trim() || undefined,
            photos: form.photos,
            monthlyFee: num(form.monthlyFee),
            weeklyFee: num(form.weeklyFee),
            dailyFee: num(form.dailyFee),
            // Manuel üye — uygulama ACTIVE sayacı sunucuda toplanır
            memberCount: num(form.memberCount) ?? 0,
            weeklyHours: form.weeklyHours,
            openTime: firstOpen?.open || undefined,
            closeTime: firstOpen?.close || undefined,
            squareMeters: num(form.squareMeters),
            lockerMale: num(form.lockerMale),
            lockerFemale: num(form.lockerFemale),
            showerMale: num(form.showerMale),
            showerFemale: num(form.showerFemale),
            wcMale: num(form.wcMale),
            wcFemale: num(form.wcFemale),
            dressingRoomMale: num(form.dressingRoomMale),
            dressingRoomFemale: num(form.dressingRoomFemale),
            equipmentList: form.equipmentList.trim() || undefined,
            salesProducts: (form.salesProducts || [])
                .filter(p => (p.name || '').trim())
                .map(p => ({
                    name: p.name.trim(),
                    weight: (p.weight || '').trim() || undefined,
                    price: p.price === '' || p.price == null ? undefined : Number(p.price),
                    photoUrl: p.photoUrl || undefined,
                })),
            amenities: form.amenities.trim() || undefined,
            contactPhone: form.contactPhone.trim() || undefined,
            website: form.website.trim() || undefined,
            instagram: form.instagram.trim() || undefined,
        };
    };

    const submit = async () => {
        if (!form.name.trim()) return Alert.alert('', t.gymNameRequired);
        if (!form.city.trim()) return Alert.alert('', t.gymCityRequired);
        setSubmitting(true);
        try {
            const payload = buildPayload();
            if (editingId) {
                await api.patch(`/gyms/${editingId}`, payload);
                Alert.alert('', t.gymUpdated);
            } else {
                await api.post('/gyms', payload);
                Alert.alert('', t.gymSubmittedPending);
            }
            closeForm();
            load();
        } catch (e) {
            Alert.alert(t.error, e?.response?.data?.message || t.actionFailed);
        } finally {
            setSubmitting(false);
        }
    };

    const loadReviews = async (gymId) => {
        try {
            const { data } = await api.get(`/gyms/${gymId}/reviews`);
            setReviews(Array.isArray(data?.reviews) ? data.reviews : []);
            setAvgRating(data?.avgRating ?? null);
            setCanReview(!!data?.canReview);
            setMyReview(data?.myReview || null);
            if (data?.myReview) {
                setReviewStars(data.myReview.rating || 5);
                setReviewComment(data.myReview.comment || '');
            } else {
                setReviewStars(5);
                setReviewComment('');
            }
        } catch {
            setReviews([]);
            setAvgRating(null);
            setCanReview(false);
            setMyReview(null);
        }
    };

    const submitGymReview = async () => {
        if (!detail?.id) return;
        setSubmittingReview(true);
        try {
            await api.post(`/gyms/${detail.id}/reviews`, {
                rating: reviewStars,
                comment: reviewComment.trim() || undefined,
            });
            await loadReviews(detail.id);
            load();
            Alert.alert('', t.gymReviewSaved);
        } catch (e) {
            Alert.alert(t.error, e?.response?.data?.message || t.actionFailed);
        } finally {
            setSubmittingReview(false);
        }
    };

    const openDetailFull = async (g) => {
        try {
            const { data } = await api.get(`/gyms/${g.id}`);
            setDetail(data);
            setMyQr(null);
            setApps([]);
            const amOwner = !!(myId && (g.userId === myId || data.user?.id === myId));
            setDetailIsOwner(amOwner);
            await loadReviews(g.id);
            if (amOwner) {
                const { data: mem } = await api.get(`/gyms/${g.id}/membership-applications`);
                setApps(Array.isArray(mem) ? mem : []);
            } else if (data.myMembershipStatus === 'ACTIVE') {
                try {
                    const qr = await api.get(`/gyms/${g.id}/my-qr`);
                    setMyQr(qr.data);
                } catch { /* ignore */ }
            }
        } catch (e) {
            Alert.alert(t.error, e?.response?.data?.message || t.actionFailed);
        }
    };

    const applyMember = async (gymId) => {
        try {
            await api.post(`/gyms/${gymId}/membership-apply`, {});
            Alert.alert('', t.gymApplySent);
            load();
            if (detail?.id === gymId) openDetailFull({ id: gymId, userId: detail.user?.id });
        } catch (e) {
            Alert.alert(t.error, e?.response?.data?.message || t.actionFailed);
        }
    };

    const respondApp = async (reqId, action) => {
        try {
            await api.patch(`/gyms/membership-applications/${reqId}`, { action });
            if (detail) {
                const { data: mem } = await api.get(`/gyms/${detail.id}/membership-applications`);
                setApps(Array.isArray(mem) ? mem : []);
                openDetailFull(detail);
            }
        } catch (e) {
            Alert.alert(t.error, e?.response?.data?.message || t.actionFailed);
        }
    };

    const deleteGym = (id) => {
        Alert.alert(t.gymDeleteTitle, t.gymDeleteMsg, [
            { text: t.cancelBtn, style: 'cancel' },
            {
                text: t.deleteBtn, style: 'destructive',
                onPress: async () => {
                    try {
                        await api.delete(`/gyms/${id}`);
                        setDetail(null);
                        setDetailIsOwner(false);
                        load();
                    } catch (e) {
                        Alert.alert(t.error, e?.response?.data?.message || t.actionFailed);
                    }
                },
            },
        ]);
    };

    const manualN = parseInt(form.memberCount, 10);
    const manualSafe = Number.isFinite(manualN) && manualN >= 0 ? manualN : 0;
    const totalPreview = manualSafe + (editingId ? editAppMemberCount : 0);

    const formModal = (
        <KeyboardSafeModal visible={showCreate} onClose={closeForm}>
            {/* Kulüp formu ile aynı kalıp: başlık form içinde; maxHeight %82; bottomOffset 48 */}
            <KeyboardAwareForm
                adjustWindow={false}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator
                bottomOffset={48}
                style={{ maxHeight: Math.round(WIN_H * 0.82) }}
                contentContainerStyle={{ paddingBottom: 28 }}
            >
                <Text style={s.modalTitle}>{editingId ? t.editGymTitle : t.createGymTitle}</Text>

                <Field label={`${t.gymNameLabel} *`} value={form.name} onChangeText={v => set('name', v)} placeholder={t.gymNamePh} />
                <Field label={`${t.gymCityLabel} *`} value={form.city} onChangeText={v => set('city', v)} placeholder={t.gymCityPh} />
                <Field label={t.gymDistrictLabel} value={form.district} onChangeText={v => set('district', v)} placeholder={t.gymDistrictPh} />
                <Field label={t.gymAddressLabel} value={form.address} onChangeText={v => set('address', v)} placeholder={t.gymAddressPh} multiline />
                <Field label={t.gymDescLabel} value={form.description} onChangeText={v => set('description', v)} placeholder={t.gymDescPh} multiline />

                <Text style={s.section}>{t.gymFeesSection}</Text>
                <PairRow
                    left={<Field label={t.gymMonthlyFee} value={form.monthlyFee} onChangeText={v => set('monthlyFee', v)} keyboardType="number-pad" placeholder="₺" />}
                    right={<Field label={t.gymWeeklyFee} value={form.weeklyFee} onChangeText={v => set('weeklyFee', v)} keyboardType="number-pad" placeholder="₺" />}
                />
                <Field label={t.gymDailyFee} value={form.dailyFee} onChangeText={v => set('dailyFee', v)} keyboardType="number-pad" placeholder="₺" />

                <Text style={s.section}>{t.gymMembersSection}</Text>
                <Text style={s.hint}>{t.gymMemberManualHint}</Text>
                <Field
                    label={t.gymMemberManual}
                    value={form.memberCount}
                    onChangeText={v => set('memberCount', v)}
                    keyboardType="number-pad"
                    placeholder="0"
                />
                {editingId ? (
                    <Text style={s.cardMeta}>
                        {t.gymMemberApp}: {editAppMemberCount} · {t.gymMemberTotal}: {totalPreview}
                    </Text>
                ) : (
                    <Text style={s.hint}>{t.gymMemberCreateHint}</Text>
                )}

                <Text style={s.section}>{t.gymHoursSection}</Text>
                <Text style={s.hint}>{t.gymHoursByDayHint}</Text>
                {DAY_KEYS.map(d => {
                    const row = form.weeklyHours[d] || { open: '06:00', close: '23:00', closed: false };
                    return (
                        <View key={d} style={s.dayRow}>
                            <TouchableOpacity
                                onPress={() => setDay(d, { closed: !row.closed })}
                                style={[s.dayChip, row.closed && s.dayChipOff]}
                            >
                                <Text style={[s.dayChipText, row.closed && { color: colors.textMuted }]}>
                                    {t[`gymDay_${d}`] || d}
                                </Text>
                            </TouchableOpacity>
                            {row.closed ? (
                                <Text style={[s.cardMeta, { flex: 1, marginTop: 0 }]}>{t.gymDayClosed}</Text>
                            ) : (
                                <View style={{ flex: 1, flexDirection: 'row', gap: 6 }}>
                                    <TextInput
                                        style={[s.input, { flex: 1, marginBottom: 0 }]}
                                        value={row.open}
                                        onChangeText={v => setDay(d, { open: v })}
                                        placeholder="06:00"
                                        placeholderTextColor={colors.textMuted}
                                    />
                                    <TextInput
                                        style={[s.input, { flex: 1, marginBottom: 0 }]}
                                        value={row.close}
                                        onChangeText={v => setDay(d, { close: v })}
                                        placeholder="23:00"
                                        placeholderTextColor={colors.textMuted}
                                    />
                                </View>
                            )}
                        </View>
                    );
                })}
                <TouchableOpacity
                    onPress={() => {
                        const src = form.weeklyHours.mon;
                        setForm(p => ({
                            ...p,
                            weeklyHours: Object.fromEntries(DAY_KEYS.map(d => [d, { ...src }])),
                        }));
                    }}
                    style={{ marginBottom: 8 }}
                >
                    <Text style={{ color: cfg?.color || '#f97316', fontSize: 12, fontWeight: '700' }}>
                        {t.gymHoursCopyMon}
                    </Text>
                </TouchableOpacity>

                <Field label={t.gymSquareMeters} value={form.squareMeters} onChangeText={v => set('squareMeters', v)} keyboardType="number-pad" placeholder="m²" />

                <Text style={s.section}>{t.gymFacilitiesSection}</Text>
                <PairRow
                    left={<Field label={t.gymLockerMale} value={form.lockerMale} onChangeText={v => set('lockerMale', v)} keyboardType="number-pad" />}
                    right={<Field label={t.gymLockerFemale} value={form.lockerFemale} onChangeText={v => set('lockerFemale', v)} keyboardType="number-pad" />}
                />
                <PairRow
                    left={<Field label={t.gymShowerMale} value={form.showerMale} onChangeText={v => set('showerMale', v)} keyboardType="number-pad" />}
                    right={<Field label={t.gymShowerFemale} value={form.showerFemale} onChangeText={v => set('showerFemale', v)} keyboardType="number-pad" />}
                />
                <PairRow
                    left={<Field label={t.gymWcMale} value={form.wcMale} onChangeText={v => set('wcMale', v)} keyboardType="number-pad" />}
                    right={<Field label={t.gymWcFemale} value={form.wcFemale} onChangeText={v => set('wcFemale', v)} keyboardType="number-pad" />}
                />
                <PairRow
                    left={<Field label={t.gymDressingMale} value={form.dressingRoomMale} onChangeText={v => set('dressingRoomMale', v)} keyboardType="number-pad" />}
                    right={<Field label={t.gymDressingFemale} value={form.dressingRoomFemale} onChangeText={v => set('dressingRoomFemale', v)} keyboardType="number-pad" />}
                />

                <Field label={t.gymEquipmentList} value={form.equipmentList} onChangeText={v => set('equipmentList', v)} placeholder={t.gymEquipmentPh} multiline />

                <Text style={s.section}>{t.gymSalesList}</Text>
                <Text style={s.hint}>{t.gymSalesProductsHint}</Text>
                {(form.salesProducts || []).map((p, idx) => (
                    <View key={`prod-${idx}`} style={s.productCard}>
                        <Field label={t.gymProductName} value={p.name} onChangeText={v => setProduct(idx, { name: v })} placeholder={t.gymProductNamePh} />
                        <PairRow
                            left={<Field label={t.gymProductWeight} value={p.weight} onChangeText={v => setProduct(idx, { weight: v })} placeholder={t.gymProductWeightPh} />}
                            right={<Field label={t.gymProductPrice} value={p.price} onChangeText={v => setProduct(idx, { price: v })} keyboardType="number-pad" placeholder="₺" />}
                        />
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                            <TouchableOpacity style={[s.photoBtn, { flex: 1, marginBottom: 0 }]} onPress={() => pickProductPhoto(idx)} disabled={uploading}>
                                <Text style={s.photoBtnText}>
                                    {uploading ? '...' : (p.photoUrl ? t.gymProductPhotoChange : t.gymProductPhotoAdd)}
                                </Text>
                            </TouchableOpacity>
                            {p.photoUrl ? (
                                <Image source={{ uri: p.photoUrl }} style={{ width: 48, height: 48, borderRadius: 8 }} />
                            ) : null}
                            <TouchableOpacity
                                onPress={() => setForm(f => ({
                                    ...f,
                                    salesProducts: f.salesProducts.filter((_, i) => i !== idx),
                                }))}
                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            >
                                <Text style={{ color: '#f87171', fontWeight: '800' }}>✕</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                ))}
                <TouchableOpacity
                    style={[s.photoBtn, { borderColor: (cfg?.color || '#f97316') + '80' }]}
                    onPress={() => setForm(f => ({
                        ...f,
                        salesProducts: [...(f.salesProducts || []), emptyProduct()],
                    }))}
                >
                    <Text style={[s.photoBtnText, { color: cfg?.color || '#f97316' }]}>{t.gymProductAdd}</Text>
                </TouchableOpacity>

                <Field label={t.gymAmenities} value={form.amenities} onChangeText={v => set('amenities', v)} placeholder={t.gymAmenitiesPh} multiline />
                <Field label={t.gymPhone} value={form.contactPhone} onChangeText={v => set('contactPhone', v)} keyboardType="phone-pad" />
                <Field label={t.gymWebsite} value={form.website} onChangeText={v => set('website', v)} autoCapitalize="none" />
                <Field label={t.gymInstagram} value={form.instagram} onChangeText={v => set('instagram', v)} autoCapitalize="none" />

                <TouchableOpacity style={s.photoBtn} onPress={pickPhotos} disabled={uploading}>
                    <Text style={s.photoBtnText}>
                        {uploading ? '...' : (form.photos.length ? t.gymPhotosChange(form.photos.length) : t.gymPhotosAdd)}
                    </Text>
                </TouchableOpacity>
                {form.photos.length > 0 && (
                    <ScrollView horizontal style={{ marginBottom: 10 }}>
                        {form.photos.map((u, i) => (
                            <Image key={u + i} source={{ uri: u }} style={{ width: 64, height: 64, borderRadius: 8, marginRight: 6 }} />
                        ))}
                    </ScrollView>
                )}

                <TouchableOpacity
                    style={[s.submit, { backgroundColor: cfg?.color || '#f97316' }, submitting && { opacity: 0.6 }]}
                    onPress={submit}
                    disabled={submitting}>
                    <Text style={s.submitText}>
                        {submitting ? t.submittingBtn : (editingId ? t.saveGymBtn : t.createGymBtn)}
                    </Text>
                </TouchableOpacity>
            </KeyboardAwareForm>
        </KeyboardSafeModal>
    );

    return (
        <View>
            {!hideCreateButton && (
                <TouchableOpacity
                    style={[s.createBtn, { borderColor: (cfg?.color || '#f97316') + '60' }]}
                    onPress={() => { reset(); setShowCreate(true); }}>
                    <Text style={[s.createBtnText, { color: cfg?.color || '#f97316' }]}>{t.createGymBtn}</Text>
                </TouchableOpacity>
            )}

            {CompactFilterSlot}

            {loading
                ? <ActivityIndicator color={cfg?.color || '#f97316'} style={{ marginTop: 20 }} />
                : filtered.length === 0
                    ? (
                        <View style={{ paddingVertical: 28, alignItems: 'center' }}>
                            <Text style={{ fontSize: 28, marginBottom: 6 }}>🏋️</Text>
                            <Text style={{ color: colors.textMuted, fontSize: 13 }}>{t.emptyGyms}</Text>
                        </View>
                    )
                    : filtered.map(g => (
                        <TouchableOpacity
                            key={g.id}
                            onPress={() => openDetailFull(g)}
                            style={s.card}>
                            <View style={{ flexDirection: 'row', gap: 10 }}>
                                {Array.isArray(g.photos) && g.photos[0] && g.status === 'ACTIVE' ? (
                                    <Image source={{ uri: g.photos[0] }} style={s.thumb} />
                                ) : (
                                    <View style={[s.thumb, { alignItems: 'center', justifyContent: 'center' }]}>
                                        <Text style={{ fontSize: 22 }}>🏋️</Text>
                                    </View>
                                )}
                                <View style={{ flex: 1 }}>
                                    <Text style={s.cardTitle} numberOfLines={1}>{g.name}</Text>
                                    {g.status === 'PENDING' && (
                                        <Text style={{ color: '#fbbf24', fontSize: 11, fontWeight: '700' }}>{t.pendingApproval}</Text>
                                    )}
                                    {g.status === 'REJECTED' && (
                                        <Text style={{ color: '#f87171', fontSize: 11, fontWeight: '700' }}>{t.rejectedStatus}</Text>
                                    )}
                                    {(g.address || g.city) ? (
                                        <Text style={s.cardMeta} numberOfLines={2}>
                                            📍 {[g.address, g.district, g.city].filter(Boolean).join(' · ')}
                                        </Text>
                                    ) : null}
                                    {g.monthlyFee != null && (
                                        <Text style={s.cardFee}>{t.gymMonthlyFee}: {g.monthlyFee}₺</Text>
                                    )}
                                    {g.totalMemberCount != null && (
                                        <Text style={s.cardMeta}>👥 {t.gymMemberTotal}: {g.totalMemberCount}</Text>
                                    )}
                                    {(g.avgRating != null || g.reviewCount > 0) && (
                                        <Text style={{ color: '#fbbf24', fontSize: 11, fontWeight: '700', marginTop: 2 }}>
                                            ★ {g.avgRating != null ? g.avgRating : '—'}{g.reviewCount ? ` (${g.reviewCount})` : ''}
                                        </Text>
                                    )}
                                    {g.myMembershipStatus === 'ACTIVE' && (
                                        <Text style={{ color: '#4ade80', fontSize: 11, fontWeight: '700', marginTop: 2 }}>{t.gymMemberActive}</Text>
                                    )}
                                    {g.myMembershipStatus === 'PENDING' && (
                                        <Text style={{ color: '#fbbf24', fontSize: 11, fontWeight: '700', marginTop: 2 }}>{t.gymMemberPending}</Text>
                                    )}
                                </View>
                            </View>
                        </TouchableOpacity>
                    ))}

            {formModal}

            <KeyboardSafeModal visible={!!detail} onClose={() => { setDetail(null); setDetailIsOwner(false); setMyQr(null); setApps([]); }}>
                {detail && (
                    <ScrollView style={{ maxHeight: Math.round(WIN_H * 0.82) }} keyboardShouldPersistTaps="handled">
                        <Text style={s.modalTitle}>{detail.name}</Text>
                        {(detail.address || detail.city) && (
                            <Text style={s.cardMeta}>📍 {[detail.address, detail.district, detail.city].filter(Boolean).join(' · ')}</Text>
                        )}
                        {detail.monthlyFee != null && <Text style={s.cardFee}>{t.gymMonthlyFee}: {detail.monthlyFee}₺</Text>}
                        {detail.weeklyFee != null && <Text style={s.cardMeta}>{t.gymWeeklyFee}: {detail.weeklyFee}₺</Text>}
                        {detail.dailyFee != null && <Text style={s.cardMeta}>{t.gymDailyFee}: {detail.dailyFee}₺</Text>}
                        {formatHoursLine(detail, t) && (
                            <Text style={s.cardMeta}>🕒 {formatHoursLine(detail, t)}</Text>
                        )}
                        {detail.squareMeters != null && <Text style={s.cardMeta}>📐 {detail.squareMeters} m²</Text>}
                        <Text style={s.cardMeta}>
                            👥 {t.gymMemberTotal}: {detail.totalMemberCount != null
                                ? detail.totalMemberCount
                                : ((detail.memberCount || 0) + (detail.appMemberCount || 0))}
                            {detailIsOwner ? (
                                `  (${t.gymMemberManual}: ${detail.memberCount || 0} + ${t.gymMemberApp}: ${detail.appMemberCount || 0})`
                            ) : null}
                        </Text>
                        {detail.description ? <Text style={[s.cardMeta, { marginTop: 8 }]}>{detail.description}</Text> : null}
                        {detail.equipmentList ? <Text style={s.cardMeta}>{t.gymEquipmentList}: {detail.equipmentList}</Text> : null}
                        {detail.amenities ? <Text style={s.cardMeta}>{t.gymAmenities}: {detail.amenities}</Text> : null}

                        {Array.isArray(detail.salesProducts) && detail.salesProducts.length > 0 && (
                            <>
                                <Text style={s.section}>{t.gymSalesList}</Text>
                                {detail.salesProducts.map((p, i) => (
                                    <View key={`sp-${i}`} style={{ flexDirection: 'row', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                                        {p.photoUrl ? (
                                            <Image source={{ uri: p.photoUrl }} style={{ width: 48, height: 48, borderRadius: 8 }} />
                                        ) : (
                                            <View style={[s.thumb, { width: 48, height: 48 }]} />
                                        )}
                                        <View style={{ flex: 1 }}>
                                            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>{p.name}</Text>
                                            <Text style={s.cardMeta}>
                                                {[p.weight, p.price != null ? `${p.price}₺` : null].filter(Boolean).join(' · ')}
                                            </Text>
                                        </View>
                                    </View>
                                ))}
                            </>
                        )}
                        {(!detail.salesProducts || !detail.salesProducts.length) && detail.salesList ? (
                            <Text style={s.cardMeta}>{t.gymSalesList}: {detail.salesList}</Text>
                        ) : null}

                        {Array.isArray(detail.photos) && detail.photos.length > 0 && (
                            <ScrollView horizontal style={{ marginVertical: 10 }}>
                                {detail.photos.map((u, i) => (
                                    <Image key={u + i} source={{ uri: u }} style={{ width: 120, height: 90, borderRadius: 8, marginRight: 6 }} />
                                ))}
                            </ScrollView>
                        )}

                        {myQr?.qrPayload && (
                            <View style={{ alignItems: 'center', marginVertical: 12 }}>
                                <Text style={s.section}>{t.gymMyQrTitle}</Text>
                                <Image
                                    source={{ uri: `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(myQr.qrPayload)}` }}
                                    style={{ width: 180, height: 180, backgroundColor: '#fff', borderRadius: 8 }}
                                />
                                <Text style={[s.cardMeta, { textAlign: 'center', marginTop: 6 }]}>{t.gymMyQrHint}</Text>
                            </View>
                        )}

                        {!detailIsOwner && detail.myMembershipStatus === 'ACTIVE' && (
                            <TouchableOpacity
                                style={[s.submit, { backgroundColor: '#7f1d1d', marginTop: 8 }]}
                                onPress={() => {
                                    Alert.alert(t.gymLeaveTitle || '', t.gymLeaveMsg || '', [
                                        { text: t.cancel, style: 'cancel' },
                                        {
                                            text: t.gymLeaveBtn || t.delete,
                                            style: 'destructive',
                                            onPress: async () => {
                                                try {
                                                    await api.post(`/gyms/${detail.id}/membership-leave`);
                                                    setMyQr(null);
                                                    setDetail(null);
                                                    load();
                                                } catch (e) {
                                                    Alert.alert(t.error, e?.response?.data?.message || t.actionFailed);
                                                }
                                            },
                                        },
                                    ]);
                                }}
                            >
                                <Text style={s.submitText}>{t.gymLeaveBtn}</Text>
                            </TouchableOpacity>
                        )}

                        {!detailIsOwner && detail.status === 'ACTIVE' && !detail.myMembershipStatus && (
                            <TouchableOpacity style={[s.submit, { backgroundColor: cfg?.color || '#f97316' }]} onPress={() => applyMember(detail.id)}>
                                <Text style={s.submitText}>{t.gymApplyBtn}</Text>
                            </TouchableOpacity>
                        )}

                        <Text style={s.section}>
                            {t.gymReviewsTitle}
                            {avgRating != null ? ` · ★ ${avgRating}` : ''}
                            {reviews.length ? ` (${reviews.length})` : ''}
                        </Text>
                        {canReview && (
                            <View style={{ marginBottom: 10 }}>
                                <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }}>
                                    {[1, 2, 3, 4, 5].map(n => (
                                        <TouchableOpacity key={n} onPress={() => setReviewStars(n)}>
                                            <Text style={{ fontSize: 26, color: n <= reviewStars ? '#fbbf24' : '#4b5563' }}>★</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                                <TextInput
                                    style={[s.input, { height: 64, textAlignVertical: 'top', marginBottom: 8 }]}
                                    value={reviewComment}
                                    onChangeText={setReviewComment}
                                    placeholder={t.gymReviewCommentPh}
                                    placeholderTextColor={colors.textMuted}
                                    multiline
                                />
                                <TouchableOpacity
                                    style={[s.submit, { backgroundColor: '#f59e0b', marginBottom: 8 }]}
                                    onPress={submitGymReview}
                                    disabled={submittingReview}>
                                    <Text style={s.submitText}>
                                        {submittingReview ? '...' : (myReview ? t.gymReviewUpdate : t.gymReviewSubmit)}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        )}
                        {reviews.length === 0
                            ? <Text style={s.cardMeta}>{t.gymNoReviews}</Text>
                            : reviews.slice(0, 20).map(rv => (
                                <View key={rv.id} style={s.appRow}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>
                                            {'★'.repeat(rv.rating)}{'☆'.repeat(Math.max(0, 5 - rv.rating))}{' '}
                                            {rv.reviewer?.fullName || rv.reviewer?.username}
                                        </Text>
                                        {rv.comment ? <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>{rv.comment}</Text> : null}
                                    </View>
                                </View>
                            ))}

                        {detailIsOwner && (
                            <View style={{ marginTop: 10 }}>
                                <TouchableOpacity
                                    style={[s.submit, { backgroundColor: '#a855f7', marginBottom: 8 }]}
                                    onPress={() => openEdit(detail)}>
                                    <Text style={s.submitText}>{t.editGymBtn}</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[s.submit, { backgroundColor: '#0ea5e9', marginBottom: 8 }]}
                                    onPress={() => onOpenScan?.(detail.id, detail.name)}>
                                    <Text style={s.submitText}>{t.gymScanQrBtn}</Text>
                                </TouchableOpacity>
                                <Text style={s.section}>{t.gymApplicationsTitle}</Text>
                                {apps.length === 0
                                    ? <Text style={s.cardMeta}>{t.gymNoApplications}</Text>
                                    : apps.map(a => (
                                        <View key={a.id} style={s.appRow}>
                                            <View style={{ flex: 1 }}>
                                                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>
                                                    {a.user?.fullName || a.user?.username}
                                                </Text>
                                                <Text style={{ color: colors.textMuted, fontSize: 11 }}>{a.status}</Text>
                                            </View>
                                            {a.status === 'PENDING' && (
                                                <>
                                                    <TouchableOpacity onPress={() => respondApp(a.id, 'accept')} style={s.miniOk}>
                                                        <Text style={{ color: '#fff', fontWeight: '800', fontSize: 11 }}>{t.acceptBtn}</Text>
                                                    </TouchableOpacity>
                                                    <TouchableOpacity onPress={() => respondApp(a.id, 'reject')} style={s.miniNo}>
                                                        <Text style={{ color: '#fff', fontWeight: '800', fontSize: 11 }}>{t.rejectBtn}</Text>
                                                    </TouchableOpacity>
                                                </>
                                            )}
                                            {a.status === 'ACTIVE' && (
                                                <TouchableOpacity onPress={() => respondApp(a.id, 'revoke')} style={s.miniNo}>
                                                    <Text style={{ color: '#fff', fontWeight: '800', fontSize: 11 }}>{t.gymRevokeMember}</Text>
                                                </TouchableOpacity>
                                            )}
                                        </View>
                                    ))}
                                <TouchableOpacity onPress={() => deleteGym(detail.id)} style={{ marginTop: 12 }}>
                                    <Text style={{ color: '#f87171', textAlign: 'center', fontWeight: '700' }}>{t.gymDeleteBtn}</Text>
                                </TouchableOpacity>
                            </View>
                        )}
                    </ScrollView>
                )}
            </KeyboardSafeModal>
        </View>
    );
}

const s = StyleSheet.create({
    createBtn: {
        borderWidth: 1, borderRadius: 10, paddingVertical: 10, alignItems: 'center', marginBottom: 8,
        backgroundColor: colors.surface2,
    },
    createBtnText: { fontSize: 13, fontWeight: '800' },
    card: {
        backgroundColor: colors.surface2, borderRadius: 12, padding: 10, marginBottom: 8,
        borderWidth: 1, borderColor: colors.border,
    },
    thumb: { width: 56, height: 56, borderRadius: 10, backgroundColor: colors.bg },
    cardTitle: { color: '#fff', fontSize: 14, fontWeight: '800' },
    cardMeta: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
    cardFee: { color: '#4ade80', fontSize: 12, fontWeight: '800', marginTop: 3 },
    modalTitle: { color: '#fff', fontSize: 16, fontWeight: '900', marginBottom: 12 },
    label: { color: colors.textMuted, fontSize: 11, fontWeight: '700', marginBottom: 3 },
    input: {
        backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border, borderRadius: 8,
        color: '#fff', paddingHorizontal: 10, paddingVertical: 8, fontSize: 13,
    },
    section: { color: '#fff', fontSize: 13, fontWeight: '800', marginTop: 8, marginBottom: 6 },
    hint: { color: colors.textMuted, fontSize: 11, marginBottom: 6, lineHeight: 15 },
    dayRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
    dayChip: {
        minWidth: 52, paddingHorizontal: 8, paddingVertical: 8, borderRadius: 8,
        backgroundColor: '#f9731630', borderWidth: 1, borderColor: '#f9731660', alignItems: 'center',
    },
    dayChipOff: { backgroundColor: colors.surface2, borderColor: colors.border },
    dayChipText: { color: '#fb923c', fontSize: 11, fontWeight: '800' },
    productCard: {
        borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 8, marginBottom: 8,
        backgroundColor: colors.surface2,
    },
    photoBtn: {
        borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 10,
        alignItems: 'center', marginBottom: 8,
    },
    photoBtnText: { color: colors.textSecondary, fontWeight: '700', fontSize: 12 },
    submit: { borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 6, marginBottom: 16 },
    submitText: { color: '#fff', fontWeight: '900', fontSize: 14 },
    appRow: {
        flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8,
        borderBottomWidth: 1, borderBottomColor: colors.border,
    },
    miniOk: { backgroundColor: '#16a34a', paddingHorizontal: 8, paddingVertical: 5, borderRadius: 6 },
    miniNo: { backgroundColor: '#dc2626', paddingHorizontal: 8, paddingVertical: 5, borderRadius: 6 },
});
