import { useCallback, useEffect, useRef, useState } from 'react';
import {
    Modal, View, Text, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Alert,
    KeyboardAvoidingView, Pressable, useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useVideoPlayer, VideoView } from 'expo-video';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useSelector } from 'react-redux';
import api from '../services/api';

const ACCENT = '#22d3ee';
const TEAM_COLORS = { A: '#38bdf8', B: '#f472b6' };
const CORNER_COLORS = ['#f97316', '#f97316', '#22c55e', '#22c55e'];
const ACTIVE = ['UPLOADING', 'QUEUED', 'PROCESSING'];

const mmss = (sec) => {
    const s = Math.max(0, Math.round(sec || 0));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
    return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
};

function Btn({ label, onPress, color = ACCENT, filled, disabled, style }) {
    return (
        <TouchableOpacity disabled={disabled} onPress={onPress}
            style={[{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: color + '90',
                backgroundColor: filled ? color : color + '20', alignItems: 'center', opacity: disabled ? 0.5 : 1 }, style]}>
            <Text style={{ color: filled ? '#0b1220' : color, fontSize: 14, fontWeight: '800' }}>{label}</Text>
        </TouchableOpacity>
    );
}

function buildPlayers(teamA, teamB, doubles) {
    const n = doubles ? 2 : 1;
    const side = (arr, team) => Array.from({ length: n }, (_, i) => ({
        key: `${team}${i}`, team, userId: arr[i]?.id || null, name: arr[i]?.name || '',
    }));
    return [...side(teamA, 'A'), ...side(teamB, 'B')];
}

// ── Kayıt: oyuncular sırayla kameraya tanıtılır (zaman damgası = kimlik karesi), sonra maç ──
function RecordStep({ players, onDone, onCancel, t }) {
    const insets = useSafeAreaInsets();
    const [camPerm, requestCamPerm] = useCameraPermissions();
    const cameraRef = useRef(null);
    const startRef = useRef(0);
    const introRef = useRef([]);
    const [camMounted, setCamMounted] = useState(false);
    const [camReady, setCamReady] = useState(false);
    const [recording, setRecording] = useState(false);
    const [introIdx, setIntroIdx] = useState(0);
    const [elapsed, setElapsed] = useState(0);

    // Kamera yüzeyi modal açılış animasyonu bitmeden takılırsa Android'de çöküyordu
    useEffect(() => {
        const id = setTimeout(() => setCamMounted(true), 300);
        return () => clearTimeout(id);
    }, []);
    useEffect(() => {
        if (!recording) return undefined;
        const id = setInterval(() => setElapsed((Date.now() - startRef.current) / 1000), 1000);
        return () => clearInterval(id);
    }, [recording]);

    const start = async () => {
        if (!cameraRef.current || recording) return;
        introRef.current = [];
        setIntroIdx(0);
        setElapsed(0);
        startRef.current = Date.now();
        setRecording(true);
        try {
            const v = await cameraRef.current.recordAsync({ maxDuration: 3 * 3600 });
            setRecording(false);
            if (v?.uri) onDone({ uri: v.uri, introTimes: introRef.current });
        } catch (e) {
            setRecording(false);
            Alert.alert(t.mvaTitle, t.mvaErrRecord);
        }
    };
    const nextIntro = () => {
        introRef.current[introIdx] = Math.max(0, (Date.now() - startRef.current) / 1000 - 0.3);
        setIntroIdx(i => i + 1);
    };
    const stop = () => cameraRef.current?.stopRecording();

    if (!camPerm?.granted) {
        return (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#000' }}>
                <Text style={{ color: '#fff', fontSize: 15, textAlign: 'center', marginBottom: 16 }}>{t.mvaCamPerm}</Text>
                <Btn label={t.mvaGrant} filled onPress={requestCamPerm} />
                <Btn label={t.mvaBack} onPress={onCancel} style={{ marginTop: 10 }} />
            </View>
        );
    }

    const introDone = introIdx >= players.length;
    const cur = players[introIdx];
    return (
        <View style={{ flex: 1, backgroundColor: '#000' }}>
            {camMounted && (
                <CameraView ref={cameraRef} style={{ flex: 1 }} mode="video" facing="back" mute
                    videoQuality="720p" onCameraReady={() => setCamReady(true)} />
            )}
            <View style={{ position: 'absolute', top: insets.top + 10, left: 12, right: 12 }}>
                {!recording ? (
                    <View style={{ backgroundColor: '#000000b0', borderRadius: 12, padding: 12 }}>
                        <Text style={{ color: '#fff', fontWeight: '800', marginBottom: 6 }}>{t.mvaTipsTitle}</Text>
                        {[t.mvaTip1, t.mvaTip2, t.mvaTip3, t.mvaTip4].map((x, i) => (
                            <Text key={i} style={{ color: '#e2e8f0', fontSize: 12, marginBottom: 2 }}>• {x}</Text>
                        ))}
                    </View>
                ) : (
                    <View style={{ backgroundColor: '#000000b0', borderRadius: 12, padding: 12 }}>
                        <Text style={{ color: '#f87171', fontWeight: '800' }}>● REC {mmss(elapsed)}</Text>
                        {!introDone ? (
                            <Text style={{ color: TEAM_COLORS[cur.team], fontSize: 15, fontWeight: '800', marginTop: 6 }}>
                                {t.mvaIntroPrompt(cur.name || `${cur.team}${introIdx + 1}`)}
                            </Text>
                        ) : (
                            <Text style={{ color: '#fff', fontSize: 14, marginTop: 6 }}>{t.mvaRecordingMatch}</Text>
                        )}
                    </View>
                )}
            </View>
            <View style={{ position: 'absolute', bottom: insets.bottom + 20, left: 12, right: 12, flexDirection: 'row', gap: 10, justifyContent: 'center' }}>
                {!recording ? (
                    <>
                        <Btn label={t.mvaBack} onPress={onCancel} color="#e2e8f0" />
                        <Btn label={`● ${t.mvaStartRec}`} onPress={start} color="#ef4444" filled disabled={!camReady} />
                    </>
                ) : (
                    <>
                        {!introDone && <Btn label={t.mvaIntroNext} onPress={nextIntro} filled />}
                        <Btn label={`■ ${t.mvaStopRec}`} onPress={stop} color="#ef4444" filled={introDone} />
                    </>
                )}
            </View>
        </View>
    );
}

// ── Kalibrasyon: kare üzerinde 4 kort köşesi + her oyuncuya dokun ──
function CalibrateStep({ video, players, introTimes, onDone, onBack, busy, uploadPct, t }) {
    const insets = useSafeAreaInsets();
    const { width: winW, height: winH } = useWindowDimensions();
    const player = useVideoPlayer({ uri: video.uri }, (p) => { p.muted = true; p.pause(); });
    const [size, setSize] = useState(video.width && video.height ? { w: video.width, h: video.height } : null);
    const [swapped, setSwapped] = useState(false);
    const [duration, setDuration] = useState(video.duration || 0);
    const [corners, setCorners] = useState([]);
    const [tags, setTags] = useState({});
    const [curTime, setCurTime] = useState(0);

    useEffect(() => {
        const subs = [
            player.addListener('sourceLoad', (e) => {
                const tr = e?.availableVideoTracks?.[0];
                if (tr?.size?.width && !size) setSize({ w: tr.size.width, h: tr.size.height });
                if (e?.duration) setDuration(e.duration);
            }),
            player.addListener('videoTrackChange', (e) => {
                const sz = e?.videoTrack?.size;
                if (sz?.width && !size) setSize({ w: sz.width, h: sz.height });
            }),
        ];
        return () => subs.forEach(s => s?.remove?.());
    }, [player, size]);

    const seek = useCallback((tSec) => {
        const d = duration || player.duration || 0;
        const v = Math.max(0, d ? Math.min(d - 0.1, tSec) : tSec);
        player.currentTime = v;
        player.pause();
        setCurTime(v);
    }, [player, duration]);

    const nextPlayerIdx = players.findIndex((_, i) => !tags[i]);
    const phase = corners.length < 4 ? 'corner' : nextPlayerIdx >= 0 ? 'player' : 'done';

    // Oyuncu sırası gelince tanıtım karesine git (kameradan kayıtta)
    useEffect(() => {
        if (phase !== 'player') return;
        const it = introTimes?.[nextPlayerIdx];
        if (Number.isFinite(it)) seek(it);
    }, [phase, nextPlayerIdx]); // eslint-disable-line react-hooks/exhaustive-deps

    const raw = size || { w: 16, h: 9 };
    const aspect = swapped ? raw.h / raw.w : raw.w / raw.h;
    const maxW = winW - 24, maxH = winH * 0.52;
    const boxW = Math.min(maxW, maxH * aspect);
    const boxH = boxW / aspect;

    const onTap = (e) => {
        const x = Math.max(0, Math.min(1, e.nativeEvent.locationX / boxW));
        const y = Math.max(0, Math.min(1, e.nativeEvent.locationY / boxH));
        if (phase === 'corner') setCorners(c => [...c, { x, y }]);
        else if (phase === 'player') setTags(tg => ({ ...tg, [nextPlayerIdx]: { t: player.currentTime || curTime, x, y } }));
    };
    const undo = () => {
        const tagged = Object.keys(tags).map(Number);
        if (tagged.length) {
            const last = Math.max(...tagged);
            setTags(tg => { const n = { ...tg }; delete n[last]; return n; });
        } else setCorners(c => c.slice(0, -1));
    };

    const prompt = phase === 'corner' ? t[`mvaCorner${corners.length}`]
        : phase === 'player' ? t.mvaTagPlayer(players[nextPlayerIdx].name || `${players[nextPlayerIdx].team}${nextPlayerIdx + 1}`)
        : t.mvaCalibDone;

    return (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12, paddingBottom: insets.bottom + 24 }}>
            <Text style={{ color: '#fff', fontSize: 17, fontWeight: '800', marginBottom: 4 }}>{t.mvaCalibTitle}</Text>
            <Text style={{ color: phase === 'done' ? '#4ade80' : ACCENT, fontSize: 14, fontWeight: '700', marginBottom: 10 }}>{prompt}</Text>
            <View style={{ width: boxW, height: boxH, alignSelf: 'center', backgroundColor: '#000', borderRadius: 6, overflow: 'hidden' }}>
                <VideoView player={player} style={{ width: boxW, height: boxH }} contentFit="fill" nativeControls={false} />
                <Pressable onPress={onTap} style={{ position: 'absolute', left: 0, top: 0, width: boxW, height: boxH }}>
                    {corners.map((p, i) => (
                        <View key={`c${i}`} pointerEvents="none" style={{ position: 'absolute', left: p.x * boxW - 9, top: p.y * boxH - 9, width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: '#fff', backgroundColor: CORNER_COLORS[i], alignItems: 'center', justifyContent: 'center' }}>
                            <Text style={{ color: '#fff', fontSize: 10, fontWeight: '900' }}>{i + 1}</Text>
                        </View>
                    ))}
                    {Object.entries(tags).map(([i, p]) => (
                        <View key={`p${i}`} pointerEvents="none" style={{ position: 'absolute', left: p.x * boxW - 6, top: p.y * boxH - 6, alignItems: 'flex-start' }}>
                            <View style={{ width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: '#fff', backgroundColor: TEAM_COLORS[players[i].team] }} />
                            <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800', backgroundColor: '#000000a0', paddingHorizontal: 3, marginTop: 2 }} numberOfLines={1}>{players[i].name}</Text>
                        </View>
                    ))}
                </Pressable>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                {[-5, -1, 1, 5].map(d => (
                    <TouchableOpacity key={d} onPress={() => seek((player.currentTime || curTime) + d)}
                        style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, backgroundColor: '#1e293b' }}>
                        <Text style={{ color: '#e2e8f0', fontWeight: '800' }}>{d > 0 ? `+${d}s` : `${d}s`}</Text>
                    </TouchableOpacity>
                ))}
                <Text style={{ color: '#94a3b8', fontSize: 12, marginLeft: 6 }}>{mmss(curTime)}{duration ? ` / ${mmss(duration)}` : ''}</Text>
            </View>
            <Text style={{ color: '#94a3b8', fontSize: 12, marginTop: 10 }}>{t.mvaCalibHint}</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                <Btn label={t.mvaUndo} onPress={undo} color="#e2e8f0" disabled={busy || (!corners.length && !Object.keys(tags).length)} />
                <Btn label={t.mvaSwapAspect} onPress={() => setSwapped(v => !v)} color="#e2e8f0" disabled={busy} />
                <Btn label={t.mvaBack} onPress={onBack} color="#e2e8f0" disabled={busy} />
            </View>
            {busy ? (
                <View style={{ marginTop: 16, alignItems: 'center' }}>
                    <ActivityIndicator color={ACCENT} />
                    <Text style={{ color: '#fff', marginTop: 8, fontWeight: '700' }}>{t.mvaUploading(uploadPct ?? 0)}</Text>
                    <Text style={{ color: '#94a3b8', marginTop: 4, fontSize: 12, textAlign: 'center' }}>{t.mvaUploadKeepOpen}</Text>
                </View>
            ) : (
                <Btn label={t.mvaUploadBtn} filled disabled={phase !== 'done'} style={{ marginTop: 16 }}
                    onPress={() => onDone({
                        corners,
                        tags: players.map((_, i) => tags[i]),
                        durationSec: duration || player.duration || null,
                    })} />
            )}
        </ScrollView>
    );
}

// ── Rapor ──
function Stat({ label, value }) {
    return (
        <View style={{ width: '50%', paddingVertical: 4 }}>
            <Text style={{ color: '#94a3b8', fontSize: 11 }}>{label}</Text>
            <Text style={{ color: '#fff', fontSize: 15, fontWeight: '800' }}>{value ?? '—'}</Text>
        </View>
    );
}

function Heatmap({ grid, color, t }) {
    if (!Array.isArray(grid)) return null;
    const maxV = Math.max(1, ...grid.flat());
    return (
        <View style={{ marginTop: 6 }}>
            <Text style={{ color: '#94a3b8', fontSize: 11, marginBottom: 3 }}>{t.mvaHeatmap} · {t.mvaNetTop}</Text>
            <View style={{ borderWidth: 1, borderColor: '#475569', borderRadius: 4, overflow: 'hidden', width: 150 }}>
                {grid.map((row, r) => (
                    <View key={r} style={{ flexDirection: 'row' }}>
                        {row.map((v, c) => (
                            <View key={c} style={{ width: 50, height: 22, backgroundColor: color, opacity: 0.08 + 0.92 * (v / maxV), alignItems: 'center', justifyContent: 'center', borderWidth: 0.5, borderColor: '#0b1220' }}>
                                <Text style={{ color: '#fff', fontSize: 9, fontWeight: '800' }}>{v}%</Text>
                            </View>
                        ))}
                    </View>
                ))}
            </View>
        </View>
    );
}

function ReportView({ item, t }) {
    const r = item?.result;
    if (!r) return null;
    const names = (team) => (r.players || []).filter(p => p.team === team).map(p => p.name).join(' / ');
    const kmh = (v) => (v != null ? `${v} km/h` : '—');
    const evText = (e) => {
        if (e.type === 'point') return `🏁 ${t.mvaPointFor(names(e.team))} · ${t[`mvaReason_${e.reason}`] || e.reason}`;
        const who = r.players?.[e.slot]?.name || '';
        if (e.type === 'fault') return `⚠️ ${who} · ${t.mvaEv_fault}`;
        const res = t[`mvaRes_${e.result}`] || '';
        return `${e.type === 'serve' ? '🎾' : '↔️'} ${who} · ${t[`mvaEv_${e.type}`]}${e.speed ? ` · ${e.speed} km/h` : ''}${res ? ` · ${res}` : ''}`;
    };
    return (
        <View>
            <View style={{ backgroundColor: '#0f172a', borderRadius: 12, padding: 12, marginBottom: 10 }}>
                <Text style={{ color: '#94a3b8', fontSize: 12 }}>{t.mvaScore}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
                    <Text style={{ flex: 1, color: TEAM_COLORS.A, fontWeight: '800' }} numberOfLines={2}>{names('A')}</Text>
                    <Text style={{ color: '#fff', fontSize: 22, fontWeight: '900', marginHorizontal: 10 }}>{r.teamPoints?.A ?? 0} – {r.teamPoints?.B ?? 0}</Text>
                    <Text style={{ flex: 1, color: TEAM_COLORS.B, fontWeight: '800', textAlign: 'right' }} numberOfLines={2}>{names('B')}</Text>
                </View>
                <Text style={{ color: '#94a3b8', fontSize: 12, marginTop: 8 }}>
                    {t.mvaRallies(r.rallies?.count ?? 0, r.rallies?.avgLength ?? 0, r.rallies?.longest ?? 0)} · {mmss(r.durationSec)}
                </Text>
            </View>
            {(r.players || []).map(p => (
                <View key={p.slot} style={{ backgroundColor: '#0f172a', borderRadius: 12, padding: 12, marginBottom: 10, borderLeftWidth: 4, borderLeftColor: TEAM_COLORS[p.team] }}>
                    <Text style={{ color: '#fff', fontSize: 15, fontWeight: '800', marginBottom: 6 }}>{p.name}</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                        <Stat label={t.mvaShots} value={p.shots} />
                        <Stat label={t.mvaServes} value={p.serves} />
                        <Stat label={t.mvaAces} value={p.aces} />
                        <Stat label={t.mvaWinners} value={p.winners} />
                        <Stat label={t.mvaDoubleFaults} value={p.doubleFaults} />
                        <Stat label={t.mvaErrors} value={`${p.errors} (${t.mvaOuts} ${p.outs} · ${t.mvaNets} ${p.nets})`} />
                        <Stat label={t.mvaFirstServe} value={p.firstServePct != null ? `${p.firstServePct}%` : '—'} />
                        <Stat label={t.mvaDistance} value={`${p.distanceM ?? 0} m`} />
                        <Stat label={t.mvaAvgShot} value={kmh(p.avgShotSpeed)} />
                        <Stat label={t.mvaMaxShot} value={kmh(p.maxShotSpeed)} />
                        <Stat label={t.mvaAvgServe} value={kmh(p.avgServeSpeed)} />
                        <Stat label={t.mvaMaxServe} value={kmh(p.maxServeSpeed)} />
                    </View>
                    <Heatmap grid={p.heatmap} color={TEAM_COLORS[p.team]} t={t} />
                </View>
            ))}
            <Text style={{ color: '#94a3b8', fontSize: 12, marginBottom: 10 }}>
                {t.mvaQuality(Math.round((r.quality?.ballCoverage || 0) * 100))}
            </Text>
            <Text style={{ color: '#fff', fontSize: 15, fontWeight: '800', marginBottom: 6 }}>{t.mvaTimeline}</Text>
            {(r.timeline || []).slice(0, 300).map((e, i) => (
                <View key={i} style={{ flexDirection: 'row', paddingVertical: 4, borderBottomWidth: 0.5, borderBottomColor: '#1e293b' }}>
                    <Text style={{ color: '#64748b', width: 54, fontSize: 12 }}>{mmss(e.t)}</Text>
                    <Text style={{ color: e.type === 'point' ? '#4ade80' : '#e2e8f0', flex: 1, fontSize: 12 }}>{evText(e)}</Text>
                </View>
            ))}
        </View>
    );
}

// ── Ana modal ──
export default function MatchVideoAnalysisModal({ visible, onClose, match, teamA = [], teamB = [], t }) {
    const insets = useSafeAreaInsets();
    const myId = useSelector(s => s.auth.user?.id);
    const [step, setStep] = useState('list'); // list | setup | record | calib | report
    const [source, setSource] = useState('camera');
    const [videos, setVideos] = useState([]);
    const [loading, setLoading] = useState(false);
    const [doubles, setDoubles] = useState(false);
    const [players, setPlayers] = useState([]);
    const [video, setVideo] = useState(null);
    const [introTimes, setIntroTimes] = useState([]);
    const [report, setReport] = useState(null);
    const [uploadPct, setUploadPct] = useState(null);

    const load = useCallback(async () => {
        if (!match?.id) return;
        try {
            const res = await api.get('/match-videos', { params: { activityRequestId: match.id } });
            setVideos(res.data?.videos || []);
        } catch { /* liste boş kalır */ }
    }, [match?.id]);

    useEffect(() => {
        if (!visible) return;
        const dbl = teamA.length >= 2 && teamB.length >= 2;
        setStep('list');
        setVideo(null);
        setIntroTimes([]);
        setReport(null);
        setUploadPct(null);
        setDoubles(dbl);
        setPlayers(buildPlayers(teamA, teamB, dbl));
        setLoading(true);
        load().finally(() => setLoading(false));
    }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

    // İşlenen video varken liste kendini yenilesin
    useEffect(() => {
        if (!visible || step !== 'list' || !videos.some(v => ACTIVE.includes(v.status))) return undefined;
        const id = setInterval(load, 8000);
        return () => clearInterval(id);
    }, [visible, step, videos, load]);

    const setDbl = (v) => { setDoubles(v); setPlayers(buildPlayers(teamA, teamB, v)); };
    const busy = uploadPct != null;

    const close = () => {
        if (step === 'record' || busy) return;
        onClose();
    };

    const pickGallery = async () => {
        const res = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['videos'], quality: 1,
            ...(ImagePicker.VideoExportPreset?.H264_1280x720 != null ? { videoExportPreset: ImagePicker.VideoExportPreset.H264_1280x720 } : {}),
        });
        const a = res?.assets?.[0];
        if (res.canceled || !a?.uri) return;
        setVideo({ uri: a.uri, width: a.width, height: a.height, duration: a.duration ? a.duration / 1000 : 0 });
        setIntroTimes([]);
        setStep('calib');
    };

    const continueSetup = () => {
        if (players.some(p => !p.name.trim())) { Alert.alert(t.mvaTitle, t.mvaNeedNames); return; }
        if (source === 'camera') setStep('record');
        else pickGallery();
    };

    const upload = async ({ corners, tags, durationSec }) => {
        setUploadPct(0);
        try {
            const isMov = /\.mov$/i.test(video.uri);
            const res = await api.post('/match-videos', {
                activityRequestId: match.id,
                subCategory: match.subCategory,
                doubles,
                durationSec,
                contentType: isMov ? 'video/quicktime' : 'video/mp4',
                calibration: { corners },
                players: players.map((p, i) => ({ name: p.name.trim(), userId: p.userId, team: p.team, tag: tags[i] })),
            });
            const { video: rec, uploadUrl, contentType } = res.data;
            const task = FileSystem.createUploadTask(uploadUrl, video.uri, {
                httpMethod: 'PUT',
                uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
                headers: { 'Content-Type': contentType },
            }, ({ totalBytesSent, totalBytesExpectedToSend }) => {
                if (totalBytesExpectedToSend > 0) setUploadPct(Math.round((totalBytesSent / totalBytesExpectedToSend) * 100));
            });
            const up = await task.uploadAsync();
            if (!up || up.status >= 300) throw new Error(`upload ${up?.status}`);
            await api.post(`/match-videos/${rec.id}/uploaded`);
            setUploadPct(null);
            Alert.alert(t.mvaTitle, t.mvaUploaded);
            setStep('list');
            setLoading(true);
            load().finally(() => setLoading(false));
        } catch (e) {
            setUploadPct(null);
            const code = e?.response?.data?.code;
            const msg = code === 'STORAGE_OFF' ? t.mvaErrStorage
                : code === 'BUSY' ? t.mvaErrBusy
                : code === 'TOO_LONG' ? t.mvaErrTooLong
                : t.mvaErrUpload;
            Alert.alert(t.mvaTitle, msg);
        }
    };

    const retry = async (v) => {
        try { await api.post(`/match-videos/${v.id}/retry`); load(); } catch { Alert.alert(t.mvaTitle, t.mvaErrGeneric); }
    };
    const remove = (v) => Alert.alert(t.mvaTitle, t.mvaDeleteConfirm, [
        { text: t.mvaCancel, style: 'cancel' },
        { text: t.mvaDelete, style: 'destructive', onPress: async () => {
            try { await api.delete(`/match-videos/${v.id}`); load(); } catch { Alert.alert(t.mvaTitle, t.mvaErrGeneric); }
        } },
    ]);

    const statusText = (v) => {
        if (v.status === 'PROCESSING') return `${t.mvaStatus_PROCESSING} ${v.progress || 0}%`;
        return t[`mvaStatus_${v.status}`] || v.status;
    };
    const statusColor = { DONE: '#4ade80', FAILED: '#f87171', PROCESSING: ACCENT, QUEUED: '#facc15', UPLOADING: '#94a3b8' };

    const header = (title, onBack) => (
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: insets.top + 8, paddingBottom: 8 }}>
            {onBack ? (
                <TouchableOpacity onPress={onBack} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} disabled={busy}>
                    <Text style={{ color: '#fff', fontSize: 22, marginRight: 10 }}>‹</Text>
                </TouchableOpacity>
            ) : null}
            <Text style={{ color: '#fff', fontSize: 18, fontWeight: '900', flex: 1 }}>{title}</Text>
            <TouchableOpacity onPress={close} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} disabled={busy}>
                <Text style={{ color: '#94a3b8', fontSize: 22 }}>✕</Text>
            </TouchableOpacity>
        </View>
    );

    return (
        <Modal visible={visible} animationType="slide" onRequestClose={close} android_keyboardInputMode="adjustNothing">
            <View style={{ flex: 1, backgroundColor: '#0b1220' }}>
                {step === 'record' ? (
                    <RecordStep players={players} t={t}
                        onCancel={() => setStep('setup')}
                        onDone={({ uri, introTimes: it }) => { setVideo({ uri }); setIntroTimes(it); setStep('calib'); }} />
                ) : step === 'calib' && video ? (
                    <>
                        {header(t.mvaTitle, busy ? null : () => setStep('setup'))}
                        <CalibrateStep video={video} players={players} introTimes={introTimes} t={t}
                            busy={busy} uploadPct={uploadPct}
                            onBack={() => setStep('setup')} onDone={upload} />
                    </>
                ) : step === 'report' && report ? (
                    <>
                        {header(t.mvaReportTitle, () => setStep('list'))}
                        <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: insets.bottom + 24 }}>
                            <ReportView item={report} t={t} />
                        </ScrollView>
                    </>
                ) : step === 'setup' ? (
                    <>
                        {header(t.mvaSetupTitle, () => setStep('list'))}
                        <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
                            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 12, paddingBottom: insets.bottom + 40 }}>
                                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                                    <Btn label={t.mvaSingles} onPress={() => setDbl(false)} filled={!doubles} style={{ flex: 1 }} />
                                    <Btn label={t.mvaDoubles} onPress={() => setDbl(true)} filled={doubles} style={{ flex: 1 }} />
                                </View>
                                {['A', 'B'].map(team => (
                                    <View key={team} style={{ marginBottom: 12 }}>
                                        <Text style={{ color: TEAM_COLORS[team], fontWeight: '800', marginBottom: 6 }}>{team === 'A' ? t.mvaTeamA : t.mvaTeamB}</Text>
                                        {players.map((p, i) => p.team !== team ? null : (
                                            <TextInput key={p.key} value={p.name} placeholder={t.mvaPlayerName} placeholderTextColor="#64748b"
                                                onChangeText={(v) => setPlayers(list => list.map((x, j) => (j === i ? { ...x, name: v.slice(0, 40), userId: v.trim() ? x.userId : null } : x)))}
                                                style={{ backgroundColor: '#0f172a', color: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#334155', paddingHorizontal: 12, paddingVertical: 10, marginBottom: 6, fontSize: 15 }} />
                                        ))}
                                    </View>
                                ))}
                                <View style={{ backgroundColor: '#0f172a', borderRadius: 12, padding: 12, marginBottom: 14 }}>
                                    <Text style={{ color: '#fff', fontWeight: '800', marginBottom: 6 }}>{t.mvaTipsTitle}</Text>
                                    {[t.mvaTip1, t.mvaTip2, t.mvaTip3, t.mvaTip4].map((x, i) => (
                                        <Text key={i} style={{ color: '#cbd5e1', fontSize: 13, marginBottom: 3 }}>• {x}</Text>
                                    ))}
                                    {source === 'camera' && <Text style={{ color: ACCENT, fontSize: 13, marginTop: 6 }}>{t.mvaIntroExplain}</Text>}
                                </View>
                                <Btn label={source === 'camera' ? t.mvaContinueRecord : t.mvaContinuePick} filled onPress={continueSetup} />
                            </ScrollView>
                        </KeyboardAvoidingView>
                    </>
                ) : (
                    <>
                        {header(t.mvaTitle)}
                        <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: insets.bottom + 24 }}>
                            <Text style={{ color: ACCENT, fontSize: 12, fontWeight: '800', marginBottom: 4 }}>{t.mvaBeta}</Text>
                            <Text style={{ color: '#cbd5e1', fontSize: 13, marginBottom: 14 }}>{t.mvaIntro}</Text>
                            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
                                <Btn label={t.mvaRecordNew} filled style={{ flex: 1 }} onPress={() => { setSource('camera'); setStep('setup'); }} />
                                <Btn label={t.mvaPickGallery} style={{ flex: 1 }} onPress={() => { setSource('gallery'); setStep('setup'); }} />
                            </View>
                            {loading ? <ActivityIndicator color={ACCENT} /> : videos.length === 0 ? (
                                <Text style={{ color: '#64748b', textAlign: 'center', marginTop: 10 }}>{t.mvaNoVideos}</Text>
                            ) : videos.map(v => (
                                <TouchableOpacity key={v.id} disabled={v.status !== 'DONE'} onPress={() => { setReport(v); setStep('report'); }}
                                    style={{ backgroundColor: '#0f172a', borderRadius: 12, padding: 12, marginBottom: 8 }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                        <Text style={{ color: '#fff', fontWeight: '800', flex: 1 }} numberOfLines={1}>
                                            {(v.players || []).filter(p => p.team === 'A').map(p => p.name).join(' / ')} – {(v.players || []).filter(p => p.team === 'B').map(p => p.name).join(' / ')}
                                        </Text>
                                        <Text style={{ color: statusColor[v.status] || '#94a3b8', fontWeight: '800', fontSize: 12 }}>{statusText(v)}</Text>
                                    </View>
                                    <Text style={{ color: '#64748b', fontSize: 11, marginTop: 4 }}>
                                        {new Date(v.createdAt).toLocaleString()}{v.durationSec ? ` · ${mmss(v.durationSec)}` : ''}
                                    </Text>
                                    {v.status === 'DONE' && v.result?.teamPoints && (
                                        <Text style={{ color: ACCENT, fontSize: 13, fontWeight: '800', marginTop: 4 }}>
                                            {t.mvaViewReport} · {v.result.teamPoints.A} – {v.result.teamPoints.B}
                                        </Text>
                                    )}
                                    {v.status === 'FAILED' && v.error ? <Text style={{ color: '#f87171', fontSize: 11, marginTop: 4 }}>{t.mvaFailedHint}</Text> : null}
                                    {v.userId === myId && (
                                        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                                            {v.status === 'FAILED' && <Btn label={t.mvaRetry} onPress={() => retry(v)} />}
                                            {v.status !== 'PROCESSING' && <Btn label={t.mvaDelete} color="#f87171" onPress={() => remove(v)} />}
                                        </View>
                                    )}
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </>
                )}
            </View>
        </Modal>
    );
}
