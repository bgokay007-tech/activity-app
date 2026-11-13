import { useEffect, useState, useMemo } from 'react';
import {
    Modal, View, Text, ScrollView, TouchableOpacity, Linking, StyleSheet, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSelector } from 'react-redux';
import colors from '../theme/colors';
import { moderateScale } from '../theme/scale';
import useT from '../hooks/useT';
import api from '../services/api';
import { getSportGuide, hasSportGuide, mergeAthleteRankings } from '../data/sportGuides';

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

function DetailSection({ title, color, children }) {
    if (!children) return null;
    return (
        <View style={s.detailBlock}>
            <Text style={[s.detailBlockTitle, { color }]}>{title}</Text>
            {typeof children === 'string' ? <Text style={s.cardBody}>{children}</Text> : children}
        </View>
    );
}

function AthleteDetailModal({ visible, athlete, onClose, accent, insets }) {
    const t = useT();
    if (!athlete) return null;
    const rankTxt = athlete.worldRank != null
        ? `#${athlete.worldRank}${athlete.tourLabel ? ` ${athlete.tourLabel}` : ''}`
        : (athlete.status === 'legend' && athlete.peakRank
            ? t.sportGuidePeakRank(athlete.peakRank)
            : null);

    return (
        <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
            <View style={s.backdrop}>
                <View style={[s.sheet, { paddingBottom: Math.max(16, insets.bottom + 8), maxHeight: '94%' }]}>
                    <View style={s.head}>
                        <View style={{ flex: 1, paddingRight: 10 }}>
                            <Text style={s.title} numberOfLines={2}>
                                {athlete.country ? `${athlete.country} ` : ''}{athlete.name}
                            </Text>
                            <Text style={s.subMeta}>
                                {[athlete.years, rankTxt].filter(Boolean).join('  ·  ')}
                            </Text>
                        </View>
                        <TouchableOpacity onPress={onClose} hitSlop={10}>
                            <Text style={s.close}>✕</Text>
                        </TouchableOpacity>
                    </View>
                    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.body}>
                        {!!athlete.bio && (
                            <View style={s.card}>
                                <Text style={s.cardBody}>{athlete.bio}</Text>
                            </View>
                        )}
                        <DetailSection title={t.sportGuideLife} color="#38bdf8">{athlete.detail?.life}</DetailSection>
                        <DetailSection title={t.sportGuideAchievements} color="#fbbf24">{athlete.detail?.achievements}</DetailSection>
                        <DetailSection title={t.sportGuideStyle} color="#c084fc">{athlete.detail?.style}</DetailSection>
                        <DetailSection title={t.sportGuideAdvice} color="#4ade80">{athlete.detail?.advice}</DetailSection>
                        {(athlete.links || []).length > 0 && (
                            <DetailSection title={t.sportGuideTalks} color={accent}>
                                {(athlete.links || []).map((l, j) => (
                                    <TouchableOpacity
                                        key={`dl-${j}`}
                                        onPress={() => openUrl(l.url)}
                                        style={[s.linkBtn, { borderColor: accent + '66' }]}
                                        activeOpacity={0.8}
                                    >
                                        <Text style={[s.linkTxt, { color: accent }]}>▶  {l.label}</Text>
                                    </TouchableOpacity>
                                ))}
                            </DetailSection>
                        )}
                        <View style={{ height: 16 }} />
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
}

export default function SportGuideModal({ visible, onClose, cfg, sub }) {
    const t = useT();
    const insets = useSafeAreaInsets();
    const lang = useSelector(s => s.lang?.lang || 'en');
    const [tab, setTab] = useState('how');
    const [tours, setTours] = useState({});
    const [rankLoading, setRankLoading] = useState(false);
    const [rankUpdatedAt, setRankUpdatedAt] = useState(null);
    const [detailAthlete, setDetailAthlete] = useState(null);
    const accent = cfg?.color || colors.purple;

    useEffect(() => {
        if (visible) {
            setTab('how');
            setDetailAthlete(null);
        }
    }, [visible, sub]);

    const guide = useMemo(
        () => (hasSportGuide(sub) ? (getSportGuide(sub, lang) || getSportGuide(sub, 'en')) : null),
        [sub, lang]
    );

    useEffect(() => {
        if (!visible || !guide?.rankingSport) {
            setTours({});
            setRankUpdatedAt(null);
            return undefined;
        }
        let cancelled = false;
        setRankLoading(true);
        api.get(`/sport-guide/rankings/${sub}`)
            .then((res) => {
                if (cancelled) return;
                setTours(res.data?.tours || {});
                setRankUpdatedAt(res.data?.updatedAt || null);
            })
            .catch(() => {
                if (!cancelled) {
                    setTours({});
                    setRankUpdatedAt(null);
                }
            })
            .finally(() => { if (!cancelled) setRankLoading(false); });
        return () => { cancelled = true; };
    }, [visible, sub, guide?.rankingSport]);

    const athletes = useMemo(
        () => mergeAthleteRankings(guide?.athletes || [], tours),
        [guide?.athletes, tours]
    );

    if (!guide) return null;

    const tabLabel = (key) => {
        if (key === 'how') return t.sportGuideTabHow;
        if (key === 'athletes') return t.sportGuideTabAthletes;
        return t.sportGuideTabBonus;
    };

    return (
        <>
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

                        {tab === 'athletes' && (
                            <>
                                {guide.rankingSport ? (
                                    <Text style={s.rankNote}>
                                        {rankLoading
                                            ? t.sportGuideRankLoading
                                            : (rankUpdatedAt
                                                ? t.sportGuideRankUpdated(new Date(rankUpdatedAt).toLocaleDateString(lang === 'tr' ? 'tr-TR' : lang === 'de' ? 'de-DE' : lang === 'ru' ? 'ru-RU' : 'en-US'))
                                                : t.sportGuideRankFallback)}
                                    </Text>
                                ) : null}
                                {rankLoading && guide.rankingSport ? (
                                    <ActivityIndicator color={accent} style={{ marginVertical: 12 }} />
                                ) : null}
                                {athletes.map((a) => {
                                    const rankBadge = a.worldRank != null
                                        ? `#${a.worldRank}`
                                        : (a.status === 'legend' && a.peakRank ? t.sportGuidePeakShort(a.peakRank) : null);
                                    return (
                                        <View key={a.id || a.name} style={s.card}>
                                            <View style={s.athleteRow}>
                                                <View style={{ flex: 1, paddingRight: 8 }}>
                                                    <Text style={s.athleteName} numberOfLines={1}>
                                                        {a.country ? `${a.country} ` : ''}{a.name}
                                                    </Text>
                                                    <Text style={s.athleteMeta} numberOfLines={1}>
                                                        {[a.years, a.tourLabel || a.tour].filter(Boolean).join(' · ')}
                                                    </Text>
                                                </View>
                                                {rankBadge ? (
                                                    <Text style={[s.rankBadge, { color: accent, borderColor: accent + '66' }]}>{rankBadge}</Text>
                                                ) : null}
                                                <TouchableOpacity
                                                    onPress={() => setDetailAthlete(a)}
                                                    style={[s.detailBtn, { borderColor: accent }]}
                                                    activeOpacity={0.8}
                                                >
                                                    <Text style={[s.detailBtnTxt, { color: accent }]}>{t.sportGuideDetail}</Text>
                                                </TouchableOpacity>
                                            </View>
                                            <Text style={s.cardBody} numberOfLines={3}>{a.bio}</Text>
                                        </View>
                                    );
                                })}
                            </>
                        )}

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

        <AthleteDetailModal
            visible={!!detailAthlete}
            athlete={detailAthlete}
            onClose={() => setDetailAthlete(null)}
            accent={accent}
            insets={insets}
        />
        </>
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
    subMeta: { color: colors.textMuted, fontSize: moderateScale(12), fontWeight: '600', marginTop: 4 },
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
    athleteRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 6 },
    athleteName: { color: '#fff', fontSize: moderateScale(14), fontWeight: '900' },
    athleteMeta: { color: colors.textMuted, fontSize: moderateScale(11), fontWeight: '600', marginTop: 2 },
    rankBadge: {
        fontSize: moderateScale(12), fontWeight: '900', paddingHorizontal: 8, paddingVertical: 4,
        borderRadius: 8, borderWidth: 1, overflow: 'hidden',
    },
    detailBtn: {
        borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6,
        backgroundColor: '#ffffff08',
    },
    detailBtnTxt: { fontSize: moderateScale(11), fontWeight: '800' },
    rankNote: { color: colors.textMuted, fontSize: moderateScale(11), marginBottom: 8, fontWeight: '600' },
    detailBlock: {
        backgroundColor: colors.surface2, borderRadius: 14, borderWidth: 1, borderColor: colors.border,
        padding: 12, marginBottom: 10,
    },
    detailBlockTitle: { fontSize: moderateScale(13), fontWeight: '900', marginBottom: 8 },
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
