import { useState, useEffect, useRef } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, StyleSheet, Animated, Linking, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import colors from '../theme/colors';

const CHANNELS = [
    { value: null, icon: '🚫' },
    { value: 'WHATSAPP', icon: '💬' },
    { value: 'TELEGRAM', icon: '✈️' },
    { value: 'SMS', icon: '📩' },
    { value: 'EMAIL', icon: '✉️' },
];

// Kişisel "Veri Tasarrufu" / işletme ayarındaki "ek bildirim kanalı" seçici — uygulama içi
// bildirimlere ek olarak WhatsApp/Telegram/SMS/E-posta'dan da otomatik mesaj almayı seçebilir.
// Telegram diğerlerinden farklı: bot rastgele bir numarayı mesajlayamaz, önce bağlanması gerekir.
export default function ExtraNotifyChannelModal({
    visible, onClose, t,
    channel, phone, email, accountPhone, accountEmail, telegramLinked,
    onLinkTelegram, onUnlinkTelegram, linkingTelegram,
    onSave, saving,
}) {
    const insets = useSafeAreaInsets();
    const translateY = useRef(new Animated.Value(-500)).current;
    const [localChannel, setLocalChannel] = useState(channel);
    const [localPhone, setLocalPhone] = useState(phone || '');
    const [localEmail, setLocalEmail] = useState(email || '');

    useEffect(() => {
        if (visible) {
            setLocalChannel(channel);
            setLocalPhone(phone || '');
            setLocalEmail(email || '');
            translateY.setValue(-500);
            Animated.timing(translateY, { toValue: 0, duration: 260, useNativeDriver: true }).start();
        }
    }, [visible]);

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <View style={s.overlay}>
                <Animated.View style={[s.sheet, { marginTop: insets.top, transform: [{ translateY }] }]}>
                    <View style={s.header}>
                        <Text style={s.title}>{t.extraNotifyTitle}</Text>
                        <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                            <Text style={s.closeBtn}>✕</Text>
                        </TouchableOpacity>
                    </View>
                    <Text style={s.desc}>{t.extraNotifyDesc}</Text>

                    {CHANNELS.map(c => {
                        const active = localChannel === c.value;
                        return (
                            <TouchableOpacity
                                key={c.value || 'off'}
                                style={[s.row, active && s.rowActive]}
                                onPress={() => setLocalChannel(c.value)}
                            >
                                <Text style={s.rowIcon}>{c.icon}</Text>
                                <Text style={[s.rowLabel, active && s.rowLabelActive]}>
                                    {c.value ? t[`extraNotify_${c.value}`] : t.extraNotifyOff}
                                </Text>
                                {active && <Text style={s.rowCheck}>✓</Text>}
                            </TouchableOpacity>
                        );
                    })}

                    {(localChannel === 'WHATSAPP' || localChannel === 'SMS') && (
                        <View style={s.subField}>
                            <Text style={s.subFieldLabel}>{t.extraNotifyPhoneLabel}</Text>
                            <TextInput
                                style={s.input}
                                value={localPhone}
                                onChangeText={setLocalPhone}
                                placeholder={accountPhone || t.extraNotifyPhonePh}
                                placeholderTextColor={colors.textMuted}
                                keyboardType="phone-pad"
                            />
                            <Text style={s.subFieldHint}>{t.extraNotifyPhoneHint}</Text>
                        </View>
                    )}

                    {localChannel === 'EMAIL' && (
                        <View style={s.subField}>
                            <Text style={s.subFieldLabel}>{t.extraNotifyEmailLabel}</Text>
                            <TextInput
                                style={s.input}
                                value={localEmail}
                                onChangeText={setLocalEmail}
                                placeholder={accountEmail || t.extraNotifyEmailPh}
                                placeholderTextColor={colors.textMuted}
                                keyboardType="email-address"
                                autoCapitalize="none"
                            />
                            <Text style={s.subFieldHint}>{t.extraNotifyEmailHint}</Text>
                        </View>
                    )}

                    {localChannel === 'TELEGRAM' && (
                        <View style={s.subField}>
                            {telegramLinked ? (
                                <>
                                    <Text style={s.telegramLinked}>✅ {t.extraNotifyTelegramLinked}</Text>
                                    <TouchableOpacity style={s.unlinkBtn} onPress={onUnlinkTelegram} disabled={linkingTelegram}>
                                        <Text style={s.unlinkBtnText}>{t.extraNotifyTelegramUnlink}</Text>
                                    </TouchableOpacity>
                                </>
                            ) : (
                                <>
                                    <Text style={s.subFieldHint}>{t.extraNotifyTelegramHint}</Text>
                                    <TouchableOpacity style={s.linkBtn} onPress={onLinkTelegram} disabled={linkingTelegram}>
                                        {linkingTelegram
                                            ? <ActivityIndicator color="#fff" size="small" />
                                            : <Text style={s.linkBtnText}>✈️ {t.extraNotifyTelegramLink}</Text>}
                                    </TouchableOpacity>
                                </>
                            )}
                        </View>
                    )}

                    <TouchableOpacity
                        style={[s.saveBtn, saving && { opacity: 0.6 }]}
                        onPress={() => onSave(localChannel, localPhone, localEmail)}
                        disabled={saving}
                    >
                        {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.saveBtnText}>{t.saveBtn}</Text>}
                    </TouchableOpacity>
                </Animated.View>
            </View>
        </Modal>
    );
}

const s = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
    sheet: { backgroundColor: colors.surface, borderBottomLeftRadius: 20, borderBottomRightRadius: 20, paddingBottom: 21 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 13, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: colors.border },
    title: { color: colors.text, fontSize: 16, fontWeight: '700' },
    closeBtn: { color: colors.textMuted, fontSize: 20 },
    desc: { color: colors.textMuted, fontSize: 12, lineHeight: 18, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 4 },
    row: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 12, marginTop: 8, paddingHorizontal: 13, paddingVertical: 11, borderRadius: 12, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
    rowActive: { backgroundColor: colors.purple + '20', borderColor: colors.purple },
    rowIcon: { fontSize: 20, marginRight: 12 },
    rowLabel: { color: colors.text, fontSize: 14, fontWeight: '700', flex: 1 },
    rowLabelActive: { color: colors.purple },
    rowCheck: { color: colors.purple, fontSize: 16, fontWeight: '800' },
    subField: { marginHorizontal: 12, marginTop: 10, padding: 12, borderRadius: 12, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
    subFieldLabel: { color: colors.text, fontSize: 12, fontWeight: '700', marginBottom: 6 },
    input: { backgroundColor: colors.bg, borderRadius: 10, paddingHorizontal: 11, paddingVertical: 9, color: colors.text, fontSize: 14, borderWidth: 1, borderColor: colors.border },
    subFieldHint: { color: colors.textMuted, fontSize: 11, marginTop: 6, lineHeight: 16 },
    telegramLinked: { color: '#4ade80', fontSize: 13, fontWeight: '700', marginBottom: 8 },
    linkBtn: { marginTop: 10, backgroundColor: '#229ED9', borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
    linkBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
    unlinkBtn: { borderRadius: 10, paddingVertical: 9, alignItems: 'center', borderWidth: 1, borderColor: '#f87171' },
    unlinkBtnText: { color: '#f87171', fontSize: 13, fontWeight: '700' },
    saveBtn: { marginHorizontal: 12, marginTop: 16, backgroundColor: colors.purple, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
    saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});
