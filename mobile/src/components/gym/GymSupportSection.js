import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    View, Text, TouchableOpacity, TextInput, Image, ActivityIndicator,
    Alert, StyleSheet, ScrollView,
} from 'react-native';
import { useSelector } from 'react-redux';
import * as ImagePicker from 'expo-image-picker';
import colors from '../../theme/colors';
import api from '../../services/api';
import useT from '../../hooks/useT';
import KeyboardAwareForm from '../KeyboardAwareForm';
import KeyboardSafeModal from '../KeyboardSafeModal';

const INIT_FORM = {
    name: '', description: '', address: '', city: '', district: '',
    photos: [],
    monthlyFee: '', weeklyFee: '', dailyFee: '', memberCount: '',
    openTime: '', closeTime: '', squareMeters: '',
    lockerMale: '', lockerFemale: '', showerMale: '', showerFemale: '',
    wcMale: '', wcFemale: '', dressingRoomMale: '', dressingRoomFemale: '',
    equipmentList: '', salesList: '', amenities: '',
    contactPhone: '', website: '', instagram: '',
};

function Field({ label, value, onChangeText, placeholder, multiline, keyboardType }) {
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

export default function GymSupportSection({
    category = 'SPORTS',
    sub = 'fitness_gym',
    cfg,
    cityFilter,
    feeMinFilter,
    feeMaxFilter,
    onOpenScan,
    CompactFilterSlot,
}) {
    const t = useT();
    const myId = useSelector(s => s.auth.user?.id);
    const [listings, setListings] = useState([]);
    const [loading, setLoading] = useState(false);
    const [showCreate, setShowCreate] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [form, setForm] = useState(INIT_FORM);
    const [uploading, setUploading] = useState(false);
    const [detail, setDetail] = useState(null); // API listing
    const [detailIsOwner, setDetailIsOwner] = useState(false);
    const [apps, setApps] = useState([]);
    const [myQr, setMyQr] = useState(null);

    const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const params = { category, subCategory: sub };
            if (cityFilter) params.city = cityFilter;
            if (feeMinFilter) params.minMonthlyFee = feeMinFilter;
            if (feeMaxFilter) params.maxMonthlyFee = feeMaxFilter;
            const { data } = await api.get('/gyms', { params });
            setListings(Array.isArray(data) ? data : []);
        } catch (e) {
            Alert.alert(t.error, e?.response?.data?.message || t.somethingWrong);
        } finally {
            setLoading(false);
        }
    }, [category, sub, cityFilter, feeMinFilter, feeMaxFilter, t.error, t.somethingWrong]);

    useEffect(() => { load(); }, [load]);

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

    const reset = () => setForm(INIT_FORM);

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
                const fd = new FormData();
                fd.append('file', {
                    uri: asset.uri,
                    name: 'gym.jpg',
                    type: 'image/jpeg',
                });
                const { data } = await api.post('/upload', fd, {
                    headers: { 'Content-Type': 'multipart/form-data' },
                });
                if (data?.url) urls.push(data.url);
            }
            set('photos', urls);
        } catch (e) {
            Alert.alert(t.error, e?.response?.data?.message || t.somethingWrong);
        } finally {
            setUploading(false);
        }
    };

    const submit = async () => {
        if (!form.name.trim()) return Alert.alert('', t.gymNameRequired);
        if (!form.city.trim()) return Alert.alert('', t.gymCityRequired);
        setSubmitting(true);
        try {
            const num = (v) => (v === '' || v == null ? undefined : parseInt(v, 10));
            await api.post('/gyms', {
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
                memberCount: num(form.memberCount),
                openTime: form.openTime.trim() || undefined,
                closeTime: form.closeTime.trim() || undefined,
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
                salesList: form.salesList.trim() || undefined,
                amenities: form.amenities.trim() || undefined,
                contactPhone: form.contactPhone.trim() || undefined,
                website: form.website.trim() || undefined,
                instagram: form.instagram.trim() || undefined,
            });
            setShowCreate(false);
            reset();
            Alert.alert('', t.gymSubmittedPending);
            load();
        } catch (e) {
            Alert.alert(t.error, e?.response?.data?.message || t.somethingWrong);
        } finally {
            setSubmitting(false);
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
            Alert.alert(t.error, e?.response?.data?.message || t.somethingWrong);
        }
    };

    const applyMember = async (gymId) => {
        try {
            await api.post(`/gyms/${gymId}/membership-apply`, {});
            Alert.alert('', t.gymApplySent);
            load();
            if (detail?.id === gymId) openDetailFull({ id: gymId, userId: detail.user?.id });
        } catch (e) {
            Alert.alert(t.error, e?.response?.data?.message || t.somethingWrong);
        }
    };

    const respondApp = async (reqId, action) => {
        try {
            await api.patch(`/gyms/membership-applications/${reqId}`, { action });
            if (detail) {
                const { data: mem } = await api.get(`/gyms/${detail.id}/membership-applications`);
                setApps(Array.isArray(mem) ? mem : []);
            }
        } catch (e) {
            Alert.alert(t.error, e?.response?.data?.message || t.somethingWrong);
        }
    };

    const deleteGym = (id) => {
        Alert.alert(t.gymDeleteTitle, t.gymDeleteMsg, [
            { text: t.cancel, style: 'cancel' },
            {
                text: t.delete, style: 'destructive',
                onPress: async () => {
                    try {
                        await api.delete(`/gyms/${id}`);
                        setDetail(null);
                        setDetailIsOwner(false);
                        load();
                    } catch (e) {
                        Alert.alert(t.error, e?.response?.data?.message || t.somethingWrong);
                    }
                },
            },
        ]);
    };

    return (
        <View>
            <TouchableOpacity
                style={[s.createBtn, { borderColor: (cfg?.color || '#f97316') + '60' }]}
                onPress={() => { reset(); setShowCreate(true); }}>
                <Text style={[s.createBtnText, { color: cfg?.color || '#f97316' }]}>{t.createGymBtn}</Text>
            </TouchableOpacity>

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

            <KeyboardSafeModal visible={showCreate} onClose={() => { setShowCreate(false); reset(); }}>
                <Text style={s.modalTitle}>{t.createGymTitle}</Text>
                <KeyboardAwareForm adjustWindow={false} style={{ maxHeight: 520 }}>
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
                    <PairRow
                        left={<Field label={t.gymDailyFee} value={form.dailyFee} onChangeText={v => set('dailyFee', v)} keyboardType="number-pad" placeholder="₺" />}
                        right={<Field label={t.gymMemberCount} value={form.memberCount} onChangeText={v => set('memberCount', v)} keyboardType="number-pad" />}
                    />

                    <Text style={s.section}>{t.gymHoursSection}</Text>
                    <PairRow
                        left={<Field label={t.gymOpenTime} value={form.openTime} onChangeText={v => set('openTime', v)} placeholder="06:00" />}
                        right={<Field label={t.gymCloseTime} value={form.closeTime} onChangeText={v => set('closeTime', v)} placeholder="23:00" />}
                    />
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
                    <Field label={t.gymSalesList} value={form.salesList} onChangeText={v => set('salesList', v)} placeholder={t.gymSalesPh} multiline />
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
                        <Text style={s.submitText}>{submitting ? t.submittingBtn : t.createGymBtn}</Text>
                    </TouchableOpacity>
                </KeyboardAwareForm>
            </KeyboardSafeModal>

            <KeyboardSafeModal visible={!!detail} onClose={() => { setDetail(null); setDetailIsOwner(false); setMyQr(null); setApps([]); }}>
                {detail && (
                    <ScrollView style={{ maxHeight: 560 }}>
                        <Text style={s.modalTitle}>{detail.name}</Text>
                        {(detail.address || detail.city) && (
                            <Text style={s.cardMeta}>📍 {[detail.address, detail.district, detail.city].filter(Boolean).join(' · ')}</Text>
                        )}
                        {detail.monthlyFee != null && <Text style={s.cardFee}>{t.gymMonthlyFee}: {detail.monthlyFee}₺</Text>}
                        {detail.weeklyFee != null && <Text style={s.cardMeta}>{t.gymWeeklyFee}: {detail.weeklyFee}₺</Text>}
                        {detail.dailyFee != null && <Text style={s.cardMeta}>{t.gymDailyFee}: {detail.dailyFee}₺</Text>}
                        {(detail.openTime || detail.closeTime) && (
                            <Text style={s.cardMeta}>🕒 {detail.openTime || '?'} – {detail.closeTime || '?'}</Text>
                        )}
                        {detail.squareMeters != null && <Text style={s.cardMeta}>📐 {detail.squareMeters} m²</Text>}
                        {detail.memberCount != null && <Text style={s.cardMeta}>👥 {t.gymMemberCount}: {detail.memberCount}</Text>}
                        {detail.description ? <Text style={[s.cardMeta, { marginTop: 8 }]}>{detail.description}</Text> : null}
                        {detail.equipmentList ? <Text style={s.cardMeta}>{t.gymEquipmentList}: {detail.equipmentList}</Text> : null}
                        {detail.salesList ? <Text style={s.cardMeta}>{t.gymSalesList}: {detail.salesList}</Text> : null}
                        {detail.amenities ? <Text style={s.cardMeta}>{t.gymAmenities}: {detail.amenities}</Text> : null}

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

                        {!detailIsOwner && detail.status === 'ACTIVE' && !detail.myMembershipStatus && (
                            <TouchableOpacity style={[s.submit, { backgroundColor: cfg?.color || '#f97316' }]} onPress={() => applyMember(detail.id)}>
                                <Text style={s.submitText}>{t.gymApplyBtn}</Text>
                            </TouchableOpacity>
                        )}

                        {detailIsOwner && (
                            <View style={{ marginTop: 10 }}>
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
                                                        <Text style={{ color: '#fff', fontWeight: '800', fontSize: 11 }}>{t.accept}</Text>
                                                    </TouchableOpacity>
                                                    <TouchableOpacity onPress={() => respondApp(a.id, 'reject')} style={s.miniNo}>
                                                        <Text style={{ color: '#fff', fontWeight: '800', fontSize: 11 }}>{t.reject}</Text>
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
