import { useEffect, useState, useCallback, useRef } from 'react';
import {
    View, Text, ScrollView, TouchableOpacity, StyleSheet,
    ActivityIndicator, Alert, TextInput, Modal, Platform, Image, Pressable, KeyboardAvoidingView,
    Dimensions, Animated, Linking,
} from 'react-native';
import { useSelector, useDispatch } from 'react-redux';
import * as ImagePicker from 'expo-image-picker';
import { Audio } from 'expo-av';
import { logout, setUser } from '../../store/slices/authSlice';
import { setLang } from '../../store/slices/langSlice';
import useT from '../../hooks/useT';
import api from '../../services/api';
import { onSocket } from '../../services/socket';
import colors from '../../theme/colors';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ManageActivitiesModal from '../../components/ManageActivitiesModal';
import AssessmentModal from '../../components/AssessmentModal';
import SupportModal from '../../components/SupportModal';
import { getSubCategoryLabel } from '../../utils/subCategoryLabels';
import RainbowLogo from '../../components/RainbowLogo';
import CityPickerModal from '../../components/CityPickerModal';
import VolleyballRatingModal from '../../components/VolleyballRatingModal';
import ExtraNotifyChannelModal from '../../components/ExtraNotifyChannelModal';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// ─── Sport Card Flip Modal ────────────────────────────────────────────────────
const { width: SW, height: SH } = Dimensions.get('window');

const COUNTRY_CODES = [
    { flag:'🇹🇷', code:'+90',  name:'Türkiye' },
    { flag:'🇩🇪', code:'+49',  name:'Almanya' },
    { flag:'🇳🇱', code:'+31',  name:'Hollanda' },
    { flag:'🇧🇪', code:'+32',  name:'Belçika' },
    { flag:'🇦🇹', code:'+43',  name:'Avusturya' },
    { flag:'🇨🇭', code:'+41',  name:'İsviçre' },
    { flag:'🇫🇷', code:'+33',  name:'Fransa' },
    { flag:'🇬🇧', code:'+44',  name:'İngiltere' },
    { flag:'🇺🇸', code:'+1',   name:'ABD / Kanada' },
    { flag:'🇬🇷', code:'+30',  name:'Yunanistan' },
    { flag:'🇧🇬', code:'+359', name:'Bulgaristan' },
    { flag:'🇷🇴', code:'+40',  name:'Romanya' },
    { flag:'🇺🇦', code:'+380', name:'Ukrayna' },
    { flag:'🇷🇺', code:'+7',   name:'Rusya' },
    { flag:'🇦🇿', code:'+994', name:'Azerbaycan' },
    { flag:'🇸🇦', code:'+966', name:'S. Arabistan' },
    { flag:'🇦🇪', code:'+971', name:'BAE' },
    { flag:'🇶🇦', code:'+974', name:'Katar' },
    { flag:'🇦🇺', code:'+61',  name:'Avustralya' },
];

const LEVEL_RANGES = { beginner:[0,1], intermediate:[1,2], advanced:[2,3], expert:[3,4], professional:[4,5] };
const LEVEL_COLORS_CARD = { beginner:'#4ade80', intermediate:'#facc15', advanced:'#f97316', expert:'#a855f7', professional:'#ef4444' };

function calcLevelAccuracy(level, skillRating, wins, losses) {
    const range = LEVEL_RANGES[level];
    if (!range) return null;
    const [min, max] = range;
    const eloAcc = Math.min(100, Math.max(0, ((skillRating - min) / (max - min)) * 100));
    const total = (wins || 0) + (losses || 0);
    const winRate = total > 0 ? ((wins || 0) / total) * 100 : 50;
    return Math.round(eloAcc * 0.7 + winRate * 0.3);
}

function getMatchResult(m, userId) {
    const isOwner = m.senderId === userId;
    const w = m.score?.winner;
    if (!w) return null;
    if (w === 'draw') return 'draw';
    if (w === (isOwner ? 'sender' : 'opponent')) return 'win';
    return 'loss';
}

function getEloDelta(m, userId) {
    const snap = m.score?.ratingSnapshot;
    if (snap && snap[userId]) return snap[userId].change ?? 0;
    return 0;
}

function EloLineGraph({ matches, userId }) {
    const GRAPH_W = SW - 80;
    const GRAPH_H = 90;
    const PADDING = 6;

    if (!matches || matches.length < 2) return (
        <View style={{ alignItems: 'center', paddingVertical: 13 }}>
            <Text style={{ color: '#6b7280', fontSize: 11 }}>— En az 2 maç gerekli —</Text>
        </View>
    );

    // Kümülatif ELO değerleri
    const deltas = matches.map(m => getEloDelta(m, userId));
    const cumulative = deltas.reduce((acc, d, i) => { acc.push((acc[i - 1] || 0) + d); return acc; }, []);
    const minV = Math.min(...cumulative);
    const maxV = Math.max(...cumulative);
    const range = maxV - minV || 0.01;

    const pts = cumulative.map((v, i) => ({
        x: PADDING + (i / (cumulative.length - 1)) * (GRAPH_W - PADDING * 2),
        y: PADDING + (1 - (v - minV) / range) * (GRAPH_H - PADDING * 2),
        v,
    }));

    const lastDelta = deltas[deltas.length - 1];
    const trend = lastDelta > 0 ? '#4ade80' : lastDelta < 0 ? '#f87171' : '#6b7280';

    return (
        <View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                <Text style={{ color: '#6b7280', fontSize: 10, fontWeight: '700' }}>ELO GRAFİĞİ · SON {matches.length} MAÇ</Text>
                <Text style={{ color: trend, fontSize: 10, fontWeight: '800' }}>
                    {lastDelta > 0 ? '▲' : lastDelta < 0 ? '▼' : '—'} {lastDelta > 0 ? '+' : ''}{lastDelta.toFixed ? lastDelta.toFixed(3) : lastDelta}
                </Text>
            </View>
            <View style={{ width: GRAPH_W, height: GRAPH_H, position: 'relative' }}>
                {/* Grid çizgisi */}
                <View style={{ position: 'absolute', top: GRAPH_H / 2, left: 0, right: 0, height: 1, backgroundColor: '#ffffff08' }} />
                {/* Bağlantı çizgileri */}
                {pts.slice(0, -1).map((p, i) => {
                    const n = pts[i + 1];
                    const dx = n.x - p.x;
                    const dy = n.y - p.y;
                    const len = Math.sqrt(dx * dx + dy * dy);
                    const angle = Math.atan2(dy, dx) * 180 / Math.PI;
                    const col = n.v >= p.v ? '#4ade80' : '#f87171';
                    // Çizgiyi iki nokta arasının merkezine konumlandır
                    const cx = (p.x + n.x) / 2 - len / 2;
                    const cy = (p.y + n.y) / 2 - 1;
                    return (
                        <View key={i} style={{
                            position: 'absolute', left: cx, top: cy,
                            width: len, height: 2, backgroundColor: col, opacity: 0.8,
                            transform: [{ rotate: `${angle}deg` }],
                        }} />
                    );
                })}
                {/* Noktalar */}
                {pts.map((p, i) => (
                    <View key={i} style={{
                        position: 'absolute', left: p.x - 3, top: p.y - 3,
                        width: 6, height: 6, borderRadius: 3,
                        backgroundColor: i === pts.length - 1 ? '#facc15' : '#a855f7',
                        borderWidth: 1, borderColor: '#1a1a2e',
                    }} />
                ))}
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                <Text style={{ color: '#6b7280', fontSize: 9 }}>{minV.toFixed ? minV.toFixed(2) : minV}</Text>
                <Text style={{ color: '#6b7280', fontSize: 9 }}>{maxV.toFixed ? maxV.toFixed(2) : maxV}</Text>
            </View>
        </View>
    );
}

function MatchListModal({ visible, matches, type, userId, lang, onClose }) {
    const filtered = (matches || []).filter(m => getMatchResult(m, userId) === type);
    const tr = lang === 'tr';
    const ru = lang === 'ru';
    const label = type === 'win'  ? (tr ? '✅ Galibiyetler' : ru ? '✅ Победы' : '✅ Wins')
                : type === 'loss' ? (tr ? '❌ Mağlubiyetler' : ru ? '❌ Поражения' : '❌ Losses')
                :                   (tr ? '🤝 Beraberlikler' : ru ? '🤝 Ничьи' : '🤝 Draws');
    const resultColor = type === 'win' ? '#4ade80' : type === 'loss' ? '#f87171' : '#facc15';

    const formatSets = (score, isOwner) => {
        if (!score?.sets?.length) return null;
        return score.sets.map(s => {
            const me = isOwner ? (s.sender ?? s.p1 ?? 0) : (s.opponent ?? s.p2 ?? 0);
            const opp = isOwner ? (s.opponent ?? s.p2 ?? 0) : (s.sender ?? s.p1 ?? 0);
            return `${me}-${opp}`;
        }).join('  ');
    };

    const SURFACE_TR = { HARD:'Sert', CLAY:'Toprak', GRASS:'Çim', CARPET:'Suni', ARTIFICIAL:'Suni Çim', GLASS:'Cam', INDOOR:'Kapalı', HALI_SAHA:'Halı Saha', BEACH:'Plaj' };
    const SURFACE_EN = { HARD:'Hard', CLAY:'Clay', GRASS:'Grass', CARPET:'Carpet', ARTIFICIAL:'Artificial', GLASS:'Glass', INDOOR:'Indoor', HALI_SAHA:'Turf', BEACH:'Beach' };
    const SURFACE_RU = { HARD:'Хард', CLAY:'Грунт', GRASS:'Трава', CARPET:'Ковровое', ARTIFICIAL:'Искусственная трава', GLASS:'Стекло', INDOOR:'Закрытый корт', HALI_SAHA:'Ковровое поле', BEACH:'Пляж' };

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <View style={{ flex: 1, backgroundColor: '#000000cc', justifyContent: 'flex-end' }}>
                <View style={{ backgroundColor: '#1a1a2e', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: SH * 0.82, paddingBottom: 17 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 15, borderBottomWidth: 1, borderBottomColor: '#ffffff10' }}>
                        <Text style={{ color: '#fff', fontSize: 15, fontWeight: '900' }}>{label} ({filtered.length})</Text>
                        <TouchableOpacity onPress={onClose}><Text style={{ color: '#6b7280', fontSize: 20 }}>✕</Text></TouchableOpacity>
                    </View>
                    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 13 }}>
                        {filtered.length === 0 ? (
                            <Text style={{ color: '#6b7280', textAlign: 'center', marginTop: 24 }}>—</Text>
                        ) : filtered.map((m, idx) => {
                            const isOwner = m.senderId === userId;
                            const opponent = isOwner ? (m.receiver || (Array.isArray(m.participants) ? m.participants[0] : null)) : m.sender;
                            const delta = getEloDelta(m, userId);
                            const sets = formatSets(m.score, isOwner);
                            const surface = m.surface ? ((tr ? SURFACE_TR : ru ? SURFACE_RU : SURFACE_EN)[m.surface?.toUpperCase()] || m.surface) : null;
                            const date = m.completedAt
                                ? new Date(m.completedAt).toLocaleDateString(tr ? 'tr-TR' : ru ? 'ru-RU' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' })
                                : m.matchDate
                                    ? new Date(m.matchDate).toLocaleDateString(tr ? 'tr-TR' : ru ? 'ru-RU' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' })
                                    : '';
                            const modeLabel = m.matchMode === 'COMPETITIVE' ? (tr ? '⚔️ Rekabetçi' : ru ? '⚔️ Соревновательный' : '⚔️ Competitive') : m.matchMode === 'PRACTICE' ? (tr ? '🎯 Antrenman' : ru ? '🎯 Тренировка' : '🎯 Practice') : '';
                            const typeLabel = m.matchType === 'DOUBLE' ? (tr ? '👥 Çiftler' : ru ? '👥 Пары' : '👥 Doubles') : m.matchType === 'SINGLE' ? (tr ? '👤 Tekler' : ru ? '👤 Одиночный' : '👤 Singles') : '';
                            return (
                                <View key={m.id || idx} style={{ backgroundColor: '#ffffff06', borderRadius: 12, padding: 9, marginBottom: 10, borderWidth: 1, borderColor: '#ffffff0f', borderLeftWidth: 3, borderLeftColor: resultColor + '80' }}>
                                    {/* Satır 1: Rakip + ELO */}
                                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                                        <Text style={{ color: '#fff', fontSize: 13, fontWeight: '800' }}>
                                            {opponent ? `${opponent.username}` : (tr ? 'Rakip bilinmiyor' : ru ? 'Соперник неизвестен' : 'Unknown opponent')}
                                        </Text>
                                        {delta !== 0 && (
                                            <Text style={{ color: delta > 0 ? '#4ade80' : '#f87171', fontSize: 13, fontWeight: '900' }}>
                                                {delta > 0 ? '+' : ''}{typeof delta === 'number' ? delta.toFixed(3) : delta}
                                            </Text>
                                        )}
                                    </View>
                                    {/* Skor */}
                                    {sets && (
                                        <Text style={{ color: resultColor, fontSize: 15, fontWeight: '900', marginBottom: 6, letterSpacing: 1 }}>
                                            {sets}
                                        </Text>
                                    )}
                                    {/* Chip'ler: mod, tür, zemin */}
                                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 3, marginBottom: 6 }}>
                                        {modeLabel ? <View style={{ backgroundColor: '#ffffff10', borderRadius: 5, paddingHorizontal: 4, paddingVertical: 0 }}><Text style={{ color: '#e2e8f0', fontSize: 10, fontWeight: '700' }}>{modeLabel}</Text></View> : null}
                                        {typeLabel ? <View style={{ backgroundColor: '#ffffff10', borderRadius: 5, paddingHorizontal: 4, paddingVertical: 0 }}><Text style={{ color: '#e2e8f0', fontSize: 10, fontWeight: '700' }}>{typeLabel}</Text></View> : null}
                                        {surface ? <View style={{ backgroundColor: '#ffffff10', borderRadius: 5, paddingHorizontal: 4, paddingVertical: 0 }}><Text style={{ color: '#94a3b8', fontSize: 10, fontWeight: '700' }}>⬜ {surface}</Text></View> : null}
                                    </View>
                                    {/* Konum */}
                                    {(m.courtName || m.location) && (
                                        <Text style={{ color: '#60a5fa', fontSize: 11, marginBottom: 4 }}>
                                            🏟️ {[m.courtName, m.location].filter(Boolean).join(' · ')}
                                        </Text>
                                    )}
                                    {/* Tarih */}
                                    {date ? <Text style={{ color: '#6b7280', fontSize: 10 }}>📅 {date}{m.matchTime ? '  ' + m.matchTime : ''}</Text> : null}
                                </View>
                            );
                        })}
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
}

// ─── Günlük Tenis Oyuncu Animasyonu ─────────────────────────────────────────

const TENNIS_LEGENDS = [
    { name: 'Novak Djokovic',        country: '🇷🇸', titles: '24× Grand Slam', era: '2003–present', move: 'Baseline' },
    { name: 'Rafael Nadal',          country: '🇪🇸', titles: '22× Grand Slam', era: '2001–2024',    move: 'Topspin' },
    { name: 'Roger Federer',         country: '🇨🇭', titles: '20× Grand Slam', era: '1998–2022',    move: 'Serve & Volley' },
    { name: 'Carlos Alcaraz',        country: '🇪🇸', titles: '4× Grand Slam',  era: '2018–present', move: 'Drop Shot' },
    { name: 'Jannik Sinner',         country: '🇮🇹', titles: '2× Grand Slam',  era: '2018–present', move: 'Baseline' },
    { name: 'Andy Murray',           country: '🏴󠁧󠁢󠁳󠁣󠁴󠁿', titles: '3× Grand Slam',  era: '2005–present', move: 'Return Game' },
    { name: 'Pete Sampras',          country: '🇺🇸', titles: '14× Grand Slam', era: '1988–2002',    move: 'Serve & Volley' },
    { name: 'Andre Agassi',          country: '🇺🇸', titles: '8× Grand Slam',  era: '1986–2006',    move: 'Return of Serve' },
    { name: 'Björn Borg',            country: '🇸🇪', titles: '11× Grand Slam', era: '1973–1983',    move: 'Topspin' },
    { name: 'John McEnroe',          country: '🇺🇸', titles: '7× Grand Slam',  era: '1977–1992',    move: 'Serve & Volley' },
    { name: 'Ivan Lendl',            country: '🇨🇿', titles: '8× Grand Slam',  era: '1978–1994',    move: 'Baseline' },
    { name: 'Boris Becker',          country: '🇩🇪', titles: '6× Grand Slam',  era: '1984–1999',    move: 'Diving Volley' },
    { name: 'Stefan Edberg',         country: '🇸🇪', titles: '6× Grand Slam',  era: '1983–1996',    move: 'Net Game' },
    { name: 'Serena Williams',       country: '🇺🇸', titles: '23× Grand Slam', era: '1995–2022',    move: 'Power Serve' },
    { name: 'Steffi Graf',           country: '🇩🇪', titles: '22× Grand Slam', era: '1982–1999',    move: 'Forehand' },
    { name: 'Martina Navratilova',   country: '🇨🇿', titles: '18× Grand Slam', era: '1973–2004',    move: 'Net Game' },
    { name: 'Monica Seles',          country: '🇺🇸', titles: '9× Grand Slam',  era: '1989–2003',    move: 'Two-Handed' },
    { name: 'Justine Henin',         country: '🇧🇪', titles: '7× Grand Slam',  era: '1999–2011',    move: 'One-Hand BH' },
    { name: 'Venus Williams',        country: '🇺🇸', titles: '7× Grand Slam',  era: '1994–present', move: 'Power Game' },
    { name: 'Iga Świątek',           country: '🇵🇱', titles: '4× Grand Slam',  era: '2016–present', move: 'Topspin' },
    { name: 'Aryna Sabalenka',       country: '🇧🇾', titles: '3× Grand Slam',  era: '2014–present', move: 'Power Serve' },
    { name: 'Coco Gauff',            country: '🇺🇸', titles: '1× Grand Slam',  era: '2018–present', move: 'Baseline' },
    { name: 'Daniil Medvedev',       country: '🇷🇺', titles: '1× Grand Slam',  era: '2016–present', move: 'Baseline' },
    { name: 'Alexander Zverev',      country: '🇩🇪', titles: '1× Grand Slam',  era: '2013–present', move: 'Baseline' },
    { name: 'Holger Rune',           country: '🇩🇰', titles: 'Top 10',          era: '2020–present', move: 'Aggressive' },
    { name: 'Casper Ruud',           country: '🇳🇴', titles: 'Top 10',          era: '2015–present', move: 'Topspin' },
    { name: 'Nick Kyrgios',          country: '🇦🇺', titles: 'Wimbledon Final', era: '2013–present', move: 'Underarm Serve' },
    { name: 'Grigor Dimitrov',       country: '🇧🇬', titles: 'ATP Finals',      era: '2008–present', move: 'All-Court' },
    { name: 'Marin Čilić',           country: '🇭🇷', titles: '1× Grand Slam',  era: '2005–present', move: 'Power Serve' },
    { name: 'Stan Wawrinka',         country: '🇨🇭', titles: '3× Grand Slam',  era: '2002–present', move: 'One-Hand BH' },
    { name: 'Victoria Azarenka',     country: '🇧🇾', titles: '2× Grand Slam',  era: '2005–present', move: 'Baseline' },
    { name: 'Maria Sharapova',       country: '🇷🇺', titles: '5× Grand Slam',  era: '2001–2020',    move: 'Baseline' },
    { name: 'Kim Clijsters',         country: '🇧🇪', titles: '4× Grand Slam',  era: '1997–2012',    move: 'All-Court' },
    { name: 'Arantxa Sánchez',       country: '🇪🇸', titles: '3× Grand Slam',  era: '1988–2002',    move: 'Clay Baseline' },
    { name: 'Gabriela Sabatini',     country: '🇦🇷', titles: '1× Grand Slam',  era: '1984–1996',    move: 'Topspin' },
    { name: 'Pat Cash',              country: '🇦🇺', titles: '1× Grand Slam',  era: '1982–1997',    move: 'Serve & Volley' },
];

function TennisDailyAnimation({ color, lang }) {
    const dayIdx = Math.floor(Date.now() / 86400000) % TENNIS_LEGENDS.length;
    const player = TENNIS_LEGENDS[dayIdx];

    const armPhase  = useRef(new Animated.Value(0)).current;
    const ballY     = useRef(new Animated.Value(0)).current;
    const ballX     = useRef(new Animated.Value(0)).current;
    const ballScale = useRef(new Animated.Value(1)).current;
    const pulse     = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        Animated.loop(Animated.sequence([
            Animated.timing(pulse, { toValue: 1.2, duration: 900, useNativeDriver: true }),
            Animated.timing(pulse, { toValue: 1,   duration: 900, useNativeDriver: true }),
        ])).start();

        Animated.loop(Animated.sequence([
            Animated.delay(600),
            // Wind-up
            Animated.parallel([
                Animated.timing(armPhase,  { toValue: 1, duration: 500, useNativeDriver: true }),
                Animated.timing(ballY,     { toValue: -32, duration: 500, useNativeDriver: true }),
            ]),
            // Contact
            Animated.parallel([
                Animated.timing(armPhase,  { toValue: 2, duration: 140, useNativeDriver: true }),
                Animated.timing(ballY,     { toValue: -48, duration: 140, useNativeDriver: true }),
                Animated.timing(ballScale, { toValue: 1.5, duration: 140, useNativeDriver: true }),
            ]),
            // Follow-through + ball away
            Animated.parallel([
                Animated.timing(armPhase,  { toValue: 3, duration: 320, useNativeDriver: true }),
                Animated.timing(ballY,     { toValue: -18, duration: 320, useNativeDriver: true }),
                Animated.timing(ballX,     { toValue: -38, duration: 320, useNativeDriver: true }),
                Animated.timing(ballScale, { toValue: 0.5, duration: 320, useNativeDriver: true }),
            ]),
            Animated.delay(700),
            // Reset
            Animated.parallel([
                Animated.timing(armPhase,  { toValue: 0, duration: 280, useNativeDriver: true }),
                Animated.timing(ballY,     { toValue: 0, duration: 280, useNativeDriver: true }),
                Animated.timing(ballX,     { toValue: 0, duration: 280, useNativeDriver: true }),
                Animated.timing(ballScale, { toValue: 1, duration: 280, useNativeDriver: true }),
            ]),
        ])).start();
    }, []);

    const armRotate = armPhase.interpolate({
        inputRange: [0, 1, 2, 3],
        outputRange: ['25deg', '-85deg', '-145deg', '-105deg'],
    });

    return (
        <View style={{ alignItems: 'center', paddingTop: 1 }}>
            <Text style={{ color: color + '90', fontSize: 8, fontWeight: '900', letterSpacing: 2.5, marginBottom: 10 }}>
                ✦ {lang === 'tr' ? 'GÜNÜN OYUNCUSU' : lang === 'ru' ? 'ИГРОК ДНЯ' : "TODAY'S PLAYER"} ✦
            </Text>

            {/* Animasyon alanı */}
            <View style={{ width: 110, height: 100, marginBottom: 10 }}>
                {/* Glow halkaları */}
                <Animated.View style={{ position:'absolute', left:30, top:18, width:50, height:50, borderRadius:25, borderWidth:1, borderColor:color+'30', transform:[{scale:pulse}] }} />
                <Animated.View style={{ position:'absolute', left:22, top:10, width:66, height:66, borderRadius:33, borderWidth:1, borderColor:color+'15', transform:[{scale:pulse}] }} />

                {/* Top — baş */}
                <View style={{ position:'absolute', left:48, top:6, width:14, height:14, borderRadius:7, backgroundColor:color+'D0' }} />
                {/* Gövde */}
                <View style={{ position:'absolute', left:52, top:20, width:4, height:22, borderRadius:2, backgroundColor:color+'C0' }} />
                {/* Sol kol (statik) */}
                <View style={{ position:'absolute', left:38, top:24, width:14, height:3, borderRadius:2, backgroundColor:color+'70', transform:[{rotate:'-20deg'}] }} />
                {/* Bacaklar */}
                <View style={{ position:'absolute', left:48, top:42, width:4, height:20, borderRadius:2, backgroundColor:color+'C0', transform:[{rotate:'9deg'}] }} />
                <View style={{ position:'absolute', left:56, top:42, width:4, height:20, borderRadius:2, backgroundColor:color+'C0', transform:[{rotate:'-9deg'}] }} />
                {/* Ayaklar */}
                <View style={{ position:'absolute', left:43, top:61, width:11, height:4, borderRadius:2, backgroundColor:color+'80' }} />
                <View style={{ position:'absolute', left:54, top:61, width:11, height:4, borderRadius:2, backgroundColor:color+'80' }} />

                {/* Sağ kol — servis animasyonu */}
                <Animated.View style={{
                    position:'absolute', left:54, top:25,
                    width:26, height:3, borderRadius:2, backgroundColor:color,
                    transform:[{translateX:-13},{rotate:armRotate},{translateX:13}],
                }}>
                    {/* Raket kafası */}
                    <View style={{ position:'absolute', right:-10, top:-6, width:10, height:15, borderRadius:5, borderWidth:2, borderColor:color, backgroundColor:'transparent' }} />
                    {/* Raket ipi */}
                    <View style={{ position:'absolute', right:-5, top:-2, width:1, height:7, backgroundColor:color+'60' }} />
                </Animated.View>

                {/* Top */}
                <Animated.View style={{
                    position:'absolute', left:66, top:28,
                    width:9, height:9, borderRadius:4.5,
                    backgroundColor:'#facc15',
                    transform:[{translateY:ballY},{translateX:ballX},{scale:ballScale}],
                }}>
                    <View style={{ position:'absolute', top:4, left:0, right:0, height:1, backgroundColor:'#ca8a04', transform:[{rotate:'35deg'}] }} />
                </Animated.View>
            </View>

            {/* Oyuncu bilgileri */}
            <Text style={{ color, fontSize: 13, fontWeight: '900', textAlign: 'center', letterSpacing: 0.5 }}>
                {player.country}  {player.name}
            </Text>
            <Text style={{ color: '#a855f7', fontSize: 10, fontWeight: '800', marginTop: 3, textAlign: 'center' }}>
                {player.titles}
            </Text>
            <Text style={{ color: '#6b7280', fontSize: 9, fontWeight: '600', marginTop: 2, textAlign: 'center', letterSpacing: 1 }}>
                {player.move.toUpperCase()}  ·  {player.era}
            </Text>

            {/* Gün göstergesi */}
            <View style={{ flexDirection:'row', gap:3, marginTop:10 }}>
                {[0,1,2,3,4,5,6].map(i => (
                    <View key={i} style={{ width:5, height:5, borderRadius:2.5, backgroundColor: i === dayIdx % 7 ? color : color+'25' }} />
                ))}
            </View>
        </View>
    );
}

function SportCardFlipModal({ item, visible, onClose, lang, t, onUpcoming, onArchive, onReservations, isOwnProfile, aliasEditId, aliasValue, setAliasValue, onSaveAlias, onCancelAlias, onEditAlias, savingAlias, profile, userId, profileUserId, onViewTournament, onGoalsSaved, onAssessComplete }) {
    const insets = useSafeAreaInsets();
    const flipAnim = useRef(new Animated.Value(0)).current;
    const [isBack, setIsBack] = useState(false);
    const [matchListType, setMatchListType] = useState(null);
    const [showEloModal, setShowEloModal] = useState(false);
    const [anketScores, setAnketScores] = useState({ stres: 0, fairplay: 0, beden: 0 });
    const [canRate, setCanRate] = useState(false);
    const [anketAverages, setAnketAverages] = useState(null);
    const [showAnketModal, setShowAnketModal] = useState(false);
    const [surveyLoaded, setSurveyLoaded] = useState(false);
    const [showAchievements, setShowAchievements] = useState(false);
    const [showGoals, setShowGoals] = useState(false);
    const [showVolleyballRating, setShowVolleyballRating] = useState(false);
    const [showPadelRating, setShowPadelRating] = useState(false);
    // Kullanıcı isteği: "Yönet" penceresindeki tekli/çiftli değerlendirme seçimi (bkz.
    // ManageActivitiesModal openAssessPicker) burada da, kartın kendisinde senkronize
    // şekilde bulunsun — henüz hiç değerlendirme yapılmamış (ilk 3 maç oynanmamış) bir
    // tenis/padel dalında bile "Tekli -★ / Çiftler -★" ve altında bir "Değerlendir"
    // butonu görünsün.
    const [assessGate, setAssessGate] = useState(null); // { ratingType }

    useEffect(() => {
        if (!visible) {
            flipAnim.setValue(0); setIsBack(false); setMatchListType(null);
            setShowEloModal(false); setShowAnketModal(false);
            setAnketScores({ stres: 0, fairplay: 0, beden: 0 });
            setCanRate(false); setAnketAverages(null); setSurveyLoaded(false);
            setShowAchievements(false); setShowGoals(false); setShowVolleyballRating(false);
            setShowPadelRating(false); setAssessGate(null);
        }
    }, [visible]);

    // ManageActivitiesModal'daki openAssessPicker ile birebir aynı kural: tekli/çiftler
    // AYRI, 3+ maç oynanmış bir disiplin yeniden değerlendirilemez, tenis'te çiftlerden
    // önce tekli tamamlanmış olmalı (padel'de bu şart yok, çiftler varsayılan/birincil).
    const openAssessPicker = () => {
        if (!item) return;
        const canRedoSingles = ((item.singlesMatchCount ?? ((item.wins || 0) + (item.losses || 0))) < 3) || !item.assessmentCompleted;
        const canDoDoubles = !item.doublesAssessmentCompleted || (item.doublesMatchCount || 0) < 3;
        if (!canRedoSingles && !canDoDoubles) return;
        Alert.alert(t.assessPickerTitle, t.assessPickerMessage, [
            { text: t.singlesAssessOption, onPress: () => {
                if (!canRedoSingles) { Alert.alert(t.assessPickerTitle, t.tooManyMatchesMsg); return; }
                setAssessGate({ ratingType: null });
            }},
            { text: t.doublesAssessOption, onPress: () => {
                if (item.subCategory === 'tennis' && !item.assessmentCompleted) { Alert.alert(t.assessPickerTitle, t.doSinglesFirstMsg); return; }
                if (!canDoDoubles) { Alert.alert(t.assessPickerTitle, t.tooManyMatchesMsg); return; }
                setAssessGate({ ratingType: 'doubles' });
            }},
            { text: t.assessPickerCancelBtn, style: 'cancel' },
        ]);
    };

    const handleFlip = () => {
        Animated.timing(flipAnim, { toValue: 0.5, duration: 180, useNativeDriver: true }).start(() => {
            setIsBack(b => !b);
            Animated.timing(flipAnim, { toValue: isBack ? 0 : 1, duration: 180, useNativeDriver: true }).start();
        });
    };

    const rotateY = flipAnim.interpolate({ inputRange: [0, 0.5, 1], outputRange: ['0deg', '90deg', '0deg'] });

    useEffect(() => {
        if (!visible || !item || !profileUserId || surveyLoaded) return;
        api.get(`/survey/${profileUserId}/${item.subCategory}`)
            .then(({ data }) => {
                setCanRate(data.canRate);
                setAnketAverages(data.averages);
                if (data.myRating) setAnketScores({ stres: data.myRating.stres, fairplay: data.myRating.fairplay, beden: data.myRating.beden });
                setSurveyLoaded(true);
            })
            .catch(() => setSurveyLoaded(true));
    }, [visible, item, profileUserId]);

    const saveScore = (key, val) => {
        const next = { ...anketScores, [key]: val };
        setAnketScores(next);
        api.post(`/survey/${profileUserId}/${item.subCategory}`, next).catch(() => {});
    };

    if (!item) return null;

    const SPORT_COLORS = { tennis:'#eab308', padel:'#06b6d4', football:'#16a34a', basketball:'#f97316', volleyball:'#a855f7' };
    const cfg = { color: SPORT_COLORS[item.subCategory] || '#a855f7' };
    const matches = item.historyMatches || [];
    const winsCount   = matches.filter(m => getMatchResult(m, userId) === 'win').length;
    const lossesCount = matches.filter(m => getMatchResult(m, userId) === 'loss').length;
    const drawsCount  = matches.filter(m => getMatchResult(m, userId) === 'draw').length;
    const levelColor  = LEVEL_COLORS_CARD[item.level] || '#a855f7';
    const accuracy    = item.level ? calcLevelAccuracy(item.level, item.skillRating || 0, item.wins || 0, item.losses || 0) : null;
    const isEditingAlias = aliasEditId === item.id;

    const BottomBtns = () => (
        <View style={[fc.btnRow, { bottom: 28 + insets.bottom }]}>
            <TouchableOpacity style={fc.backBtn} onPress={onClose}>
                <Text style={fc.backBtnText}>← {lang === 'tr' ? 'Geri' : lang === 'ru' ? 'Назад' : 'Back'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={fc.flipBtn} onPress={handleFlip}>
                <Text style={fc.flipBtnText}>🔄</Text>
            </TouchableOpacity>
        </View>
    );

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
            <View style={{ flex: 1 }}>
            <Animated.View style={[fc.card, { transform: [{ perspective: 1200 }, { rotateY }] }]}>
                {!isBack ? (
                    <View style={fc.face}>
                        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 67 }}>

                            {/* ── Tek satır: emoji + isim + G/M/B butonları ── */}
                            <View style={fc.topRow}>
                                {item.subCategory === 'padel'
                                    ? <Image source={require('../../../assets/padel.png')} style={{ width: 16, height: 16 }} resizeMode="contain" />
                                    : <Text style={fc.smallEmoji}>{item.emoji || '🏅'}</Text>}
                                <View style={{ flexShrink: 1 }}>
                                    <Text style={fc.smallSportName} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{getSubCategoryLabel(item.subCategory, lang)?.toUpperCase()}</Text>
                                    {item.alias ? <Text style={{ color: '#a855f7', fontSize: 8, fontWeight: '700' }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{item.alias}</Text> : null}
                                </View>
                                {/* Kullanıcı isteği: onaylı antrenör/hakem rozeti olanlar, ELO puanının hemen
                                    altında (aynı kutu içinde) "Antrenör"/"Hakem" etiketiyle görünsün — bkz.
                                    backend interest.controller.js attachCoachRefereeBadges. */}
                                {(item.assessmentCompleted || item.isCoach || item.isReferee || (isOwnProfile && ['tennis','padel'].includes(item.subCategory))) && (
                                    <View style={{ alignItems: 'center', backgroundColor: '#facc1520', borderRadius: 6, paddingVertical: 1, paddingHorizontal: 4, borderWidth: 1, borderColor: '#facc1540' }}>
                                        {/* Tenis/padel: tekli/çiftler puanı AYRI gösterilir (bkz. backend
                                            utrRating.js) — ikisi de dokununca aynı ELO geçmişi grafiğini açar.
                                            Kullanıcı isteği: henüz hiç değerlendirme yapılmamışsa bile "—" ile
                                            gösterilsin, altında "Değerlendir" butonu olsun (bkz. openAssessPicker). */}
                                        {['tennis','padel'].includes(item.subCategory) ? (
                                            <>
                                                <TouchableOpacity onPress={() => item.assessmentCompleted && setShowEloModal(true)} disabled={!item.assessmentCompleted} style={{ alignItems: 'center' }}>
                                                    <Text style={{ color: '#facc15', fontSize: 10, fontWeight: '900' }} numberOfLines={1}>
                                                        {lang === 'tr' ? 'Tekli' : lang === 'ru' ? 'Одиночный' : 'Singles'} {item.singlesDisplayRating != null ? Number(item.singlesDisplayRating).toFixed(2) : '—'}
                                                    </Text>
                                                    <Text style={{ color: '#facc15', fontSize: 10, fontWeight: '900' }} numberOfLines={1}>
                                                        {lang === 'tr' ? 'Çiftler' : lang === 'ru' ? 'Пары' : 'Doubles'} {item.doublesDisplayRating != null ? Number(item.doublesDisplayRating).toFixed(2) : '—'}
                                                    </Text>
                                                    <Text style={{ color: '#facc1599', fontSize: 8, fontWeight: '700' }}>ELO ★</Text>
                                                </TouchableOpacity>
                                                {isOwnProfile && (
                                                    <TouchableOpacity onPress={openAssessPicker} style={{ marginTop: 2, backgroundColor: '#facc1530', borderRadius: 5, paddingHorizontal: 5, paddingVertical: 1 }}>
                                                        <Text style={{ color: '#facc15', fontSize: 8, fontWeight: '800' }} numberOfLines={1}>📋 {lang === 'tr' ? 'Değerlendir' : lang === 'ru' ? 'Оценить' : 'Assess'}</Text>
                                                    </TouchableOpacity>
                                                )}
                                            </>
                                        ) : item.assessmentCompleted && (
                                            <TouchableOpacity onPress={() => setShowEloModal(true)} style={{ alignItems: 'center' }}>
                                                <Text style={{ color: '#facc15', fontSize: 13, fontWeight: '900' }}>{Number(item.skillRating).toFixed(2)}</Text>
                                                <Text style={{ color: '#facc1599', fontSize: 8, fontWeight: '700' }}>ELO ★</Text>
                                            </TouchableOpacity>
                                        )}
                                        {item.isCoach && <Text style={{ color: '#4ade80', fontSize: 8, fontWeight: '800' }}>🎓 {lang==='tr' ? 'Antrenör' : lang==='ru' ? 'Тренер' : 'Coach'}</Text>}
                                        {item.isReferee && <Text style={{ color: '#fbbf24', fontSize: 8, fontWeight: '800' }}>🟨 {lang==='tr' ? 'Hakem' : lang==='ru' ? 'Судья' : 'Referee'}</Text>}
                                    </View>
                                )}
                                {[
                                    { type: 'win',  count: winsCount,   label: lang==='tr' ? 'Galibiyet' : lang==='ru' ? 'Победа' : 'Wins',   color: '#4ade80' },
                                    { type: 'loss', count: lossesCount, label: lang==='tr' ? 'Mağlubiyet' : lang==='ru' ? 'Поражение' : 'Losses', color: '#f87171' },
                                    { type: 'draw', count: drawsCount,  label: lang==='tr' ? 'Beraberlik' : lang==='ru' ? 'Ничья' : 'Draws',  color: '#facc15' },
                                ].map(({ type, count, label, color }) => (
                                    <TouchableOpacity key={type} onPress={() => setMatchListType(type)} style={fc.miniStatBtn}>
                                        <Text style={{ color, fontSize: 13, fontWeight: '900' }}>{count}</Text>
                                        <Text style={{ color: '#6b7280', fontSize: 8, fontWeight: '700' }}>{label}</Text>
                                    </TouchableOpacity>
                                ))}
                                {isOwnProfile && (item.reservationCount > 0) && (
                                    <TouchableOpacity onPress={onReservations} style={fc.miniStatBtn}>
                                        <Text style={{ color: '#60a5fa', fontSize: 13, fontWeight: '900' }}>{item.reservationCount}</Text>
                                        <Text style={{ color: '#6b7280', fontSize: 8, fontWeight: '700' }}>📅 Rezerv.</Text>
                                    </TouchableOpacity>
                                )}
                            </View>

                            {/* ── Eylem butonları ── */}
                            <View style={fc.halfRow}>
                                {/* Sol: Yaklaşan / Arşiv / Takma Ad */}
                                <View style={fc.actionCol}>
                                    <TouchableOpacity onPress={onUpcoming} style={fc.actionBtn}>
                                        <Text style={[fc.actionTxt, { color: '#4ade80' }]}>⏰ {lang==='tr' ? 'Yaklaşan Maçlar' : lang==='ru' ? 'Предстоящие матчи' : 'Upcoming'}{item.upcomingCount > 0 ? ` (${item.upcomingCount})` : ''}</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity onPress={onArchive} style={fc.actionBtn}>
                                        <Text style={[fc.actionTxt, { color: '#a855f7' }]}>🗃️ {lang==='tr' ? 'Maç Arşivi' : lang==='ru' ? 'Архив матчей' : 'Archive'}{item.archiveCount > 0 ? ` (${item.archiveCount})` : ''}</Text>
                                    </TouchableOpacity>
                                    {isOwnProfile && (
                                        isEditingAlias ? (
                                            <View style={{ gap: 3 }}>
                                                <TextInput value={aliasValue} onChangeText={setAliasValue}
                                                    placeholder={`${profile?.username}`} placeholderTextColor="#6b7280" maxLength={30} autoFocus
                                                    style={{ color: '#fff', fontSize: 11, backgroundColor: '#ffffff10', borderRadius: 8, paddingHorizontal: 5, paddingVertical: 3, borderWidth: 1, borderColor: '#ffffff20' }} />
                                                <View style={{ flexDirection: 'row', gap: 3 }}>
                                                    <TouchableOpacity onPress={onSaveAlias} disabled={savingAlias}
                                                        style={{ flex: 1, backgroundColor: '#a855f7', borderRadius: 6, paddingVertical: 2, alignItems: 'center' }}>
                                                        <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>✓</Text>
                                                    </TouchableOpacity>
                                                    <TouchableOpacity onPress={onCancelAlias}
                                                        style={{ flex: 1, backgroundColor: '#ffffff10', borderRadius: 6, paddingVertical: 2, alignItems: 'center' }}>
                                                        <Text style={{ color: '#9ca3af', fontSize: 11 }}>✕</Text>
                                                    </TouchableOpacity>
                                                </View>
                                            </View>
                                        ) : (
                                            <TouchableOpacity onPress={onEditAlias} style={fc.actionBtn}>
                                                <Text style={[fc.actionTxt, { color: '#9ca3af' }]}>✏️ {item.alias ? `${item.alias}` : (t?.sportAliasLabel || 'Takma Ad')}</Text>
                                            </TouchableOpacity>
                                        )
                                    )}
                                </View>

                                {/* Sağ: Başarılar / Hedefler / Anket Ortalaması */}
                                <View style={fc.actionCol}>
                                    <TouchableOpacity style={fc.actionBtn} onPress={() => setShowAchievements(true)}>
                                        <Text style={[fc.actionTxt, { color: '#f59e0b' }]}>🏆 {lang==='tr' ? 'Başarılar' : lang==='ru' ? 'Достижения' : 'Achievements'}</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity style={fc.actionBtn} onPress={() => setShowGoals(true)}>
                                        <Text style={[fc.actionTxt, { color: '#38bdf8' }]}>🎯 {lang==='tr' ? 'Hedefler' : lang==='ru' ? 'Цели' : 'Goals'}</Text>
                                    </TouchableOpacity>
                                    {surveyLoaded && (
                                        <TouchableOpacity style={fc.actionBtn} onPress={() => anketAverages ? setShowAnketModal(true) : null}>
                                            <Text style={[fc.actionTxt, { color: anketAverages ? '#c084fc' : '#6b7280' }]}>
                                                📊 {anketAverages ? (lang==='tr' ? 'Anket Ortalaması' : lang==='ru' ? 'Средний балл опроса' : 'Survey Avg') : (lang==='tr' ? 'Henüz Anket Yok' : lang==='ru' ? 'Опросов пока нет' : 'No Survey Yet')}
                                            </Text>
                                        </TouchableOpacity>
                                    )}
                                </View>
                            </View>

                            {/* ── ELO seviye progress ── */}
                            {accuracy !== null && (
                                <View style={fc.progressBox}>
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
                                        <Text style={{ color: '#6b7280', fontSize: 10, fontWeight: '700' }}>{t?.levelTr?.[item.level] || item.level}</Text>
                                        <Text style={{ color: levelColor, fontSize: 10, fontWeight: '800' }}>{accuracy}%</Text>
                                    </View>
                                    <View style={fc.progressTrack}>
                                        <View style={[fc.progressFill, { width: `${accuracy}%`, backgroundColor: levelColor }]} />
                                    </View>
                                </View>
                            )}

                            {/* ── Sporcu Anketi (küçük) ── */}
                            {(!isOwnProfile || canRate || anketScores.stres > 0) && (
                                <View style={fc.anketSection}>
                                    <Text style={fc.anketSectionTitle}>📋 {lang === 'tr' ? 'Sporcu Anketi' : lang === 'ru' ? 'Опрос спортсмена' : 'Player Survey'}</Text>
                                    {[
                                        { key: 'stres',    emoji: '🧠', title: lang==='tr' ? 'Stres Yönetimi' : lang==='ru' ? 'Управление стрессом' : 'Stress Mgmt',
                                          desc: lang==='tr' ? 'Zor durumlarda sakin kalabilme; öfke patlamaları disiplini yansıtır.' : lang==='ru' ? 'Способность сохранять спокойствие в сложных ситуациях.' : 'Staying calm in critical moments.' },
                                        { key: 'fairplay', emoji: '🤝', title: lang==='tr' ? 'Adil Oyun' : lang==='ru' ? 'Честная игра' : 'Fair Play',
                                          desc: lang==='tr' ? 'Tartışmalı topları kabul etme, hakemi yanıltmama.' : lang==='ru' ? 'Признание спорных мячей, честность с судьёй.' : 'Accepting disputed balls honestly.' },
                                        { key: 'beden',    emoji: '💪', title: lang==='tr' ? 'Beden Dili' : lang==='ru' ? 'Язык тела' : 'Body Language',
                                          desc: lang==='tr' ? 'Gerginlikte odaklanmayı sürdürme, mazeret üretmeme.' : lang==='ru' ? 'Сохранение концентрации под давлением, без отговорок.' : 'Maintaining focus under pressure.' },
                                    ].map(({ key, emoji, title, desc }) => (
                                        <View key={key} style={fc.anketCard}>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 3 }}>
                                                <Text style={{ fontSize: 13 }}>{emoji}</Text>
                                                <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800', flex: 1 }}>{title}</Text>
                                            </View>
                                            <Text style={{ color: '#6b7280', fontSize: 9, marginBottom: 6, lineHeight: 13 }}>{desc}</Text>
                                            <View style={{ flexDirection: 'row', gap: 3, justifyContent: 'flex-start' }}>
                                                {[1,2,3,4,5].map(n => {
                                                    const sel = anketScores[key] === n;
                                                    const col = n <= 2 ? '#f87171' : n === 3 ? '#facc15' : '#4ade80';
                                                    return (
                                                        <TouchableOpacity key={n}
                                                            onPress={() => canRate && saveScore(key, n)}
                                                            style={{ width: 20, height: 20, borderRadius: 4, backgroundColor: sel ? col+'30' : '#ffffff08', borderWidth: sel ? 2 : 1, borderColor: sel ? col : '#ffffff15', alignItems: 'center', justifyContent: 'center', opacity: canRate ? 1 : 0.5 }}>
                                                            <Text style={{ color: sel ? col : '#6b7280', fontSize: 9, fontWeight: '900' }}>{n}</Text>
                                                        </TouchableOpacity>
                                                    );
                                                })}
                                            </View>
                                        </View>
                                    ))}
                                    {!canRate && <Text style={{ color: '#6b7280', fontSize: 9, textAlign: 'center', marginTop: 4 }}>{lang==='tr' ? 'Bu sporda birlikte maç yapmanız gerekiyor.' : lang==='ru' ? 'Вам нужно сыграть вместе в этом виде спорта.' : 'You need to have played together.'}</Text>}
                                </View>
                            )}

                            {/* ── Voleybol Değerlendirmesi ── */}
                            {item.subCategory === 'volleyball' && (
                                <TouchableOpacity style={fc.actionBtn} onPress={() => setShowVolleyballRating(true)}>
                                    <Text style={[fc.actionTxt, { color: '#a855f7', textAlign: 'center' }]}>{t.volleyballRatingBtn}</Text>
                                </TouchableOpacity>
                            )}

                            {/* ── Padel Değerlendirmesi ── */}
                            {item.subCategory === 'padel' && (
                                <TouchableOpacity style={fc.actionBtn} onPress={() => setShowPadelRating(true)}>
                                    <Text style={[fc.actionTxt, { color: '#06b6d4', textAlign: 'center' }]}>{t.padelRatingBtn}</Text>
                                </TouchableOpacity>
                            )}

                        </ScrollView>
                        <BottomBtns />

                        {/* ELO Grafik Modali */}
                        <Modal visible={showEloModal} transparent animationType="slide" onRequestClose={() => setShowEloModal(false)}>
                            <View style={{ flex: 1, backgroundColor: '#000000cc', justifyContent: 'flex-end' }}>
                                <View style={{ backgroundColor: '#1a1a2e', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 17, paddingBottom: 33, borderWidth: 1, borderColor: '#a855f730' }}>
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                                        <View>
                                            {['tennis','padel'].includes(item.subCategory) ? (
                                                <Text style={{ color: '#facc15', fontSize: 14, fontWeight: '900' }} numberOfLines={1}>
                                                    ELO ★ {lang === 'tr' ? 'Tekli' : lang === 'ru' ? 'О' : 'S'} {item.singlesDisplayRating != null ? Number(item.singlesDisplayRating).toFixed(2) : '—'} · {lang === 'tr' ? 'Çiftler' : lang === 'ru' ? 'П' : 'D'} {item.doublesDisplayRating != null ? Number(item.doublesDisplayRating).toFixed(2) : '—'}
                                                </Text>
                                            ) : (
                                                <Text style={{ color: '#facc15', fontSize: 16, fontWeight: '900' }}>ELO ★ {Number(item.skillRating || 0).toFixed(2)}</Text>
                                            )}
                                            <Text style={{ color: '#6b7280', fontSize: 11, marginTop: 2 }}>{lang === 'tr' ? 'Puan Geçmişi' : lang === 'ru' ? 'История рейтинга' : 'Rating History'}</Text>
                                        </View>
                                        <TouchableOpacity onPress={() => setShowEloModal(false)}>
                                            <Text style={{ color: '#6b7280', fontSize: 22 }}>✕</Text>
                                        </TouchableOpacity>
                                    </View>
                                    <View style={fc.graphBox}>
                                        <EloLineGraph matches={matches} userId={userId} />
                                    </View>
                                </View>
                            </View>
                        </Modal>

                        {/* Anket Ortalaması Modali */}
                        <Modal visible={showAnketModal} transparent animationType="slide" onRequestClose={() => setShowAnketModal(false)}>
                            <View style={{ flex: 1, backgroundColor: '#000000cc', justifyContent: 'flex-end' }}>
                                <View style={{ backgroundColor: '#1a1a2e', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 17, paddingBottom: 33, borderWidth: 1, borderColor: '#a855f730' }}>
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                                        <View>
                                            <Text style={{ color: '#c084fc', fontSize: 16, fontWeight: '900' }}>📊 {lang==='tr' ? 'Anket Ortalaması' : lang==='ru' ? 'Средний балл опроса' : 'Survey Average'}</Text>
                                            <Text style={{ color: '#6b7280', fontSize: 11, marginTop: 2 }}>{anketAverages?.count || 0} {lang==='tr' ? 'değerlendirme' : lang==='ru' ? 'оценок' : 'ratings'}</Text>
                                        </View>
                                        <TouchableOpacity onPress={() => setShowAnketModal(false)}>
                                            <Text style={{ color: '#6b7280', fontSize: 22 }}>✕</Text>
                                        </TouchableOpacity>
                                    </View>
                                    {anketAverages && [
                                        { key: 'stres',    emoji: '🧠', label: lang==='tr' ? 'Stres Yönetimi' : lang==='ru' ? 'Управление стрессом' : 'Stress Management', val: anketAverages.stres },
                                        { key: 'fairplay', emoji: '🤝', label: lang==='tr' ? 'Adil Oyun' : lang==='ru' ? 'Честная игра' : 'Fair Play',             val: anketAverages.fairplay },
                                        { key: 'beden',    emoji: '💪', label: lang==='tr' ? 'Beden Dili' : lang==='ru' ? 'Язык тела' : 'Body Language',         val: anketAverages.beden },
                                    ].map(({ key, emoji, label, val }) => {
                                        const col = val <= 2 ? '#f87171' : val <= 3 ? '#facc15' : '#4ade80';
                                        const pct = (val / 5) * 100;
                                        return (
                                            <View key={key} style={{ marginBottom: 16 }}>
                                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                                                    <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>{emoji} {label}</Text>
                                                    <Text style={{ color: col, fontSize: 14, fontWeight: '900' }}>{val.toFixed(1)} / 5</Text>
                                                </View>
                                                <View style={{ height: 10, backgroundColor: '#ffffff10', borderRadius: 5, overflow: 'hidden' }}>
                                                    <View style={{ width: `${pct}%`, height: 10, backgroundColor: col, borderRadius: 5 }} />
                                                </View>
                                            </View>
                                        );
                                    })}
                                </View>
                            </View>
                        </Modal>
                    </View>
                ) : (
                    /* ── Arka Yüz ── */
                    <View style={[fc.face, fc.backFace]}>
                        {(item?.subCategory === 'tennis' || item?.subCategory === 'padel') ? (
                            <TennisDailyAnimation color={cfg.color} lang={lang} />
                        ) : (
                            <>
                                <Text style={fc.backLogo}>⚡</Text>
                                <Text style={fc.backTitle}>AcTiViTy</Text>
                                <View style={fc.backPattern}>
                                    {['🏅','⚡','🏆','🔥','💪','🎯','🌟','⚡','🏅','🎯','🔥','🏆'].map((e, idx) => (
                                        <Text key={idx} style={fc.backPatternEmoji}>{e}</Text>
                                    ))}
                                </View>
                            </>
                        )}
                        <BottomBtns />
                    </View>
                )}
            </Animated.View>
            </View>

            <MatchListModal
                visible={!!matchListType}
                matches={matches}
                type={matchListType}
                userId={userId}
                lang={lang}
                onClose={() => setMatchListType(null)}
            />

            <AchievementsModal
                visible={showAchievements}
                onClose={() => setShowAchievements(false)}
                profileUserId={profileUserId}
                isOwnProfile={isOwnProfile}
                lang={lang}
                cfg={cfg}
                onViewTournament={(achievement) => {
                    setShowAchievements(false);
                    onViewTournament && onViewTournament(achievement);
                }}
            />
            <GoalsModal
                visible={showGoals}
                onClose={() => setShowGoals(false)}
                lang={lang}
                cfg={cfg}
                interestId={item.id}
                subCategoryLabel={getSubCategoryLabel(item.subCategory, lang)}
                initialGoals={item.goals}
                isOwnProfile={isOwnProfile}
                onSaved={(goals) => onGoalsSaved?.(item.id, goals)}
            />
            <VolleyballRatingModal
                visible={showVolleyballRating}
                subjectId={profileUserId}
                onClose={() => setShowVolleyballRating(false)}
            />
            <VolleyballRatingModal
                visible={showPadelRating}
                subjectId={profileUserId}
                subCategory="padel"
                onClose={() => setShowPadelRating(false)}
            />
            {/* Kartın kendisinden tekli/çiftli değerlendirme — bkz. openAssessPicker yorumu.
                mandatory değil (dal zaten eklenmiş), vazgeçince aktivite silinmez. */}
            <AssessmentModal
                visible={!!assessGate}
                interestId={item.id}
                subCategory={item.subCategory}
                ratingType={assessGate?.ratingType || null}
                lang={lang}
                onClose={() => setAssessGate(null)}
                onComplete={(result) => {
                    setAssessGate(null);
                    if (result?.interest) onAssessComplete?.(item.id, result.interest);
                }}
            />
        </Modal>
    );
}

// ─── Hedefler Modalı ──────────────────────────────────────────────────────────
// Eskiden tüm dallarda aynı (tenis temalı) dart mini oyunu gösteriliyordu — her dalın
// kendi hedefi olmadığı için kaldırıldı, yerine oyuncunun kendine bu dala özel yazdığı
// serbest metin hedef/söz notu geldi (UserInterest.goals, dal başına ayrı saklanır).
function GoalsModal({ visible, onClose, lang, cfg, interestId, subCategoryLabel, initialGoals, isOwnProfile, onSaved }) {
    const tr = lang === 'tr';
    const ru = lang === 'ru';
    const color = cfg?.color || '#38bdf8';
    const [text, setText] = useState(initialGoals || '');
    const [editing, setEditing] = useState(false);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (visible) {
            setText(initialGoals || '');
            setEditing(isOwnProfile && !initialGoals);
        }
    }, [visible, initialGoals, isOwnProfile]);

    const save = async () => {
        setSaving(true);
        try {
            const { data } = await api.patch(`/interests/${interestId}/goals`, { goals: text });
            onSaved?.(data.goals);
            setEditing(false);
        } catch { /* silent */ }
        setSaving(false);
    };

    return (
        <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
            <View style={{ flex:1, backgroundColor:'#000000cc', justifyContent:'flex-end' }}>
                <KeyboardAvoidingView behavior="padding">
                    <View style={{ backgroundColor:'#0f0f1a', borderTopLeftRadius:24, borderTopRightRadius:24, paddingBottom:31, maxHeight:'80%' }}>
                        <View style={{ flexDirection:'row', alignItems:'center', padding:13, borderBottomWidth:1, borderBottomColor:'#ffffff10' }}>
                            <Text style={{ color:'#fff', fontSize:15, fontWeight:'900', flex:1 }} numberOfLines={1}>
                                🎯 {tr ? 'Hedefler' : ru ? 'Цели' : 'Goals'} — {subCategoryLabel}
                            </Text>
                            <TouchableOpacity onPress={onClose}><Text style={{ color:'#6b7280', fontSize:22 }}>✕</Text></TouchableOpacity>
                        </View>

                        <ScrollView contentContainerStyle={{ padding:17, gap:10 }} keyboardShouldPersistTaps="handled">
                            <Text style={{ color:'#6b7280', fontSize:12, lineHeight:17 }}>
                                {tr
                                    ? 'Bu dalda kendine koyduğun hedefleri, kendine verdiğin sözleri buraya yaz.'
                                    : ru
                                        ? 'Запиши здесь цели и обещания, которые ты поставил себе в этом виде спорта.'
                                        : 'Write down the goals and promises you set for yourself in this branch.'}
                            </Text>

                            {isOwnProfile && editing ? (
                                <>
                                    <TextInput
                                        value={text}
                                        onChangeText={setText}
                                        multiline
                                        maxLength={500}
                                        placeholder={tr ? 'Örn: Bu ay 3 kez maç yap, servis isabetini artır...' : ru ? 'Напр.: сыграть 3 матча в этом месяце, улучшить точность подачи...' : 'E.g: Play 3 matches this month, improve serve accuracy...'}
                                        placeholderTextColor="#4b5563"
                                        style={{ color:'#fff', fontSize:14, minHeight:120, textAlignVertical:'top', backgroundColor:'#ffffff08', borderRadius:12, borderWidth:1, borderColor:'#ffffff15', padding:12, lineHeight:20 }}
                                    />
                                    <Text style={{ color:'#4b5563', fontSize:10, textAlign:'right' }}>{text.length}/500</Text>
                                    <TouchableOpacity onPress={save} disabled={saving}
                                        style={{ backgroundColor:color+'20', borderRadius:10, paddingVertical:11, alignItems:'center', borderWidth:1, borderColor:color+'50', opacity: saving ? 0.6 : 1 }}>
                                        {saving ? <ActivityIndicator color={color} /> : <Text style={{ color, fontWeight:'900', fontSize:14 }}>{tr ? 'Kaydet' : ru ? 'Сохранить' : 'Save'}</Text>}
                                    </TouchableOpacity>
                                </>
                            ) : isOwnProfile ? (
                                <>
                                    <Text style={{ color:'#fff', fontSize:14, lineHeight:20 }}>{text}</Text>
                                    <TouchableOpacity onPress={() => setEditing(true)}
                                        style={{ backgroundColor:'#ffffff10', borderRadius:10, paddingVertical:10, alignItems:'center' }}>
                                        <Text style={{ color:'#9ca3af', fontWeight:'800', fontSize:13 }}>✏️ {tr ? 'Düzenle' : ru ? 'Изменить' : 'Edit'}</Text>
                                    </TouchableOpacity>
                                </>
                            ) : text ? (
                                <Text style={{ color:'#fff', fontSize:14, lineHeight:20 }}>{text}</Text>
                            ) : (
                                <Text style={{ color:'#4b5563', fontSize:13, textAlign:'center', marginTop:10 }}>
                                    {tr ? 'Henüz hedef belirlenmemiş.' : ru ? 'Цели пока не заданы.' : 'No goals set yet.'}
                                </Text>
                            )}
                        </ScrollView>
                    </View>
                </KeyboardAvoidingView>
            </View>
        </Modal>
    );
}

// ─── Başarılar Modalı ─────────────────────────────────────────────────────────

function AchievementsModal({ visible, onClose, profileUserId, isOwnProfile, lang, cfg, onViewTournament }) {
    const [data, setData] = useState({ tournament: [], custom: [] });
    const [loading, setLoading] = useState(false);
    const [showAdd, setShowAdd] = useState(false);
    const [form, setForm] = useState({ title: '', description: '', achievedAt: '' });
    const [proofUri, setProofUri] = useState(null);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (visible && profileUserId) {
            setLoading(true);
            api.get(`/achievements/${profileUserId}`)
                .then(r => setData(r.data))
                .catch(() => {})
                .finally(() => setLoading(false));
        }
        if (!visible) { setShowAdd(false); setForm({ title: '', description: '', achievedAt: '' }); setProofUri(null); }
    }, [visible, profileUserId]);

    const pickProof = async () => {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) return Alert.alert('', lang === 'tr' ? 'Galeri izni gerekli' : lang === 'ru' ? 'Требуется доступ к галерее' : 'Gallery permission required');
        const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85 });
        if (!result.canceled) setProofUri(result.assets[0].uri);
    };

    const submit = async () => {
        if (!form.title.trim()) return Alert.alert('', lang === 'tr' ? 'Başlık zorunludur' : lang === 'ru' ? 'Заголовок обязателен' : 'Title is required');
        setSubmitting(true);
        try {
            let proofUrl = null;
            if (proofUri) {
                const fd = new FormData();
                fd.append('file', { uri: proofUri, name: 'proof.jpg', type: 'image/jpeg' });
                const { data: upData } = await api.post('/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
                proofUrl = upData.url;
            }
            const { data: newItem } = await api.post('/achievements', { ...form, proofUrl });
            setData(prev => ({ ...prev, custom: [newItem, ...prev.custom] }));
            setShowAdd(false);
            setForm({ title: '', description: '', achievedAt: '' });
            setProofUri(null);
        } catch (e) { Alert.alert('', e?.response?.data?.message || 'Hata'); }
        finally { setSubmitting(false); }
    };

    const remove = async (id) => {
        Alert.alert(lang === 'tr' ? 'Sil' : lang === 'ru' ? 'Удалить' : 'Delete', lang === 'tr' ? 'Bu başarıyı silmek istiyor musunuz?' : lang === 'ru' ? 'Удалить это достижение?' : 'Delete this achievement?', [
            { text: lang === 'tr' ? 'İptal' : lang === 'ru' ? 'Отмена' : 'Cancel', style: 'cancel' },
            { text: lang === 'tr' ? 'Sil' : lang === 'ru' ? 'Удалить' : 'Delete', style: 'destructive', onPress: async () => {
                try {
                    await api.delete(`/achievements/${id}`);
                    setData(prev => ({ ...prev, custom: prev.custom.filter(c => c.id !== id) }));
                } catch {}
            }},
        ]);
    };

    const tr = lang === 'tr';
    const ru = lang === 'ru';
    const color = cfg?.color || '#a855f7';

    return (
        <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
            <View style={{ flex: 1, backgroundColor: '#00000090', justifyContent: 'flex-end' }}>
                <View style={{ backgroundColor: '#1a1a2e', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '88%', paddingBottom: 33 }}>
                    {/* Header */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', padding: 15, borderBottomWidth: 1, borderBottomColor: '#ffffff10' }}>
                        <Text style={{ color: '#fff', fontSize: 16, fontWeight: '900', flex: 1 }}>🏆 {tr ? 'Başarılar' : ru ? 'Достижения' : 'Achievements'}</Text>
                        {isOwnProfile && !showAdd && (
                            <TouchableOpacity onPress={() => setShowAdd(true)}
                                style={{ backgroundColor: color + '20', borderRadius: 8, paddingHorizontal: 9, paddingVertical: 3, borderWidth: 1, borderColor: color + '50', marginRight: 10 }}>
                                <Text style={{ color, fontWeight: '800', fontSize: 12 }}>+ {tr ? 'Ekle' : ru ? 'Добавить' : 'Add'}</Text>
                            </TouchableOpacity>
                        )}
                        <TouchableOpacity onPress={onClose}><Text style={{ color: '#6b7280', fontSize: 22 }}>✕</Text></TouchableOpacity>
                    </View>

                    <ScrollView contentContainerStyle={{ padding: 15 }} showsVerticalScrollIndicator={false}>
                        {/* Başarı ekleme formu */}
                        {showAdd && (
                            <View style={{ backgroundColor: '#ffffff08', borderRadius: 14, padding: 11, marginBottom: 18, borderWidth: 1, borderColor: color + '40' }}>
                                <Text style={{ color, fontSize: 12, fontWeight: '800', marginBottom: 10 }}>✦ {tr ? 'Yeni Başarı Ekle' : ru ? 'Добавить достижение' : 'Add Achievement'}</Text>
                                <TextInput
                                    style={{ backgroundColor: '#ffffff10', borderRadius: 8, paddingHorizontal: 9, paddingVertical: 5, color: '#fff', fontSize: 13, borderWidth: 1, borderColor: '#ffffff20', marginBottom: 8 }}
                                    placeholder={tr ? 'Başlık *' : ru ? 'Заголовок *' : 'Title *'}
                                    placeholderTextColor="#6b7280"
                                    value={form.title}
                                    onChangeText={v => setForm(f => ({ ...f, title: v }))}
                                    maxLength={80}
                                />
                                <TextInput
                                    style={{ backgroundColor: '#ffffff10', borderRadius: 8, paddingHorizontal: 9, paddingVertical: 5, color: '#fff', fontSize: 13, borderWidth: 1, borderColor: '#ffffff20', marginBottom: 8, minHeight: 60, textAlignVertical: 'top' }}
                                    placeholder={tr ? 'Açıklama (isteğe bağlı)' : ru ? 'Описание (необязательно)' : 'Description (optional)'}
                                    placeholderTextColor="#6b7280"
                                    value={form.description}
                                    onChangeText={v => setForm(f => ({ ...f, description: v }))}
                                    multiline
                                    maxLength={300}
                                />
                                <TextInput
                                    style={{ backgroundColor: '#ffffff10', borderRadius: 8, paddingHorizontal: 9, paddingVertical: 5, color: '#fff', fontSize: 13, borderWidth: 1, borderColor: '#ffffff20', marginBottom: 10 }}
                                    placeholder={tr ? 'Tarih (ör. Haziran 2024)' : ru ? 'Дата (напр. Июнь 2024)' : 'Date (e.g. June 2024)'}
                                    placeholderTextColor="#6b7280"
                                    value={form.achievedAt}
                                    onChangeText={v => setForm(f => ({ ...f, achievedAt: v }))}
                                />
                                <TouchableOpacity onPress={pickProof}
                                    style={{ flexDirection: 'row', alignItems: 'center', gap: 3, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#ffffff20', borderStyle: 'dashed', backgroundColor: '#ffffff08', marginBottom: 12, justifyContent: 'center' }}>
                                    <Text style={{ fontSize: 16 }}>📎</Text>
                                    <Text style={{ color: proofUri ? '#4ade80' : '#6b7280', fontSize: 12, fontWeight: '700' }}>
                                        {proofUri ? (tr ? 'Belge seçildi ✓' : ru ? 'Файл выбран ✓' : 'Proof selected ✓') : (tr ? 'Belge / Fotoğraf Ekle' : ru ? 'Добавить файл / фото' : 'Add Proof / Photo')}
                                    </Text>
                                </TouchableOpacity>
                                {proofUri && <Image source={{ uri: proofUri }} style={{ width: '100%', height: 120, borderRadius: 10, marginBottom: 10 }} resizeMode="cover" />}
                                <View style={{ flexDirection: 'row', gap: 3 }}>
                                    <TouchableOpacity onPress={() => { setShowAdd(false); setForm({ title: '', description: '', achievedAt: '' }); setProofUri(null); }}
                                        style={{ flex: 1, paddingVertical: 7, borderRadius: 8, alignItems: 'center', backgroundColor: '#ffffff10' }}>
                                        <Text style={{ color: '#6b7280', fontWeight: '700' }}>{tr ? 'İptal' : ru ? 'Отмена' : 'Cancel'}</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity onPress={submit} disabled={submitting}
                                        style={{ flex: 2, paddingVertical: 7, borderRadius: 8, alignItems: 'center', backgroundColor: color, opacity: submitting ? 0.6 : 1 }}>
                                        <Text style={{ color: '#fff', fontWeight: '900' }}>{submitting ? '...' : (tr ? 'Kaydet' : ru ? 'Сохранить' : 'Save')}</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        )}

                        {loading ? (
                            <ActivityIndicator color={color} style={{ marginTop: 30 }} />
                        ) : (
                            <>
                                {/* Turnuva başarıları */}
                                {data.tournament.length > 0 && (
                                    <>
                                        <Text style={{ color: '#f59e0b', fontSize: 11, fontWeight: '800', letterSpacing: 1, marginBottom: 10 }}>
                                            🏅 {tr ? 'TURNUVA BAŞARILARI' : ru ? 'ТУРНИРНЫЕ ДОСТИЖЕНИЯ' : 'TOURNAMENT ACHIEVEMENTS'}
                                        </Text>
                                        {data.tournament.map((item, i) => (
                                            <TouchableOpacity key={i} activeOpacity={0.7}
                                                onPress={() => onViewTournament && onViewTournament(item)}
                                                style={{ backgroundColor: '#ffffff08', borderRadius: 12, padding: 9, marginBottom: 8, borderWidth: 1, borderColor: '#f59e0b30', flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                                                <Text style={{ fontSize: 32 }}>{item.medal}</Text>
                                                <View style={{ flex: 1 }}>
                                                    <Text style={{ color: '#fff', fontSize: 13, fontWeight: '800' }}>{item.name}</Text>
                                                    <Text style={{ color: '#f59e0b', fontSize: 11, fontWeight: '700', marginTop: 2 }}>
                                                        {item.placement === 1 ? (tr ? '1. Yer' : ru ? '1-е место' : '1st Place') : item.placement === 2 ? (tr ? '2. Yer' : ru ? '2-е место' : '2nd Place') : (tr ? '3. Yer' : ru ? '3-е место' : '3rd Place')}
                                                        {' · '}{getSubCategoryLabel(item.subCategory, lang)}
                                                    </Text>
                                                    {item.completedAt && (
                                                        <Text style={{ color: '#6b7280', fontSize: 10, marginTop: 2 }}>
                                                            {new Date(item.completedAt).toLocaleDateString(tr ? 'tr-TR' : ru ? 'ru-RU' : 'en-US', { month: 'long', year: 'numeric' })}
                                                        </Text>
                                                    )}
                                                </View>
                                                <Text style={{ color: '#f59e0b', fontSize: 16 }}>›</Text>
                                            </TouchableOpacity>
                                        ))}
                                        <View style={{ height: 1, backgroundColor: '#ffffff10', marginVertical: 14 }} />
                                    </>
                                )}

                                {/* Manuel başarılar */}
                                {data.custom.length > 0 && (
                                    <>
                                        <Text style={{ color: color, fontSize: 11, fontWeight: '800', letterSpacing: 1, marginBottom: 10 }}>
                                            ✦ {tr ? 'KİŞİSEL BAŞARILAR' : ru ? 'ЛИЧНЫЕ ДОСТИЖЕНИЯ' : 'PERSONAL ACHIEVEMENTS'}
                                        </Text>
                                        {data.custom.map(item => (
                                            <View key={item.id} style={{ backgroundColor: '#ffffff08', borderRadius: 12, padding: 9, marginBottom: 8, borderWidth: 1, borderColor: '#ffffff15' }}>
                                                <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                                                    <View style={{ flex: 1 }}>
                                                        <Text style={{ color: '#fff', fontSize: 13, fontWeight: '800' }}>🎯 {item.title}</Text>
                                                        {item.description ? <Text style={{ color: '#9ca3af', fontSize: 12, marginTop: 4, lineHeight: 17 }}>{item.description}</Text> : null}
                                                        {item.achievedAt ? <Text style={{ color: '#6b7280', fontSize: 10, marginTop: 4 }}>📅 {item.achievedAt}</Text> : null}
                                                    </View>
                                                    {isOwnProfile && (
                                                        <TouchableOpacity onPress={() => remove(item.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                                                            <Text style={{ color: '#ef4444', fontSize: 16 }}>🗑</Text>
                                                        </TouchableOpacity>
                                                    )}
                                                </View>
                                                {item.proofUrl && (
                                                    <TouchableOpacity onPress={() => Linking.openURL(item.proofUrl)} style={{ marginTop: 8 }}>
                                                        <Image source={{ uri: item.proofUrl }} style={{ width: '100%', height: 140, borderRadius: 8 }} resizeMode="cover" />
                                                        <Text style={{ color: color, fontSize: 10, fontWeight: '700', textAlign: 'center', marginTop: 4 }}>
                                                            {tr ? '📎 Belgeyi Aç' : ru ? '📎 Открыть файл' : '📎 Open Proof'}
                                                        </Text>
                                                    </TouchableOpacity>
                                                )}
                                            </View>
                                        ))}
                                    </>
                                )}

                                {data.tournament.length === 0 && data.custom.length === 0 && !showAdd && (
                                    <View style={{ alignItems: 'center', paddingVertical: 37 }}>
                                        <Text style={{ fontSize: 48, marginBottom: 12 }}>🏆</Text>
                                        <Text style={{ color: '#6b7280', fontSize: 14, fontWeight: '700', textAlign: 'center' }}>
                                            {tr ? 'Henüz başarı yok' : ru ? 'Пока нет достижений' : 'No achievements yet'}
                                        </Text>
                                        {isOwnProfile && (
                                            <Text style={{ color: '#4b5563', fontSize: 12, marginTop: 6, textAlign: 'center' }}>
                                                {tr ? '+ Ekle butonuyla kendi başarılarını paylaş' : ru ? 'Нажми + Добавить, чтобы поделиться своими достижениями' : 'Tap + Add to share your achievements'}
                                            </Text>
                                        )}
                                    </View>
                                )}
                            </>
                        )}
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
}

const fc = StyleSheet.create({
    card: { flex: 1, elevation: 20 },
    face: { flex: 1, backgroundColor: '#1a1a2e', paddingHorizontal: 0, paddingTop: 45 },
    backFace: { backgroundColor: '#0f0f1a', alignItems: 'center', justifyContent: 'center' },
    topRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 10, backgroundColor: '#ffffff08', borderRadius: 10, padding: 3, borderWidth: 1, borderColor: '#ffffff10', flexWrap: 'nowrap' },
    smallEmoji: { fontSize: 16 },
    smallSportName: { color: '#fff', fontSize: 10, fontWeight: '900', letterSpacing: 0.5, textTransform: 'uppercase' },
    miniStatBtn: { alignItems: 'center', backgroundColor: '#ffffff10', borderRadius: 6, paddingVertical: 0, paddingHorizontal: 0, borderWidth: 1, borderColor: '#ffffff15' },
    halfRow: { flexDirection: 'row', gap: 3, marginBottom: 3 },
    rightCol: { flex: 1, gap: 3 },
    actionCol: { flex: 1, gap: 3 },
    statCard: { backgroundColor: '#ffffff08', borderRadius: 8, paddingVertical: 0, paddingHorizontal: 0, alignItems: 'center', borderWidth: 1, borderColor: '#ffffff10', gap: 3 },
    statBigNum: { fontSize: 16, fontWeight: '900' },
    statSmLbl: { color: '#6b7280', fontSize: 7, fontWeight: '700', letterSpacing: 0.5 },
    actionBtn: { backgroundColor: '#ffffff08', borderRadius: 8, padding: 0, borderWidth: 1, borderColor: '#ffffff10' },
    actionTxt: { fontSize: 11, fontWeight: '700' },
    progressBox: { backgroundColor: '#ffffff06', borderRadius: 10, padding: 7, borderWidth: 1, borderColor: '#ffffff10', marginBottom: 10 },
    progressTrack: { height: 5, backgroundColor: '#ffffff15', borderRadius: 3, overflow: 'hidden' },
    progressFill: { height: 5, borderRadius: 3 },
    graphBox: { backgroundColor: '#ffffff06', borderRadius: 12, padding: 11, borderWidth: 1, borderColor: '#ffffff10' },
    btnRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', position: 'absolute', bottom: 28, left: 16, right: 16 },
    backBtn: { backgroundColor: '#ffffff10', borderRadius: 8, paddingHorizontal: 0, paddingVertical: 0, borderWidth: 1, borderColor: '#ffffff20' },
    backBtnText: { color: '#9ca3af', fontSize: 11, fontWeight: '700' },
    flipBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#a855f730', borderWidth: 1, borderColor: '#a855f760', justifyContent: 'center', alignItems: 'center' },
    flipBtnText: { fontSize: 13 },
    backLogo: { fontSize: 64, marginBottom: 12 },
    backTitle: { color: '#a855f7', fontSize: 20, fontWeight: '900', letterSpacing: 2, marginBottom: 8, textAlign: 'center' },
    anketSection: { marginTop: 8 },
    anketSectionTitle: { color: '#a855f7', fontSize: 10, fontWeight: '800', letterSpacing: 1, marginBottom: 6 },
    anketCard: { backgroundColor: '#ffffff06', borderRadius: 8, padding: 5, borderWidth: 1, borderColor: '#ffffff10', marginBottom: 6 },
    backPattern: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 3, marginBottom: 32, paddingHorizontal: 17 },
    backPatternEmoji: { fontSize: 32, opacity: 0.3 },
    backComingSoon: { color: '#a855f780', fontSize: 16, fontWeight: '700', letterSpacing: 3 },
});

// ─────────────────────────────────────────────────────────────────────────────

const SUB_EMOJI = {
    football:'⚽', basketball:'🏀', tennis:'🎾', padel:'🏓', volleyball:'🏐',
    swimming:'🏊', running:'🏃', cycling:'🚴', boxing:'🥊', martial_arts:'🥋', wellness:'🧘',
    music:'🎵', painting:'🎨', dance:'💃', photography:'📸', theater:'🎭',
    writing:'✍️', sculpture:'🗿', cinema:'🎬', poetry:'📜', illustration:'🖼️',
    fps:'🎯', rpg:'⚔️', strategy:'♟️', sports_games:'🎮', moba:'🏆',
    battle_royale:'💥', simulation:'🌍', puzzle:'🧩', racing:'🏎️', card_games:'🃏',
};

const MONTHS_TR = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
const MONTHS_RU = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];

function reservationMatchesSport(reservation, subCategory) {
    const b = (reservation?.venue?.branch || '').toLowerCase();
    const s = (subCategory || '').toLowerCase();
    if (s === 'tennis')     return b.includes('tenis') || b.includes('tennis');
    if (s === 'padel')      return b.includes('padel');
    if (s === 'football')   return b.includes('futbol') || b.includes('hali') || b.includes('halı');
    if (s === 'basketball') return b.includes('basketbol') || b.includes('basket');
    if (s === 'volleyball') return b.includes('voleybol') || b.includes('volley');
    if (s === 'badminton')  return b.includes('badminton');
    return b.includes(s);
}

function isReservActive(r) {
    if (r.status === 'CANCELLED') return false;
    const today = new Date().toISOString().slice(0, 10);
    if (r.date < today) return false;
    if (r.date === today && r.endTime) {
        const [h, m] = r.endTime.split(':').map(Number);
        const end = new Date(`${r.date}T${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00`);
        return end > new Date();
    }
    return true;
}
const MONTHS_EN = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const LEVEL_COLORS = { BEGINNER:'#4ade80', INTERMEDIATE:'#facc15', ADVANCED:'#fb923c', PRO:'#f87171' };

const ALL_BRANCHES = [
    { key: 'GENERAL',       label: '🌐 Genel',           category: 'SPORTS', subCategory: null,            isGeneral: true },
    { key: 'football',      label: '⚽ Futbol',           category: 'SPORTS', subCategory: 'football' },
    { key: 'basketball',    label: '🏀 Basketbol',        category: 'SPORTS', subCategory: 'basketball' },
    { key: 'tennis',        label: '🎾 Tenis',            category: 'SPORTS', subCategory: 'tennis' },
    { key: 'padel',         label: '🏓 Padel',            category: 'SPORTS', subCategory: 'padel' },
    { key: 'volleyball',    label: '🏐 Voleybol',         category: 'SPORTS', subCategory: 'volleyball' },
    { key: 'swimming',      label: '🏊 Yüzme',            category: 'SPORTS', subCategory: 'swimming' },
    { key: 'running',       label: '🏃 Koşu',             category: 'SPORTS', subCategory: 'running' },
    { key: 'cycling',       label: '🚴 Bisiklet',         category: 'SPORTS', subCategory: 'cycling' },
    { key: 'boxing',        label: '🥊 Boks',             category: 'SPORTS', subCategory: 'boxing' },
    { key: 'martial_arts',  label: '🥋 Dövüş Sanatları',  category: 'SPORTS', subCategory: 'martial_arts' },
    { key: 'wellness',      label: '🧘 Yoga/Pilates',     category: 'SPORTS', subCategory: 'wellness' },
    { key: 'table_tennis',      label: '🏓 Masa Tenisi',              category: 'SPORTS', subCategory: 'table_tennis' },
    { key: 'climbing',          label: '🧗 Tırmanış',                 category: 'SPORTS', subCategory: 'climbing' },
    { key: 'archery',           label: '🏹 Okçuluk',                  category: 'SPORTS', subCategory: 'archery' },
    { key: 'walking',           label: '🚶 Yürüyüş',                  category: 'SPORTS', subCategory: 'walking' },
    { key: 'foot_tennis',       label: '🦶 Ayak Tenisi',              category: 'SPORTS', subCategory: 'foot_tennis' },
    { key: 'sup_kano',          label: '🛶 Supboard ve Kano',         category: 'SPORTS', subCategory: 'sup_kano' },
    { key: 'handball',          label: '🤾 Hentbol',                  category: 'SPORTS', subCategory: 'handball' },
    { key: 'badminton',         label: '🏸 Badminton',                category: 'SPORTS', subCategory: 'badminton' },
    { key: 'shooting_hunting',  label: '🔫 Atıcılık ve Avcılık',      category: 'SPORTS', subCategory: 'shooting_hunting' },
    { key: 'equestrian',        label: '🐎 Binicilik',                category: 'SPORTS', subCategory: 'equestrian' },
    { key: 'golf',              label: '⛳ Golf',                     category: 'SPORTS', subCategory: 'golf' },
    { key: 'fitness_gym',       label: '🏋️ Fitness ve Gym',          category: 'SPORTS', subCategory: 'fitness_gym' },
    { key: 'skiing_snowboard',  label: '⛷️ Kayak ve Snowboard',       category: 'SPORTS', subCategory: 'skiing_snowboard' },
    { key: 'ice_skating',       label: '⛸️ Buz Pateni',               category: 'SPORTS', subCategory: 'ice_skating' },
    { key: 'hiking',            label: '🥾 Dağ Bayır Doğa Yürüyüşleri', category: 'SPORTS', subCategory: 'hiking' },
    { key: 'camping',           label: '🏕️ Kamp',                    category: 'SPORTS', subCategory: 'camping' },
    { key: 'motorcycle',        label: '🏍️ Sürüş (Motosiklet)',      category: 'SPORTS', subCategory: 'motorcycle' },
    { key: 'extreme_sports',    label: '🪂 Ekstrem Sporları',         category: 'SPORTS', subCategory: 'extreme_sports' },
    { key: 'paintball',         label: '🎯 Paintball',                category: 'SPORTS', subCategory: 'paintball' },
    { key: 'airsoft',           label: '🪖 Airsoft',                  category: 'SPORTS', subCategory: 'airsoft' },
    { key: 'music',         label: '🎵 Müzik',            category: 'ARTS',   subCategory: 'music' },
    { key: 'painting',      label: '🎨 Resim',            category: 'ARTS',   subCategory: 'painting' },
    { key: 'dance',         label: '💃 Dans',             category: 'ARTS',   subCategory: 'dance' },
    { key: 'photography',   label: '📸 Fotoğraf',         category: 'ARTS',   subCategory: 'photography' },
    { key: 'theater',       label: '🎭 Tiyatro',          category: 'ARTS',   subCategory: 'theater' },
    { key: 'writing',       label: '✍️ Yazarlık',         category: 'ARTS',   subCategory: 'writing' },
    { key: 'sculpture',     label: '🗿 Heykel',           category: 'ARTS',   subCategory: 'sculpture' },
    { key: 'cinema',        label: '🎬 Sinema',           category: 'ARTS',   subCategory: 'cinema' },
    { key: 'poetry',        label: '📜 Şiir',             category: 'ARTS',   subCategory: 'poetry' },
    { key: 'illustration',  label: '🖼️ İllüstrasyon',    category: 'ARTS',   subCategory: 'illustration' },
    { key: 'fps',           label: '🎯 FPS',              category: 'GAMES',  subCategory: 'fps' },
    { key: 'rpg',           label: '⚔️ RPG',              category: 'GAMES',  subCategory: 'rpg' },
    { key: 'strategy',      label: '♟️ Strateji',         category: 'GAMES',  subCategory: 'strategy' },
    { key: 'sports_games',  label: '🎮 Spor Oyunları',    category: 'GAMES',  subCategory: 'sports_games' },
    { key: 'moba',          label: '🏆 MOBA',             category: 'GAMES',  subCategory: 'moba' },
    { key: 'battle_royale', label: '💥 Battle Royale',    category: 'GAMES',  subCategory: 'battle_royale' },
    { key: 'simulation',    label: '🌍 Simülasyon',       category: 'GAMES',  subCategory: 'simulation' },
    { key: 'puzzle',        label: '🧩 Bulmaca',          category: 'GAMES',  subCategory: 'puzzle' },
    { key: 'racing',        label: '🏎️ Yarış',            category: 'GAMES',  subCategory: 'racing' },
    { key: 'card_games',    label: '🃏 Kart Oyunları',    category: 'GAMES',  subCategory: 'card_games' },
];

const SCREEN_W = Dimensions.get('window').width;
const GRID_GAP = 2;
const CELL_SIZE = (SCREEN_W - GRID_GAP * 2) / 3;

const PRIVACY_OPTIONS = [
    { key: 'PUBLIC',           label: '🌍 Herkese Açık' },
    { key: 'FRIENDS',          label: '👥 Sadece Arkadaşlarım' },
    { key: 'FOLLOWERS',        label: '🔔 Takipçilerim' },
    { key: 'FRIENDS_EXCEPT',   label: '🚫 Seçili Arkadaşlar Hariç' },
    { key: 'FRIENDS_SELECTED', label: '✅ Sadece Seçili Arkadaşlar' },
    { key: 'NOBODY',           label: '🔒 Kimseye Gösterme' },
];

function privacyEmoji(p) {
    if (p === 'PUBLIC')           return '🌍';
    if (p === 'FRIENDS')          return '👥';
    if (p === 'FOLLOWERS')        return '🔔';
    if (p === 'FRIENDS_EXCEPT')   return '🚫';
    if (p === 'FRIENDS_SELECTED') return '✅';
    if (p === 'NOBODY')           return '🔒';
    return '🔒';
}

function joinDate(str, lang) {
    if (!str) return '';
    const d = new Date(str);
    const months = lang === 'tr' ? MONTHS_TR : lang === 'ru' ? MONTHS_RU : MONTHS_EN;
    return `${months[d.getMonth()]} ${d.getFullYear()}`;
}

function calcAge(str) {
    if (!str) return null;
    const today = new Date();
    const b = new Date(str);
    let age = today.getFullYear() - b.getFullYear();
    if (today.getMonth() < b.getMonth() || (today.getMonth() === b.getMonth() && today.getDate() < b.getDate())) age--;
    return age;
}

function formatBirthDate(str) {
    if (!str) return '';
    const d = new Date(str);
    return `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`;
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function GradientAvatar({ name, avatar, size = 90, onPress, onAddStory, onArchive, onChangeAvatar, onAvatarZoom, onAvatarLongPress, onProfileInfo, storyRing }) {
    const ringColor = storyRing === 'unviewed' ? '#a855f7' : storyRing === 'viewed' ? '#4b5563' : null;
    return (
        <View style={{ position: 'relative', alignSelf: 'center' }}>
            <Pressable
                onPress={onAvatarZoom || onPress}
                onLongPress={onAvatarLongPress}
                delayLongPress={600}
                unstable_pressDelay={0}
            >
                {({ pressed }) => (
                    <View style={{ opacity: pressed ? 0.8 : 1 }}>
                        <View style={ringColor ? { width: size + 8, height: size + 8, borderRadius: (size + 8) / 2, backgroundColor: ringColor, justifyContent: 'center', alignItems: 'center' } : null}>
                            <View style={[s.avatarCircle, { width: size, height: size, borderRadius: size / 2, overflow: 'hidden' }]}>
                                {avatar
                                    ? <Image source={{ uri: avatar }} style={{ width: size, height: size }} resizeMode="cover" />
                                    : <Text style={[s.avatarLetter, { fontSize: size * 0.42 }]}>{name?.[0]?.toUpperCase() || '?'}</Text>
                                }
                            </View>
                        </View>
                    </View>
                )}
            </Pressable>
            {onChangeAvatar && (
                <TouchableOpacity style={s.avatarStarBadge} onPress={onChangeAvatar}>
                    <Text style={s.avatarStarText}>★</Text>
                </TouchableOpacity>
            )}
            {onAddStory && (
                <TouchableOpacity style={s.avatarPlusBadge} onPress={onAddStory}>
                    <Text style={s.avatarPlusText}>+</Text>
                </TouchableOpacity>
            )}
            {onArchive && (
                <TouchableOpacity style={s.avatarMinusBadge} onPress={onArchive}>
                    <Text style={s.avatarMinusText}>−</Text>
                </TouchableOpacity>
            )}
            {onProfileInfo && (
                <TouchableOpacity style={s.avatarSlashBadge} onPress={onProfileInfo}>
                    <Text style={s.avatarSlashText}>/</Text>
                </TouchableOpacity>
            )}
        </View>
    );
}

// ─── Stat Row ─────────────────────────────────────────────────────────────────

function StatRow({ emoji, label, count, onAdd, onPress }) {
    return (
        <TouchableOpacity style={s.statRow} onPress={onPress} activeOpacity={onPress ? 0.7 : 1}>
            <Text style={s.statRowEmoji}>{emoji}</Text>
            <Text style={s.statRowLabel}>{label}</Text>
            <View style={s.statRowBadge}>
                <Text style={s.statRowCount}>{count}</Text>
            </View>
            {onAdd && (
                <TouchableOpacity style={s.addBtn} onPress={onAdd}>
                    <Text style={s.addBtnText}>+</Text>
                </TouchableOpacity>
            )}
        </TouchableOpacity>
    );
}

// ─── Stat Card (compact, for side-by-side layout) ────────────────────────────

function StatCard({ emoji, label, count, onAdd, onPress }) {
    return (
        <TouchableOpacity style={s.statCard} onPress={onPress} activeOpacity={onPress ? 0.7 : 1} disabled={!onPress}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <Text style={s.statCardEmoji}>{emoji}</Text>
                {onAdd && (
                    <TouchableOpacity style={s.addBtnSm} onPress={onAdd}>
                        <Text style={s.addBtnText}>+</Text>
                    </TouchableOpacity>
                )}
            </View>
            <Text style={s.statCardCount}>{count}</Text>
            <Text style={s.statCardLabel}>{label}</Text>
        </TouchableOpacity>
    );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function ProfileScreen({ route, navigation }) {
    const insets = useSafeAreaInsets();
    const dispatch = useDispatch();
    const myUser = useSelector(s => s.auth.user);
    const lang = useSelector(s => s.lang?.lang || 'en');
    const t = useT();
    const targetUserId = route?.params?.userId;
    const isOwnProfile = !targetUserId || targetUserId === myUser?.id;

    const [profile, setProfile] = useState(null);
    const [interests, setInterests] = useState([]);
    const [cardModalItem, setCardModalItem] = useState(null);
    const [myReservations, setMyReservations] = useState([]);
    const [posts, setPosts] = useState([]);
    const [postCount, setPostCount] = useState(0);
    const [friendCount, setFriendCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [manageOpen, setManageOpen] = useState(false);
    const [showAdminPanel, setShowAdminPanel] = useState(false);
    const [permRequests, setPermRequests] = useState([]);
    const [loadingPerms, setLoadingPerms] = useState(false);
    const [friendStatus, setFriendStatus] = useState(null);
    const [followStatus, setFollowStatus] = useState({ outgoing: 'NONE', incoming: 'NONE' });
    const [followLoading, setFollowLoading] = useState(false);

    // Arkadaş ara & ekle modali
    const [showAddFriendModal, setShowAddFriendModal] = useState(false);
    const [friendSearchQuery, setFriendSearchQuery] = useState('');
    const [friendSearchResults, setFriendSearchResults] = useState([]);
    const [searchingFriends, setSearchingFriends] = useState(false);
    const [friendActionLoading, setFriendActionLoading] = useState(null); // `${userId}_${action}`

    const runFriendSearch = useCallback(async (q) => {
        if (!q || q.trim().length < 2) { setFriendSearchResults([]); return; }
        setSearchingFriends(true);
        try {
            const { data } = await api.get(`/users/search?q=${encodeURIComponent(q.trim())}`);
            setFriendSearchResults(Array.isArray(data) ? data : []);
        } catch { setFriendSearchResults([]); }
        finally { setSearchingFriends(false); }
    }, []);

    useEffect(() => {
        if (!showAddFriendModal) return;
        const task = setTimeout(() => runFriendSearch(friendSearchQuery), 400);
        return () => clearTimeout(task);
    }, [friendSearchQuery, showAddFriendModal, runFriendSearch]);

    const handleSendFriendRequest = async (targetUser) => {
        const key = `${targetUser.id}_friend`;
        setFriendActionLoading(key);
        try {
            await api.post(`/friends/request/${targetUser.id}`);
            Alert.alert('', `${targetUser.fullName || targetUser.username} kullanıcısına arkadaşlık isteği gönderildi.`);
        } catch (e) {
            Alert.alert('', e?.response?.data?.message || t.actionFailed);
        } finally { setFriendActionLoading(null); }
    };

    const handleFollow = async (targetUser) => {
        const key = `${targetUser.id}_follow`;
        setFriendActionLoading(key);
        try {
            await api.post(`/users/${targetUser.id}/follow`);
            Alert.alert('', `${targetUser.fullName || targetUser.username} kullanıcısına takip isteği gönderildi.`);
        } catch (e) {
            Alert.alert('', e?.response?.data?.message || t.actionFailed);
        } finally { setFriendActionLoading(null); }
    };

    const handleSendMessageRequest = async (targetUser) => {
        setShowAddFriendModal(false);
        try {
            const { data: conv } = await api.get(`/messages/conversation/${targetUser.id}`);
            const enriched = { ...conv, other: conv.user1Id === myUser?.id ? conv.user2 : conv.user1 };
            navigation.navigate('MessagesTab', { screen: 'Chat', params: { conversation: enriched, other: enriched.other } });
        } catch (e) {
            if (e?.response?.status === 403) {
                Alert.alert('', e.response.data?.message || 'Bu kullanıcı tarafından engellendiniz.');
            } else {
                Alert.alert('', t.actionFailed);
            }
        }
    };

    // Stories
    const [stories, setStories] = useState([]);
    const [archivedStories, setArchivedStories] = useState([]);
    const [storyViewIdx, setStoryViewIdx] = useState(null);
    const [storyProgress, setStoryProgress] = useState(0);
    const storyMusicRef = useRef(null);
    const goStoryNextRef = useRef(null);
    const [archiveOpen, setArchiveOpen] = useState(false);
    const [pickedMedia, setPickedMedia] = useState(null);
    const [storyBranch, setStoryBranch] = useState(null);
    const [createStoryOpen, setCreateStoryOpen] = useState(false);
    const [postingStory, setPostingStory] = useState(false);
    const [avatarZoomOpen, setAvatarZoomOpen] = useState(false);
    const [viewedStoryIds, setViewedStoryIds] = useState(new Set());
    const [storyViewers, setStoryViewers] = useState([]);

    // Reel count
    const [reelCount, setReelCount] = useState(0);
    const [reels, setReels] = useState([]);

    // Profil kartlarinin (Gonderiler/Reels/Arkadaslar/Aktiviteler) modal gorunumleri
    const [showPostsModal, setShowPostsModal] = useState(false);
    const [showReelsModal, setShowReelsModal] = useState(false);

    // Medya görüntüleyici (yorumlar + beğenenler)
    const [mediaViewerPost, setMediaViewerPost] = useState(null);
    const [mediaViewerComments, setMediaViewerComments] = useState([]);
    const [mediaCommentsHidden, setMediaCommentsHidden] = useState(false);
    const [loadingMediaComments, setLoadingMediaComments] = useState(false);
    const [mediaCommentText, setMediaCommentText] = useState('');
    const [sendingMediaComment, setSendingMediaComment] = useState(false);
    const [mediaHeartFlash, setMediaHeartFlash] = useState(false);
    const mediaLastTap = useRef(0);
    const [likersModalOpen, setLikersModalOpen] = useState(false);
    const [likersList, setLikersList] = useState([]);
    const [likersHidden, setLikersHidden] = useState(false);
    const [loadingLikers, setLoadingLikers] = useState(false);
    const [showFriendsListModal, setShowFriendsListModal] = useState(false);
    const [showActivitiesViewModal, setShowActivitiesViewModal] = useState(false);
    const [friendsList, setFriendsList] = useState([]);
    const [loadingFriendsList, setLoadingFriendsList] = useState(false);
    const [friendsModalTab, setFriendsModalTab] = useState('friends'); // 'friends' | 'following' | 'followers' | 'blocked'
    const [followingList, setFollowingList] = useState([]);
    const [followersList, setFollowersList] = useState([]);
    const [blockedList, setBlockedList] = useState([]);
    const [loadingBlockedList, setLoadingBlockedList] = useState(false);
    const [pendingFollowReqs, setPendingFollowReqs] = useState([]);
    const [loadingFollowLists, setLoadingFollowLists] = useState(false);

    // Create post/reel
    const [createReelOpen, setCreateReelOpen] = useState(false);
    const [reelMedia, setReelMedia] = useState(null);
    const [reelBranch, setReelBranch] = useState(null);
    const [postingReel, setPostingReel] = useState(false);

    // Personal info modal
    const [profileInfoOpen, setProfileInfoOpen] = useState(false);
    const [infoForm, setInfoForm] = useState({
        fullName: '', city: '', gender: '', birthDate: '',
        profilePrivacy: 'PUBLIC', profileExclude: [],
        fullNamePrivacy: 'PUBLIC', fullNameExclude: [],
        cityPrivacy: 'PUBLIC', genderPrivacy: 'PUBLIC', birthDatePrivacy: 'PUBLIC',
        cityExclude: [], genderExclude: [], birthDateExclude: [],
        postsPrivacy: 'PUBLIC', postsExclude: [],
        reelsPrivacy: 'PUBLIC', reelsExclude: [],
        friendsListPrivacy: 'PUBLIC', friendsListExclude: [],
        activitiesPrivacy: 'PUBLIC', activitiesExclude: [],
        likesCommentsPrivacy: 'PUBLIC', likesCommentsExclude: [],
        contactPhone: '', contactTelegram: '', contactEmail: '', contactInstagram: '',
        phonePrivacy: 'FRIENDS', phoneSelected: [],
        telegramPrivacy: 'FRIENDS', telegramSelected: [],
        cEmailPrivacy: 'FRIENDS', cEmailSelected: [],
        instagramPrivacy: 'PUBLIC', instagramSelected: [],
    });
    const [savingInfo, setSavingInfo] = useState(false);
    const [phoneCC, setPhoneCC]         = useState('+90');
    const [showCCPicker, setShowCCPicker] = useState(false);

    // Profil değişiklik talebi modal
    const [changeReqOpen, setChangeReqOpen] = useState(false);
    const [changeReqField, setChangeReqField] = useState(null); // 'fullName'|'gender'|'birthDate'
    const [changeReqNewValue, setChangeReqNewValue] = useState('');
    const [changeReqDocUrl, setChangeReqDocUrl] = useState('');
    const [changeReqDocName, setChangeReqDocName] = useState('');
    const [changeReqLoading, setChangeReqLoading] = useState(false);
    const [changeReqUploading, setChangeReqUploading] = useState(false);
    const [myChangeRequests, setMyChangeRequests] = useState([]);

    // Destek mesajı — kullanıcı isteği: konu bazlı sohbetler, bkz. paylaşılan SupportModal.
    const [supportOpen, setSupportOpen] = useState(false);
    const openSupport = () => setSupportOpen(true);

    const openChangeReq = async (field) => {
        setChangeReqField(field);
        setChangeReqNewValue('');
        setChangeReqDocUrl('');
        setChangeReqDocName('');
        setChangeReqOpen(true);
        try {
            const { data } = await api.get('/users/me/change-requests');
            setMyChangeRequests(data || []);
        } catch { /* silent */ }
    };

    const pickChangeReqDoc = async () => {
        try {
            const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (!perm.granted) return Alert.alert('', 'Galeri izni gerekli');
            const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85 });
            if (res.canceled || !res.assets?.[0]) return;
            const asset = res.assets[0];
            setChangeReqUploading(true);
            const form = new FormData();
            const ext = asset.uri.split('.').pop() || 'jpg';
            form.append('file', { uri: asset.uri, name: `belge.${ext}`, type: `image/${ext}` });
            const { data } = await api.post('/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } });
            setChangeReqDocUrl(data.url);
            setChangeReqDocName(`belge.${ext}`);
        } catch (e) { Alert.alert('', 'Belge yüklenemedi'); }
        finally { setChangeReqUploading(false); }
    };

    const submitChangeReq = async () => {
        if (!changeReqNewValue.trim()) return Alert.alert('', 'Yeni değer giriniz');
        if (!changeReqDocUrl) return Alert.alert('', 'Belge yüklemek zorunludur');
        setChangeReqLoading(true);
        try {
            await api.post('/users/me/change-requests', {
                field: changeReqField,
                newValue: changeReqNewValue.trim(),
                documentUrl: changeReqDocUrl,
            });
            Alert.alert('✅ Talep Gönderildi', 'Talebiniz yöneticiye iletildi. Onaylandıktan sonra bildirim alacaksınız.');
            setChangeReqOpen(false);
        } catch (e) { Alert.alert('', e?.response?.data?.message || 'Hata'); }
        finally { setChangeReqLoading(false); }
    };

    // Match modals
    const [showMyUpcoming, setShowMyUpcoming] = useState(false);
    const [showMyArchive, setShowMyArchive] = useState(false);
    const [upcomingSub, setUpcomingSub] = useState(null); // which sport's upcoming is open
    const [archiveSub, setArchiveSub] = useState(null); // which sport's archive is open
    const [archiveSubTab, setArchiveSubTab] = useState('rivals');
    const [myUpcoming, setMyUpcoming] = useState([]);
    const [myHistory, setMyHistory] = useState([]);
    const [myTournamentHistory, setMyTournamentHistory] = useState([]);
    const [loadingUpcoming, setLoadingUpcoming] = useState(false);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [loadingTournamentHistory, setLoadingTournamentHistory] = useState(false);
    const [selectedArchiveTournament, setSelectedArchiveTournament] = useState(null);
    const [archiveModalMatches, setArchiveModalMatches] = useState([]);
    const [archiveModalLoading, setArchiveModalLoading] = useState(false);
    const [archiveModalTab, setArchiveModalTab] = useState('details');

    // Alias editing (sport-specific display name)
    const [aliasEditId, setAliasEditId] = useState(null);
    const [aliasValue, setAliasValue] = useState('');
    const [savingAlias, setSavingAlias] = useState(false);

    const saveAlias = async (interestId) => {
        setSavingAlias(true);
        try {
            const { data } = await api.patch(`/interests/${interestId}/alias`, { alias: aliasValue });
            setInterests(prev => prev.map(i => i.id === interestId ? { ...i, alias: data.alias } : i));
            // Kullanıcı isteği: kaydedilen değişiklik ekrandan çıkıp tekrar girmeden ANINDA
            // yansımalı — cardModalItem, interests dizisinden bağımsız kendi kopyasını tuttuğu
            // için üstteki setInterests tek başına modaldeki görünümü güncellemiyordu.
            setCardModalItem(prev => (prev && prev.id === interestId) ? { ...prev, alias: data.alias } : prev);
            setAliasEditId(null);
        } catch (e) { Alert.alert(t.error, e?.response?.data?.message || t.actionFailed); }
        setSavingAlias(false);
    };

    // Data saver
    const [dataSaver, setDataSaver] = useState(false);

    const toggleDataSaver = useCallback(async () => {
        const next = !dataSaver;
        setDataSaver(next);
        await AsyncStorage.setItem('activity_data_saver', String(next));
    }, [dataSaver]);

    // Ek bildirim kanalı (WhatsApp/Telegram/SMS/E-posta) — kullanıcı isteği: uygulama içi
    // bildirimlere ek olarak dışarıdan bir kanaldan da otomatik mesaj alabilsin. Değerler
    // getProfile'ın owner-only bloğundan (bkz. user.controller.js) doğrudan redux user'a geliyor.
    const [notifyChannelModalOpen, setNotifyChannelModalOpen] = useState(false);
    const [savingNotifyChannel, setSavingNotifyChannel] = useState(false);
    const [linkingTelegram, setLinkingTelegram] = useState(false);

    const openNotifyChannelModal = async () => {
        setNotifyChannelModalOpen(true);
        // Telegram bağlama başka bir uygulamada (Telegram) tamamlandığı için modal her
        // açıldığında telegramLinked durumu tazelenir — yoksa "bağla" deyip döndükten sonra
        // hâlâ bağlı değilmiş gibi görünürdü.
        try {
            const { data } = await api.get('/users/me');
            dispatch(setUser({ ...myUser, ...data }));
        } catch { /* sessizce yut — modal zaten mevcut redux değerleriyle açıldı */ }
    };

    const saveNotifyChannel = async (channel, phone, email) => {
        setSavingNotifyChannel(true);
        try {
            const { data } = await api.patch('/users/me/notify-channel', { channel, phone, email });
            dispatch(setUser({ ...myUser, ...data }));
            setNotifyChannelModalOpen(false);
        } catch (e) { Alert.alert(t.error || 'Hata', e?.response?.data?.message || t.actionFailed); }
        setSavingNotifyChannel(false);
    };

    const linkTelegram = async () => {
        setLinkingTelegram(true);
        try {
            const { data } = await api.post('/telegram/link-token');
            if (!data.botConfigured || !data.deepLink) {
                Alert.alert(t.info || 'Bilgi', t.extraNotifyTelegramNotReady);
            } else {
                Linking.openURL(data.deepLink);
            }
        } catch (e) { Alert.alert(t.error || 'Hata', e?.response?.data?.message || t.actionFailed); }
        setLinkingTelegram(false);
    };

    const unlinkTelegram = async () => {
        setLinkingTelegram(true);
        try {
            await api.post('/telegram/unlink');
            dispatch(setUser({ ...myUser, telegramLinked: false }));
        } catch (e) { Alert.alert(t.error || 'Hata', e?.response?.data?.message || t.actionFailed); }
        setLinkingTelegram(false);
    };

    const openMyUpcoming = (subCategory = null) => {
        setUpcomingSub(subCategory);
        setShowMyUpcoming(true);
    };

    const openMyArchive = async (subCategory = null) => {
        setArchiveSub(subCategory);
        setArchiveSubTab('rivals');
        setShowMyArchive(true);
        const loads = [];
        if (myHistory.length === 0) {
            setLoadingHistory(true);
            loads.push(
                api.get('/rivals/my-history')
                    .then(res => setMyHistory(res.data || []))
                    .catch(() => {})
                    .finally(() => setLoadingHistory(false))
            );
        }
        if (myTournamentHistory.length === 0) {
            setLoadingTournamentHistory(true);
            const params = new URLSearchParams({ participantId: userId });
            if (subCategory) { params.set('subCategory', subCategory); }
            loads.push(
                api.get(`/tournaments/archived?${params.toString()}`)
                    .then(res => setMyTournamentHistory(Array.isArray(res.data) ? res.data : []))
                    .catch(() => {})
                    .finally(() => setLoadingTournamentHistory(false))
            );
        }
        await Promise.all(loads);
    };

    useEffect(() => {
        if (!selectedArchiveTournament) { setArchiveModalMatches([]); return; }
        setArchiveModalTab('details');
        setArchiveModalLoading(true);
        api.get(`/tournaments/${selectedArchiveTournament.id}/matches`)
            .then(res => setArchiveModalMatches(Array.isArray(res.data?.matches) ? res.data.matches : []))
            .catch(() => setArchiveModalMatches([]))
            .finally(() => setArchiveModalLoading(false));
    }, [selectedArchiveTournament?.id]);

    // City picker (profile edit)
    const [showCityPickerProfile, setShowCityPickerProfile] = useState(false);

    // Privacy picker
    const [privacyPickerField, setPrivacyPickerField] = useState(null); // 'city'|'gender'|'birthDate'
    const [excludePickerField, setExcludePickerField] = useState(null);
    const [friends, setFriends] = useState([]);
    const [loadingFriends, setLoadingFriends] = useState(false);

    const userId = targetUserId || myUser?.id;

    // Gizlilik liste seçici hangi yoldan açılırsa açılsın arkadaş listesini yüklesin
    useEffect(() => {
        if (!excludePickerField || friends.length > 0) return;
        setLoadingFriends(true);
        api.get('/friends')
            .then(({ data }) => setFriends(Array.isArray(data) ? data : []))
            .catch(() => {})
            .finally(() => setLoadingFriends(false));
    }, [excludePickerField]);

    // Karşı taraf arkadaşlık isteğine kabul/red verince, bu profil açıksa sayfa yenilemeden güncelle
    useEffect(() => {
        if (isOwnProfile) return;
        const off = onSocket('friend:status_changed', (data) => {
            if (data.otherUserId !== userId) return;
            setFriendStatus({ status: data.status, isSender: true, friendshipId: data.friendshipId });
            if (data.status === 'ACCEPTED') setFriendCount(c => c + 1);
        });
        return off;
    }, [userId, isOwnProfile]);

    const openFriendsList = useCallback(async () => {
        setShowFriendsListModal(true);
        setFriendsModalTab('friends');
        setLoadingFriendsList(true);
        try {
            const { data } = await api.get(isOwnProfile ? '/friends' : `/friends/list/${userId}`);
            setFriendsList(Array.isArray(data) ? data : []);
        } catch { setFriendsList([]); }
        finally { setLoadingFriendsList(false); }
    }, [isOwnProfile, userId]);

    const loadFollowTab = useCallback(async (tab) => {
        setLoadingFollowLists(true);
        try {
            if (tab === 'following') {
                const { data } = await api.get(`/users/${userId}/following`);
                setFollowingList(Array.isArray(data) ? data : []);
            } else if (tab === 'followers') {
                const reqs = isOwnProfile ? await api.get('/users/follow-requests').catch(() => ({ data: [] })) : { data: [] };
                setPendingFollowReqs(Array.isArray(reqs.data) ? reqs.data : []);
                const { data } = await api.get(`/users/${userId}/followers`);
                setFollowersList(Array.isArray(data) ? data : []);
            }
        } catch { /* silent */ }
        finally { setLoadingFollowLists(false); }
    }, [userId, isOwnProfile]);

    const loadBlockedList = useCallback(async () => {
        setLoadingBlockedList(true);
        try {
            const { data } = await api.get('/friends/blocked');
            setBlockedList(Array.isArray(data) ? data : []);
        } catch { setBlockedList([]); }
        finally { setLoadingBlockedList(false); }
    }, []);

    const handleUnblockUser = (blockedUser) => {
        Alert.alert('Engeli Kaldır', `${blockedUser.fullName || blockedUser.username} adlı kullanıcının engeli kaldırılsın mı?`, [
            { text: 'Vazgeç', style: 'cancel' },
            { text: 'Kaldır', onPress: async () => {
                try {
                    await api.delete(`/friends/block/${blockedUser.id}`);
                    setBlockedList(prev => prev.filter(u => u.id !== blockedUser.id));
                } catch (e) { console.warn(e?.message); }
            } },
        ]);
    };

    const switchFriendsModalTab = (tab) => {
        setFriendsModalTab(tab);
        if (tab === 'blocked') loadBlockedList();
        else if (tab !== 'friends') loadFollowTab(tab);
    };

    const handleRespondFollowReqInList = async (req, action) => {
        try {
            await api.patch(`/users/${req.id}/follow`, { action });
            setPendingFollowReqs(prev => prev.filter(r => r.id !== req.id));
            if (action === 'accept') {
                setFollowersList(prev => [req, ...prev]);
            }
        } catch (e) { console.warn(e?.message); }
    };

    const handleRemoveFollower = (followerUser) => {
        Alert.alert('Takipçi Kaldır', `${followerUser.fullName || followerUser.username} takipçilikten kaldırılsın mı?`, [
            { text: t.cancelBtn || 'Vazgeç', style: 'cancel' },
            { text: t.yes || 'Evet', style: 'destructive', onPress: async () => {
                try {
                    await api.delete(`/users/${followerUser.id}/follower`);
                    setFollowersList(prev => prev.filter(f => f.id !== followerUser.id));
                } catch (e) { console.warn(e?.message); }
            } },
        ]);
    };

    const handleUnfollowFromList = (followingUser) => {
        Alert.alert('Takibi Bırak', `${followingUser.fullName || followingUser.username} takipten çıkarılsın mı?`, [
            { text: t.cancelBtn || 'Vazgeç', style: 'cancel' },
            { text: t.yes || 'Evet', style: 'destructive', onPress: async () => {
                try {
                    await api.delete(`/users/${followingUser.id}/follow`);
                    setFollowingList(prev => prev.filter(f => f.id !== followingUser.id));
                } catch (e) { console.warn(e?.message); }
            } },
        ]);
    };

    const handleRemoveFriendFromList = (friendUser) => {
        Alert.alert(t.friendsBtn || 'Arkadaşlıktan Çık', `${friendUser.fullName || friendUser.username} arkadaşlıktan çıkarılsın mı?`, [
            { text: t.cancelBtn || 'Vazgeç', style: 'cancel' },
            { text: t.yes || 'Evet', style: 'destructive', onPress: async () => {
                try {
                    await api.delete(`/friends/unfriend/${friendUser.id}`);
                    setFriendsList(prev => prev.filter(f => f.id !== friendUser.id));
                    setFriendCount(c => Math.max(0, c - 1));
                    if (friendUser.id === userId) setFriendStatus({ status: 'NONE' });
                } catch (e) { console.warn(e?.message); }
            } },
        ]);
    };

    // Benim Aktivitelerim kartındaki "⋮" menüsü — gizle (soner) / göster (addInterest'in
    // upsert'i hidden:false yapıp puan/geçmişi koruyarak geri getirir). Gizliyken o dalda
    // ilan açma/katılma backend'de (requireActiveInterest) zaten engelleniyor.
    const toggleHideInterest = async (interest) => {
        try {
            if (interest.hidden) {
                await api.post('/interests/add', { category: interest.category, subCategory: interest.subCategory });
            } else {
                await api.patch(`/interests/${interest.id}/hide`);
            }
            setInterests(prev => prev.map(x => x.id === interest.id ? { ...x, hidden: !interest.hidden } : x));
        } catch (e) {
            Alert.alert('', e?.response?.data?.message || 'İşlem yapılamadı');
        }
    };

    useEffect(() => {
        const load = async () => {
            try {
                const [profileRes, intRes, storiesRes, reelsRes, postsRes, upcomingRes, historyRes, reservationsRes] = await Promise.all([
                    api.get(isOwnProfile ? '/auth/me' : `/users/${userId}`),
                    api.get(isOwnProfile ? '/interests/my?includeHidden=true' : `/interests/user/${userId}`).catch(() => ({ data: [] })),
                    api.get(`/posts/user/${userId}?type=STORY`).catch(() => ({ data: [] })),
                    api.get(`/posts/user/${userId}?type=REEL`).catch(() => ({ data: [] })),
                    api.get(`/posts/user/${userId}?type=POST`).catch(() => ({ data: [] })),
                    isOwnProfile ? api.get('/rivals/my-upcoming').catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
                    isOwnProfile ? api.get('/rivals/my-history').catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
                    isOwnProfile ? api.get('/venues/reservations/mine').catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
                ]);
                setProfile(profileRes.data);
                setInterests(intRes.data);
                if (isOwnProfile) setMyReservations(Array.isArray(reservationsRes.data) ? reservationsRes.data : []);
                setStories(storiesRes.data);
                const reelsList = Array.isArray(reelsRes.data) ? reelsRes.data : [];
                setReels(reelsList);
                setReelCount(reelsList.length);
                const postsList = Array.isArray(postsRes.data) ? postsRes.data : [];
                setPosts(postsList);
                setPostCount(postsList.length);
                const alreadyViewed = new Set(
                    (storiesRes.data || []).filter(s => s.viewedByMe).map(s => s.id)
                );
                setViewedStoryIds(alreadyViewed);
                setFriendCount(profileRes.data?.friendCount || (profileRes.data?._count?.sentFriendReqs || 0) + (profileRes.data?._count?.receivedFriendReqs || 0));
                if (isOwnProfile) {
                    const p = profileRes.data;
                    const bd = p?.birthDate ? new Date(p.birthDate) : null;
                    setInfoForm({
                        fullName:         p?.fullName         || '',
                        city:             p?.city             || '',
                        gender:           p?.gender           || '',
                        birthDate: bd ? `${bd.getDate()}.${bd.getMonth() + 1}.${bd.getFullYear()}` : '',
                        profilePrivacy:   p?.profilePrivacy   || 'PUBLIC',
                        profileExclude:   p?.profileExclude   || [],
                        fullNamePrivacy:  p?.fullNamePrivacy  || 'PUBLIC',
                        fullNameExclude:  p?.fullNameExclude  || [],
                        cityPrivacy:      p?.cityPrivacy      || 'PUBLIC',
                        genderPrivacy:    p?.genderPrivacy    || 'PUBLIC',
                        birthDatePrivacy: p?.birthDatePrivacy || 'PUBLIC',
                        cityExclude:      p?.cityExclude      || [],
                        genderExclude:    p?.genderExclude    || [],
                        birthDateExclude: p?.birthDateExclude || [],
                        postsPrivacy:       p?.postsPrivacy       || 'PUBLIC',
                        postsExclude:       p?.postsExclude       || [],
                        reelsPrivacy:       p?.reelsPrivacy       || 'PUBLIC',
                        reelsExclude:       p?.reelsExclude       || [],
                        friendsListPrivacy: p?.friendsListPrivacy || 'PUBLIC',
                        friendsListExclude: p?.friendsListExclude || [],
                        activitiesPrivacy:  p?.activitiesPrivacy  || 'PUBLIC',
                        activitiesExclude:  p?.activitiesExclude  || [],
                        likesCommentsPrivacy: p?.likesCommentsPrivacy || 'PUBLIC',
                        likesCommentsExclude: p?.likesCommentsExclude || [],
                        contactPhone:    (() => {
                            const raw = p?.contactPhone || '';
                            if (raw) {
                                // Extract country code from saved full number
                                const sorted = [...COUNTRY_CODES].sort((a, b) => b.code.length - a.code.length);
                                const match = sorted.find(c => raw.startsWith(c.code));
                                if (match) {
                                    setPhoneCC(match.code);
                                    return raw.slice(match.code.length);
                                }
                            }
                            return raw;
                        })(),
                        contactTelegram: p?.contactTelegram || '',
                        contactEmail:    p?.contactEmail    || '',
                        contactInstagram:p?.contactInstagram|| '',
                        phonePrivacy:    p?.phonePrivacy    || 'FRIENDS',
                        phoneSelected:   p?.phoneSelected   || [],
                        telegramPrivacy: p?.telegramPrivacy || 'FRIENDS',
                        telegramSelected:p?.telegramSelected|| [],
                        cEmailPrivacy:   p?.cEmailPrivacy   || 'FRIENDS',
                        cEmailSelected:  p?.cEmailSelected  || [],
                        instagramPrivacy:p?.instagramPrivacy|| 'PUBLIC',
                        instagramSelected:p?.instagramSelected||[],
                    });
                }
                if (isOwnProfile && Array.isArray(upcomingRes.data)) setMyUpcoming(upcomingRes.data);
                if (isOwnProfile && Array.isArray(historyRes.data)) setMyHistory(historyRes.data);
                if (isOwnProfile) dispatch(setUser(profileRes.data));
                if (!isOwnProfile) {
                    api.get(`/friends/status/${userId}`)
                        .then(({ data }) => setFriendStatus({ status: data.status || 'NONE', isSender: data.isSender, friendshipId: data.friendshipId }))
                        .catch(() => setFriendStatus({ status: 'NONE' }));
                    api.get(`/users/${userId}/follow-status`)
                        .then(({ data }) => setFollowStatus({ outgoing: data.outgoing?.status || 'NONE', incoming: data.incoming?.status || 'NONE' }))
                        .catch(() => {});
                }
            } catch (e) { console.warn(e?.message); }
            finally { setLoading(false); }
        };
        load();
    }, [userId]);

    useEffect(() => {
        const unsubscribe = navigation.addListener('focus', () => {
            api.get(`/posts/user/${userId}?type=POST`).then(({ data }) => {
                if (Array.isArray(data)) { setPosts(data); setPostCount(data.length); }
            }).catch(() => {});
            api.get(`/posts/user/${userId}?type=REEL`).then(({ data }) => {
                if (Array.isArray(data)) { setReels(data); setReelCount(data.length); }
            }).catch(() => {});
            api.get(`/posts/user/${userId}?type=STORY`).then(({ data }) => {
                if (Array.isArray(data)) setStories(data);
            }).catch(() => {});
            api.get(isOwnProfile ? '/auth/me' : `/users/${userId}`).then(({ data }) => {
                setProfile(data);
                if (isOwnProfile) dispatch(setUser(data));
            }).catch(() => {});
            // Kullanıcı raporu: başka bir ekranda (ör. ilan oluşturma sırasında açılan anket
            // gate'i) tamamlanan bir değerlendirme, profile dönüldüğünde hâlâ eski (bayat)
            // ELO puanını gösteriyordu — bu ekrandaki diğer sekmeler gibi interests de her
            // focus'ta tazeleniyor artık.
            api.get(isOwnProfile ? '/interests/my?includeHidden=true' : `/interests/user/${userId}`).then(({ data }) => {
                if (Array.isArray(data)) setInterests(data);
            }).catch(() => {});
            if (!isOwnProfile) {
                api.get(`/friends/status/${userId}`)
                    .then(({ data }) => setFriendStatus({ status: data.status || 'NONE', isSender: data.isSender, friendshipId: data.friendshipId }))
                    .catch(() => {});
                api.get(`/users/${userId}/follow-status`)
                    .then(({ data }) => setFollowStatus({ outgoing: data.outgoing?.status || 'NONE', incoming: data.incoming?.status || 'NONE' }))
                    .catch(() => {});
            }
        });
        return unsubscribe;
    }, [navigation, userId, isOwnProfile]);

    const goStoryNext = useCallback(() => {
        if (storyViewIdx !== null && storyViewIdx < stories.length - 1) {
            const newIdx = storyViewIdx + 1;
            setStoryViewIdx(newIdx);
            setViewedStoryIds(prev => new Set([...prev, stories[newIdx].id]));
            api.post(`/posts/${stories[newIdx].id}/view`).catch(() => {});
            if (isOwnProfile) {
                api.get(`/posts/${stories[newIdx].id}/views`)
                    .then(r => setStoryViewers(r.data)).catch(() => setStoryViewers([]));
            }
        } else {
            setStoryViewIdx(null);
        }
    }, [storyViewIdx, stories, isOwnProfile]);

    const goStoryPrev = useCallback(() => {
        if (storyViewIdx !== null && storyViewIdx > 0) {
            const newIdx = storyViewIdx - 1;
            setStoryViewIdx(newIdx);
            if (isOwnProfile) {
                api.get(`/posts/${stories[newIdx].id}/views`)
                    .then(r => setStoryViewers(r.data)).catch(() => setStoryViewers([]));
            }
        }
    }, [storyViewIdx, stories, isOwnProfile]);

    useEffect(() => { goStoryNextRef.current = goStoryNext; }, [goStoryNext]);

    useEffect(() => {
        if (storyViewIdx === null) return;
        setStoryProgress(0);
        const story = stories[storyViewIdx];
        const duration = story?.musicName
            ? Math.max(1000, ((story.musicEndTime || 15) - (story.musicStartTime || 0)) * 1000)
            : 15000;
        const TICK = 100;
        const interval = setInterval(() => {
            setStoryProgress(p => {
                const next = p + TICK / duration;
                if (next >= 1) { clearInterval(interval); goStoryNextRef.current?.(); return 1; }
                return next;
            });
        }, TICK);
        let stopTimeout;
        const startMs = (story?.musicStartTime || 0) * 1000;
        const endMs = (story?.musicEndTime || 30) * 1000;
        if (story?.musicUrl) {
            Audio.setAudioModeAsync({ playsInSilentModeIOS: true })
                .then(() => Audio.Sound.createAsync({ uri: story.musicUrl }, { shouldPlay: true, positionMillis: startMs }))
                .then(({ sound }) => {
                    storyMusicRef.current = sound;
                    stopTimeout = setTimeout(() => sound.stopAsync().catch(() => {}), endMs - startMs + 500);
                }).catch(() => {});
        }
        return () => {
            clearInterval(interval);
            if (stopTimeout) clearTimeout(stopTimeout);
            storyMusicRef.current?.stopAsync().catch(() => {});
            storyMusicRef.current?.unloadAsync().catch(() => {});
            storyMusicRef.current = null;
        };
    }, [storyViewIdx]);

    const handleToggleFollow = async () => {
        setFollowLoading(true);
        try {
            if (followStatus.outgoing === 'ACCEPTED' || followStatus.outgoing === 'PENDING') {
                await api.delete(`/users/${userId}/follow`);
                setFollowStatus(s => ({ ...s, outgoing: 'NONE' }));
            } else {
                await api.post(`/users/${userId}/follow`);
                setFollowStatus(s => ({ ...s, outgoing: 'PENDING' }));
            }
        } catch (e) {
            Alert.alert('', e?.response?.data?.message || t.actionFailed);
        } finally { setFollowLoading(false); }
    };

    const handleRespondFollowRequest = async (action) => {
        try {
            await api.patch(`/users/${userId}/follow`, { action });
            setFollowStatus(s => ({ ...s, incoming: action === 'accept' ? 'ACCEPTED' : 'REJECTED' }));
        } catch (e) { console.warn(e?.message); }
    };

    const handleLogout = () => {
        // Clear the server-side push token first — otherwise this device keeps
        // receiving push notifications meant for this account after switching users.
        const clearPushToken = () => api.post('/auth/logout').catch(() => {});
        Alert.alert(t.logoutTitle, t.logoutMsg, [
            { text: t.cancelBtn, style: 'cancel' },
            { text: t.logoutAction, style: 'destructive', onPress: async () => { await clearPushToken(); dispatch(logout()); } },
            { text: t.logoutForget, style: 'destructive', onPress: async () => {
                await AsyncStorage.removeItem('activity_saved_email');
                await AsyncStorage.removeItem('activity_saved_pass');
                await clearPushToken();
                dispatch(logout());
            }},
        ]);
    };

    const openAdminPanel = async () => {
        setShowAdminPanel(true);
        setLoadingPerms(true);
        try {
            const { data } = await api.get('/admin/tournament-permissions');
            setPermRequests(data);
        } catch { setPermRequests([]); }
        finally { setLoadingPerms(false); }
    };

    // Opened from a "Turnuva İzin Talebi" notification tap
    useEffect(() => {
        if (route?.params?.openTournamentPermissions) {
            openAdminPanel();
            navigation.setParams({ openTournamentPermissions: undefined });
        }
    }, [route?.params?.openTournamentPermissions]);

    // Batak/Okey gibi oyunlar "aktivite ekle" akışını buraya yönlendiriyor ki
    // ekleme profil üzerinden olsun ve seviye testi (assessment) hiç atlanmasın.
    useEffect(() => {
        if (route?.params?.openManageActivities) {
            setManageOpen(true);
            navigation.setParams({ openManageActivities: undefined });
        }
    }, [route?.params?.openManageActivities]);

    const handlePermApprove = async (userId) => {
        try {
            await api.patch(`/admin/tournament-permissions/${userId}/approve`);
            setPermRequests(prev => prev.filter(r => r.userId !== userId));
        } catch (e) { Alert.alert('', e?.response?.data?.message || 'Hata'); }
    };

    const handlePermReject = async (userId) => {
        try {
            await api.patch(`/admin/tournament-permissions/${userId}/reject`);
            setPermRequests(prev => prev.filter(r => r.userId !== userId));
        } catch (e) { Alert.alert('', e?.response?.data?.message || 'Hata'); }
    };

    const handleChangeAvatar = () => {
        const pickAndUpload = async () => {
            const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (!perm.granted) { Alert.alert('İzin gerekli', 'Galeri erişimine izin verin.'); return; }
            const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85, allowsEditing: true, aspect: [1, 1] });
            if (result.canceled) return;
            const uri = result.assets[0].uri;
            try {
                const formData = new FormData();
                formData.append('file', { uri, type: 'image/jpeg', name: 'avatar.jpg' });
                const { data: uploadData } = await api.post('/upload', formData, {
                    headers: { 'Content-Type': 'multipart/form-data' },
                });
                const serverUrl = uploadData.url;
                await api.post('/users/me', { avatar: serverUrl });
                setProfile(p => ({ ...p, avatar: serverUrl }));
                dispatch(setUser({ ...profile, avatar: serverUrl }));
            } catch (e) { console.warn(e?.message); Alert.alert('Hata', 'Profil resmi yüklenemedi.'); }
        };
        Alert.alert(
            'Profil Resmi',
            'Galeriden fotoğraf seçerek profil resminizi değiştirebilirsiniz.',
            [
                { text: 'İptal', style: 'cancel' },
                { text: 'Fotoğraf Seç', onPress: pickAndUpload },
            ]
        );
    };

    const handleAddStory = () => {
        const pickMedia = async () => {
            const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (!perm.granted) { Alert.alert('İzin gerekli', 'Galeri erişimine izin verin.'); return; }
            const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], quality: 0.8 });
            if (result.canceled) return;
            const asset = result.assets[0];
            setPickedMedia({ uri: asset.uri, type: asset.type === 'video' ? 'video' : 'image' });
            setStoryBranch(interests.length > 0 ? { category: interests[0].category, subCategory: interests[0].subCategory } : null);
            setCreateStoryOpen(true);
        };
        Alert.alert(
            '📸 Hikaye Paylaş',
            'Paylaştığınız fotoğraf veya video 24 saat sonra otomatik olarak arşive taşınır.',
            [
                { text: 'İptal', style: 'cancel' },
                { text: 'Galeriden Seç', onPress: pickMedia },
            ]
        );
    };

    const handlePostStory = async () => {
        if (!pickedMedia || !storyBranch) return;
        setPostingStory(true);
        try {
            const uploadedUrl = await uploadMedia(pickedMedia);
            await api.post('/posts', {
                type: 'STORY',
                category: storyBranch.category,
                subCategory: storyBranch.subCategory,
                content: '',
                imageUrl: pickedMedia.type === 'image' ? uploadedUrl : null,
                videoUrl: pickedMedia.type === 'video' ? uploadedUrl : null,
                targets: [{ category: storyBranch.category, subCategory: storyBranch.subCategory }],
            });
            setCreateStoryOpen(false);
            setPickedMedia(null);
            setStoryBranch(null);
            const { data } = await api.get(`/posts/user/${userId}?type=STORY`);
            setStories(data);
        } catch (e) { console.warn(e?.message); }
        finally { setPostingStory(false); }
    };

    const handleOpenArchive = async () => {
        try {
            const { data } = await api.get(`/posts/user/${userId}?type=STORY&archive=true`);
            setArchivedStories(data);
        } catch {}
        setArchiveOpen(true);
    };

    const openProfileInfo = async () => {
        setProfileInfoOpen(true);
        AsyncStorage.getItem('activity_data_saver').then(v => setDataSaver(v === 'true'));
        if (friends.length === 0) {
            setLoadingFriends(true);
            try {
                const { data } = await api.get('/friends');
                setFriends(data);
            } catch {}
            setLoadingFriends(false);
        }
    };

    const handleCreatePost = () => {
        navigation.navigate('CreatePost');
    };

    const uploadMedia = async (media) => {
        const filename = media.uri.split('/').pop();
        const ext = filename.split('.').pop()?.toLowerCase() || '';
        const mimeType = media.type === 'video'
            ? (ext === 'mov' ? 'video/quicktime' : `video/${ext || 'mp4'}`)
            : `image/${ext || 'jpeg'}`;
        const formData = new FormData();
        formData.append('file', { uri: media.uri, type: mimeType, name: filename });
        const { data } = await api.post('/upload', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
        });
        return data.url;
    };

    const handleCreateReel = () => {
        const pickAndOpen = async () => {
            const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (!perm.granted) { Alert.alert('İzin gerekli', 'Galeri erişimine izin verin.'); return; }
            const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], quality: 0.8 });
            if (result.canceled) return;
            const asset = result.assets[0];
            setReelMedia({ uri: asset.uri, type: asset.type === 'video' ? 'video' : 'image' });
            setReelBranch(interests.length > 0 ? { category: interests[0].category, subCategory: interests[0].subCategory } : null);
            setCreateReelOpen(true);
        };
        pickAndOpen();
    };

    const handlePostReel = async () => {
        if (!reelMedia || !reelBranch) return;
        setPostingReel(true);
        try {
            const uploadedUrl = await uploadMedia(reelMedia);
            await api.post('/posts', {
                type: 'REEL',
                category: reelBranch.category,
                subCategory: reelBranch.subCategory,
                content: '',
                imageUrl: reelMedia.type === 'image' ? uploadedUrl : null,
                videoUrl: reelMedia.type === 'video' ? uploadedUrl : null,
                targets: [{ category: reelBranch.category, subCategory: reelBranch.subCategory }],
            });
            setCreateReelOpen(false);
            setReelMedia(null);
            setReelCount(c => c + 1);
        } catch { Alert.alert('Hata', 'Reel paylaşılamadı.'); }
        finally { setPostingReel(false); }
    };

    const handleSaveInfo = async () => {
        setSavingInfo(true);
        try {
            const { data } = await api.post('/users/me', {
                city:     infoForm.city     || null,
                profilePrivacy:   infoForm.profilePrivacy,
                profileExclude:   infoForm.profileExclude,
                fullNamePrivacy:  infoForm.fullNamePrivacy,
                fullNameExclude:  infoForm.fullNameExclude,
                cityPrivacy:      infoForm.cityPrivacy,
                genderPrivacy:    infoForm.genderPrivacy,
                birthDatePrivacy: infoForm.birthDatePrivacy,
                cityExclude:      infoForm.cityExclude,
                genderExclude:    infoForm.genderExclude,
                birthDateExclude: infoForm.birthDateExclude,
                contactPhone:    infoForm.contactPhone ? (phoneCC + infoForm.contactPhone.replace(/^0+/, '')) : null,
                contactTelegram: infoForm.contactTelegram || null,
                contactEmail:    infoForm.contactEmail    || null,
                contactInstagram:infoForm.contactInstagram|| null,
                phonePrivacy:    infoForm.phonePrivacy,
                phoneSelected:   infoForm.phoneSelected,
                telegramPrivacy: infoForm.telegramPrivacy,
                telegramSelected:infoForm.telegramSelected,
                cEmailPrivacy:   infoForm.cEmailPrivacy,
                cEmailSelected:  infoForm.cEmailSelected,
                instagramPrivacy:infoForm.instagramPrivacy,
                instagramSelected:infoForm.instagramSelected,
            });
            setProfile(p => ({ ...p, ...data }));
            dispatch(setUser({ ...profile, ...data }));
            setProfileInfoOpen(false);
        } catch (e) { Alert.alert('Hata', e?.response?.data?.message || e?.message || 'Kaydedilemedi.'); }
        finally { setSavingInfo(false); }
    };

    const handleFriendAction = async () => {
        try {
            if (!friendStatus || friendStatus.status === 'NONE' || friendStatus.status === 'REJECTED') {
                const { data } = await api.post(`/friends/request/${userId}`);
                setFriendStatus({ status: 'PENDING', isSender: true, friendshipId: data.id });
            } else if (friendStatus.status === 'PENDING' && friendStatus.isSender) {
                await api.delete(`/friends/unfriend/${userId}`);
                setFriendStatus({ status: 'NONE' });
            } else if (friendStatus.status === 'ACCEPTED') {
                Alert.alert(t.friendsBtn, t.unfriendConfirm || 'Arkadaşlıktan çıkarılsın mı?', [
                    { text: t.cancelBtn || 'Vazgeç', style: 'cancel' },
                    { text: t.yes || 'Evet', style: 'destructive', onPress: async () => {
                        try { await api.delete(`/friends/unfriend/${userId}`); setFriendStatus({ status: 'NONE' }); setFriendCount(c => Math.max(0, c - 1)); }
                        catch (e) { console.warn(e?.message); }
                    } },
                ]);
            }
        } catch (e) { console.warn(e?.message); }
    };

    const handleRespondFriendRequest = async (action) => {
        if (!friendStatus?.friendshipId) return;
        try {
            await api.patch(`/friends/request/${friendStatus.friendshipId}`, { action });
            setFriendStatus({ status: action === 'accept' ? 'ACCEPTED' : 'NONE' });
            if (action === 'accept') setFriendCount(c => c + 1);
        } catch (e) { console.warn(e?.message); }
    };

    // Arkadaşlık isteği reddedilmiş olsa da olmasa da, istemediği kişiyi
    // doğrudan profilinden engelleyebilir — engellenen kişi artık bu profili göremez.
    const handleBlockUser = () => {
        Alert.alert(
            '🚫 Kullanıcıyı Engelle',
            `${profile?.fullName || profile?.username} adlı kullanıcıyı engellemek istediğinize emin misiniz? Engellerseniz birbirinizin profilini göremez, mesajlaşamaz, arkadaşlığınız varsa kaldırılır.`,
            [
                { text: 'Vazgeç', style: 'cancel' },
                { text: 'Engelle', style: 'destructive', onPress: async () => {
                    try {
                        await api.post(`/friends/block/${userId}`);
                        navigation.goBack();
                    } catch (e) { Alert.alert('Hata', e?.response?.data?.message || 'Engellenemedi.'); }
                } },
            ]
        );
    };

    const sendMessage = async () => {
        try {
            const { data: conv } = await api.get(`/messages/conversation/${userId}`);
            const enriched = { ...conv, other: conv.user1Id === myUser?.id ? conv.user2 : conv.user1 };
            navigation.navigate('MessagesTab', { screen: 'Chat', params: { conversation: enriched, other: enriched.other } });
        } catch (e) {
            if (e?.response?.status === 403) {
                Alert.alert('', e.response.data?.message || 'Bu kullanıcı tarafından engellendiniz.');
            } else {
                console.warn(e?.message);
            }
        }
    };

    const pickPrivacy = async (field, value) => {
        setInfoForm(f => ({ ...f, [`${field}Privacy`]: value }));
        setPrivacyPickerField(null);
        if (value === 'FRIENDS_EXCEPT' || value === 'FRIENDS_SELECTED') {
            setExcludePickerField(field);
        }
        try {
            const { data } = await api.post('/users/me', { [`${field}Privacy`]: value });
            setProfile(p => ({ ...p, ...data }));
        } catch (e) { console.warn(e?.message); }
    };

    const toggleExclude = async (field, friendId) => {
        const key = `${field}Exclude`;
        const list = infoForm[key] || [];
        const updated = list.includes(friendId) ? list.filter(id => id !== friendId) : [...list, friendId];
        setInfoForm(prev => ({ ...prev, [key]: updated }));
        try {
            const { data } = await api.post('/users/me', { [key]: updated });
            setProfile(p => ({ ...p, ...data }));
        } catch (e) { console.warn(e?.message); }
    };

    const openMediaViewer = (p) => {
        setMediaViewerPost(p);
        setMediaViewerComments([]);
        setMediaCommentsHidden(false);
        setMediaCommentText('');
        setLoadingMediaComments(true);
        api.get(`/posts/${p.id}/comments`)
            .then(({ data }) => setMediaViewerComments(Array.isArray(data) ? data : []))
            .catch(e => { if (e?.response?.status === 403) setMediaCommentsHidden(true); })
            .finally(() => setLoadingMediaComments(false));
    };

    // mediaViewerPost + arkasındaki Gönderiler/Reels ızgaralarını aynı anda günceller —
    // modal kapanıp tekrar açıldığında beğeni/yorum sayısı bayat kalmasın diye.
    const patchPostEverywhere = (postId, patch) => {
        setMediaViewerPost(prev => (prev && prev.id === postId) ? { ...prev, ...patch(prev) } : prev);
        setPosts(prev => prev.map(p => p.id === postId ? { ...p, ...patch(p) } : p));
        setReels(prev => prev.map(p => p.id === postId ? { ...p, ...patch(p) } : p));
    };

    const toggleMediaViewerLike = async (like = null) => {
        if (!mediaViewerPost) return;
        const wasLiked = !!mediaViewerPost.isLiked;
        if (like === true && wasLiked) return; // double-tap: sadece beğenir, geri almaz
        const nextLiked = like === null ? !wasLiked : like;
        if (nextLiked === wasLiked) return;
        patchPostEverywhere(mediaViewerPost.id, p => ({
            isLiked: nextLiked,
            _count: { ...p._count, likes: Math.max(0, (p._count?.likes || 0) + (nextLiked ? 1 : -1)) },
        }));
        try {
            await api.post(`/posts/${mediaViewerPost.id}/like`);
        } catch (e) {
            // başarısızsa geri al
            patchPostEverywhere(mediaViewerPost.id, p => ({
                isLiked: wasLiked,
                _count: { ...p._count, likes: Math.max(0, (p._count?.likes || 0) + (wasLiked ? 1 : -1)) },
            }));
        }
    };

    const handleMediaImageTap = () => {
        const now = Date.now();
        const isDouble = now - mediaLastTap.current < 300;
        mediaLastTap.current = now;
        if (!isDouble) return;
        toggleMediaViewerLike(true);
        setMediaHeartFlash(true);
        setTimeout(() => setMediaHeartFlash(false), 800);
    };

    const sendMediaComment = async () => {
        if (!mediaViewerPost || !mediaCommentText.trim() || sendingMediaComment) return;
        setSendingMediaComment(true);
        try {
            const { data } = await api.post(`/posts/${mediaViewerPost.id}/comment`, { content: mediaCommentText.trim() });
            setMediaViewerComments(prev => [...prev, data]);
            setMediaCommentText('');
            patchPostEverywhere(mediaViewerPost.id, p => ({ _count: { ...p._count, comments: (p._count?.comments || 0) + 1 } }));
        } catch (e) {
            Alert.alert(t.error, e?.response?.data?.message || t.actionFailed);
        } finally { setSendingMediaComment(false); }
    };

    const openLikers = () => {
        if (!mediaViewerPost) return;
        setLikersModalOpen(true);
        setLikersList([]);
        setLikersHidden(false);
        setLoadingLikers(true);
        api.get(`/posts/${mediaViewerPost.id}/likes`)
            .then(({ data }) => setLikersList(Array.isArray(data) ? data : []))
            .catch(e => { if (e?.response?.status === 403) setLikersHidden(true); })
            .finally(() => setLoadingLikers(false));
    };

    if (loading) {
        return (
            <View style={[s.container, { justifyContent: 'center', alignItems: 'center' }]}>
                <ActivityIndicator size="large" color={colors.purple} />
            </View>
        );
    }

    const wins = interests.reduce((acc, i) => acc + (i.wins || 0), 0);
    const losses = interests.reduce((acc, i) => acc + (i.losses || 0), 0);

    return (
        <View style={s.container}>
            {/* Top bar */}
            <View style={s.topBar}>
                {/* Left */}
                {!isOwnProfile ? (
                    <TouchableOpacity onPress={() => navigation.goBack()}>
                        <Text style={s.backBtn}>{t.back}</Text>
                    </TouchableOpacity>
                ) : (
                    <View style={{ minWidth: 60 }} />
                )}

                {/* Center — animated logo */}
                <RainbowLogo style={{ fontSize: 15, letterSpacing: 1 }} />

                {/* Right */}
                {isOwnProfile ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <TouchableOpacity onPress={openSupport} style={s.logoutBtn}>
                            <Text style={s.logoutText}>💬 Destek</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={handleLogout} style={s.logoutBtn}>
                            <Text style={s.logoutText}>{t.logoutBtn}</Text>
                        </TouchableOpacity>
                    </View>
                ) : friendStatus?.status === 'ACCEPTED' ? (
                    <TouchableOpacity onPress={handleFriendAction} style={s.logoutBtn}>
                        <Text style={s.logoutText}>✕ {t.unfriendBtn || 'Arkadaşlıktan Çık'}</Text>
                    </TouchableOpacity>
                ) : friendStatus?.status === 'PENDING' && friendStatus.isSender ? (
                    <TouchableOpacity onPress={handleFriendAction} style={s.logoutBtn}>
                        <Text style={s.logoutText}>⏳ {t.pendingBtn || 'Bekliyor'}</Text>
                    </TouchableOpacity>
                ) : (
                    <Text style={s.topBarUsername}>{profile?.username}</Text>
                )}
            </View>

            {/* İşletme Hesabı Bandı */}
            {isOwnProfile && myUser?.isBusiness && (
                <TouchableOpacity
                    style={s.bizBanner}
                    onPress={() => navigation.navigate('BusinessHome')}
                    activeOpacity={0.85}
                >
                    <Text style={s.bizBannerText}>🏢 İşletme Hesabım</Text>
                    <Text style={s.bizBannerArrow}>›</Text>
                </TouchableOpacity>
            )}

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>

                {/* ── Profile Card ── */}
                <View style={s.profileCard}>

                    {/* Avatar + Info row */}
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 3, marginBottom: 14 }}>

                        {/* Left: username above avatar */}
                        <View style={{ alignItems: 'center' }}>
                            <Text style={s.username}>{profile?.username}</Text>
                            <GradientAvatar
                                name={profile?.username}
                                avatar={profile?.avatar}
                                size={88}
                                onPress={profile?.avatar ? () => setAvatarZoomOpen(true) : null}
                                onAvatarZoom={
                                    stories.length > 0
                                        ? () => {
                                            setStoryViewIdx(0);
                                            setViewedStoryIds(prev => new Set([...prev, stories[0].id]));
                                            api.post(`/posts/${stories[0].id}/view`).catch(() => {});
                                            if (isOwnProfile) {
                                                api.get(`/posts/${stories[0].id}/views`)
                                                    .then(r => setStoryViewers(r.data)).catch(() => setStoryViewers([]));
                                            }
                                        }
                                        : null
                                }
                                onAvatarLongPress={profile?.avatar ? () => setAvatarZoomOpen(true) : null}
                                onChangeAvatar={isOwnProfile ? handleChangeAvatar : null}
                                onAddStory={isOwnProfile ? handleAddStory : null}
                                onArchive={isOwnProfile ? handleOpenArchive : null}
                                onProfileInfo={isOwnProfile ? openProfileInfo : null}
                                storyRing={
                                    stories.length === 0 ? null
                                    : stories.every(s => viewedStoryIds.has(s.id)) ? 'viewed'
                                    : 'unviewed'
                                }
                            />
                        </View>

                        {/* Right: Name + personal info column */}
                        <View style={{ flex: 1, paddingTop: 3, gap: 3 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 2 }}>
                                <Text style={[s.fullName, { marginBottom: 0, flex: 1 }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                                    {profile?.fullName || profile?.username}
                                </Text>
                                {isOwnProfile && (
                                    <Text style={s.privacyDot}>{privacyEmoji(profile?.fullNamePrivacy)}</Text>
                                )}
                            </View>

                            {(isOwnProfile || profile?.gender) && (
                                <View style={[s.infoItem, { gap: 3 }]}>
                                    <Text style={s.infoItemText}>
                                        {profile?.gender === 'MALE' ? `👨  ${t.genderMale.replace(/^[^\s]+\s*/,'')}`
                                            : profile?.gender === 'FEMALE' ? `👩  ${t.genderFemale.replace(/^[^\s]+\s*/,'')}`
                                            : profile?.gender === 'OTHER' ? `🧑  ${t.genderOther.replace(/^[^\s]+\s*/,'')}`
                                            : isOwnProfile ? '—' : ''}
                                    </Text>
                                    {isOwnProfile && (
                                        <Text style={s.privacyDot}>{privacyEmoji(profile?.genderPrivacy)}</Text>
                                    )}
                                </View>
                            )}
                            {(isOwnProfile || profile?.birthDate) && (
                                <View style={[s.infoItem, { gap: 3 }]}>
                                    <Text style={s.infoItemText}>
                                        {profile?.birthDate
                                            ? `🎂  ${formatBirthDate(profile.birthDate)} · ${calcAge(profile.birthDate)} ${t.years}`
                                            : isOwnProfile ? t.birthDateNotSet : ''}
                                    </Text>
                                    {isOwnProfile && (
                                        <Text style={s.privacyDot}>{privacyEmoji(profile?.birthDatePrivacy)}</Text>
                                    )}
                                </View>
                            )}
                            {(isOwnProfile || profile?.city) && (
                                <View style={[s.infoItem, { gap: 3 }]}>
                                    <Text style={s.infoItemText}>
                                        {profile?.city ? `📍  ${profile.city}` : isOwnProfile ? '— Şehir' : ''}
                                    </Text>
                                    {isOwnProfile && (
                                        <Text style={s.privacyDot}>{privacyEmoji(profile?.cityPrivacy)}</Text>
                                    )}
                                </View>
                            )}
                            <View style={s.infoItem}>
                                <Text style={s.infoItemText}>📅  {joinDate(profile?.createdAt, lang)}</Text>
                            </View>
                        </View>
                    </View>

                    {/* Bio */}
                    {profile?.bio ? (
                        <Text style={s.bio}>{profile.bio}</Text>
                    ) : null}

                    {/* 2×2 stat grid */}
                    <View style={s.statGrid}>
                        <StatCard emoji="🔥" label={t.postsLabel}      count={postCount}        onAdd={isOwnProfile ? handleCreatePost : null} onPress={() => setShowPostsModal(true)} />
                        <StatCard emoji="🎬" label={t.reels}            count={reelCount}        onAdd={isOwnProfile ? handleCreateReel : null} onPress={() => setShowReelsModal(true)} />
                        <StatCard emoji="👥" label={t.friendsLabel}     count={friendCount}      onAdd={isOwnProfile ? () => setShowAddFriendModal(true) : null} onPress={openFriendsList} />
                        <StatCard emoji="🏃" label={t.activitiesLabel}  count={interests.length} onAdd={isOwnProfile ? () => setManageOpen(true) : null} onPress={() => isOwnProfile ? setManageOpen(true) : setShowActivitiesViewModal(true)} />
                    </View>


                    {/* Gelen takip isteği */}
                    {!isOwnProfile && followStatus.incoming === 'PENDING' && (
                        <View style={[s.actionRow, { marginBottom: 8 }]}>
                            <Text style={{ color: colors.textSecondary, fontSize: 12, flex: 1, alignSelf: 'center' }}>
                                🔔 {profile?.fullName || profile?.username} sizi takip etmek istiyor
                            </Text>
                            <TouchableOpacity style={[s.actionBtn, s.actionBtnActive]} onPress={() => handleRespondFollowRequest('accept')}>
                                <Text style={s.actionBtnText}>✓</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={s.actionBtn} onPress={() => handleRespondFollowRequest('reject')}>
                                <Text style={s.actionBtnText}>✕</Text>
                            </TouchableOpacity>
                        </View>
                    )}

                    {/* Action buttons */}
                    {!isOwnProfile && (
                        <View style={s.actionRow}>
                            <TouchableOpacity
                                onPress={handleBlockUser}
                                style={{ flex: 0, width: 40, backgroundColor: colors.surface2, borderRadius: 14, paddingVertical: 10, alignItems: 'center' }}
                            >
                                <Text style={s.actionBtnText}>🚫</Text>
                            </TouchableOpacity>
                            {friendStatus?.status === 'PENDING' && !friendStatus.isSender ? (
                                <>
                                    <TouchableOpacity style={[s.actionBtn, s.actionBtnActive]} onPress={() => handleRespondFriendRequest('accept')}>
                                        <Text style={s.actionBtnText}>✓ {t.acceptBtn || 'Kabul Et'}</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity style={s.actionBtn} onPress={() => handleRespondFriendRequest('reject')}>
                                        <Text style={s.actionBtnText}>✕ {t.rejectBtn || 'Reddet'}</Text>
                                    </TouchableOpacity>
                                </>
                            ) : (
                                <TouchableOpacity
                                    style={[s.actionBtn, friendStatus?.status === 'ACCEPTED' && s.actionBtnActive]}
                                    onPress={handleFriendAction}
                                >
                                    <Text style={s.actionBtnText}>
                                        {friendStatus?.status === 'ACCEPTED' ? '✓✓ ' + t.friendsBtn : friendStatus?.status === 'PENDING' ? t.pendingBtn : t.addFriendBtn}
                                    </Text>
                                </TouchableOpacity>
                            )}
                            <TouchableOpacity
                                style={[s.actionBtn, followStatus.outgoing === 'ACCEPTED' && s.actionBtnActive]}
                                disabled={followLoading}
                                onPress={handleToggleFollow}
                            >
                                <Text style={s.actionBtnText}>
                                    {followStatus.outgoing === 'ACCEPTED' ? '✓ Takip Ediliyor' : followStatus.outgoing === 'PENDING' ? '⏳ İstek Gönderildi' : '🔔 Takip Et'}
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[s.actionBtn, s.msgBtn]} onPress={sendMessage}>
                                <Text style={s.actionBtnText}>{t.messageBtnProfile}</Text>
                            </TouchableOpacity>
                        </View>
                    )}
                </View>

                {/* İletişim Butonları */}
                {(profile?.contactPhone || profile?.contactTelegram || profile?.contactEmail || profile?.contactInstagram) && (
                    <View style={{ flexDirection:'row', flexWrap:'wrap', gap:8, paddingHorizontal:12, marginBottom:14 }}>
                        {profile.contactPhone && (
                            <TouchableOpacity
                                onPress={() => { const num = (profile.contactPhone || '').replace(/\D/g, ''); Linking.openURL(`tel:+${num}`); }}
                                style={s.contactBtn}>
                                <Text style={s.contactBtnText}>📞 {t.callBtn}</Text>
                            </TouchableOpacity>
                        )}
                        {profile.contactPhone && (
                            <TouchableOpacity
                                onPress={() => { const num = (profile.contactPhone || '').replace(/\D/g, ''); Linking.openURL(`https://wa.me/${num}`).catch(() => Linking.openURL(`whatsapp://send?phone=${num}`)); }}
                                style={[s.contactBtn, { backgroundColor:'#25D366' }]}>
                                <Text style={[s.contactBtnText, { color:'#fff' }]}>💬 {t.whatsappBtn}</Text>
                            </TouchableOpacity>
                        )}
                        {profile.contactTelegram && (
                            <TouchableOpacity
                                onPress={() => {
                                    const tg = profile.contactTelegram.startsWith('@') ? profile.contactTelegram.slice(1) : profile.contactTelegram;
                                    Linking.openURL(`https://t.me/${tg}`);
                                }}
                                style={[s.contactBtn, { backgroundColor:'#2CA5E0' }]}>
                                <Text style={[s.contactBtnText, { color:'#fff' }]}>✈️ Telegram</Text>
                            </TouchableOpacity>
                        )}
                        {profile.contactEmail && (
                            <TouchableOpacity
                                onPress={() => Linking.openURL(`mailto:${profile.contactEmail}`)}
                                style={s.contactBtn}>
                                <Text style={s.contactBtnText}>✉️ E-Posta</Text>
                            </TouchableOpacity>
                        )}
                        {profile.contactInstagram && (
                            <TouchableOpacity
                                onPress={() => {
                                    const ig = profile.contactInstagram.replace('@','');
                                    Linking.openURL(`instagram://user?username=${ig}`).catch(() =>
                                        Linking.openURL(`https://instagram.com/${ig}`));
                                }}
                                style={[s.contactBtn, { backgroundColor:'#E1306C' }]}>
                                <Text style={[s.contactBtnText, { color:'#fff' }]}>📸 Instagram</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                )}

                {/* ── Activities / Interests ── */}
                <View style={s.section}>
                    <Text style={s.sectionTitle}>{isOwnProfile ? t.branchesSection : (lang === 'tr' ? '🏅 Sporlar' : lang === 'ru' ? '🏅 Виды спорта' : '🏅 Sports')}</Text>
                    {interests.length > 0 ? (
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 3, paddingVertical: 1 }}>
                            {[...interests].sort((a, b) => (a.hidden ? 1 : 0) - (b.hidden ? 1 : 0)).map(i => {
                                const upcomingCount = myUpcoming.filter(m => m.subCategory === i.subCategory).length;
                                const reservationCount = isOwnProfile ? myReservations.filter(r => isReservActive(r) && reservationMatchesSport(r, i.subCategory)).length : 0;
                                return (
                                    <View key={i.id} style={{ position: 'relative' }}>
                                        <TouchableOpacity
                                            activeOpacity={0.8}
                                            onPress={() => setCardModalItem({
                                                ...i,
                                                emoji: SUB_EMOJI[i.subCategory] || '🏅',
                                                upcomingCount,
                                                archiveCount: myHistory.filter(m => m.subCategory === i.subCategory).length,
                                                historyMatches: myHistory.filter(m => m.subCategory === i.subCategory).slice(-14),
                                                reservationCount,
                                            })}
                                            style={{ backgroundColor: colors.surface2, borderRadius: 16, paddingTop: 3, paddingBottom: 11, paddingHorizontal: 11, alignItems: 'center', borderWidth: 1, borderColor: colors.border, width: 90, height: (i.isCoach || i.isReferee) ? 138 : (['tennis','padel'].includes(i.subCategory) ? 138 : 128), gap: 3, opacity: i.hidden ? 0.4 : 1 }}
                                        >
                                            {i.subCategory === 'padel'
                                                ? <Image source={require('../../../assets/padel.png')} style={{ width: 34, height: 34 }} resizeMode="contain" />
                                                : <Text style={{ fontSize: 34 }}>{SUB_EMOJI[i.subCategory] || '🏅'}</Text>}
                                            <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800', textAlign: 'center' }} numberOfLines={1}>{getSubCategoryLabel(i.subCategory, lang)}</Text>
                                            {/* Alias varsa gösterilir, yoksa hiç render edilmez — boş bir satır
                                                bırakıp isim ile derece arasında gereksiz boşluk oluşturmasın. */}
                                            {i.alias ? <Text style={{ color: '#a855f7', fontSize: 9, fontWeight: '700' }} numberOfLines={1}>{i.alias}</Text> : null}
                                            {/* Tenis/padel: tekli/çiftler puanı AYRI (bkz. backend utrRating.js) —
                                                iki kısa satır olarak gösterilir, diğer dallarda tek birleşik puan. */}
                                            {['tennis','padel'].includes(i.subCategory) ? (
                                                <View style={{ alignItems: 'center' }}>
                                                    <Text style={{ color: '#facc15', fontSize: 9, fontWeight: '900' }} numberOfLines={1}>
                                                        {lang === 'tr' ? 'T' : lang === 'ru' ? 'О' : 'S'}: {i.singlesDisplayRating != null ? Number(i.singlesDisplayRating).toFixed(2) : '—'}★
                                                    </Text>
                                                    <Text style={{ color: '#facc15', fontSize: 9, fontWeight: '900' }} numberOfLines={1}>
                                                        {lang === 'tr' ? 'Ç' : lang === 'ru' ? 'П' : 'D'}: {i.doublesDisplayRating != null ? Number(i.doublesDisplayRating).toFixed(2) : '—'}★
                                                    </Text>
                                                </View>
                                            ) : (
                                                <Text style={{ color: '#facc15', fontSize: 11, fontWeight: '900' }} numberOfLines={1}>{i.assessmentCompleted ? `${Number(i.skillRating).toFixed(2)} ★` : ' '}</Text>
                                            )}
                                            {/* Kullanıcı isteği: onaylı antrenör/hakem rozeti ELO'nun hemen altında
                                                görünsün (bkz. backend attachCoachRefereeBadges). */}
                                            {(i.isCoach || i.isReferee) && (
                                                <Text numberOfLines={1} style={{ fontSize: 8, fontWeight: '800', color: i.isCoach ? '#4ade80' : '#fbbf24' }}>
                                                    {i.isCoach ? '🎓 Antrenör' : '🟨 Hakem'}
                                                </Text>
                                            )}
                                            <Text style={{ color: i.hidden ? colors.textMuted : '#60a5fa', fontSize: 9, fontWeight: '700' }} numberOfLines={1}>
                                                {i.hidden ? 'Gizli' : reservationCount > 0 ? `📅 ${reservationCount}` : ' '}
                                            </Text>
                                        </TouchableOpacity>
                                        {isOwnProfile && (
                                            <TouchableOpacity
                                                onPress={() => Alert.alert(
                                                    i.subCategory,
                                                    null,
                                                    [
                                                        { text: i.hidden ? 'Göster' : 'Gizle', onPress: () => toggleHideInterest(i) },
                                                        { text: t.cancelBtn || 'Vazgeç', style: 'cancel' },
                                                    ]
                                                )}
                                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                                style={{ position: 'absolute', top: 2, right: 2, width: 22, height: 22, alignItems: 'center', justifyContent: 'center' }}
                                            >
                                                <Text style={{ color: colors.textMuted, fontSize: 14, fontWeight: '900' }}>⋮</Text>
                                            </TouchableOpacity>
                                        )}
                                    </View>
                                );
                            })}
                        </ScrollView>
                    ) : (
                        isOwnProfile ? (
                            <TouchableOpacity
                                onPress={() => setManageOpen(true)}
                                style={{ backgroundColor: colors.surface2, borderRadius:12, paddingVertical:11, alignItems:'center', borderWidth:1, borderColor: colors.border, borderStyle:'dashed' }}
                            >
                                <Text style={{ color: colors.textMuted, fontSize:13 }}>+ {t.addSportBtn || 'Spor Ekle'}</Text>
                            </TouchableOpacity>
                        ) : (
                            <Text style={{ color: colors.textMuted, fontSize:13 }}>{t.noSportsYet || 'Henüz spor eklenmemiş.'}</Text>
                        )
                    )}
                </View>

                {/* ── Rezervasyonlarım (tüm kullanıcılar) ── */}
                {isOwnProfile && (
                    <TouchableOpacity style={ap.reservBtn} onPress={() => navigation.navigate('MyReservations')}>
                        <Text style={ap.reservBtnText}>📅 Rezervasyonlarım{myReservations.filter(isReservActive).length > 0 ? ` (${myReservations.filter(isReservActive).length})` : ''}</Text>
                    </TouchableOpacity>
                )}

                {/* ── Admin Panel Butonu (sadece admin) ── */}
                {isOwnProfile && myUser?.isAdmin && (
                    <TouchableOpacity style={ap.adminBtn} onPress={() => navigation.navigate('AdminPortal')}>
                        <Text style={ap.adminBtnText}>{t.adminPanelBtn}</Text>
                    </TouchableOpacity>
                )}

            </ScrollView>

            {/* ── Yaklaşan Maçlarım Modal ── */}
            <Modal visible={showMyUpcoming} animationType="slide" transparent onRequestClose={() => setShowMyUpcoming(false)}>
                <View style={s.modalOverlay}>
                    <View style={[s.modalBox, { maxHeight:'85%' }]}>
                        <View style={s.modalHeader}>
                            <Text style={s.modalTitle}>
                                {upcomingSub ? `${SUB_EMOJI[upcomingSub] || '⏰'} ${upcomingSub} ${t.myUpcomingTitle || 'Yaklaşan Maçlar'}` : t.myUpcomingTitle}
                            </Text>
                            <TouchableOpacity onPress={() => setShowMyUpcoming(false)}>
                                <Text style={s.modalClose}>✕</Text>
                            </TouchableOpacity>
                        </View>
                        <ScrollView showsVerticalScrollIndicator={false}>
                            {(() => {
                                const filtered = upcomingSub ? myUpcoming.filter(m => m.subCategory === upcomingSub) : myUpcoming;
                                if (filtered.length === 0) return (
                                    <Text style={{ color:colors.textMuted, textAlign:'center', marginTop:30, fontSize:13 }}>{t.myUpcomingEmpty}</Text>
                                );
                                return filtered.map(m => {
                                    const allP = [
                                        { ...m.sender, skillRating: m.senderSkillRating },
                                        ...(Array.isArray(m.participants) ? m.participants : []),
                                    ].filter(Boolean);
                                    const isTeam = m.matchMode?.toUpperCase() === 'TEAM';
                                    const sizeBadge2 = isTeam ? `👥 ${m.teamSize || '?'}v${m.teamSize || '?'}` : '⚔️ 1v1';
                                    return (
                                        <View key={m.id} style={{ borderBottomWidth:1, borderBottomColor:colors.border, paddingVertical:11 }}>
                                            {/* Sport + badges */}
                                            <View style={{ flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginBottom:6 }}>
                                                <Text style={{ color:'#4ade80', fontSize:14, fontWeight:'800' }}>
                                                    {SUB_EMOJI[m.subCategory] || '🏅'} {getSubCategoryLabel(m.subCategory, lang)}
                                                </Text>
                                            </View>
                                            <View style={{ flexDirection:'row', flexWrap:'wrap', gap:3, marginBottom:8 }}>
                                                <View style={{ backgroundColor: colors.surface2, borderRadius:8, paddingHorizontal:5, paddingVertical:0, borderWidth:1, borderColor: colors.border }}>
                                                    <Text style={{ color: colors.purple, fontSize:11, fontWeight:'700' }}>{sizeBadge2}</Text>
                                                </View>
                                                {m.matchMode?.toUpperCase() === 'COMPETITIVE' && (
                                                    <View style={{ backgroundColor:'#ef444420', borderRadius:8, paddingHorizontal:5, paddingVertical:0, borderWidth:1, borderColor:'#ef444440' }}>
                                                        <Text style={{ color:'#ef4444', fontSize:11, fontWeight:'700' }}>⚔️ Rekabetçi</Text>
                                                    </View>
                                                )}
                                                {m.matchMode?.toUpperCase() === 'PRACTICE' && (
                                                    <View style={{ backgroundColor:'#22c55e20', borderRadius:8, paddingHorizontal:5, paddingVertical:0, borderWidth:1, borderColor:'#22c55e40' }}>
                                                        <Text style={{ color:'#22c55e', fontSize:11, fontWeight:'700' }}>🏃 Antrenman</Text>
                                                    </View>
                                                )}
                                                {m.flexibleSchedule && (
                                                    <View style={{ backgroundColor:'#f59e0b20', borderRadius:8, paddingHorizontal:5, paddingVertical:0, borderWidth:1, borderColor:'#f59e0b40' }}>
                                                        <Text style={{ color:'#f59e0b', fontSize:11, fontWeight:'700' }}>📅 Esnek</Text>
                                                    </View>
                                                )}
                                            </View>
                                            {/* Players */}
                                            <View style={{ flexDirection:'row', flexWrap:'wrap', gap:3, marginBottom:8 }}>
                                                {allP.map(p => (
                                                    <View key={p.id || p.username} style={{ backgroundColor: colors.surface2, borderRadius:6, paddingHorizontal:5, paddingVertical:1, flexDirection:'row', alignItems:'center', gap:3 }}>
                                                        <Text style={{ color:'#fff', fontSize:12, fontWeight:'600' }}>{p.username}</Text>
                                                        {p.skillRating != null && (
                                                            <Text style={{ color:'#facc15', fontSize:12, fontWeight:'800' }}>{Number(p.skillRating).toFixed(2)} ★</Text>
                                                        )}
                                                    </View>
                                                ))}
                                            </View>
                                            {/* Date / Time / Location */}
                                            <View style={{ flexDirection:'row', flexWrap:'wrap', gap:3, marginBottom:6 }}>
                                                {m.flexibleSchedule ? (
                                                    <Text style={{ color:colors.textMuted, fontSize:12 }}>📅 Esnek Program</Text>
                                                ) : (
                                                    <>
                                                        {m.matchDate ? <Text style={{ color:colors.textMuted, fontSize:12 }}>📅 {new Date(m.matchDate).toLocaleDateString('tr-TR', { day:'numeric', month:'short', weekday:'short' })}</Text> : null}
                                                        {m.matchTime ? <Text style={{ color:colors.textMuted, fontSize:12 }}>🕐 {m.matchTime}</Text> : null}
                                                    </>
                                                )}
                                                {m.location ? <Text style={{ color:colors.textMuted, fontSize:12 }}>📍 {m.location}</Text> : null}
                                            </View>
                                            {/* Court reserved */}
                                            <Text style={{ color: m.isCourtReserved ? '#4ade80' : '#f87171', fontSize:12, marginBottom: m.message ? 4 : 0 }}>
                                                {m.isCourtReserved ? '✅ Kort Rezerve Edildi' : '❌ Kort Rezerve Edilmedi'}
                                            </Text>
                                            {/* Note */}
                                            {m.message ? (
                                                <Text style={{ color:colors.textSecondary, fontSize:12, fontStyle:'italic', marginTop:2 }}>
                                                    💬 {m.message}
                                                </Text>
                                            ) : null}
                                        </View>
                                    );
                                });
                            })()}
                        </ScrollView>
                    </View>
                </View>
            </Modal>

            {/* ── Maç Arşivi Modal ── */}
            <Modal visible={showMyArchive} animationType="slide" transparent onRequestClose={() => setShowMyArchive(false)}>
                <View style={s.modalOverlay}>
                    <View style={[s.modalBox, { maxHeight:'85%' }]}>
                        <View style={s.modalHeader}>
                            <Text style={s.modalTitle}>
                                {archiveSub ? `${SUB_EMOJI[archiveSub] || '🏅'} ${archiveSub} ${t.matchArchiveTitle || 'Maç Arşivi'}` : t.matchArchiveTitle}
                            </Text>
                            <TouchableOpacity onPress={() => setShowMyArchive(false)}>
                                <Text style={s.modalClose}>✕</Text>
                            </TouchableOpacity>
                        </View>
                        {/* Archive sub-tabs */}
                        <View style={{ flexDirection:'row', gap:3, paddingHorizontal:13, paddingBottom:5 }}>
                            {['rivals','tournaments'].map(st => (
                                <TouchableOpacity key={st} onPress={() => setArchiveSubTab(st)}
                                    style={{ flex:1, paddingVertical:3, borderRadius:8, alignItems:'center', backgroundColor: archiveSubTab===st ? colors.purple : colors.surface2, borderWidth:1, borderColor: archiveSubTab===st ? colors.purple : colors.border }}>
                                    <Text style={{ color: archiveSubTab===st ? '#fff' : colors.textSecondary, fontSize:11, fontWeight:'700' }}>
                                        {st === 'rivals' ? '⚔️ Bireysel Maçlar' : '🏆 Turnuvalar'}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                        <ScrollView showsVerticalScrollIndicator={false}>
                            {archiveSubTab === 'rivals' && (loadingHistory ? (
                                <ActivityIndicator color={colors.purple} style={{ marginTop:30 }} />
                            ) : (() => {
                                const filtered = archiveSub ? myHistory.filter(m => m.subCategory === archiveSub) : myHistory;
                                if (filtered.length === 0) return <Text style={{ color:colors.textMuted, textAlign:'center', marginTop:30, fontSize:13 }}>{t.matchArchiveEmpty}</Text>;
                                return filtered.map(m => {
                                    const myId2 = myUser?.id;
                                    const isOwner = m.senderId === myId2;
                                    const parts = Array.isArray(m.participants) ? m.participants : [];
                                    const allP = [m.sender, ...parts].filter(Boolean);
                                    const snapshot = m.score?.ratingSnapshot || {};
                                    const sets = m.score?.sets;
                                    const winner = m.score?.winner;
                                    const myResult = winner === 'draw' ? '🤝' : winner === (isOwner ? 'sender' : 'opponent') ? '✅' : winner ? '❌' : '';
                                    const isTeam = m.matchMode?.toUpperCase() === 'TEAM';
                                    const sizeTxt2 = isTeam ? `👥 ${m.teamSize || '?'}v${m.teamSize || '?'}` : '⚔️ 1v1';
                                    const modeTxt2 = m.matchMode?.toUpperCase() === 'COMPETITIVE' ? '⚔️ Rekabetçi' : m.matchMode?.toUpperCase() === 'PRACTICE' ? '🏃 Antrenman' : '';
                                    return (
                                        <View key={m.id} style={{ borderBottomWidth:1, borderBottomColor:colors.border, paddingVertical:9 }}>
                                            <View style={{ flexDirection:'row', alignItems:'center', gap:3, marginBottom:6, flexWrap:'wrap' }}>
                                                <Text style={{ color:'#c084fc', fontSize:12, fontWeight:'800' }}>{SUB_EMOJI[m.subCategory] || '🏅'} {getSubCategoryLabel(m.subCategory, lang)}</Text>
                                                <Text style={{ color: colors.textMuted, fontSize:11 }}>·</Text>
                                                <Text style={{ color: colors.purple, fontSize:11, fontWeight:'700' }}>{sizeTxt2}</Text>
                                                {modeTxt2 ? <><Text style={{ color: colors.textMuted, fontSize:11 }}>·</Text><Text style={{ color: m.matchMode?.toUpperCase() === 'COMPETITIVE' ? '#ef4444' : '#22c55e', fontSize:11, fontWeight:'700' }}>{modeTxt2}</Text></> : null}
                                                <Text style={{ color: colors.textMuted, fontSize:11 }}>·</Text>
                                                <Text style={{ color: colors.textMuted, fontSize:11 }}>
                                                    {m.flexibleSchedule ? '📅 Esnek' : m.matchDate ? new Date(m.matchDate).toLocaleDateString('tr-TR', { day:'numeric', month:'short' }) : ''}
                                                    {!m.flexibleSchedule && m.matchTime ? ` ${m.matchTime}` : ''}
                                                </Text>
                                                {myResult ? <Text style={{ fontSize:14, marginLeft:'auto' }}>{myResult}</Text> : null}
                                            </View>
                                            {(m.courtName || m.location) ? (
                                                <Text style={{ color:colors.textMuted, fontSize:11, marginBottom:6 }}>🏟️ {m.courtName || m.location}</Text>
                                            ) : null}
                                            <View style={{ flexDirection:'row', flexWrap:'wrap', gap:3 }}>
                                                {allP.map(p => {
                                                    const isSender = p.id === m.senderId;
                                                    const hist = snapshot[p.id];
                                                    const ratingBefore = hist?.skillRating_before;
                                                    const pts = hist?.change ?? null;
                                                    const pSets = sets ? sets.map(s2 => isSender ? s2.sender : s2.opponent) : null;
                                                    const pWins = sets ? sets.filter(s2 => (isSender ? s2.sender : s2.opponent) > (isSender ? s2.opponent : s2.sender)).length : null;
                                                    return (
                                                        <View key={p.id || p.username} style={{ alignItems:'flex-start', gap:3 }}>
                                                            <TouchableOpacity onPress={() => p.id && p.id !== myUser?.id && navigation.push('Profile', { userId: p.id })} activeOpacity={p.id && p.id !== myUser?.id ? 0.7 : 1} style={{ backgroundColor: colors.surface2, borderRadius:6, paddingHorizontal:5, paddingVertical:1, flexDirection:'row', alignItems:'center', gap:3 }}>
                                                                <Text style={{ color:'#fff', fontSize:12, fontWeight:'600' }}>{p.username}</Text>
                                                                {ratingBefore != null && ratingBefore > 0 && <Text style={{ color:'#facc15', fontSize:11, fontWeight:'800' }}>{Number(ratingBefore).toFixed(2)} ★</Text>}
                                                                {pts != null && pts !== 0 && <Text style={{ color: pts > 0 ? '#4ade80' : '#f87171', fontSize:11, fontWeight:'800' }}>{pts > 0 ? '+' : ''}{pts}p</Text>}
                                                            </TouchableOpacity>
                                                            {pSets && (
                                                                <Text style={{ color: colors.textMuted, fontSize:11, paddingLeft:3 }}>
                                                                    {pSets.join('  ')}
                                                                    {'  '}<Text style={{ color: pWins != null && pWins > (sets.length - pWins) ? '#4ade80' : pWins != null && pWins < (sets.length - pWins) ? '#f87171' : colors.textMuted, fontWeight:'800' }}>({pWins})</Text>
                                                                </Text>
                                                            )}
                                                        </View>
                                                    );
                                                })}
                                            </View>
                                        </View>
                                    );
                                });
                            })())}
                            {archiveSubTab === 'tournaments' && (loadingTournamentHistory ? (
                                <ActivityIndicator color={colors.purple} style={{ marginTop:30 }} />
                            ) : (() => {
                                const filtered = archiveSub ? myTournamentHistory.filter(tt => tt.subCategory === archiveSub) : myTournamentHistory;
                                if (filtered.length === 0) return <Text style={{ color:colors.textMuted, textAlign:'center', marginTop:30, fontSize:13 }}>Henüz tamamlanmış turnuva yok.</Text>;
                                return filtered.map(tourn => (
                                    <View key={tourn.id} style={{ borderBottomWidth:1, borderBottomColor:colors.border, paddingVertical:9 }}>
                                        <View style={{ flexDirection:'row', alignItems:'flex-start', justifyContent:'space-between', gap:3 }}>
                                            <View style={{ flex:1 }}>
                                                <View style={{ flexDirection:'row', alignItems:'center', gap:3, marginBottom:2 }}>
                                                    <Text style={{ color:'#fff', fontSize:13, fontWeight:'800', flexShrink:1 }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{tourn.name}</Text>
                                                    {tourn.myPlacement ? (
                                                        <View style={{ backgroundColor:'#f59e0b20', borderRadius:6, paddingHorizontal:3, paddingVertical:0, borderWidth:1, borderColor:'#f59e0b50' }}>
                                                            <Text style={{ color:'#f59e0b', fontSize:10, fontWeight:'800' }}>
                                                                {{ 1:'🥇', 2:'🥈', 3:'🥉' }[tourn.myPlacement]} {tourn.myPlacement}.
                                                            </Text>
                                                        </View>
                                                    ) : null}
                                                </View>
                                                <Text style={{ color:'#c084fc', fontSize:11, fontWeight:'700' }}>{SUB_EMOJI[tourn.subCategory] || '🏅'} {getSubCategoryLabel(tourn.subCategory, lang)}</Text>
                                                <Text style={{ color: colors.textMuted, fontSize:11 }}>
                                                    👤 {tourn.creator?.fullName || tourn.creator?.username}
                                                    {tourn.city ? `  📍 ${tourn.city}` : ''}
                                                </Text>
                                                {tourn.completedAt && (
                                                    <Text style={{ color: colors.textMuted, fontSize:11 }}>
                                                        🏁 {new Date(tourn.completedAt).toLocaleDateString('tr-TR', { day:'numeric', month:'short', year:'numeric' })}
                                                    </Text>
                                                )}
                                            </View>
                                            <View style={{ backgroundColor:'#16a34a20', borderRadius:6, paddingHorizontal:5, paddingVertical:0, borderWidth:1, borderColor:'#16a34a50' }}>
                                                <Text style={{ color:'#4ade80', fontSize:10, fontWeight:'800' }}>✅ Tamamlandı</Text>
                                            </View>
                                        </View>
                                        <TouchableOpacity
                                            style={{ backgroundColor:'#a855f715', borderRadius:8, paddingHorizontal:7, paddingVertical:4, borderWidth:1, borderColor:'#a855f740', marginTop:8, flexDirection:'row', justifyContent:'space-between', alignItems:'center' }}
                                            onPress={() => setSelectedArchiveTournament(tourn)}
                                        >
                                            <Text style={{ color:'#c084fc', fontSize:12, fontWeight:'700' }}>📋 Turnuva Detayları</Text>
                                            <Text style={{ color:'#c084fc', fontSize:14 }}>›</Text>
                                        </TouchableOpacity>
                                    </View>
                                ));
                            })())}
                        </ScrollView>
                    </View>
                </View>
            </Modal>

            {/* ── Archive Tournament Detail Modal ── */}
            <Modal visible={!!selectedArchiveTournament} animationType="slide" transparent onRequestClose={() => setSelectedArchiveTournament(null)}>
                <View style={s.modalOverlay}>
                    <View style={[s.modalBox, { maxHeight:'92%' }]}>
                        {selectedArchiveTournament && (() => {
                            const tourn = selectedArchiveTournament;
                            const row = (label, value) => value ? (
                                <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'flex-start', paddingVertical:7, borderBottomWidth:1, borderBottomColor:colors.border }}>
                                    <Text style={{ color:colors.textMuted, fontSize:13, fontWeight:'600', flex:1 }}>{label}</Text>
                                    <Text style={{ color:'#fff', fontSize:13, fontWeight:'700', flex:1.2, textAlign:'right' }}>{value}</Text>
                                </View>
                            ) : null;
                            const archiveStandings = (() => {
                                const stats = {};
                                for (const m of archiveModalMatches) {
                                    if (m.phase !== 'GROUP') continue;
                                    if (m.p1Id && !stats[m.p1Id]) stats[m.p1Id] = { id:m.p1Id, name:m.p1Name, played:0, won:0, lost:0, setsWon:0, setsLost:0, gamesWon:0, gamesLost:0, points:0 };
                                    if (m.p2Id && !stats[m.p2Id]) stats[m.p2Id] = { id:m.p2Id, name:m.p2Name, played:0, won:0, lost:0, setsWon:0, setsLost:0, gamesWon:0, gamesLost:0, points:0 };
                                    if (m.status !== 'COMPLETED' || !m.score || !m.p2Id) continue;
                                    const sc = m.score;
                                    const s1 = stats[m.p1Id], s2 = stats[m.p2Id];
                                    if (!s1 || !s2) continue;
                                    s1.played++; s2.played++;
                                    let p1s=0,p2s=0,p1g=0,p2g=0;
                                    for (const set of (sc.sets||[])) {
                                        p1g+=set.p1||0; p2g+=set.p2||0;
                                        if ((set.p1||0)>(set.p2||0)) p1s++; else if ((set.p2||0)>(set.p1||0)) p2s++;
                                    }
                                    s1.setsWon+=p1s; s1.setsLost+=p2s; s1.gamesWon+=p1g; s1.gamesLost+=p2g;
                                    s2.setsWon+=p2s; s2.setsLost+=p1s; s2.gamesWon+=p2g; s2.gamesLost+=p1g;
                                    if (sc.winner==='p1') { s1.won++; s1.points+=3; s2.lost++; } else { s2.won++; s2.points+=3; s1.lost++; }
                                }
                                return Object.values(stats).sort((a,b) => {
                                    if (b.points!==a.points) return b.points-a.points;
                                    const sr=x=>x.setsLost===0?(x.setsWon===0?0:Infinity):x.setsWon/x.setsLost;
                                    if (Math.abs(sr(b)-sr(a))>0.001) return sr(b)-sr(a);
                                    const gr=x=>x.gamesLost===0?(x.gamesWon===0?0:Infinity):x.gamesWon/x.gamesLost;
                                    return gr(b)-gr(a);
                                });
                            })();
                            const hasGroup = archiveModalMatches.some(m => m.phase === 'GROUP');
                            const tabs = ['details', 'matches', ...(hasGroup ? ['standings'] : [])];
                            const tabLabel = { details:'Detaylar', matches:'Maçlar', standings:'Puan Tablosu' };
                            const playoffMs = archiveModalMatches.filter(m => m.phase === 'PLAYOFF');
                            const playoffMaxRound = playoffMs.length ? Math.max(...playoffMs.map(m => m.round)) : 0;
                            const getRoundLabel = (round, phase) => {
                                if (phase === 'GROUP') return `Grup - Tur ${round}`;
                                const fromEnd = playoffMaxRound - round;
                                if (fromEnd === 0) return 'Final';
                                if (fromEnd === 1) return 'Yarı Final';
                                if (fromEnd === 2) return 'Çeyrek Final';
                                return `Playoff - Tur ${round}`;
                            };
                            return (
                                <>
                                    <View style={[s.modalHeader, { paddingHorizontal:21 }]}>
                                        <Text style={[s.modalTitle, { flex:1 }]} numberOfLines={2}>🏆 {tourn.name}</Text>
                                        <TouchableOpacity onPress={() => setSelectedArchiveTournament(null)}>
                                            <Text style={s.modalClose}>✕</Text>
                                        </TouchableOpacity>
                                    </View>
                                    <View style={{ flexDirection:'row', gap:3, marginBottom:10, paddingHorizontal:21 }}>
                                        {tabs.map(tab => (
                                            <TouchableOpacity key={tab} onPress={() => setArchiveModalTab(tab)}
                                                style={{ paddingHorizontal:9, paddingVertical:3, borderRadius:8, backgroundColor: archiveModalTab===tab ? '#a855f740' : 'transparent', borderWidth:1, borderColor: archiveModalTab===tab ? '#a855f760' : colors.border }}>
                                                <Text style={{ color: archiveModalTab===tab ? '#c084fc' : colors.textMuted, fontSize:12, fontWeight:'700' }}>{tabLabel[tab]}</Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal:21, paddingBottom:21 }}>
                                        {archiveModalTab === 'details' && (
                                            <>
                                                <View style={{ backgroundColor:'#16a34a20', borderRadius:8, paddingHorizontal:9, paddingVertical:3, alignSelf:'flex-start', borderWidth:1, borderColor:'#16a34a50', marginBottom:14 }}>
                                                    <Text style={{ color:'#4ade80', fontSize:11, fontWeight:'800' }}>✅ Tamamlandı</Text>
                                                </View>
                                                {tourn.subCategory ? row('🏅 Dal', `${SUB_EMOJI[tourn.subCategory] || ''} ${getSubCategoryLabel(tourn.subCategory, lang)}`) : null}
                                                {row('👤 Organizatör', tourn.creator?.fullName || tourn.creator?.username)}
                                                {tourn.city ? row('📍 Şehir', tourn.city) : null}
                                                {tourn.location ? row('🏟️ Mekan', tourn.location) : null}
                                                {tourn.surface ? row('🎾 Zemin', tourn.surface) : null}
                                                {typeof tourn.isIndoor === 'boolean' ? row('🏠 Alan', tourn.isIndoor ? 'Kapalı' : 'Açık') : null}
                                                {tourn.eventDate ? row('📅 Başlangıç', new Date(tourn.eventDate).toLocaleDateString('tr-TR', { day:'numeric', month:'long', year:'numeric' })) : null}
                                                {tourn.eventEndDate ? row('📅 Bitiş', new Date(tourn.eventEndDate).toLocaleDateString('tr-TR', { day:'numeric', month:'long', year:'numeric' })) : null}
                                                {row('👥 Katılımcı', `${tourn._count?.participants || 0} kişi`)}
                                                {tourn.setsPerMatch ? row('🎯 Set/Maç', `${tourn.setsPerMatch} set`) : null}
                                                {tourn.playoffQualifiers ? row('🏆 Playoff', `İlk ${tourn.playoffQualifiers} takım`) : null}
                                                {tourn.prize1 ? row('🥇 1. Ödül', tourn.prize1) : null}
                                                {tourn.prize2 ? row('🥈 2. Ödül', tourn.prize2) : null}
                                                {tourn.prize3 ? row('🥉 3. Ödül', tourn.prize3) : null}
                                                {tourn.isPaid ? row('💰 Katılım Ücreti', `${tourn.playerFee} ₺`) : null}
                                                {tourn.completedAt ? row('🏁 Tamamlandı', new Date(tourn.completedAt).toLocaleDateString('tr-TR', { day:'numeric', month:'long', year:'numeric' })) : null}
                                            </>
                                        )}
                                        {archiveModalTab === 'matches' && (
                                            archiveModalLoading
                                                ? <ActivityIndicator color="#c084fc" style={{ marginTop:20 }} />
                                                : archiveModalMatches.length === 0
                                                    ? <Text style={{ color:colors.textMuted, textAlign:'center', marginTop:20, fontSize:13 }}>Maç bulunamadı</Text>
                                                    : (() => {
                                                        const seen = new Set();
                                                        const roundKeys = archiveModalMatches
                                                            .filter(m => { const k=`${m.phase}|${m.round}`; if (seen.has(k)) return false; seen.add(k); return true; })
                                                            .map(m => ({ phase:m.phase, round:m.round }));
                                                        return roundKeys.map(({ phase, round }) => {
                                                            const rMatches = archiveModalMatches.filter(m => m.phase === phase && m.round === round);
                                                            return (
                                                                <View key={`${phase}|${round}`} style={{ marginBottom:10 }}>
                                                                    <Text style={{ color:'#c084fc', fontSize:11, fontWeight:'800', marginBottom:6 }}>{getRoundLabel(round, phase)}</Text>
                                                                    {rMatches.map(match => {
                                                                        const isDone = match.status === 'COMPLETED';
                                                                        const isBye = match.status === 'BYE';
                                                                        return (
                                                                            <View key={match.id} style={{ backgroundColor:'#0f172a', borderRadius:8, padding:5, marginBottom:5, borderWidth:1, borderColor: isDone ? '#16a34a30' : '#334155' }}>
                                                                                <View style={{ flexDirection:'row', alignItems:'center', justifyContent:'space-between' }}>
                                                                                    <View style={{ flex:1 }}>
                                                                                        <Text style={{ color: isDone && match.winnerId===match.p1Id ? '#4ade80' : '#fff', fontSize:12, fontWeight:'700' }}>{match.p1Name || 'TBD'}</Text>
                                                                                        <Text style={{ color:colors.textMuted, fontSize:10 }}>vs</Text>
                                                                                        <Text style={{ color: isDone && match.winnerId===match.p2Id ? '#4ade80' : '#fff', fontSize:12, fontWeight:'700' }}>{match.p2Name || 'TBD'}</Text>
                                                                                    </View>
                                                                                    <View style={{ alignItems:'flex-end' }}>
                                                                                        {isBye && <Text style={{ color:colors.textMuted, fontSize:10 }}>BYE</Text>}
                                                                                        {isDone && match.score && (
                                                                                            <Text style={{ color:'#94a3b8', fontSize:12, fontWeight:'700' }}>
                                                                                                {(match.score.sets||[]).map(s=>`${s.p1}-${s.p2}`).join(', ')}
                                                                                            </Text>
                                                                                        )}
                                                                                    </View>
                                                                                </View>
                                                                            </View>
                                                                        );
                                                                    })}
                                                                </View>
                                                            );
                                                        });
                                                    })()
                                        )}
                                        {archiveModalTab === 'standings' && (
                                            archiveModalLoading
                                                ? <ActivityIndicator color="#c084fc" style={{ marginTop:20 }} />
                                                : archiveStandings.length === 0
                                                    ? <Text style={{ color:colors.textMuted, textAlign:'center', marginTop:20, fontSize:13 }}>Henüz maç sonucu yok</Text>
                                                    : <View>
                                                        <View style={{ flexDirection:'row', paddingVertical:1, borderBottomWidth:1, borderBottomColor:colors.border, marginBottom:2 }}>
                                                            <Text style={{ color:colors.textMuted, fontSize:10, fontWeight:'700', flex:1 }}>Oyuncu</Text>
                                                            {['O','G','M','Av','P'].map(h => (
                                                                <Text key={h} style={{ color:colors.textMuted, fontSize:10, fontWeight:'700', width:28, textAlign:'center' }}>{h}</Text>
                                                            ))}
                                                        </View>
                                                        {archiveStandings.map((row2, i) => (
                                                            <View key={row2.id} style={{ flexDirection:'row', alignItems:'center', paddingVertical:2, borderBottomWidth: i < archiveStandings.length-1 ? 1 : 0, borderBottomColor:colors.border+'30' }}>
                                                                <Text style={{ color:'#fff', fontSize:11, flex:1 }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{i+1}. {row2.name}</Text>
                                                                {[row2.played, row2.won, row2.lost, (() => { const d=row2.setsWon-row2.setsLost; return (d>=0?'+':'')+d; })(), row2.points].map((v,j) => (
                                                                    <Text key={j} style={{ color: j===4 ? '#4ade80' : '#fff', fontSize:11, fontWeight: j===4 ? '800' : '400', width:28, textAlign:'center' }}>{String(v)}</Text>
                                                                ))}
                                                            </View>
                                                        ))}
                                                    </View>
                                        )}
                                    </ScrollView>
                                </>
                            );
                        })()}
                    </View>
                </View>
            </Modal>

            {/* ── Arkadaş Ara & Ekle ── */}
            <Modal visible={showAddFriendModal} animationType="slide" transparent onRequestClose={() => setShowAddFriendModal(false)}>
                <View style={{ flex:1, backgroundColor:'#000000bb', justifyContent:'flex-end' }}>
                    <View style={{ backgroundColor: colors.surface, borderTopLeftRadius:24, borderTopRightRadius:24, height:'80%', padding:17 }}>
                        <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
                            <Text style={{ color:'#fff', fontSize:17, fontWeight:'900' }}>Arkadaş Ara</Text>
                            <TouchableOpacity onPress={() => { setShowAddFriendModal(false); setFriendSearchQuery(''); setFriendSearchResults([]); }}>
                                <Text style={{ color: colors.textMuted, fontSize:22 }}>✕</Text>
                            </TouchableOpacity>
                        </View>
                        <TextInput
                            style={{ backgroundColor: colors.surface2, borderRadius:12, paddingHorizontal:11, paddingVertical:8, color:'#fff', fontSize:14, borderWidth:1, borderColor: colors.border }}
                            placeholder="İsim veya kullanıcı adı yazın..."
                            placeholderTextColor={colors.textMuted}
                            value={friendSearchQuery}
                            onChangeText={setFriendSearchQuery}
                            autoFocus
                        />
                        <ScrollView style={{ marginTop:14 }} showsVerticalScrollIndicator={false}>
                            {searchingFriends ? (
                                <ActivityIndicator color={colors.purple} style={{ marginTop:30 }} />
                            ) : friendSearchQuery.trim().length < 2 ? (
                                <Text style={{ color: colors.textMuted, fontSize:12, textAlign:'center', marginTop:30 }}>En az 2 karakter yazın</Text>
                            ) : friendSearchResults.length === 0 ? (
                                <Text style={{ color: colors.textMuted, fontSize:12, textAlign:'center', marginTop:30 }}>Kullanıcı bulunamadı</Text>
                            ) : friendSearchResults.map(u => (
                                <View key={u.id} style={{ flexDirection:'row', alignItems:'center', backgroundColor: colors.surface2, borderRadius:14, padding:9, marginBottom:8, borderWidth:1, borderColor: colors.border }}>
                                    <TouchableOpacity
                                        style={{ flex:1, flexDirection:'row', alignItems:'center' }}
                                        onPress={() => { setShowAddFriendModal(false); navigation.push('Profile', { userId: u.id }); }}>
                                        {u.avatar
                                            ? <Image source={{ uri: u.avatar }} style={{ width:40, height:40, borderRadius:20, marginRight:10 }} />
                                            : <View style={{ width:40, height:40, borderRadius:20, marginRight:10, backgroundColor: colors.purple + '30', alignItems:'center', justifyContent:'center' }}>
                                                <Text style={{ color: colors.purple, fontWeight:'800' }}>{(u.username?.[0] || '?').toUpperCase()}</Text>
                                              </View>
                                        }
                                        <View style={{ flex:1 }}>
                                            <Text style={{ color:'#fff', fontSize:13, fontWeight:'700' }}>{u.fullName || u.username}</Text>
                                            <Text style={{ color: colors.textMuted, fontSize:11 }}>{u.username}</Text>
                                        </View>
                                    </TouchableOpacity>
                                    <View style={{ flexDirection:'row', gap:3 }}>
                                        <TouchableOpacity
                                            disabled={friendActionLoading === `${u.id}_friend`}
                                            onPress={() => handleSendFriendRequest(u)}
                                            style={{ backgroundColor: colors.purple + '20', borderRadius:8, paddingHorizontal:5, paddingVertical:4, borderWidth:1, borderColor: colors.purple + '50', opacity: friendActionLoading === `${u.id}_friend` ? 0.5 : 1 }}>
                                            <Text style={{ fontSize:15 }}>👥</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            disabled={friendActionLoading === `${u.id}_follow`}
                                            onPress={() => handleFollow(u)}
                                            style={{ backgroundColor:'#2563eb20', borderRadius:8, paddingHorizontal:5, paddingVertical:4, borderWidth:1, borderColor:'#2563eb50', opacity: friendActionLoading === `${u.id}_follow` ? 0.5 : 1 }}>
                                            <Text style={{ fontSize:15 }}>🔔</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            onPress={() => handleSendMessageRequest(u)}
                                            style={{ backgroundColor:'#16a34a20', borderRadius:8, paddingHorizontal:5, paddingVertical:4, borderWidth:1, borderColor:'#16a34a50' }}>
                                            <Text style={{ fontSize:15 }}>💬</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            ))}
                        </ScrollView>
                    </View>
                </View>
            </Modal>

            <ManageActivitiesModal
                visible={manageOpen}
                interests={interests}
                onClose={() => setManageOpen(false)}
                onInterestsChange={(updated) => setInterests(updated)}
                privacyEmojiIcon={privacyEmoji(infoForm.activitiesPrivacy)}
                onPrivacyPress={() => { setManageOpen(false); setPrivacyPickerField('activities'); }}
            />

            <SportCardFlipModal
                item={cardModalItem}
                visible={!!cardModalItem}
                onClose={() => { setCardModalItem(null); setAliasEditId(null); }}
                lang={lang}
                t={t}
                isOwnProfile={isOwnProfile}
                profile={profile}
                aliasEditId={aliasEditId}
                aliasValue={aliasValue}
                setAliasValue={setAliasValue}
                savingAlias={savingAlias}
                onSaveAlias={() => cardModalItem && saveAlias(cardModalItem.id)}
                onCancelAlias={() => setAliasEditId(null)}
                onEditAlias={() => cardModalItem && (setAliasValue(cardModalItem.alias || ''), setAliasEditId(cardModalItem.id))}
                onUpcoming={() => { setCardModalItem(null); cardModalItem && openMyUpcoming(cardModalItem.subCategory); }}
                onArchive={() => { setCardModalItem(null); cardModalItem && openMyArchive(cardModalItem.subCategory); }}
                onReservations={() => { const sub = cardModalItem?.subCategory; setCardModalItem(null); navigation.navigate('MyReservations', { sportFilter: sub }); }}
                onViewTournament={(achievement) => {
                    setCardModalItem(null);
                    setSelectedArchiveTournament({ id: achievement.tournamentId, name: achievement.name, subCategory: achievement.subCategory, category: achievement.category });
                }}
                userId={myUser?.id}
                profileUserId={profile?.id}
                onGoalsSaved={(interestId, goals) => setInterests(prev => prev.map(i => i.id === interestId ? { ...i, goals } : i))}
                onAssessComplete={(interestId, patch) => {
                    setInterests(prev => prev.map(i => i.id === interestId ? { ...i, ...patch } : i));
                    // Kart açıkken tamamlanırsa (kapatmadan) anında yeni puanı görsün diye
                    // şu an açık olan kart snapshot'ı da güncellenir.
                    setCardModalItem(prev => prev && prev.id === interestId ? { ...prev, ...patch } : prev);
                }}
            />

            {/* ── Gönderiler modalı ── */}
            <Modal visible={showPostsModal} animationType="slide" transparent onRequestClose={() => setShowPostsModal(false)}>
                <View style={{ flex:1, backgroundColor:'#000000bb', justifyContent:'flex-end' }}>
                    <View style={{ backgroundColor: colors.surface, borderTopLeftRadius:24, borderTopRightRadius:24, height:'80%', padding:17 }}>
                        <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:14, gap:3 }}>
                            <Text style={{ color:'#fff', fontSize:17, fontWeight:'900', flex:1 }}>🔥 {t.postsLabel}</Text>
                            {isOwnProfile && (
                                <TouchableOpacity onPress={() => setPrivacyPickerField('posts')}>
                                    <Text style={{ fontSize:18 }}>{privacyEmoji(infoForm.postsPrivacy)}</Text>
                                </TouchableOpacity>
                            )}
                            {isOwnProfile && (
                                <TouchableOpacity onPress={() => setPrivacyPickerField('likesComments')} style={{ marginLeft:10 }}>
                                    <Text style={{ fontSize:18 }}>❤️{privacyEmoji(infoForm.likesCommentsPrivacy)}</Text>
                                </TouchableOpacity>
                            )}
                            <TouchableOpacity onPress={() => setShowPostsModal(false)} style={{ marginLeft:10 }}><Text style={{ color: colors.textMuted, fontSize:22 }}>✕</Text></TouchableOpacity>
                        </View>
                        {isOwnProfile && (
                            <TouchableOpacity
                                style={{ flexDirection:'row', alignItems:'center', justifyContent:'center', gap:3, backgroundColor: colors.purple + '20', borderRadius:12, paddingVertical:8, marginBottom:12, borderWidth:1, borderColor: colors.purple + '50' }}
                                onPress={() => { setShowPostsModal(false); handleCreatePost(); }}>
                                <Text style={{ color: colors.purple, fontWeight:'800', fontSize:13 }}>+ Gönderi Ekle</Text>
                            </TouchableOpacity>
                        )}
                        <ScrollView showsVerticalScrollIndicator={false}>
                            {posts.length === 0 ? (
                                <Text style={{ color: colors.textMuted, fontSize:12, textAlign:'center', marginTop:30 }}>Henüz gönderi yok</Text>
                            ) : (
                                <View style={{ flexDirection:'row', flexWrap:'wrap', gap:3 }}>
                                    {posts.map(p => (
                                        <TouchableOpacity key={p.id} activeOpacity={0.85} onPress={() => openMediaViewer(p)} style={{ width:'31.5%', aspectRatio:1, borderRadius:10, overflow:'hidden', backgroundColor: colors.surface2 }}>
                                            {p.imageUrl || p.videoUrl
                                                ? <Image source={{ uri: p.imageUrl || p.videoUrl }} style={{ width:'100%', height:'100%' }} />
                                                : <View style={{ flex:1, padding:3, justifyContent:'center' }}>
                                                    <Text style={{ color: colors.textSecondary, fontSize:10 }} numberOfLines={4}>{p.content}</Text>
                                                  </View>
                                            }
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            )}
                        </ScrollView>
                    </View>
                </View>
            </Modal>

            {/* ── Reels modalı ── */}
            <Modal visible={showReelsModal} animationType="slide" transparent onRequestClose={() => setShowReelsModal(false)}>
                <View style={{ flex:1, backgroundColor:'#000000bb', justifyContent:'flex-end' }}>
                    <View style={{ backgroundColor: colors.surface, borderTopLeftRadius:24, borderTopRightRadius:24, height:'80%', padding:17 }}>
                        <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:14, gap:3 }}>
                            <Text style={{ color:'#fff', fontSize:17, fontWeight:'900', flex:1 }}>🎬 {t.reels}</Text>
                            {isOwnProfile && (
                                <TouchableOpacity onPress={() => setPrivacyPickerField('reels')}>
                                    <Text style={{ fontSize:18 }}>{privacyEmoji(infoForm.reelsPrivacy)}</Text>
                                </TouchableOpacity>
                            )}
                            {isOwnProfile && (
                                <TouchableOpacity onPress={() => setPrivacyPickerField('likesComments')} style={{ marginLeft:10 }}>
                                    <Text style={{ fontSize:18 }}>❤️{privacyEmoji(infoForm.likesCommentsPrivacy)}</Text>
                                </TouchableOpacity>
                            )}
                            <TouchableOpacity onPress={() => setShowReelsModal(false)} style={{ marginLeft:10 }}><Text style={{ color: colors.textMuted, fontSize:22 }}>✕</Text></TouchableOpacity>
                        </View>
                        {isOwnProfile && (
                            <TouchableOpacity
                                style={{ flexDirection:'row', alignItems:'center', justifyContent:'center', gap:3, backgroundColor: colors.purple + '20', borderRadius:12, paddingVertical:8, marginBottom:12, borderWidth:1, borderColor: colors.purple + '50' }}
                                onPress={() => { setShowReelsModal(false); handleCreateReel(); }}>
                                <Text style={{ color: colors.purple, fontWeight:'800', fontSize:13 }}>+ Reels Ekle</Text>
                            </TouchableOpacity>
                        )}
                        <ScrollView showsVerticalScrollIndicator={false}>
                            {reels.length === 0 ? (
                                <Text style={{ color: colors.textMuted, fontSize:12, textAlign:'center', marginTop:30 }}>Henüz reels yok</Text>
                            ) : (
                                <View style={{ flexDirection:'row', flexWrap:'wrap', gap:3 }}>
                                    {reels.map(r => (
                                        <TouchableOpacity key={r.id} activeOpacity={0.85} onPress={() => openMediaViewer(r)} style={{ width:'31.5%', aspectRatio:9/16, borderRadius:10, overflow:'hidden', backgroundColor: colors.surface2 }}>
                                            {r.imageUrl || r.videoUrl
                                                ? <Image source={{ uri: r.imageUrl || r.videoUrl }} style={{ width:'100%', height:'100%' }} />
                                                : <View style={{ flex:1, padding:3, justifyContent:'center' }}>
                                                    <Text style={{ color: colors.textSecondary, fontSize:10 }} numberOfLines={4}>{r.content}</Text>
                                                  </View>
                                            }
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            )}
                        </ScrollView>
                    </View>
                </View>
            </Modal>

            {/* ── Medya görüntüleyici (yorumlar + beğenenler) ── */}
            <Modal visible={!!mediaViewerPost} animationType="fade" transparent onRequestClose={() => setMediaViewerPost(null)}>
                <View style={{ flex:1, backgroundColor:'#000000ee' }}>
                    <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center', paddingTop: Platform.OS === 'ios' ? 54 : 30, paddingHorizontal:17, paddingBottom:10 }}>
                        {isOwnProfile ? (
                            <TouchableOpacity onPress={() => setPrivacyPickerField('likesComments')}>
                                <Text style={{ fontSize:18 }}>{privacyEmoji(infoForm.likesCommentsPrivacy)}</Text>
                            </TouchableOpacity>
                        ) : <View style={{ width:18 }} />}
                        <TouchableOpacity onPress={() => setMediaViewerPost(null)}><Text style={{ color:'#fff', fontSize:22 }}>✕</Text></TouchableOpacity>
                    </View>
                    {mediaViewerPost && (
                        <ScrollView showsVerticalScrollIndicator={false} style={{ flex:1 }} keyboardShouldPersistTaps="handled">
                            {(mediaViewerPost.imageUrl || mediaViewerPost.videoUrl) && (
                                <Pressable onPress={handleMediaImageTap} style={{ width:'100%', aspectRatio:1 }}>
                                    <Image source={{ uri: mediaViewerPost.imageUrl || mediaViewerPost.videoUrl }} style={{ width:'100%', height:'100%', backgroundColor: colors.surface2 }} resizeMode="contain" />
                                    {mediaHeartFlash && (
                                        <View style={{ position:'absolute', top:0, left:0, right:0, bottom:0, justifyContent:'center', alignItems:'center' }}>
                                            <Text style={{ fontSize:80 }}>❤️</Text>
                                        </View>
                                    )}
                                </Pressable>
                            )}
                            {mediaViewerPost.content ? (
                                <Text style={{ color:'#fff', fontSize:13, paddingHorizontal:3, paddingTop:3 }}>{mediaViewerPost.content}</Text>
                            ) : null}
                            <View style={{ flexDirection:'row', gap:20, paddingHorizontal:17, paddingTop:14 }}>
                                <View style={{ flexDirection:'row', alignItems:'center', gap:5 }}>
                                    <TouchableOpacity onPress={() => toggleMediaViewerLike()} hitSlop={{ top:8, bottom:8, left:8, right:8 }}>
                                        <Text style={{ fontSize:18 }}>{mediaViewerPost.isLiked ? '❤️' : '🤍'}</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity onPress={openLikers}>
                                        <Text style={{ color:'#fff', fontSize:13, fontWeight:'700' }}>{t.likesCountText(mediaViewerPost._count?.likes || 0)}</Text>
                                    </TouchableOpacity>
                                </View>
                                <View style={{ flexDirection:'row', alignItems:'center', gap:5 }}>
                                    <Text style={{ fontSize:16 }}>💬</Text>
                                    <Text style={{ color:'#fff', fontSize:13, fontWeight:'700' }}>{mediaViewerPost._count?.comments || 0}</Text>
                                </View>
                            </View>

                            <View style={{ paddingHorizontal:17, paddingTop:16, paddingBottom:30 }}>
                                <Text style={{ color:'#fff', fontSize:13, fontWeight:'800', marginBottom:10 }}>{t.commentsLabel}</Text>
                                {loadingMediaComments ? (
                                    <ActivityIndicator color={colors.purple} style={{ marginVertical:16 }} />
                                ) : mediaCommentsHidden ? (
                                    <Text style={{ color: colors.textMuted, fontSize:12 }}>{t.commentsHiddenText}</Text>
                                ) : mediaViewerComments.length === 0 ? (
                                    <Text style={{ color: colors.textMuted, fontSize:12 }}>{t.noCommentsYetText}</Text>
                                ) : (
                                    mediaViewerComments.map(c => (
                                        <View key={c.id} style={{ flexDirection:'row', gap:8, marginBottom:12 }}>
                                            <View style={{ width:28, height:28, borderRadius:14, backgroundColor: colors.surface2, justifyContent:'center', alignItems:'center', overflow:'hidden' }}>
                                                {c.user?.avatar
                                                    ? <Image source={{ uri: c.user.avatar }} style={{ width:28, height:28 }} />
                                                    : <Text style={{ color:'#fff', fontWeight:'800', fontSize:11 }}>{c.user?.username?.[0]?.toUpperCase()}</Text>}
                                            </View>
                                            <View style={{ flex:1 }}>
                                                <Text style={{ color:'#fff', fontSize:12 }}>
                                                    <Text style={{ fontWeight:'800' }}>{c.user?.username}</Text> {c.content}
                                                </Text>
                                            </View>
                                        </View>
                                    ))
                                )}
                            </View>
                        </ScrollView>
                    )}
                    {mediaViewerPost && !mediaCommentsHidden && (
                        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                            <View style={{ flexDirection:'row', gap:8, alignItems:'center', paddingHorizontal:13, paddingTop:8, paddingBottom: insets.bottom + (Platform.OS==='ios' ? 8 : 10), borderTopWidth:1, borderTopColor:'#ffffff20' }}>
                                <TextInput
                                    style={{ flex:1, height:40, borderRadius:20, backgroundColor:'#ffffff14', color:'#fff', paddingHorizontal:14, fontSize:13 }}
                                    placeholder={t.addCommentPlaceholder}
                                    placeholderTextColor="#888"
                                    value={mediaCommentText}
                                    onChangeText={setMediaCommentText}
                                    returnKeyType="send"
                                    onSubmitEditing={sendMediaComment}
                                />
                                <TouchableOpacity onPress={sendMediaComment} disabled={sendingMediaComment || !mediaCommentText.trim()}
                                    style={{ opacity: (sendingMediaComment || !mediaCommentText.trim()) ? 0.4 : 1 }}>
                                    {sendingMediaComment
                                        ? <ActivityIndicator size="small" color={colors.purple} />
                                        : <Text style={{ color: colors.purple, fontSize:13, fontWeight:'800' }}>{t.postCommentSendBtn}</Text>}
                                </TouchableOpacity>
                            </View>
                        </KeyboardAvoidingView>
                    )}
                </View>
            </Modal>

            {/* ── Beğenenler modalı ── */}
            <Modal visible={likersModalOpen} animationType="slide" transparent onRequestClose={() => setLikersModalOpen(false)}>
                <View style={s.modalOverlay}>
                    <View style={[s.modalBox, { maxHeight: '70%' }]}>
                        <View style={s.modalHeader}>
                            <Text style={s.modalTitle}>❤️ {t.likersTitle}</Text>
                            <TouchableOpacity onPress={() => setLikersModalOpen(false)}>
                                <Text style={s.modalClose}>✕</Text>
                            </TouchableOpacity>
                        </View>
                        {loadingLikers ? (
                            <ActivityIndicator color={colors.purple} style={{ marginVertical: 20 }} />
                        ) : likersHidden ? (
                            <Text style={{ color: colors.textMuted, textAlign: 'center', marginVertical: 20 }}>{t.likersHiddenText}</Text>
                        ) : likersList.length === 0 ? (
                            <Text style={{ color: colors.textMuted, textAlign: 'center', marginVertical: 20 }}>{t.noLikesYetText}</Text>
                        ) : (
                            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 320 }}>
                                {likersList.map(l => (
                                    <TouchableOpacity
                                        key={l.id}
                                        style={s.friendRow}
                                        onPress={() => { setLikersModalOpen(false); setMediaViewerPost(null); navigation.push('Profile', { userId: l.user.id }); }}
                                    >
                                        <View style={s.friendAvatar}>
                                            {l.user?.avatar
                                                ? <Image source={{ uri: l.user.avatar }} style={{ width: 36, height: 36, borderRadius: 18 }} />
                                                : <Text style={{ color: '#fff', fontWeight: '800' }}>{l.user?.username?.[0]?.toUpperCase()}</Text>
                                            }
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>{l.user?.fullName || l.user?.username}</Text>
                                            <Text style={{ color: colors.textMuted, fontSize: 11 }}>{l.user?.username}</Text>
                                        </View>
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>
                        )}
                    </View>
                </View>
            </Modal>

            {/* ── Arkadaşlar listesi modalı ── */}
            <Modal visible={showFriendsListModal} animationType="slide" transparent onRequestClose={() => setShowFriendsListModal(false)}>
                <View style={{ flex:1, backgroundColor:'#000000bb', justifyContent:'flex-end' }}>
                    <View style={{ backgroundColor: colors.surface, borderTopLeftRadius:24, borderTopRightRadius:24, height:'85%', padding:17 }}>
                        <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:14, gap:3 }}>
                            <Text style={{ color:'#fff', fontSize:17, fontWeight:'900', flex:1 }}>👥 {t.friendsLabel}</Text>
                            {isOwnProfile && (
                                <TouchableOpacity onPress={() => setPrivacyPickerField('friendsList')}>
                                    <Text style={{ fontSize:18 }}>{privacyEmoji(infoForm.friendsListPrivacy)}</Text>
                                </TouchableOpacity>
                            )}
                            <TouchableOpacity onPress={() => setShowFriendsListModal(false)}><Text style={{ color: colors.textMuted, fontSize:22 }}>✕</Text></TouchableOpacity>
                        </View>

                        {isOwnProfile && (
                            <TouchableOpacity
                                style={{ flexDirection:'row', alignItems:'center', justifyContent:'center', gap:3, backgroundColor: colors.purple + '20', borderRadius:12, paddingVertical:8, marginBottom:12, borderWidth:1, borderColor: colors.purple + '50' }}
                                onPress={() => { setShowFriendsListModal(false); setShowAddFriendModal(true); }}>
                                <Text style={{ color: colors.purple, fontWeight:'800', fontSize:13 }}>🔎 Arkadaş Ara</Text>
                            </TouchableOpacity>
                        )}

                        <View style={{ flexDirection:'row', gap:3, marginBottom:12 }}>
                            {[
                                { key:'friends', label:'Arkadaşlar' },
                                { key:'following', label:'Takip Ettiklerim' },
                                { key:'followers', label:'Takipçilerim' },
                                ...(isOwnProfile ? [{ key:'blocked', label:'Engellenen Kullanıcılar' }] : []),
                            ].map(tab => (
                                <TouchableOpacity
                                    key={tab.key}
                                    style={{ flex:1, paddingVertical:5, borderRadius:10, alignItems:'center', backgroundColor: friendsModalTab===tab.key ? colors.purple : colors.surface2, borderWidth:1, borderColor: friendsModalTab===tab.key ? colors.purple : colors.border }}
                                    onPress={() => switchFriendsModalTab(tab.key)}>
                                    <Text style={{ color: friendsModalTab===tab.key ? '#fff' : colors.textMuted, fontSize:11, fontWeight:'800' }}>{tab.label}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        <ScrollView showsVerticalScrollIndicator={false}>
                            {friendsModalTab === 'friends' && (
                                loadingFriendsList ? (
                                    <ActivityIndicator color={colors.purple} style={{ marginTop:30 }} />
                                ) : friendsList.length === 0 ? (
                                    <Text style={{ color: colors.textMuted, fontSize:12, textAlign:'center', marginTop:30 }}>Henüz arkadaş yok</Text>
                                ) : friendsList.map(f => (
                                    <View key={f.id} style={{ flexDirection:'row', alignItems:'center', backgroundColor: colors.surface2, borderRadius:14, padding:9, marginBottom:8, borderWidth:1, borderColor: colors.border }}>
                                        <TouchableOpacity
                                            style={{ flex:1, flexDirection:'row', alignItems:'center' }}
                                            onPress={() => { setShowFriendsListModal(false); navigation.push('Profile', { userId: f.id }); }}>
                                            {f.avatar
                                                ? <Image source={{ uri: f.avatar }} style={{ width:40, height:40, borderRadius:20, marginRight:10 }} />
                                                : <View style={{ width:40, height:40, borderRadius:20, marginRight:10, backgroundColor: colors.purple + '30', alignItems:'center', justifyContent:'center' }}>
                                                    <Text style={{ color: colors.purple, fontWeight:'800' }}>{(f.username?.[0] || '?').toUpperCase()}</Text>
                                                  </View>
                                            }
                                            <View style={{ flex:1 }}>
                                                <Text style={{ color:'#fff', fontSize:13, fontWeight:'700' }}>{f.fullName || f.username}</Text>
                                                <Text style={{ color: colors.textMuted, fontSize:11 }}>{f.username}</Text>
                                            </View>
                                        </TouchableOpacity>
                                        {isOwnProfile && (
                                            <TouchableOpacity style={{ backgroundColor:'#dc262620', borderRadius:8, paddingHorizontal:7, paddingVertical:4, borderWidth:1, borderColor:'#dc262650' }} onPress={() => handleRemoveFriendFromList(f)}>
                                                <Text style={{ color:'#f87171', fontSize:11, fontWeight:'700' }}>Arkadaşlıktan Çık</Text>
                                            </TouchableOpacity>
                                        )}
                                    </View>
                                ))
                            )}

                            {friendsModalTab === 'following' && (
                                loadingFollowLists ? (
                                    <ActivityIndicator color={colors.purple} style={{ marginTop:30 }} />
                                ) : followingList.length === 0 ? (
                                    <Text style={{ color: colors.textMuted, fontSize:12, textAlign:'center', marginTop:30 }}>Henüz kimseyi takip etmiyorsun</Text>
                                ) : followingList.map(f => (
                                    <View key={f.id} style={{ flexDirection:'row', alignItems:'center', backgroundColor: colors.surface2, borderRadius:14, padding:9, marginBottom:8, borderWidth:1, borderColor: colors.border }}>
                                        <TouchableOpacity style={{ flex:1, flexDirection:'row', alignItems:'center' }} onPress={() => { setShowFriendsListModal(false); navigation.push('Profile', { userId: f.id }); }}>
                                            {f.avatar
                                                ? <Image source={{ uri: f.avatar }} style={{ width:40, height:40, borderRadius:20, marginRight:10 }} />
                                                : <View style={{ width:40, height:40, borderRadius:20, marginRight:10, backgroundColor: colors.purple + '30', alignItems:'center', justifyContent:'center' }}>
                                                    <Text style={{ color: colors.purple, fontWeight:'800' }}>{(f.username?.[0] || '?').toUpperCase()}</Text>
                                                  </View>
                                            }
                                            <View style={{ flex:1 }}>
                                                <Text style={{ color:'#fff', fontSize:13, fontWeight:'700' }}>{f.fullName || f.username}</Text>
                                                <Text style={{ color: colors.textMuted, fontSize:11 }}>{f.username}</Text>
                                            </View>
                                        </TouchableOpacity>
                                        {isOwnProfile && (
                                            <TouchableOpacity style={{ backgroundColor:'#dc262620', borderRadius:8, paddingHorizontal:7, paddingVertical:4, borderWidth:1, borderColor:'#dc262650' }} onPress={() => handleUnfollowFromList(f)}>
                                                <Text style={{ color:'#f87171', fontSize:11, fontWeight:'700' }}>Takipten Çık</Text>
                                            </TouchableOpacity>
                                        )}
                                    </View>
                                ))
                            )}

                            {friendsModalTab === 'followers' && (
                                loadingFollowLists ? (
                                    <ActivityIndicator color={colors.purple} style={{ marginTop:30 }} />
                                ) : (
                                    <>
                                        {pendingFollowReqs.length > 0 && (
                                            <View style={{ marginBottom: 12 }}>
                                                <Text style={{ color: colors.textMuted, fontSize:11, fontWeight:'700', marginBottom:6 }}>⏳ Bekleyen İstekler</Text>
                                                {pendingFollowReqs.map(req => (
                                                    <View key={req.id} style={{ flexDirection:'row', alignItems:'center', backgroundColor: colors.surface2, borderRadius:14, padding:9, marginBottom:8, borderWidth:1, borderColor: colors.purple + '40' }}>
                                                        <View style={{ flex:1 }}>
                                                            <Text style={{ color:'#fff', fontSize:13, fontWeight:'700' }}>{req.fullName || req.username}</Text>
                                                            <Text style={{ color: colors.textMuted, fontSize:11 }}>{req.username}</Text>
                                                        </View>
                                                        <TouchableOpacity style={[s.actionBtn, s.actionBtnActive, { marginRight:6 }]} onPress={() => handleRespondFollowReqInList(req, 'accept')}>
                                                            <Text style={s.actionBtnText}>✓</Text>
                                                        </TouchableOpacity>
                                                        <TouchableOpacity style={s.actionBtn} onPress={() => handleRespondFollowReqInList(req, 'reject')}>
                                                            <Text style={s.actionBtnText}>✕</Text>
                                                        </TouchableOpacity>
                                                    </View>
                                                ))}
                                            </View>
                                        )}
                                        {followersList.length === 0 ? (
                                            <Text style={{ color: colors.textMuted, fontSize:12, textAlign:'center', marginTop:10 }}>Henüz takipçin yok</Text>
                                        ) : followersList.map(f => (
                                            <View key={f.id} style={{ flexDirection:'row', alignItems:'center', backgroundColor: colors.surface2, borderRadius:14, padding:9, marginBottom:8, borderWidth:1, borderColor: colors.border }}>
                                                <TouchableOpacity style={{ flex:1, flexDirection:'row', alignItems:'center' }} onPress={() => { setShowFriendsListModal(false); navigation.push('Profile', { userId: f.id }); }}>
                                                    {f.avatar
                                                        ? <Image source={{ uri: f.avatar }} style={{ width:40, height:40, borderRadius:20, marginRight:10 }} />
                                                        : <View style={{ width:40, height:40, borderRadius:20, marginRight:10, backgroundColor: colors.purple + '30', alignItems:'center', justifyContent:'center' }}>
                                                            <Text style={{ color: colors.purple, fontWeight:'800' }}>{(f.username?.[0] || '?').toUpperCase()}</Text>
                                                          </View>
                                                    }
                                                    <View style={{ flex:1 }}>
                                                        <Text style={{ color:'#fff', fontSize:13, fontWeight:'700' }}>{f.fullName || f.username}</Text>
                                                        <Text style={{ color: colors.textMuted, fontSize:11 }}>{f.username}</Text>
                                                    </View>
                                                </TouchableOpacity>
                                                {isOwnProfile && (
                                                    <TouchableOpacity style={{ backgroundColor:'#dc262620', borderRadius:8, paddingHorizontal:7, paddingVertical:4, borderWidth:1, borderColor:'#dc262650' }} onPress={() => handleRemoveFollower(f)}>
                                                        <Text style={{ color:'#f87171', fontSize:11, fontWeight:'700' }}>Kaldır</Text>
                                                    </TouchableOpacity>
                                                )}
                                            </View>
                                        ))}
                                    </>
                                )
                            )}

                            {friendsModalTab === 'blocked' && (
                                loadingBlockedList ? (
                                    <ActivityIndicator color={colors.purple} style={{ marginTop:30 }} />
                                ) : blockedList.length === 0 ? (
                                    <Text style={{ color: colors.textMuted, fontSize:12, textAlign:'center', marginTop:30 }}>Henüz kimseyi engellemedin</Text>
                                ) : blockedList.map(u => (
                                    <View key={u.id} style={{ flexDirection:'row', alignItems:'center', backgroundColor: colors.surface2, borderRadius:14, padding:9, marginBottom:8, borderWidth:1, borderColor: colors.border }}>
                                        <View style={{ flex:1, flexDirection:'row', alignItems:'center' }}>
                                            {u.avatar
                                                ? <Image source={{ uri: u.avatar }} style={{ width:40, height:40, borderRadius:20, marginRight:10 }} />
                                                : <View style={{ width:40, height:40, borderRadius:20, marginRight:10, backgroundColor: colors.purple + '30', alignItems:'center', justifyContent:'center' }}>
                                                    <Text style={{ color: colors.purple, fontWeight:'800' }}>{(u.username?.[0] || '?').toUpperCase()}</Text>
                                                  </View>
                                            }
                                            <View style={{ flex:1 }}>
                                                <Text style={{ color:'#fff', fontSize:13, fontWeight:'700' }}>{u.fullName || u.username}</Text>
                                                <Text style={{ color: colors.textMuted, fontSize:11 }}>{u.username}</Text>
                                            </View>
                                        </View>
                                        <TouchableOpacity style={{ backgroundColor:'#dc262620', borderRadius:8, paddingHorizontal:7, paddingVertical:4, borderWidth:1, borderColor:'#dc262650' }} onPress={() => handleUnblockUser(u)}>
                                            <Text style={{ color:'#f87171', fontSize:11, fontWeight:'700' }}>Engeli Kaldır</Text>
                                        </TouchableOpacity>
                                    </View>
                                ))
                            )}
                        </ScrollView>
                    </View>
                </View>
            </Modal>

            {/* ── Aktiviteler görüntüleme modalı (başkasının profili) ── */}
            <Modal visible={showActivitiesViewModal} animationType="slide" transparent onRequestClose={() => setShowActivitiesViewModal(false)}>
                <View style={{ flex:1, backgroundColor:'#000000bb', justifyContent:'flex-end' }}>
                    <View style={{ backgroundColor: colors.surface, borderTopLeftRadius:24, borderTopRightRadius:24, height:'80%', padding:17 }}>
                        <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:14, gap:3 }}>
                            <Text style={{ color:'#fff', fontSize:17, fontWeight:'900', flex:1 }}>🏃 Sporlar</Text>
                            {isOwnProfile && (
                                <TouchableOpacity onPress={() => setPrivacyPickerField('activities')}>
                                    <Text style={{ fontSize:18 }}>{privacyEmoji(infoForm.activitiesPrivacy)}</Text>
                                </TouchableOpacity>
                            )}
                            <TouchableOpacity onPress={() => setShowActivitiesViewModal(false)}><Text style={{ color: colors.textMuted, fontSize:22 }}>✕</Text></TouchableOpacity>
                        </View>
                        <ScrollView showsVerticalScrollIndicator={false}>
                            {interests.length === 0 ? (
                                <Text style={{ color: colors.textMuted, fontSize:12, textAlign:'center', marginTop:30 }}>Henüz spor eklenmemiş</Text>
                            ) : interests.map(i => (
                                <View key={i.id} style={{ flexDirection:'row', alignItems:'center', backgroundColor: colors.surface2, borderRadius:14, padding:9, marginBottom:8, borderWidth:1, borderColor: colors.border }}>
                                    <Text style={{ fontSize:22, marginRight:10 }}>{SUB_EMOJI[i.subCategory] || '🏅'}</Text>
                                    <View style={{ flex:1 }}>
                                        <Text style={{ color:'#fff', fontSize:13, fontWeight:'700' }}>{getSubCategoryLabel(i.subCategory, lang)}</Text>
                                        <Text style={{ color: colors.textMuted, fontSize:11 }}>{t.levelTr?.[i.level] || i.level}{i.skillRating != null ? `  ${Number(i.skillRating).toFixed(2)}★` : ''}</Text>
                                        {(i.isCoach || i.isReferee) && (
                                            <Text style={{ fontSize: 10, fontWeight: '800', color: i.isCoach ? '#4ade80' : '#fbbf24', marginTop: 2 }}>
                                                {i.isCoach ? '🎓 Antrenör' : '🟨 Hakem'}
                                            </Text>
                                        )}
                                    </View>
                                </View>
                            ))}
                        </ScrollView>
                    </View>
                </View>
            </Modal>

            {/* ── Admin Paneli — Turnuva İzin Talepleri ── */}
            <Modal visible={showAdminPanel} animationType="slide" transparent onRequestClose={() => setShowAdminPanel(false)}>
                <View style={ap.overlay}>
                    <View style={ap.box}>
                        <View style={ap.header}>
                            <Text style={ap.title}>🛡️ Turnuva İzin Talepleri</Text>
                            <TouchableOpacity onPress={() => setShowAdminPanel(false)}><Text style={ap.close}>✕</Text></TouchableOpacity>
                        </View>
                        {loadingPerms ? (
                            <ActivityIndicator color={colors.purple} style={{ marginVertical: 40 }} />
                        ) : permRequests.length === 0 ? (
                            <View style={{ alignItems: 'center', paddingVertical: 45 }}>
                                <Text style={{ fontSize: 40, marginBottom: 12 }}>✅</Text>
                                <Text style={{ color: colors.textMuted, fontSize: 14 }}>Bekleyen talep yok.</Text>
                            </View>
                        ) : (
                            permRequests.map(req => (
                                <View key={req.id} style={ap.card}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={ap.username}>{req.user?.username}</Text>
                                        {req.user?.fullName ? <Text style={ap.fullname}>{req.user.fullName}</Text> : null}
                                    </View>
                                    <TouchableOpacity style={ap.approveBtn} onPress={() => handlePermApprove(req.userId)}>
                                        <Text style={ap.approveTxt}>Onayla</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity style={ap.rejectBtn} onPress={() => handlePermReject(req.userId)}>
                                        <Text style={ap.rejectTxt}>Reddet</Text>
                                    </TouchableOpacity>
                                </View>
                            ))
                        )}
                    </View>
                </View>
            </Modal>

            {/* ── Create Story Modal ── */}
            <Modal visible={createStoryOpen} animationType="slide" transparent onRequestClose={() => setCreateStoryOpen(false)}>
                <View style={s.modalOverlay}>
                    <View style={s.modalBox}>
                        <View style={s.modalHeader}>
                            <Text style={s.modalTitle}>📸 Hikaye Paylaş</Text>
                            <TouchableOpacity onPress={() => setCreateStoryOpen(false)}>
                                <Text style={s.modalClose}>✕</Text>
                            </TouchableOpacity>
                        </View>

                        {pickedMedia && (
                            <View style={{ alignItems: 'center', marginBottom: 16 }}>
                                {pickedMedia.type === 'image'
                                    ? <Image source={{ uri: pickedMedia.uri }} style={{ width: '100%', height: 200, borderRadius: 16 }} resizeMode="cover" />
                                    : <View style={{ width: '100%', height: 200, borderRadius: 16, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' }}>
                                            <Text style={{ color: '#fff', fontSize: 36 }}>▶</Text>
                                        </View>
                                }
                            </View>
                        )}

                        <Text style={s.fieldLabel}>Dal seç (hikaye bu dalın medyasında görünür)</Text>
                        <ScrollView style={{ maxHeight: 180 }} showsVerticalScrollIndicator={false}>
                            {interests.map(i => (
                                <TouchableOpacity
                                    key={i.id}
                                    style={[s.branchOption, storyBranch?.subCategory === i.subCategory && s.branchOptionActive]}
                                    onPress={() => setStoryBranch({ category: i.category, subCategory: i.subCategory })}
                                >
                                    <Text style={s.branchOptionText}>{SUB_EMOJI[i.subCategory] || '🏅'} {getSubCategoryLabel(i.subCategory, lang)}</Text>
                                    {storyBranch?.subCategory === i.subCategory && <Text style={{ color: colors.purple }}>✓</Text>}
                                </TouchableOpacity>
                            ))}
                        </ScrollView>

                        <TouchableOpacity
                            style={[s.saveBtn, (!storyBranch || postingStory) && { opacity: 0.5 }, { marginTop: 16 }]}
                            onPress={handlePostStory}
                            disabled={!storyBranch || postingStory}
                        >
                            <Text style={s.saveBtnText}>{postingStory ? 'Paylaşılıyor...' : '🚀 Paylaş (24s)'}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* ── Story Viewer Modal ── */}
            <Modal visible={storyViewIdx !== null} animationType="fade" statusBarTranslucent onRequestClose={() => setStoryViewIdx(null)}>
                {storyViewIdx !== null && stories[storyViewIdx] && (() => {
                    const story = stories[storyViewIdx];
                    return (
                        <View style={{ flex: 1, backgroundColor: '#000' }}>
                            {/* Tam ekran görsel */}
                            <View style={{ flex: 1 }}>
                                {story.imageUrl
                                    ? <Image source={{ uri: story.imageUrl }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                                    : story.videoUrl
                                        ? <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}><Text style={{ fontSize: 60 }}>🎬</Text></View>
                                        : <View style={{ flex: 1, backgroundColor: '#111' }} />
                                }
                                {/* Müzik — sol üst */}
                                {!!story.musicName && (
                                    <View style={{ position: 'absolute', top: 90, left: 14, flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#00000075', borderRadius: 20, paddingHorizontal: 9, paddingVertical: 4, maxWidth: '65%' }}>
                                        <Text style={{ fontSize: 14 }}>🎵</Text>
                                        <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{story.musicName}{story.musicArtist ? ` – ${story.musicArtist}` : ''}</Text>
                                    </View>
                                )}
                                {/* Konum — sağ alt */}
                                {!!story.location && (
                                    <View style={{ position: 'absolute', bottom: isOwnProfile ? 180 : 72, right: 14, flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#00000075', borderRadius: 16, paddingHorizontal: 7, paddingVertical: 3 }}>
                                        <Text style={{ fontSize: 12 }}>📍</Text>
                                        <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{story.location}</Text>
                                    </View>
                                )}
                                {/* Yazı overlay — ortada */}
                                {!!story.content && (
                                    <View style={{ position: 'absolute', left: 20, right: 20, bottom: story.location ? (isOwnProfile ? 240 : 130) : (isOwnProfile ? 180 : 72), alignItems: 'center' }}>
                                        <View style={{ backgroundColor: '#00000065', borderRadius: 12, paddingHorizontal: 13, paddingVertical: 7 }}>
                                            <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700', textAlign: 'center', lineHeight: 23 }}>{story.content}</Text>
                                        </View>
                                    </View>
                                )}
                                {/* Kim baktı — sadece kendi profilinde */}
                                {isOwnProfile && (
                                    <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#000000cc', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 17, paddingTop: 11, paddingBottom: 27 }}>
                                        <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', marginBottom: 10 }}>
                                            👁 {storyViewers.length} kişi baktı
                                        </Text>
                                        {storyViewers.length === 0
                                            ? <Text style={{ color: colors.textMuted, fontSize: 12 }}>Henüz kimse bakmadı</Text>
                                            : (
                                                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                                                    {storyViewers.map((v) => (
                                                        <View key={v.id} style={{ alignItems: 'center', marginRight: 14 }}>
                                                            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.purple + '60', justifyContent: 'center', alignItems: 'center' }}>
                                                                {v.user?.avatar
                                                                    ? <Image source={{ uri: v.user.avatar }} style={{ width: 36, height: 36, borderRadius: 18 }} />
                                                                    : <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>{v.user?.username?.[0]?.toUpperCase()}</Text>
                                                                }
                                                            </View>
                                                            <Text style={{ color: '#fff', fontSize: 9, fontWeight: '600', marginTop: 4 }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                                                                {v.user?.username}
                                                            </Text>
                                                        </View>
                                                    ))}
                                                </ScrollView>
                                            )
                                        }
                                    </View>
                                )}
                                {/* Dokunma bölgeleri */}
                                <TouchableOpacity style={{ position: 'absolute', left: 0, top: 60, bottom: isOwnProfile ? 140 : 0, width: '35%' }} onPress={goStoryPrev} activeOpacity={1} />
                                <TouchableOpacity style={{ position: 'absolute', right: 0, top: 60, bottom: isOwnProfile ? 140 : 0, width: '65%' }} onPress={goStoryNext} activeOpacity={1} />
                            </View>
                            {/* İlerleme çubukları — en üstte */}
                            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', gap: 3, paddingHorizontal: 9, paddingTop: 49, paddingBottom: 5 }}>
                                {stories.map((_, i) => (
                                    <View key={i} style={{ flex: 1, height: 2.5, borderRadius: 2, backgroundColor: '#ffffff35', overflow: 'hidden' }}>
                                        {i < storyViewIdx
                                            ? <View style={{ flex: 1, backgroundColor: '#fff' }} />
                                            : i === storyViewIdx
                                                ? <View style={{ width: `${Math.min(storyProgress * 100, 100)}%`, height: '100%', backgroundColor: '#fff' }} />
                                                : null
                                        }
                                    </View>
                                ))}
                            </View>
                        </View>
                    );
                })()}
            </Modal>

            {/* ── Profile Info Modal ── */}
            <Modal visible={profileInfoOpen} animationType="slide" transparent onRequestClose={() => setProfileInfoOpen(false)}>
                <View style={s.modalOverlay}>
                    <View style={s.modalBox}>
                        <View style={s.modalHeader}>
                            <Text style={s.modalTitle}>/ Kişisel Bilgiler</Text>
                            <TouchableOpacity onPress={() => setProfileInfoOpen(false)}>
                                <Text style={s.modalClose}>✕</Text>
                            </TouchableOpacity>
                        </View>

                        <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 420 }}>

                            {/* ── Language ── */}
                            <View style={s.infoFieldHeader}>
                                <Text style={s.fieldLabel}>🌐 Dil / Language</Text>
                                <View style={{ flexDirection: 'row', gap: 3 }}>
                                    {['tr', 'en', 'ru'].map(l => (
                                        <TouchableOpacity
                                            key={l}
                                            onPress={() => dispatch(setLang(l))}
                                            style={[
                                                s.langChip,
                                                lang === l && s.langChipActive,
                                            ]}
                                        >
                                            <Text style={[s.langChipText, lang === l && { color: '#fff' }]}>
                                                {l === 'tr' ? '🇹🇷 TR' : l === 'ru' ? '🇷🇺 RU' : '🇬🇧 EN'}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </View>

                            {/* ── Data Saver ── */}
                            <View style={s.infoFieldHeader}>
                                <View>
                                    <Text style={s.fieldLabel}>{t.dataSaverLabel}</Text>
                                    <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
                                        {t.dataSaverDesc}
                                    </Text>
                                </View>
                                <TouchableOpacity
                                    onPress={toggleDataSaver}
                                    style={[s.toggleTrack, dataSaver && s.toggleTrackOn]}
                                    activeOpacity={0.8}
                                >
                                    <View style={[s.toggleThumb, dataSaver && s.toggleThumbOn]} />
                                </TouchableOpacity>
                            </View>

                            {/* ── Ek Bildirim Kanalı ── */}
                            <TouchableOpacity style={s.infoFieldHeader} onPress={openNotifyChannelModal} activeOpacity={0.7}>
                                <View style={{ flex: 1 }}>
                                    <Text style={s.fieldLabel}>{t.extraNotifyLabel}</Text>
                                    <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }} numberOfLines={1}>
                                        {myUser?.extraNotifyChannel ? t[`extraNotify_${myUser.extraNotifyChannel}`] : t.extraNotifyOff}
                                    </Text>
                                </View>
                                <Text style={{ color: colors.textMuted, fontSize: 18 }}>›</Text>
                            </TouchableOpacity>

                            <View style={s.divider} />

                            {/* İletişim Bilgileri */}
                            <Text style={s.menuSectionTitle}>📞 {t.contactSection}</Text>

                            {[
                                { field:'contactPhone',    emoji:'📞💬', emojiSize:11, ph:t.contactPhonePh,    privPrefix:'phone',    kbd:'phone-pad' },
                                { field:'contactTelegram', emoji:'✈️',   emojiSize:16, ph:t.contactTelegramPh, privPrefix:'telegram', kbd:'default'   },
                                { field:'contactEmail',    emoji:'✉️',   emojiSize:16, ph:t.contactEmailPh,    privPrefix:'cEmail',   kbd:'email-address' },
                                { field:'contactInstagram',emoji:'📸',   emojiSize:16, ph:t.contactInstagramPh,privPrefix:'instagram',kbd:'default'   },
                            ].map(({ field, emoji, emojiSize, ph, privPrefix, kbd }) => (
                                <View key={field} style={[s.contactFieldRow, { marginBottom:10 }]}>
                                    <View style={{ flexDirection:'row', alignItems:'center', gap:6 }}>
                                        {/* Emoji prefix */}
                                        <View style={{ width:42, height:44, borderRadius:10, backgroundColor: colors.surface2, borderWidth:1, borderColor: colors.border, alignItems:'center', justifyContent:'center' }}>
                                            <Text style={{ fontSize:emojiSize }}>{emoji}</Text>
                                        </View>
                                        {/* Country code button — only for phone */}
                                        {field === 'contactPhone' && (
                                            <TouchableOpacity
                                                onPress={() => setShowCCPicker(true)}
                                                style={{ height:44, paddingHorizontal:10, borderRadius:10, backgroundColor: colors.surface2, borderWidth:1, borderColor: colors.border, alignItems:'center', justifyContent:'center' }}>
                                                <Text style={{ color: colors.text, fontSize:13 }}>
                                                    {(() => { const cc = COUNTRY_CODES.find(c => c.code === phoneCC); return cc ? `${cc.flag} ${cc.code}` : phoneCC; })()}
                                                </Text>
                                            </TouchableOpacity>
                                        )}
                                        <TextInput
                                            style={[s.fieldInput, { flex:1, marginBottom:0 }]}
                                            value={infoForm[field]}
                                            onChangeText={v => setInfoForm(f => ({ ...f, [field]: v }))}
                                            placeholder={ph}
                                            placeholderTextColor={colors.textMuted}
                                            keyboardType={kbd}
                                            autoCapitalize="none"
                                        />
                                        <TouchableOpacity
                                            onPress={() => setPrivacyPickerField(privPrefix)}
                                            style={s.privacyIconBtn}>
                                            <Text style={{ fontSize:18 }}>{privacyEmoji(infoForm[`${privPrefix}Privacy`])}</Text>
                                        </TouchableOpacity>
                                    </View>
                                    {field === 'contactPhone' && (
                                        <Text style={{ color: colors.textMuted, fontSize:11, marginTop:4, marginLeft:42 }}>
                                            {t.contactPhoneHint}
                                        </Text>
                                    )}
                                </View>
                            ))}

                            <View style={s.divider} />

                            {/* ── Profile Privacy (general) ── */}
                            <View style={s.infoFieldHeader}>
                                <Text style={s.fieldLabel}>{t.profileVisibilityLabel}</Text>
                                <TouchableOpacity onPress={() => setPrivacyPickerField('profile')} style={s.menuBtn}>
                                    <Text style={s.menuBtnPrivacy}>{privacyEmoji(infoForm.profilePrivacy)}</Text>
                                    <Text style={s.menuBtnIcon}>≡</Text>
                                </TouchableOpacity>
                            </View>
                            <View style={[s.fieldInput, { justifyContent: 'center', marginBottom: 8 }]}>
                                <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                                    {infoForm.profilePrivacy === 'PUBLIC' ? t.visibilityPublic
                                        : infoForm.profilePrivacy === 'FRIENDS' ? t.visibilityFriendsOnly
                                        : t.visibilityFriendsExcept(infoForm.profileExclude.length)}
                                </Text>
                            </View>
                            {infoForm.profilePrivacy === 'FRIENDS_EXCEPT' && infoForm.profileExclude.length > 0 && (
                                <Text style={s.excludeHint}>{t.excludeHintCount(infoForm.profileExclude.length)}</Text>
                            )}

                            {/* ── Full Name (read-only, değişiklik talebi ile) ── */}
                            <View style={s.infoFieldHeader}>
                                <Text style={s.fieldLabel}>{t.fullNameFieldLabelProfile}</Text>
                                <TouchableOpacity onPress={() => setPrivacyPickerField('fullName')} style={s.menuBtn}>
                                    <Text style={s.menuBtnPrivacy}>{privacyEmoji(infoForm.fullNamePrivacy)}</Text>
                                    <Text style={s.menuBtnIcon}>≡</Text>
                                </TouchableOpacity>
                            </View>
                            <View style={{ flexDirection:'row', alignItems:'center', gap:3, marginBottom:4 }}>
                                <View style={[s.fieldInput, { flex:1, justifyContent:'center' }]}>
                                    <Text style={{ color: infoForm.fullName ? '#fff' : colors.textMuted, fontSize:13 }}>
                                        {infoForm.fullName || t.notEnteredText}
                                    </Text>
                                </View>
                                <TouchableOpacity onPress={() => openChangeReq('fullName')}
                                    style={{ backgroundColor:'#7c3aed20', borderRadius:8, paddingHorizontal:7, paddingVertical:4, borderWidth:1, borderColor:'#7c3aed50' }}>
                                    <Text style={{ color:'#a78bfa', fontSize:11, fontWeight:'700' }}>{t.changeFieldBtn}</Text>
                                </TouchableOpacity>
                            </View>
                            <Text style={{ color:'#f59e0b', fontSize:10, marginBottom:8 }}>{t.changeRequiresApproval}</Text>
                            {infoForm.fullNamePrivacy === 'FRIENDS_EXCEPT' && infoForm.fullNameExclude.length > 0 && (
                                <Text style={s.excludeHint}>{t.excludeHintCount(infoForm.fullNameExclude.length)}</Text>
                            )}

                            {/* ── City ── */}
                            <View style={s.infoFieldHeader}>
                                <Text style={s.fieldLabel}>{t.cityFieldLabel}</Text>
                                <TouchableOpacity
                                    onPress={() => setPrivacyPickerField('city')}
                                    style={s.menuBtn}
                                >
                                    <Text style={s.menuBtnPrivacy}>{privacyEmoji(infoForm.cityPrivacy)}</Text>
                                    <Text style={s.menuBtnIcon}>≡</Text>
                                </TouchableOpacity>
                            </View>
                            <TouchableOpacity
                                style={[s.fieldInput, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
                                onPress={() => setShowCityPickerProfile(true)}
                            >
                                <Text style={{ color: infoForm.city ? colors.text : colors.textMuted, fontSize: 14 }}>
                                    {infoForm.city || t.citySelectPlaceholder}
                                </Text>
                                <Text style={{ color: colors.textMuted, fontSize: 16 }}>▾</Text>
                            </TouchableOpacity>
                            {infoForm.cityPrivacy === 'FRIENDS_EXCEPT' && infoForm.cityExclude.length > 0 && (
                                <Text style={s.excludeHint}>{t.excludeHintCount(infoForm.cityExclude.length)}</Text>
                            )}

                            {/* ── Gender (read-only, değişiklik talebi ile) ── */}
                            <View style={s.infoFieldHeader}>
                                <Text style={s.fieldLabel}>{t.genderFieldLabelProfile}</Text>
                                <TouchableOpacity onPress={() => setPrivacyPickerField('gender')} style={s.menuBtn}>
                                    <Text style={s.menuBtnPrivacy}>{privacyEmoji(infoForm.genderPrivacy)}</Text>
                                    <Text style={s.menuBtnIcon}>≡</Text>
                                </TouchableOpacity>
                            </View>
                            <View style={{ flexDirection:'row', alignItems:'center', gap:3, marginBottom:4 }}>
                                <View style={[s.fieldInput, { flex:1, justifyContent:'center' }]}>
                                    <Text style={{ color: infoForm.gender ? '#fff' : colors.textMuted, fontSize:13 }}>
                                        {infoForm.gender === 'MALE' ? t.genderMale
                                            : infoForm.gender === 'FEMALE' ? t.genderFemale
                                            : infoForm.gender === 'OTHER' ? t.genderOther
                                            : t.notEnteredText}
                                    </Text>
                                </View>
                                <TouchableOpacity onPress={() => openChangeReq('gender')}
                                    style={{ backgroundColor:'#7c3aed20', borderRadius:8, paddingHorizontal:7, paddingVertical:4, borderWidth:1, borderColor:'#7c3aed50' }}>
                                    <Text style={{ color:'#a78bfa', fontSize:11, fontWeight:'700' }}>{t.changeFieldBtn}</Text>
                                </TouchableOpacity>
                            </View>
                            <Text style={{ color:'#f59e0b', fontSize:10, marginBottom:14 }}>{t.changeRequiresApproval}</Text>
                            {infoForm.genderPrivacy === 'FRIENDS_EXCEPT' && infoForm.genderExclude.length > 0 && (
                                <Text style={s.excludeHint}>{t.excludeHintCount(infoForm.genderExclude.length)}</Text>
                            )}

                            {/* ── Birth Date (read-only, değişiklik talebi ile) ── */}
                            <View style={s.infoFieldHeader}>
                                <Text style={s.fieldLabel}>{t.birthDateFieldLabelProfile}</Text>
                                <TouchableOpacity onPress={() => setPrivacyPickerField('birthDate')} style={s.menuBtn}>
                                    <Text style={s.menuBtnPrivacy}>{privacyEmoji(infoForm.birthDatePrivacy)}</Text>
                                    <Text style={s.menuBtnIcon}>≡</Text>
                                </TouchableOpacity>
                            </View>
                            <View style={{ flexDirection:'row', alignItems:'center', gap:3, marginBottom:4 }}>
                                <View style={[s.fieldInput, { flex:1, justifyContent:'center' }]}>
                                    <Text style={{ color: infoForm.birthDate ? '#fff' : colors.textMuted, fontSize:13 }}>
                                        {infoForm.birthDate || t.notEnteredText}
                                    </Text>
                                </View>
                                <TouchableOpacity onPress={() => openChangeReq('birthDate')}
                                    style={{ backgroundColor:'#7c3aed20', borderRadius:8, paddingHorizontal:7, paddingVertical:4, borderWidth:1, borderColor:'#7c3aed50' }}>
                                    <Text style={{ color:'#a78bfa', fontSize:11, fontWeight:'700' }}>{t.changeFieldBtn}</Text>
                                </TouchableOpacity>
                            </View>
                            <Text style={{ color:'#f59e0b', fontSize:10, marginBottom:8 }}>{t.changeRequiresApproval}</Text>
                            {infoForm.birthDatePrivacy === 'FRIENDS_EXCEPT' && infoForm.birthDateExclude.length > 0 && (
                                <Text style={s.excludeHint}>{t.excludeHintCount(infoForm.birthDateExclude.length)}</Text>
                            )}

                            {/* ── Join date (read-only) ── */}
                            <Text style={s.fieldLabel}>{t.joinDateFieldLabel}</Text>
                            <View style={[s.fieldInput, { justifyContent: 'center' }]}>
                                <Text style={{ color: colors.textMuted }}>{joinDate(profile?.createdAt, lang)}</Text>
                            </View>

                        </ScrollView>

                        <View style={[s.modalBtns, { marginTop: 16 }]}>
                            <TouchableOpacity style={s.cancelBtn} onPress={() => setProfileInfoOpen(false)}>
                                <Text style={s.cancelBtnText}>{t.cancelBtn}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={s.saveBtn} onPress={handleSaveInfo} disabled={savingInfo}>
                                <Text style={s.saveBtnText}>{savingInfo ? t.savingText : t.saveBtn}</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            <ExtraNotifyChannelModal
                visible={notifyChannelModalOpen}
                onClose={() => setNotifyChannelModalOpen(false)}
                t={t}
                channel={myUser?.extraNotifyChannel || null}
                phone={myUser?.extraNotifyPhone || ''}
                email={myUser?.extraNotifyEmail || ''}
                accountPhone={myUser?.accountPhone || ''}
                accountEmail={myUser?.accountEmail || ''}
                telegramLinked={!!myUser?.telegramLinked}
                onLinkTelegram={linkTelegram}
                onUnlinkTelegram={unlinkTelegram}
                linkingTelegram={linkingTelegram}
                onSave={saveNotifyChannel}
                saving={savingNotifyChannel}
            />

            {/* ── City Picker (Profile Edit) ── */}
            <CityPickerModal
                visible={showCityPickerProfile}
                onClose={() => setShowCityPickerProfile(false)}
                onSelect={city => setInfoForm(f => ({ ...f, city }))}
                currentValue={infoForm.city}
            />

            {/* ── Profil Değişiklik Talebi Modal ── */}
            <Modal visible={changeReqOpen} animationType="slide" transparent onRequestClose={() => setChangeReqOpen(false)}>
                <View style={s.modalOverlay}>
                    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width:'100%' }}>
                        <View style={[s.modalBox, { maxHeight:'90%' }]}>
                            <View style={s.modalHeader}>
                                <Text style={s.modalTitle}>
                                    {changeReqField === 'fullName' ? t.changeReqTitleFullName
                                        : changeReqField === 'gender' ? t.changeReqTitleGender
                                        : t.changeReqTitleBirthDate}
                                </Text>
                                <TouchableOpacity onPress={() => setChangeReqOpen(false)}>
                                    <Text style={s.modalClose}>✕</Text>
                                </TouchableOpacity>
                            </View>

                            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight:400 }}>
                                {/* Mevcut bekleyen talep uyarısı */}
                                {myChangeRequests.filter(r => r.field === changeReqField && r.status === 'PENDING').length > 0 && (
                                    <View style={{ backgroundColor:'#f59e0b12', borderRadius:10, padding:9, marginBottom:12, borderWidth:1, borderColor:'#f59e0b40' }}>
                                        <Text style={{ color:'#f59e0b', fontSize:12, fontWeight:'700' }}>{t.changeReqPendingWarning}</Text>
                                        <Text style={{ color:colors.textMuted, fontSize:11, marginTop:4 }}>{t.changeReqPendingDesc}</Text>
                                    </View>
                                )}

                                {/* Son işlenmiş talepler */}
                                {myChangeRequests.filter(r => r.field === changeReqField && r.status !== 'PENDING').slice(0,1).map(r => (
                                    <View key={r.id} style={{ backgroundColor: r.status === 'APPROVED' ? '#16a34a12' : '#dc262612', borderRadius:10, padding:9, marginBottom:12, borderWidth:1, borderColor: r.status === 'APPROVED' ? '#16a34a40' : '#dc262640' }}>
                                        <Text style={{ color: r.status === 'APPROVED' ? '#4ade80' : '#f87171', fontSize:12, fontWeight:'700' }}>
                                            {r.status === 'APPROVED' ? t.changeReqApprovedTitle : t.changeReqRejectedTitle}
                                        </Text>
                                        {r.adminNote && <Text style={{ color:colors.textMuted, fontSize:11, marginTop:4 }}>{t.changeReqNoteLabel(r.adminNote)}</Text>}
                                    </View>
                                ))}

                                <Text style={{ color:colors.textMuted, fontSize:12, marginBottom:16, lineHeight:18 }}>
                                    {t.changeReqIntro}
                                </Text>

                                {/* Yeni değer */}
                                <Text style={[s.fieldLabel, { marginBottom:6 }]}>
                                    {changeReqField === 'fullName' ? t.newFullNameLabel
                                        : changeReqField === 'gender' ? t.newGenderLabel
                                        : t.newBirthDateLabel}
                                </Text>

                                {changeReqField === 'gender' ? (
                                    <View style={{ flexDirection:'row', gap:3, marginBottom:16 }}>
                                        {[{ k:'MALE', l: t.genderMale }, { k:'FEMALE', l: t.genderFemale }, { k:'OTHER', l: t.genderOther }].map(opt => (
                                            <TouchableOpacity key={opt.k} onPress={() => setChangeReqNewValue(opt.k)}
                                                style={[s.optionBtn, changeReqNewValue === opt.k && s.optionBtnActive]}>
                                                <Text style={[s.optionBtnText, changeReqNewValue === opt.k && { color:'#fff' }]}>{opt.l}</Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                ) : (
                                    <TextInput
                                        style={[s.fieldInput, { marginBottom:16 }]}
                                        value={changeReqNewValue}
                                        onChangeText={setChangeReqNewValue}
                                        placeholder={changeReqField === 'fullName' ? t.fullNamePlaceholderExample : '15.3.1998'}
                                        placeholderTextColor={colors.textMuted}
                                        keyboardType={changeReqField === 'birthDate' ? 'numeric' : 'default'}
                                    />
                                )}

                                {/* Belge yükleme */}
                                <Text style={[s.fieldLabel, { marginBottom:6 }]}>{t.idDocumentLabel}</Text>
                                <TouchableOpacity onPress={pickChangeReqDoc} disabled={changeReqUploading}
                                    style={{ backgroundColor:'#1e293b', borderRadius:10, borderWidth:1.5, borderStyle:'dashed', borderColor:'#7c3aed50', padding:11, alignItems:'center', marginBottom:8 }}>
                                    {changeReqUploading
                                        ? <Text style={{ color:'#a78bfa', fontSize:12 }}>{t.documentUploadingText}</Text>
                                        : changeReqDocUrl
                                            ? <Text style={{ color:'#4ade80', fontSize:12, fontWeight:'700' }}>{t.documentUploadedText(changeReqDocName)}</Text>
                                            : <Text style={{ color:'#a78bfa', fontSize:12 }}>{t.choosePhotoDocText}</Text>
                                    }
                                </TouchableOpacity>
                                <Text style={{ color:colors.textMuted, fontSize:10, marginBottom:16 }}>
                                    {t.idDocumentHint}
                                </Text>
                            </ScrollView>

                            <View style={s.modalBtns}>
                                <TouchableOpacity style={s.cancelBtn} onPress={() => setChangeReqOpen(false)}>
                                    <Text style={s.cancelBtnText}>{t.cancelBtn}</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[s.saveBtn, (!changeReqNewValue.trim() || !changeReqDocUrl || changeReqLoading || myChangeRequests.some(r => r.field === changeReqField && r.status === 'PENDING')) && { opacity:0.4 }]}
                                    onPress={submitChangeReq}
                                    disabled={!changeReqNewValue.trim() || !changeReqDocUrl || changeReqLoading || myChangeRequests.some(r => r.field === changeReqField && r.status === 'PENDING')}
                                >
                                    <Text style={s.saveBtnText}>{changeReqLoading ? t.sendingText : t.sendRequestBtn}</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </KeyboardAvoidingView>
                </View>
            </Modal>

            {/* ── Destek Mesajı Modal ── */}
            {/* Kullanıcı isteği: konu bazlı sohbetler, bkz. paylaşılan SupportModal. */}
            <SupportModal visible={supportOpen} onClose={() => setSupportOpen(false)} />

            {/* ── Privacy Picker Modal ── */}
            <Modal visible={privacyPickerField !== null} animationType="slide" transparent onRequestClose={() => setPrivacyPickerField(null)}>
                <View style={s.modalOverlay}>
                    <View style={[s.modalBox, { paddingBottom: 29 }]}>
                        <View style={s.modalHeader}>
                            <Text style={s.modalTitle}>Gizlilik Ayarı</Text>
                            <TouchableOpacity onPress={() => setPrivacyPickerField(null)}>
                                <Text style={s.modalClose}>✕</Text>
                            </TouchableOpacity>
                        </View>
                        {PRIVACY_OPTIONS.map(opt => {
                            const currentVal = infoForm[`${privacyPickerField}Privacy`];
                            const isSelected = currentVal === opt.key;
                            return (
                                <TouchableOpacity
                                    key={opt.key}
                                    onPress={() => pickPrivacy(privacyPickerField, opt.key)}
                                    style={[s.privacyOption, isSelected && s.privacyOptionActive]}
                                >
                                    <Text style={[s.privacyOptionText, isSelected && { color: '#fff' }]}>
                                        {opt.label}
                                    </Text>
                                    {isSelected && <Text style={{ color: colors.purple, fontSize: 16 }}>✓</Text>}
                                </TouchableOpacity>
                            );
                        })}
                        {privacyPickerField && (infoForm[`${privacyPickerField}Privacy`] === 'FRIENDS_EXCEPT' || infoForm[`${privacyPickerField}Privacy`] === 'FRIENDS_SELECTED') && (
                            <TouchableOpacity
                                style={[s.saveBtn, { marginTop: 12 }]}
                                onPress={() => { setPrivacyPickerField(null); setExcludePickerField(privacyPickerField); }}
                            >
                                <Text style={s.saveBtnText}>
                                    {infoForm[`${privacyPickerField}Privacy`] === 'FRIENDS_SELECTED' ? 'Dahil edilecekleri seç' : 'Hariç tutulacakları seç'} ({infoForm[`${privacyPickerField}Exclude`]?.length || 0})
                                </Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </View>
            </Modal>

            {/* ── Country Code Picker Modal ── */}
            <Modal visible={showCCPicker} animationType="slide" transparent onRequestClose={() => setShowCCPicker(false)}>
                <View style={s.modalOverlay}>
                    <View style={[s.modalBox, { maxHeight: '70%' }]}>
                        <View style={s.modalHeader}>
                            <Text style={s.modalTitle}>🌍 Ülke Kodu Seç</Text>
                            <TouchableOpacity onPress={() => setShowCCPicker(false)}>
                                <Text style={s.modalClose}>✕</Text>
                            </TouchableOpacity>
                        </View>
                        <ScrollView>
                            {COUNTRY_CODES.map(({ flag, code, name }) => (
                                <TouchableOpacity
                                    key={code}
                                    onPress={() => { setPhoneCC(code); setShowCCPicker(false); }}
                                    style={[s.privacyOption, phoneCC === code && s.privacyOptionActive]}>
                                    <Text style={{ color: colors.text, fontSize:15 }}>{flag} {name}</Text>
                                    <Text style={{ color: colors.textMuted, fontSize:14, marginLeft:8 }}>{code}</Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>
                </View>
            </Modal>

            {/* ── Exclude Friend Picker Modal ── */}
            <Modal visible={excludePickerField !== null} animationType="slide" transparent onRequestClose={() => setExcludePickerField(null)}>
                <View style={s.modalOverlay}>
                    <View style={[s.modalBox, { maxHeight: '75%' }]}>
                        <View style={s.modalHeader}>
                            <Text style={s.modalTitle}>
                                {infoForm[`${excludePickerField}Privacy`] === 'FRIENDS_SELECTED' ? '✅ Görebilecekler' : '🚫 Görmesini İstemiyorum'}
                            </Text>
                            <TouchableOpacity onPress={() => setExcludePickerField(null)}>
                                <Text style={s.modalClose}>✕</Text>
                            </TouchableOpacity>
                        </View>
                        <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 14 }}>
                            {infoForm[`${excludePickerField}Privacy`] === 'FRIENDS_SELECTED'
                                ? 'Seçtiğin arkadaşlar bu bilgiyi görebilir, diğerleri göremez.'
                                : 'Seçtiğin arkadaşlar bu bilgini göremez.'}
                        </Text>
                        {loadingFriends ? (
                            <ActivityIndicator color={colors.purple} style={{ marginVertical: 20 }} />
                        ) : friends.length === 0 ? (
                            <Text style={{ color: colors.textMuted, textAlign: 'center', marginVertical: 20 }}>
                                Henüz arkadaşın yok
                            </Text>
                        ) : (
                            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 320 }}>
                                {friends.map(f => {
                                    const excludeList = infoForm[`${excludePickerField}Exclude`] || [];
                                    const isExcluded = excludeList.includes(f.id);
                                    return (
                                        <TouchableOpacity
                                            key={f.id}
                                            onPress={() => toggleExclude(excludePickerField, f.id)}
                                            style={[s.friendRow, isExcluded && s.friendRowExcluded]}
                                        >
                                            <View style={s.friendAvatar}>
                                                {f.avatar
                                                    ? <Image source={{ uri: f.avatar }} style={{ width: 36, height: 36, borderRadius: 18 }} />
                                                    : <Text style={{ color: '#fff', fontWeight: '800' }}>{f.username?.[0]?.toUpperCase()}</Text>
                                                }
                                            </View>
                                            <View style={{ flex: 1 }}>
                                                <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>{f.fullName || f.username}</Text>
                                                <Text style={{ color: colors.textMuted, fontSize: 11 }}>{f.username}</Text>
                                            </View>
                                            <View style={[s.checkbox, isExcluded && s.checkboxChecked]}>
                                                {isExcluded && <Text style={{ color: '#fff', fontSize: 12, fontWeight: '900' }}>✓</Text>}
                                            </View>
                                        </TouchableOpacity>
                                    );
                                })}
                            </ScrollView>
                        )}
                        <TouchableOpacity style={[s.saveBtn, { marginTop: 14 }]} onPress={() => setExcludePickerField(null)}>
                            <Text style={s.saveBtnText}>Tamam</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* ── Create Reel Modal ── */}
            <Modal visible={createReelOpen} animationType="slide" transparent onRequestClose={() => setCreateReelOpen(false)}>
                <View style={s.modalOverlay}>
                    <View style={s.modalBox}>
                        <View style={s.modalHeader}>
                            <Text style={s.modalTitle}>🎬 Reel Oluştur</Text>
                            <TouchableOpacity onPress={() => setCreateReelOpen(false)}>
                                <Text style={s.modalClose}>✕</Text>
                            </TouchableOpacity>
                        </View>

                        {reelMedia && (
                            <View style={{ alignItems: 'center', marginBottom: 16 }}>
                                {reelMedia.type === 'image'
                                    ? <Image source={{ uri: reelMedia.uri }} style={{ width: '100%', height: 200, borderRadius: 16 }} resizeMode="cover" />
                                    : <View style={{ width: '100%', height: 200, borderRadius: 16, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' }}>
                                            <Text style={{ color: '#fff', fontSize: 36 }}>▶</Text>
                                        </View>
                                }
                            </View>
                        )}

                        <Text style={s.fieldLabel}>Dal seç</Text>
                        <ScrollView style={{ maxHeight: 160 }} showsVerticalScrollIndicator={false}>
                            {interests.map(i => (
                                <TouchableOpacity
                                    key={i.id}
                                    style={[s.branchOption, reelBranch?.subCategory === i.subCategory && s.branchOptionActive]}
                                    onPress={() => setReelBranch({ category: i.category, subCategory: i.subCategory })}
                                >
                                    <Text style={s.branchOptionText}>{SUB_EMOJI[i.subCategory] || '🏅'} {getSubCategoryLabel(i.subCategory, lang)}</Text>
                                    {reelBranch?.subCategory === i.subCategory && <Text style={{ color: colors.purple }}>✓</Text>}
                                </TouchableOpacity>
                            ))}
                        </ScrollView>

                        <TouchableOpacity
                            style={[s.saveBtn, (!reelBranch || postingReel) && { opacity: 0.5 }, { marginTop: 16 }]}
                            onPress={handlePostReel}
                            disabled={!reelBranch || postingReel}
                        >
                            <Text style={s.saveBtnText}>{postingReel ? 'Paylaşılıyor...' : '🚀 Paylaş'}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* ── Avatar Zoom Modal ── */}
            <Modal visible={avatarZoomOpen} animationType="fade" transparent onRequestClose={() => setAvatarZoomOpen(false)}>
                <View style={{ flex: 1, backgroundColor: '#000000ee', justifyContent: 'center', alignItems: 'center' }}>
                    <View style={{ position: 'absolute', top: 56, right: 20, zIndex: 10, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                        {isOwnProfile && (
                            <TouchableOpacity
                                style={{ backgroundColor: colors.purple, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 7 }}
                                onPress={() => { setAvatarZoomOpen(false); handleChangeAvatar(); }}
                            >
                                <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>Değiştir</Text>
                            </TouchableOpacity>
                        )}
                        <TouchableOpacity onPress={() => setAvatarZoomOpen(false)}>
                            <Text style={{ color: '#fff', fontSize: 28, fontWeight: '700' }}>✕</Text>
                        </TouchableOpacity>
                    </View>
                    <ScrollView
                        style={{ flex: 1, width: '100%' }}
                        contentContainerStyle={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}
                        maximumZoomScale={4}
                        minimumZoomScale={1}
                        showsHorizontalScrollIndicator={false}
                        showsVerticalScrollIndicator={false}
                        centerContent
                    >
                        {profile?.avatar && (
                            <Image source={{ uri: profile.avatar }} style={{ width: 300, height: 300 }} resizeMode="contain" />
                        )}
                    </ScrollView>
                </View>
            </Modal>

            {/* ── Archive Modal ── */}
            <Modal visible={archiveOpen} animationType="slide" transparent onRequestClose={() => setArchiveOpen(false)}>
                <View style={s.modalOverlay}>
                    <View style={[s.modalBox, { maxHeight: '80%' }]}>
                        <View style={s.modalHeader}>
                            <Text style={s.modalTitle}>🗃 Hikaye Arşivi</Text>
                            <TouchableOpacity onPress={() => setArchiveOpen(false)}>
                                <Text style={s.modalClose}>✕</Text>
                            </TouchableOpacity>
                        </View>
                        <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 14, lineHeight: 18 }}>
                            24 saati dolan hikayeleriniz burada saklanır. Yalnızca siz görebilirsiniz.
                        </Text>
                        {archivedStories.length === 0
                            ? <Text style={{ color: colors.textMuted, textAlign: 'center', marginVertical: 30 }}>Arşivde hikaye yok</Text>
                            : (
                                <ScrollView showsVerticalScrollIndicator={false}>
                                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 3 }}>
                                        {archivedStories.map(story => (
                                            <View key={story.id} style={s.archiveThumb}>
                                                {story.imageUrl
                                                    ? <Image source={{ uri: story.imageUrl }} style={{ width: '100%', height: '100%', borderRadius: 10 }} resizeMode="cover" />
                                                    : <Text style={{ fontSize: 30 }}>🎬</Text>
                                                }
                                                <View style={s.archiveLabel}>
                                                    <Text style={{ color: '#fff', fontSize: 9, fontWeight: '700' }}>
                                                        {SUB_EMOJI[story.subCategory] || ''} {getSubCategoryLabel(story.subCategory, lang)}
                                                    </Text>
                                                </View>
                                            </View>
                                        ))}
                                    </View>
                                </ScrollView>
                            )
                        }
                    </View>
                </View>
            </Modal>
        </View>
    );
}

// ─── Admin Panel Styles ───────────────────────────────────────────────────────

const ap = StyleSheet.create({
    reservBtn:   { marginHorizontal: 20, marginTop: 12, marginBottom: 4, backgroundColor: colors.surface2, borderRadius: 14, paddingVertical: 11, alignItems: 'center', borderWidth: 1, borderColor: '#9333ea30' },
    reservBtnText:{ color: colors.purple, fontSize: 14, fontWeight: '800' },
    adminBtn:    { marginHorizontal: 20, marginTop: 8, marginBottom: 8, backgroundColor: colors.surface2, borderRadius: 14, paddingVertical: 11, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
    adminBtnText:{ color: colors.purple, fontSize: 14, fontWeight: '800' },
    overlay:     { flex: 1, backgroundColor: '#000000bb', justifyContent: 'flex-end' },
    box:         { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 17, paddingTop: 17, paddingBottom: 45, maxHeight: '80%' },
    header:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    title:       { color: '#fff', fontSize: 16, fontWeight: '900' },
    close:       { color: colors.textMuted, fontSize: 22 },
    card:        { flexDirection: 'row', alignItems: 'center', gap: 3, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: colors.border + '50' },
    username:    { color: '#fff', fontSize: 14, fontWeight: '700' },
    fullname:    { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
    approveBtn:  { backgroundColor: '#16a34a', borderRadius: 10, paddingHorizontal: 11, paddingVertical: 5 },
    approveTxt:  { color: '#fff', fontSize: 12, fontWeight: '800' },
    rejectBtn:   { backgroundColor: colors.surface2, borderRadius: 10, paddingHorizontal: 11, paddingVertical: 5, borderWidth: 1, borderColor: '#ef444450' },
    rejectTxt:   { color: '#ef4444', fontSize: 12, fontWeight: '800' },
});

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
    container:        { flex: 1, backgroundColor: colors.bg },

    topBar:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 13, paddingTop: Platform.OS === 'ios' ? 56 : 40, paddingBottom: 9 },
    backBtn:          { color: colors.purple, fontSize: 14, fontWeight: '700' },
    topBarUsername:   { color: colors.textMuted, fontSize: 12, fontWeight: '800', minWidth: 60 },
    logoutBtn:        { backgroundColor: colors.surface2, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 },
    logoutText:       { color: colors.textSecondary, fontSize: 11, fontWeight: '700' },
    bizBanner:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#f59e0b18', borderBottomWidth: 1, borderColor: '#f59e0b30', paddingHorizontal: 16, paddingVertical: 11 },
    bizBannerText:    { color: '#fbbf24', fontSize: 13, fontWeight: '800' },
    bizBannerArrow:   { color: '#f59e0b', fontSize: 22, fontWeight: '900' },
    langChip:         { borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2, backgroundColor: colors.surface2 },
    langChipActive:   { backgroundColor: colors.purple + '30' },
    langChipText:     { color: colors.textMuted, fontSize: 12, fontWeight: '800' },

    scroll:           { padding: 13, paddingBottom: 57, gap: 3 },

    // Profile card
    profileCard:      { paddingHorizontal: 1, paddingVertical: 9 },
    avatarCircle:     { backgroundColor: colors.purple, justifyContent: 'center', alignItems: 'center' },
    avatarLetter:     { color: '#fff', fontWeight: '900' },
    avatarStarBadge:  { position: 'absolute', top: 0, left: 0, width: 26, height: 26, borderRadius: 13, backgroundColor: '#d97706', borderWidth: 2, borderColor: colors.surface, justifyContent: 'center', alignItems: 'center' },
    avatarStarText:   { color: '#fff', fontSize: 13, fontWeight: '900', lineHeight: 17 },
    avatarPlusBadge:  { position: 'absolute', top: 0, right: 0, width: 26, height: 26, borderRadius: 13, backgroundColor: colors.purple, borderWidth: 2, borderColor: colors.surface, justifyContent: 'center', alignItems: 'center' },
    avatarPlusText:   { color: '#fff', fontSize: 16, fontWeight: '900', lineHeight: 20 },
    avatarMinusBadge: { position: 'absolute', bottom: 0, left: 0, width: 26, height: 26, borderRadius: 13, backgroundColor: colors.surface2, borderWidth: 2, borderColor: colors.surface, justifyContent: 'center', alignItems: 'center' },
    avatarMinusText:  { color: '#fff', fontSize: 18, fontWeight: '900', lineHeight: 22 },
    avatarSlashBadge: { position: 'absolute', bottom: 0, right: 0, width: 26, height: 26, borderRadius: 13, backgroundColor: '#2563eb', borderWidth: 2, borderColor: colors.surface, justifyContent: 'center', alignItems: 'center' },
    avatarSlashText:  { color: '#fff', fontSize: 14, fontWeight: '900', lineHeight: 18 },

    fullName:         { color: '#fff', fontSize: 17, fontWeight: '900', marginBottom: 2 },
    username:         { color: colors.textMuted, fontSize: 11, fontWeight: '700', marginBottom: 4 },
    bio:              { color: colors.textSecondary, fontSize: 13, lineHeight: 18, marginBottom: 8 },
    infoItem:         { flexDirection: 'row', alignItems: 'center' },
    infoItemText:     { color: colors.textSecondary, fontSize: 12, fontWeight: '600', flex: 1 },
    privacyDot:       { fontSize: 10 },

    divider:          { marginVertical: 14 },

    // Stat rows
    statRow:          { flexDirection: 'row', alignItems: 'center', paddingVertical: 7, gap: 3 },
    statRowEmoji:     { fontSize: 18, width: 26, textAlign: 'center' },
    statRowLabel:     { flex: 1, color: '#fff', fontSize: 14, fontWeight: '700' },
    statRowBadge:     { backgroundColor: colors.surface2, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 0, minWidth: 32, alignItems: 'center' },
    statRowCount:     { color: '#fff', fontSize: 13, fontWeight: '800' },
    addBtn:           { width: 30, height: 30, borderRadius: 8, backgroundColor: colors.purple, justifyContent: 'center', alignItems: 'center' },
    addBtnText:       { color: '#fff', fontSize: 13, fontWeight: '900', lineHeight: 17 },

    // Single-row stat cards
    statGrid:         { flexDirection: 'row', gap: 3 },
    statCard:         { flex: 1, padding: 7 },
    statCardEmoji:    { fontSize: 15 },
    statCardCount:    { color: '#fff', fontSize: 18, fontWeight: '900', marginBottom: 1 },
    statCardLabel:    { color: colors.textMuted, fontSize: 9, fontWeight: '700' },
    addBtnSm:         { width: 18, height: 18, borderRadius: 5, backgroundColor: colors.purple, justifyContent: 'center', alignItems: 'center' },

    metaLine:         { color: colors.textMuted, fontSize: 12, textAlign: 'center', marginBottom: 4 },

    matchStats:       { flexDirection: 'row', padding: 11, marginTop: 14 },
    matchStatItem:    { flex: 1, alignItems: 'center' },
    matchStatVal:     { fontSize: 22, fontWeight: '900' },
    matchStatLbl:     { color: colors.textMuted, fontSize: 10, fontWeight: '700', marginTop: 2 },
    matchStatDivider: {},

    editBtn:          { backgroundColor: colors.surface2, borderRadius: 14, paddingVertical: 10, alignItems: 'center', marginTop: 16 },
    editBtnText:      { color: '#fff', fontWeight: '800', fontSize: 14 },

    actionRow:        { flexDirection: 'row', gap: 3, marginTop: 16 },
    actionBtn:        { flex: 1, backgroundColor: colors.surface2, borderRadius: 14, paddingVertical: 10, alignItems: 'center' },
    actionBtnActive:  { backgroundColor: colors.purple + '25', borderColor: colors.purple },
    msgBtn:           { backgroundColor: colors.purple, borderColor: colors.purple },
    actionBtnText:    { color: '#fff', fontWeight: '800', fontSize: 13 },

    storyNavBtn:      { backgroundColor: '#ffffff20', borderRadius: 12, paddingHorizontal: 17, paddingVertical: 7 },

    // Branch chips (create post)
    branchChip:       { borderRadius: 10, paddingHorizontal: 9, paddingVertical: 4, backgroundColor: colors.surface2, marginRight: 8 },
    branchChipActive: { backgroundColor: colors.purple + '35' },
    branchChipText:   { color: colors.textMuted, fontSize: 12, fontWeight: '700' },

    // Branch picker (create story)
    branchOption:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.surface2, borderRadius: 12, padding: 9, marginBottom: 6 },
    branchOptionActive:{ backgroundColor: colors.purple + '30' },
    branchOptionText: { color: '#fff', fontSize: 13, fontWeight: '700' },

    // Archive
    archiveThumb:     { width: '47%', aspectRatio: 1, borderRadius: 12, backgroundColor: colors.surface2, overflow: 'hidden', justifyContent: 'center', alignItems: 'center', position: 'relative' },
    archiveLabel:     { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#000000aa', padding: 1, alignItems: 'center' },

    // Activities
    section:          { gap: 3 },
    sectionTitle:     { color: '#fff', fontSize: 15, fontWeight: '800' },
    interestGrid:     { flexDirection: 'row', flexWrap: 'wrap', gap: 3 },
    interestCard:     { backgroundColor: colors.surface2, borderRadius: 14, padding: 11, alignItems: 'center', minWidth: 90, flex: 1 },
    interestEmoji:    { fontSize: 28, marginBottom: 6 },
    interestName:     { color: '#fff', fontSize: 12, fontWeight: '700', textTransform: 'capitalize', textAlign: 'center', marginBottom: 4 },
    interestRating:   { fontSize: 12, fontWeight: '800', marginBottom: 4 },
    levelPill:        { borderRadius: 6, paddingHorizontal: 5, paddingVertical: 0 },
    levelPillText:    { fontSize: 10, fontWeight: '700' },

    // Feed empty state
    feedEmpty:        { padding: 37, alignItems: 'center', gap: 3 },

    // Instagram-style posts grid
    postsGrid:        { flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP, marginHorizontal: -16 },
    gridCell:         { width: CELL_SIZE, height: CELL_SIZE },
    gridCellInner:    { width: '100%', height: '100%' },
    gridVideoTag:     { position: 'absolute', top: 4, right: 4, backgroundColor: '#000000bb', borderRadius: 4, paddingHorizontal: 1, paddingVertical: 0 },
    feedEmptyIcon:    { fontSize: 40, opacity: 0.4 },
    feedEmptyText:    { color: colors.textSecondary, fontSize: 14 },
    feedEmptyLink:    { color: colors.purple, fontSize: 13, fontWeight: '700' },

    // Edit modal
    modalOverlay:     { flex: 1, backgroundColor: '#000000aa', justifyContent: 'flex-end' },
    modalBox:         { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 21, paddingBottom: 37 },
    modalHeader:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    modalTitle:       { color: '#fff', fontSize: 18, fontWeight: '900' },
    modalClose:       { color: colors.textMuted, fontSize: 20 },
    fieldLabel:       { color: colors.textSecondary, fontSize: 12, fontWeight: '700', marginBottom: 6 },
    fieldInput:       { backgroundColor: colors.surface2, color: '#fff', borderRadius: 12, paddingHorizontal: 11, paddingVertical: 9, fontSize: 14, marginBottom: 14 },
    switchRow:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
    modalBtns:        { flexDirection: 'row', gap: 3 },
    cancelBtn:        { flex: 1, backgroundColor: colors.surface2, borderRadius: 14, paddingVertical: 11, alignItems: 'center' },
    cancelBtnText:    { color: colors.textSecondary, fontWeight: '700' },
    saveBtn:          { flex: 1, backgroundColor: colors.purple, borderRadius: 14, paddingVertical: 11, alignItems: 'center' },
    saveBtnText:      { color: '#fff', fontWeight: '800' },

    // Toggle switch
    toggleTrack:      { width: 46, height: 26, borderRadius: 13, backgroundColor: colors.surface2, padding: 0, justifyContent: 'center' },
    toggleTrackOn:    { backgroundColor: colors.purple },
    toggleThumb:      { width: 20, height: 20, borderRadius: 10, backgroundColor: colors.textMuted },
    toggleThumbOn:    { backgroundColor: '#fff', alignSelf: 'flex-end' },

    // Info field header (label + privacy menu button)
    infoFieldHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
    menuBtn:          { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 5, paddingVertical: 1, backgroundColor: colors.surface2, borderRadius: 8 },
    menuBtnPrivacy:   { fontSize: 12 },
    menuBtnIcon:      { color: '#fff', fontSize: 14, fontWeight: '900' },
    excludeHint:      { color: '#f87171', fontSize: 10, fontWeight: '600', marginTop: -10, marginBottom: 12 },

    // Privacy picker options
    privacyOption:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.surface2, borderRadius: 12, padding: 11, marginBottom: 8 },
    privacyOptionActive: { backgroundColor: colors.purple + '30' },
    privacyOptionText: { color: '#fff', fontSize: 13, fontWeight: '700' },

    // Gender/option buttons
    optionBtn:        { flex: 1, borderRadius: 10, paddingVertical: 6, alignItems: 'center', backgroundColor: colors.surface2 },
    optionBtnActive:  { backgroundColor: colors.purple + '35' },
    optionBtnText:    { color: colors.textMuted, fontSize: 11, fontWeight: '700' },

    // Friend exclude picker
    friendRow:        { flexDirection: 'row', alignItems: 'center', gap: 3, paddingVertical: 7, paddingHorizontal: 1, borderRadius: 10, marginBottom: 4 },
    friendRowExcluded:{ backgroundColor: '#f8717120' },
    friendAvatar:     { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.purple + '60', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
    checkbox:         { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: colors.border, justifyContent: 'center', alignItems: 'center' },
    checkboxChecked:  { backgroundColor: '#f87171', borderColor: '#f87171' },

    // Contact
    contactBtn:       { paddingHorizontal:14, paddingVertical:8, borderRadius:20, backgroundColor: colors.surface2, borderWidth:1, borderColor: colors.border },
    contactBtnText:   { color: colors.text, fontSize:13, fontWeight:'700' },
    contactFieldRow:  { marginBottom:8 },
    privacyIconBtn:   { padding:6, borderRadius:8, backgroundColor: colors.surface2, borderWidth:1, borderColor: colors.border },
    menuSectionTitle: { color: '#fff', fontSize:14, fontWeight:'800', marginBottom:10, marginTop:4 },
});
