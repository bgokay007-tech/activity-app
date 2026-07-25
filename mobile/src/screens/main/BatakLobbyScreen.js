import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet, StatusBar, Platform, Alert } from 'react-native';
import colors from '../../theme/colors';
import useT from '../../hooks/useT';
import { getSocket, onSocket } from '../../services/socket';
import Avatar from '../../components/Avatar';

const VARIANT_FALLBACK = { ihaleli: 'İhaleli Batak', esli_ihaleli: 'Eşli İhaleli Batak', herkes_kendine: 'Herkes Kendine Batak', gomme: 'Gömmeli Batak' };

// "Masa Kur" ile oluşturulan, herkese açık dolmamış masaların yaşandığı canlı
// lobi ekranı — varyant başına ayrı bir alan, zamanla masa sayısı arttıkça
// modal yerine kaydırılabilir bir liste olarak büyüyebilsin diye ayrı ekran.
export default function BatakLobbyScreen({ navigation, route }) {
    const t = useT();
    const variant = route.params?.variant;
    const [tables, setTables] = useState([]);

    useEffect(() => {
        if (!variant) return;
        const socket = getSocket();
        socket?.emit('batak:listTables', { variant });
        const offList = onSocket('batak:tableList', (data) => { if (data.variant === variant) setTables(data.tables || []); });
        const offErr = onSocket('batak:error', (data) => Alert.alert('', data?.message || 'Bir hata oluştu.'));
        return () => {
            offList(); offErr();
            getSocket()?.emit('batak:unsubscribeLobby', { variant });
        };
    }, [variant]);

    const join = (tableId) => {
        const socket = getSocket();
        if (!socket) return Alert.alert('', t.batakNoConnection || 'Bağlantı kurulamadı, tekrar deneyin.');
        socket.emit('batak:joinTable', { tableId });
    };
    const spectate = (tableId) => {
        const socket = getSocket();
        if (!socket) return Alert.alert('', t.batakNoConnection || 'Bağlantı kurulamadı, tekrar deneyin.');
        socket.emit('batak:spectateTable', { tableId });
        navigation.navigate('BatakTable', { tableId, spectating: true });
    };

    return (
        <View style={s.root}>
            <StatusBar barStyle="light-content" />
            <View style={[s.header, { paddingTop: Platform.OS === 'ios' ? 54 : 36 }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
                    <Text style={s.backBtnText}>‹</Text>
                </TouchableOpacity>
                <Text style={s.title} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                    {(t[`batakVariant_${variant}`] || VARIANT_FALLBACK[variant] || '')} — {t.batakBrowseTitle || 'Açık Masalar'}
                </Text>
            </View>

            <FlatList
                data={tables}
                keyExtractor={item => item.tableId}
                numColumns={3}
                contentContainerStyle={s.list}
                columnWrapperStyle={{ justifyContent: 'space-between' }}
                ListEmptyComponent={<Text style={s.emptyText}>{t.batakBrowseEmpty || 'Şu an açık masa yok'}</Text>}
                renderItem={({ item }) => {
                    const filled = item.seats.filter(x => !x.open).length;
                    return (
                        <View style={s.tableCard}>
                            <Text style={s.tableCardStake}>🪙 {item.betAmount}</Text>
                            {item.ratingAmount > 0 && <Text style={s.tableCardRating}>⭐ {item.ratingAmount.toFixed(2)}</Text>}
                            <View style={{ flexDirection: 'row' }}>
                                {item.seats.filter(x => !x.open).map(x => <Avatar key={x.seat} user={x} size={18} />)}
                            </View>
                            <Text style={s.tableCardSeats}>{filled}/4</Text>
                            <TouchableOpacity style={s.tableCardJoinBtn} onPress={() => join(item.tableId)} activeOpacity={0.85}>
                                <Text style={s.tableCardJoinBtnText}>{t.batakJoinBtn || 'Katıl'}</Text>
                            </TouchableOpacity>
                            {item.spectatorOpen && (
                                <TouchableOpacity style={s.tableCardWatchBtn} onPress={() => spectate(item.tableId)} activeOpacity={0.85}>
                                    <Text style={s.tableCardWatchBtnText}>👁️ {t.batakWatchBtn || 'İzle'}</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    );
                }}
            />
        </View>
    );
}

const s = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingBottom: 14, backgroundColor: colors.surface, borderBottomWidth: 1, borderColor: colors.border },
    backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    backBtnText: { color: colors.textSecondary, fontSize: 26, fontWeight: '300' },
    title: { color: '#fff', fontSize: 15, fontWeight: '900', flex: 1 },
    list: { paddingHorizontal: 12, paddingTop: 14, paddingBottom: 30 },
    emptyText: { color: colors.textMuted, fontSize: 13, textAlign: 'center', marginTop: 30, width: '100%' },
    tableCard: { width: '31%', backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 8, alignItems: 'center', gap: 4, marginBottom: 10 },
    tableCardStake: { color: '#fbbf24', fontSize: 13, fontWeight: '900' },
    tableCardRating: { color: '#38bdf8', fontSize: 10, fontWeight: '700' },
    tableCardSeats: { color: colors.textMuted, fontSize: 10, fontWeight: '700' },
    tableCardJoinBtn: { width: '100%', backgroundColor: colors.purple, borderRadius: 8, paddingVertical: 6, alignItems: 'center', marginTop: 2 },
    tableCardJoinBtnText: { color: '#fff', fontSize: 11, fontWeight: '800' },
    tableCardWatchBtn: { width: '100%', backgroundColor: colors.surface, borderRadius: 8, paddingVertical: 6, alignItems: 'center', marginTop: 4 },
    tableCardWatchBtnText: { color: colors.textSecondary, fontSize: 11, fontWeight: '800' },
});
