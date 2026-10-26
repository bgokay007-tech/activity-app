import { useEffect, useMemo, useRef, useState } from 'react';
import {
    Modal, View, Text, TouchableOpacity, StyleSheet, ActivityIndicator,
    Share, Platform, Alert, Dimensions,
} from 'react-native';
import { WebView } from 'react-native-webview';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import useT from '../hooks/useT';
import { useSelector } from 'react-redux';
import colors from '../theme/colors';
import { buildMatchSharePayload, matchShareMessage } from '../utils/matchShareCard';

const W = 1080;
const H = 1920;

function cardHtml(p) {
    const setsHtml = (p.lines || []).map(l =>
        `<div class="set">${escape(l)}</div>`).join('');
    return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<meta name="viewport" content="width=${W}, initial-scale=1"/>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{width:${W}px;height:${H}px;background:linear-gradient(160deg,#12081f 0%,#1e0b3a 45%,#0a0a14 100%);
    color:#fff;font-family:-apple-system,Segoe UI,Roboto,sans-serif;
    display:flex;flex-direction:column;align-items:center;justify-content:space-between;
    padding:120px 72px 100px;position:relative;overflow:hidden}
  .glow{position:absolute;width:700px;height:700px;border-radius:50%;background:#9333ea33;filter:blur(80px);top:200px;left:190px}
  .brand{font-size:54px;font-weight:900;letter-spacing:4px;
    background:linear-gradient(90deg,#c084fc,#f0abfc,#a78bfa);-webkit-background-clip:text;color:transparent}
  .sport{margin-top:28px;font-size:36px;font-weight:800;color:#e9d5ff}
  .vsbox{width:100%;margin-top:80px;background:#ffffff10;border:2px solid #ffffff22;border-radius:40px;padding:56px 40px;backdrop-filter:blur(8px)}
  .names{display:flex;align-items:center;justify-content:space-between;gap:24px}
  .side{flex:1;text-align:center}
  .side .n{font-size:40px;font-weight:900;line-height:1.2}
  .mid{font-size:72px;font-weight:900;color:#c084fc;min-width:160px;text-align:center}
  .sets{margin-top:40px;display:flex;flex-wrap:wrap;gap:14px;justify-content:center}
  .set{background:#9333ea33;border:1px solid #a78bfa66;border-radius:18px;padding:14px 22px;font-size:32px;font-weight:800}
  .winner{margin-top:48px;text-align:center;font-size:38px;font-weight:900;color:#4ade80}
  .meta{width:100%;margin-top:auto;text-align:center;color:#c4b5fd;font-size:28px;line-height:1.6}
  .foot{margin-top:36px;font-size:24px;color:#ffffff66;font-weight:700;letter-spacing:1px}
</style></head><body>
<div class="glow"></div>
<div style="text-align:center;z-index:1">
  <div class="brand">AcTiViTy</div>
  <div class="sport">${escape(p.emoji)} ${escape(p.sport)}</div>
</div>
<div class="vsbox" style="z-index:1">
  <div class="names">
    <div class="side"><div class="n">${escape(p.leftLabel)}</div></div>
    <div class="mid">${p.leftSets}–${p.rightSets}</div>
    <div class="side"><div class="n">${escape(p.rightLabel)}</div></div>
  </div>
  <div class="sets">${setsHtml}</div>
  <div class="winner">🏆 ${escape(p.resultLabel)}</div>
</div>
<div class="meta" style="z-index:1">
  ${p.place ? `<div>📍 ${escape(p.place)}</div>` : ''}
  ${p.dateStr ? `<div>📅 ${escape(p.dateStr)}</div>` : ''}
  <div class="foot">activity · match result</div>
</div>
<canvas id="c" width="${W}" height="${H}" style="display:none"></canvas>
<script>
(function(){
  function go(){
    try{
      var canvas=document.getElementById('c');
      var ctx=canvas.getContext('2d');
      var scale=1;
      ctx.fillStyle='#12081f';
      ctx.fillRect(0,0,${W},${H});
      // html-to-canvas: draw via foreignObject is flaky on Android WebView —
      // instead rasterize by painting the same layout in canvas 2d.
      var g=ctx.createLinearGradient(0,0,${W},${H});
      g.addColorStop(0,'#12081f'); g.addColorStop(0.45,'#1e0b3a'); g.addColorStop(1,'#0a0a14');
      ctx.fillStyle=g; ctx.fillRect(0,0,${W},${H});
      ctx.fillStyle='rgba(147,51,234,0.2)';
      ctx.beginPath(); ctx.arc(540,500,320,0,Math.PI*2); ctx.fill();
      function text(str,x,y,size,color,align,weight){
        ctx.fillStyle=color||'#fff';
        ctx.font=(weight||'900')+' '+size+'px sans-serif';
        ctx.textAlign=align||'center';
        ctx.fillText(str,x,y);
      }
      text('AcTiViTy',540,180,54,'#e9d5ff');
      text(${JSON.stringify((p.emoji || '') + ' ' + (p.sport || ''))},540,250,36,'#e9d5ff','center','800');
      // card
      roundRect(ctx,72,360,${W}-144,900,40);
      ctx.fillStyle='rgba(255,255,255,0.08)'; ctx.fill();
      ctx.strokeStyle='rgba(255,255,255,0.15)'; ctx.lineWidth=3; ctx.stroke();
      text(${JSON.stringify(p.leftLabel || '')},270,520,34,'#fff','center','900');
      text(${JSON.stringify(String(p.leftSets) + '–' + String(p.rightSets))},540,540,64,'#c084fc');
      text(${JSON.stringify(p.rightLabel || '')},810,520,34,'#fff','center','900');
      var lines=${JSON.stringify(p.lines || [])};
      var y=640;
      lines.forEach(function(l){ text(l,540,y,30,'#ddd'); y+=52; });
      text('🏆 '+${JSON.stringify(p.resultLabel || '')},540,y+40,36,'#4ade80');
      var my=1500;
      ${p.place ? `text(${JSON.stringify('📍 ' + p.place)},540,my,28,'#c4b5fd'); my+=48;` : ''}
      ${p.dateStr ? `text(${JSON.stringify('📅 ' + p.dateStr)},540,my,28,'#c4b5fd'); my+=48;` : ''}
      text('activity · match result',540,1820,24,'rgba(255,255,255,0.4)','center','700');
      var data=canvas.toDataURL('image/png');
      if(window.ReactNativeWebView) window.ReactNativeWebView.postMessage(data);
    }catch(e){
      if(window.ReactNativeWebView) window.ReactNativeWebView.postMessage('ERR:'+String(e&&e.message||e));
    }
  }
  function roundRect(ctx,x,y,w,h,r){
    ctx.beginPath();
    ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r);
    ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath();
  }
  setTimeout(go,80);
})();
</script></body></html>`;
}

function escape(s) {
    return String(s || '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

export default function MatchResultShareModal({ visible, match, onClose }) {
    const t = useT();
    const lang = useSelector(s => s.lang?.lang) || 'tr';
    const insets = useSafeAreaInsets();
    const payload = useMemo(() => (visible && match ? buildMatchSharePayload(match, t, lang) : null), [visible, match, t, lang]);
    const [busy, setBusy] = useState(false);
    const [needCapture, setNeedCapture] = useState(false);
    const pendingAction = useRef(null); // 'share' | 'save'
    const winW = Dimensions.get('window').width;
    const previewH = Math.min(420, Math.round(winW * 0.72 * (H / W)));

    useEffect(() => {
        if (!visible) {
            setNeedCapture(false);
            setBusy(false);
            pendingAction.current = null;
        }
    }, [visible]);

    const onPng = async (dataUrl) => {
        setNeedCapture(false);
        if (!dataUrl || dataUrl.startsWith('ERR:')) {
            setBusy(false);
            Alert.alert(t.error, t.shareMatchFail);
            return;
        }
        try {
            const b64 = dataUrl.replace(/^data:image\/png;base64,/, '');
            const path = `${FileSystem.cacheDirectory}activity-match-${payload.id}.png`;
            await FileSystem.writeAsStringAsync(path, b64, { encoding: FileSystem.EncodingType.Base64 });
            const action = pendingAction.current;
            pendingAction.current = null;
            if (action === 'save') {
                const perm = await MediaLibrary.requestPermissionsAsync();
                if (!perm.granted) {
                    Alert.alert(t.error, t.shareMatchGalleryDenied);
                    return;
                }
                await MediaLibrary.saveToLibraryAsync(path);
                Alert.alert('', t.shareMatchSaved);
                return;
            }
            const message = matchShareMessage(payload, t);
            if (Platform.OS === 'ios') {
                await Share.share({ url: path, message });
            } else {
                // Android Share.share görseli çoğu cihazda eklemez — kartı galeriye koyup
                // metin+linki paylaş; kullanıcı WhatsApp Durumu / IG Hikâye'de galeriden seçer.
                try {
                    const perm = await MediaLibrary.requestPermissionsAsync();
                    if (perm.granted) await MediaLibrary.saveToLibraryAsync(path);
                } catch { /* galeri yoksa sadece metin */ }
                await Share.share({ message });
                Alert.alert('', t.shareMatchAndroidHint);
            }
        } catch {
            Alert.alert(t.error, t.shareMatchFail);
        } finally {
            setBusy(false);
        }
    };

    const start = (action) => {
        if (!payload || busy) return;
        pendingAction.current = action;
        setBusy(true);
        setNeedCapture(true);
    };

    if (!payload) {
        return (
            <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
                <View style={s.overlay} />
            </Modal>
        );
    }

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <View style={[s.overlay, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 12 }]}>
                <View style={s.sheet}>
                    <View style={s.header}>
                        <Text style={s.title}>{t.shareMatchTitle}</Text>
                        <TouchableOpacity onPress={onClose} hitSlop={12}><Text style={s.close}>✕</Text></TouchableOpacity>
                    </View>
                    <Text style={s.hint}>{t.shareMatchHint}</Text>

                    <View style={[s.preview, { height: previewH }]}>
                        <Text style={s.brand}>AcTiViTy</Text>
                        <Text style={s.sport}>{payload.emoji} {payload.sport}</Text>
                        <View style={s.vsRow}>
                            <Text style={[s.side, { flex: 1 }]} numberOfLines={2}>{payload.leftLabel}</Text>
                            <Text style={s.score}>{payload.leftSets}–{payload.rightSets}</Text>
                            <Text style={[s.side, { flex: 1 }]} numberOfLines={2}>{payload.rightLabel}</Text>
                        </View>
                        {payload.lines.length > 0 && (
                            <Text style={s.sets} numberOfLines={2}>{payload.lines.join('  ·  ')}</Text>
                        )}
                        <Text style={s.winner}>🏆 {payload.resultLabel}</Text>
                        {!!payload.place && <Text style={s.meta} numberOfLines={1}>📍 {payload.place}</Text>}
                        {!!payload.dateStr && <Text style={s.meta} numberOfLines={1}>📅 {payload.dateStr}</Text>}
                    </View>

                    <TouchableOpacity style={[s.btn, s.btnPrimary]} onPress={() => start('share')} disabled={busy}>
                        {busy && pendingAction.current === 'share'
                            ? <ActivityIndicator color="#fff" />
                            : <Text style={s.btnText}>{t.shareMatchShareBtn}</Text>}
                    </TouchableOpacity>
                    <TouchableOpacity style={[s.btn, s.btnGhost]} onPress={() => start('save')} disabled={busy}>
                        {busy && pendingAction.current === 'save'
                            ? <ActivityIndicator color="#c084fc" />
                            : <Text style={[s.btnText, { color: '#c084fc' }]}>{t.shareMatchSaveBtn}</Text>}
                    </TouchableOpacity>
                </View>
            </View>
            {needCapture && (
                <View style={s.hidden} pointerEvents="none">
                    <WebView
                        originWhitelist={['*']}
                        source={{ html: cardHtml(payload) }}
                        onMessage={(e) => onPng(e.nativeEvent?.data)}
                        javaScriptEnabled
                        style={{ width: 1, height: 1, opacity: 0 }}
                    />
                </View>
            )}
        </Modal>
    );
}

const s = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: '#000000cc', justifyContent: 'flex-end' },
    sheet: {
        backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
        padding: 18, maxHeight: '92%',
    },
    header: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
    title: { color: '#fff', fontSize: 17, fontWeight: '900', flex: 1 },
    close: { color: colors.textMuted, fontSize: 22 },
    hint: { color: colors.textMuted, fontSize: 12, marginBottom: 12, lineHeight: 17 },
    preview: {
        borderRadius: 18, overflow: 'hidden', marginBottom: 14, padding: 16,
        backgroundColor: '#1a0b2e', borderWidth: 1, borderColor: '#9333ea55',
        justifyContent: 'center',
    },
    brand: { color: '#e9d5ff', fontSize: 18, fontWeight: '900', textAlign: 'center', letterSpacing: 2 },
    sport: { color: '#c4b5fd', fontSize: 13, fontWeight: '800', textAlign: 'center', marginTop: 6, marginBottom: 14 },
    vsRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    side: { color: '#fff', fontSize: 13, fontWeight: '800', textAlign: 'center' },
    score: { color: '#c084fc', fontSize: 28, fontWeight: '900', minWidth: 64, textAlign: 'center' },
    sets: { color: '#ddd', fontSize: 12, textAlign: 'center', marginTop: 10, fontWeight: '700' },
    winner: { color: '#4ade80', fontSize: 14, fontWeight: '900', textAlign: 'center', marginTop: 12 },
    meta: { color: '#c4b5fd', fontSize: 11, textAlign: 'center', marginTop: 4 },
    btn: { borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginBottom: 8 },
    btnPrimary: { backgroundColor: colors.purple },
    btnGhost: { backgroundColor: '#7c3aed22', borderWidth: 1, borderColor: '#7c3aed55' },
    btnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
    hidden: { position: 'absolute', width: 1, height: 1, opacity: 0, left: -20, top: -20 },
});
