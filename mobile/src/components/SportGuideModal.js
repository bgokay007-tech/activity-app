import { useEffect, useState } from 'react';
import {
    Modal, View, Text, ScrollView, TouchableOpacity, Linking, StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSelector } from 'react-redux';
import colors from '../theme/colors';
import { moderateScale } from '../theme/scale';
import useT from '../hooks/useT';
import { getSportGuide, hasSportGuide } from '../data/sportGuides';

const TABS = ['how', 'athletes', 'bonus'];

function CourtBox({ children, h = 160 }) {
    return (
        <View style={[d.court, { height: h }]}>
            {children}
        </View>
    );
}

function TennisCourtDiagram() {
    const t = useT();
    return (
        <CourtBox h={180}>
            <View style={[d.lineH, { top: '8%' }]} />
            <View style={[d.lineH, { top: '50%', backgroundColor: '#c084fc88' }]} />
            <View style={[d.lineH, { top: '92%' }]} />
            <View style={[d.lineV, { left: '8%' }]} />
            <View style={[d.lineV, { left: '50%' }]} />
            <View style={[d.lineV, { left: '92%' }]} />
            <View style={[d.lineV, { left: '25%', top: '8%', height: '42%' }]} />
            <View style={[d.lineV, { left: '75%', top: '8%', height: '42%' }]} />
            <View style={[d.lineV, { left: '25%', top: '50%', height: '42%' }]} />
            <View style={[d.lineV, { left: '75%', top: '50%', height: '42%' }]} />
            <Text style={[d.lab, { top: '2%', alignSelf: 'center' }]}>{t.sportGuideDiagBaseline}</Text>
            <Text style={[d.lab, { top: '44%', left: '52%', color: '#c084fc' }]}>{t.sportGuideDiagNet}</Text>
            <Text style={[d.lab, { top: '22%', left: '28%' }]}>T</Text>
            <Text style={[d.lab, { bottom: 6, alignSelf: 'center' }]}>{t.sportGuideDiagOpenCourt}</Text>
        </CourtBox>
    );
}

function ServeTargetsDiagram() {
    const t = useT();
    return (
        <CourtBox h={120}>
            <View style={[d.lineH, { top: '50%', backgroundColor: '#c084fc88' }]} />
            <View style={[d.zone, { left: '12%', top: '18%', backgroundColor: '#38bdf833' }]}>
                <Text style={d.zoneTxt}>Wide</Text>
            </View>
            <View style={[d.zone, { left: '42%', top: '18%', backgroundColor: '#fbbf2433' }]}>
                <Text style={d.zoneTxt}>Body</Text>
            </View>
            <View style={[d.zone, { left: '68%', top: '18%', backgroundColor: '#4ade8033' }]}>
                <Text style={d.zoneTxt}>T</Text>
            </View>
            <Text style={[d.lab, { bottom: 8, alignSelf: 'center' }]}>{t.sportGuideDiagServeBox}</Text>
        </CourtBox>
    );
}

function PadelZonesDiagram() {
    return (
        <CourtBox h={140}>
            <View style={[d.lineH, { top: '50%', backgroundColor: '#c084fc88' }]} />
            <View style={[StyleSheet.absoluteFill, { borderWidth: 2, borderColor: '#60a5fa66', borderRadius: 8 }]} />
            <Text style={[d.lab, { top: 8, left: 10 }]}>Glass</Text>
            <Text style={[d.lab, { bottom: 8, right: 10 }]}>Glass</Text>
            <Text style={[d.lab, { top: '42%', alignSelf: 'center', color: '#c084fc' }]}>Net</Text>
            <View style={[d.zone, { left: '8%', bottom: 28, backgroundColor: '#f8717133', width: 56 }]}>
                <Text style={d.zoneTxt}>Corner</Text>
            </View>
        </CourtBox>
    );
}

function PickleKitchenDiagram() {
    const t = useT();
    return (
        <CourtBox h={130}>
            <View style={[d.lineH, { top: '50%', backgroundColor: '#c084fc88' }]} />
            <View style={{ position: 'absolute', left: '10%', right: '10%', top: '28%', height: '44%', backgroundColor: '#fbbf2422', borderWidth: 1, borderColor: '#fbbf2466', borderRadius: 6 }} />
            <Text style={[d.lab, { top: '44%', alignSelf: 'center', color: '#fbbf24' }]}>{t.sportGuideDiagKitchen}</Text>
        </CourtBox>
    );
}

function VbCourtDiagram() {
    return (
        <CourtBox h={130}>
            <View style={[d.lineH, { top: '50%', backgroundColor: '#c084fc88' }]} />
            <View style={[d.lineV, { left: '33%' }]} />
            <View style={[d.lineV, { left: '66%' }]} />
            <Text style={[d.lab, { top: 10, left: '12%' }]}>4</Text>
            <Text style={[d.lab, { top: 10, left: '48%' }]}>3</Text>
            <Text style={[d.lab, { top: 10, left: '78%' }]}>2</Text>
            <Text style={[d.lab, { bottom: 10, left: '12%' }]}>5</Text>
            <Text style={[d.lab, { bottom: 10, left: '48%' }]}>6</Text>
            <Text style={[d.lab, { bottom: 10, left: '78%' }]}>1</Text>
        </CourtBox>
    );
}

function TtServeDiagram() {
    return (
        <CourtBox h={100}>
            <View style={[d.lineH, { top: '50%', backgroundColor: '#c084fc88' }]} />
            <View style={[d.lineV, { left: '50%' }]} />
            <View style={[d.zone, { left: '18%', top: '58%', backgroundColor: '#38bdf833', width: 48 }]}>
                <Text style={d.zoneTxt}>S</Text>
            </View>
            <View style={[d.zone, { left: '58%', top: '18%', backgroundColor: '#4ade8033', width: 48 }]}>
                <Text style={d.zoneTxt}>R</Text>
            </View>
        </CourtBox>
    );
}

function Diagram({ id }) {
    if (id === 'tennis_court') return <TennisCourtDiagram />;
    if (id === 'serve_targets') return <ServeTargetsDiagram />;
    if (id === 'padel_zones') return <PadelZonesDiagram />;
    if (id === 'pickle_kitchen') return <PickleKitchenDiagram />;
    if (id === 'vb_court') return <VbCourtDiagram />;
    if (id === 'tt_serve') return <TtServeDiagram />;
    return null;
}

function openUrl(url) {
    if (!url) return;
    Linking.openURL(url).catch(() => {});
}

export default function SportGuideModal({ visible, onClose, cfg, sub }) {
    const t = useT();
    const insets = useSafeAreaInsets();
    const lang = useSelector(s => s.lang?.lang || 'en');
    const [tab, setTab] = useState('how');
    const accent = cfg?.color || colors.purple;

    useEffect(() => {
        if (visible) setTab('how');
    }, [visible, sub]);

    if (!hasSportGuide(sub)) return null;
    const guide = getSportGuide(sub, lang) || getSportGuide(sub, 'en');

    const tabLabel = (key) => {
        if (key === 'how') return t.sportGuideTabHow;
        if (key === 'athletes') return t.sportGuideTabAthletes;
        return t.sportGuideTabBonus;
    };

    return (
        <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
            <View style={s.backdrop}>
                <View style={[s.sheet, { paddingBottom: Math.max(16, insets.bottom + 8) }]}>
                    <View style={s.head}>
                        <Text style={s.title} numberOfLines={1}>{t.sportGuideTitle}</Text>
                        <TouchableOpacity onPress={onClose} hitSlop={10}>
                            <Text style={s.close}>✕</Text>
                        </TouchableOpacity>
                    </View>

                    <View style={s.tabs}>
                        {TABS.map(key => (
                            <TouchableOpacity
                                key={key}
                                onPress={() => setTab(key)}
                                style={[s.tab, tab === key && { backgroundColor: accent, borderColor: accent }]}
                            >
                                <Text
                                    style={[s.tabTxt, tab === key && s.tabTxtOn]}
                                    numberOfLines={1}
                                    adjustsFontSizeToFit
                                    minimumFontScale={0.75}
                                >
                                    {tabLabel(key)}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.body}>
                        {tab === 'how' && (guide.howToPlay || []).map((sec, i) => (
                            <View key={`h-${i}`} style={s.card}>
                                <Text style={[s.cardTitle, { color: accent }]}>{sec.title}</Text>
                                <Text style={s.cardBody}>{sec.body}</Text>
                            </View>
                        ))}

                        {tab === 'athletes' && (guide.athletes || []).map((a, i) => (
                            <View key={`a-${i}`} style={s.card}>
                                <Text style={s.athleteName}>{a.name}{a.years ? `  ·  ${a.years}` : ''}</Text>
                                <Text style={s.cardBody}>{a.bio}</Text>
                                {!!a.achievements && (
                                    <>
                                        <Text style={s.achLabel}>{t.sportGuideAchievements}</Text>
                                        <Text style={s.cardBody}>{a.achievements}</Text>
                                    </>
                                )}
                                {(a.links || []).map((l, j) => (
                                    <TouchableOpacity
                                        key={`l-${i}-${j}`}
                                        onPress={() => openUrl(l.url)}
                                        style={[s.linkBtn, { borderColor: accent + '66' }]}
                                        activeOpacity={0.8}
                                    >
                                        <Text style={[s.linkTxt, { color: accent }]}>▶  {l.label}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        ))}

                        {tab === 'bonus' && (guide.bonus || []).map((b, i) => (
                            <View key={`b-${i}`} style={s.card}>
                                <Text style={[s.cardTitle, { color: accent }]}>{b.title}</Text>
                                {b.diagram ? <Diagram id={b.diagram} /> : null}
                                <Text style={s.cardBody}>{b.body}</Text>
                                {(b.tips || []).map((tip, j) => (
                                    <View key={`t-${i}-${j}`} style={s.tipRow}>
                                        <Text style={s.tipBullet}>▸</Text>
                                        <Text style={s.tipTxt}>{tip}</Text>
                                    </View>
                                ))}
                            </View>
                        ))}

                        <View style={{ height: 12 }} />
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
}

const s = StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: '#000000cc', justifyContent: 'flex-end' },
    sheet: {
        backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
        maxHeight: '92%',
    },
    head: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderColor: colors.border,
    },
    title: { color: '#fff', fontSize: moderateScale(15), fontWeight: '900', flex: 1, paddingRight: 12 },
    close: { color: colors.textMuted, fontSize: 18, fontWeight: '700' },
    tabs: { flexDirection: 'row', gap: 4, marginHorizontal: 12, marginTop: 10, marginBottom: 8 },
    tab: {
        flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center',
        backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border,
    },
    tabTxt: { color: colors.textMuted, fontSize: moderateScale(11), fontWeight: '800' },
    tabTxtOn: { color: '#fff' },
    body: { paddingHorizontal: 14, paddingTop: 4 },
    card: {
        backgroundColor: colors.surface2, borderRadius: 14, borderWidth: 1, borderColor: colors.border,
        padding: 12, marginBottom: 10,
    },
    cardTitle: { fontSize: moderateScale(13), fontWeight: '900', marginBottom: 8 },
    cardBody: { color: colors.textSecondary, fontSize: moderateScale(13), lineHeight: moderateScale(20) },
    athleteName: { color: '#fff', fontSize: moderateScale(15), fontWeight: '900', marginBottom: 6 },
    achLabel: { color: '#fbbf24', fontSize: moderateScale(12), fontWeight: '800', marginTop: 10, marginBottom: 4 },
    linkBtn: {
        marginTop: 8, borderRadius: 10, borderWidth: 1, paddingVertical: 9, paddingHorizontal: 12,
        backgroundColor: '#ffffff08',
    },
    linkTxt: { fontSize: moderateScale(12), fontWeight: '800' },
    tipRow: { flexDirection: 'row', gap: 8, marginTop: 8, alignItems: 'flex-start' },
    tipBullet: { color: colors.purple, fontWeight: '900', marginTop: 1 },
    tipTxt: { flex: 1, color: colors.textSecondary, fontSize: moderateScale(12), lineHeight: moderateScale(18) },
});

const d = StyleSheet.create({
    court: {
        backgroundColor: '#0b1220', borderRadius: 12, borderWidth: 1, borderColor: '#ffffff18',
        marginBottom: 10, overflow: 'hidden', position: 'relative',
    },
    lineH: { position: 'absolute', left: '8%', right: '8%', height: 1, backgroundColor: '#ffffff44' },
    lineV: { position: 'absolute', top: '8%', bottom: '8%', width: 1, backgroundColor: '#ffffff44' },
    lab: { position: 'absolute', color: '#94a3b8', fontSize: 10, fontWeight: '700' },
    zone: {
        position: 'absolute', width: 64, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
        borderWidth: 1, borderColor: '#ffffff22',
    },
    zoneTxt: { color: '#e2e8f0', fontSize: 11, fontWeight: '800' },
});
