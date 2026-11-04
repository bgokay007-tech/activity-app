import { useEffect, useMemo, useRef, useState } from 'react';
import {
    Modal, View, Text, TouchableOpacity, StyleSheet, ActivityIndicator,
    Alert, ScrollView,
} from 'react-native';
import { WebView } from 'react-native-webview';
import * as FileSystem from 'expo-file-system/legacy';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import useT from '../hooks/useT';
import { useSelector } from 'react-redux';
import colors from '../theme/colors';
import { buildMatchSharePayload, matchShareMessage, BRAND_LETTER_COLORS } from '../utils/matchShareCard';
import {
    shareToWhatsApp,
    shareToWhatsAppStatus,
    shareToInstagramStory,
    shareViaSystemSheet,
    ensureGallerySave,
    PLAY_STORE_URL,
} from '../utils/directShare';

const W = 1080;
const H = 1920;

/** Tam 9:16 opak kart — şeffaf çerçeve yok (IG Hikâye'de cam kutu gibi duruyordu). */
function cardHtml(p) {
    const brand = p.brand || 'AcTiViTy';
    const colorsArr = p.brandColors || BRAND_LETTER_COLORS;
    const setPairs = (p.lines || []).map((line) => {
        const m = String(line).match(/(\d+)\s*[-–]\s*(\d+)/);
        return m ? [m[1], m[2]] : ['', ''];
    });
    const details = [
        p.place ? `📍 ${p.place}` : '',
        p.dateStr ? `📅 ${p.dateStr}` : '',
        `${p.emoji || ''} ${p.sport || ''}`.trim(),
    ].filter(Boolean);
    return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<meta name="viewport" content="width=${W}, initial-scale=1"/>
</head><body style="margin:0;background:#0B0C10">
<canvas id="c" width="${W}" height="${H}"></canvas>
<script>
(function(){
  function go(){
    try{
      var canvas=document.getElementById('c');
      var ctx=canvas.getContext('2d');
      var W=${W}, H=${H};
      ctx.fillStyle='#0B0C10';
      ctx.fillRect(0,0,W,H);
      var g=ctx.createRadialGradient(540,420,40,540,420,520);
      g.addColorStop(0,'rgba(200,245,74,0.16)');
      g.addColorStop(1,'rgba(11,12,16,0)');
      ctx.fillStyle=g; ctx.fillRect(0,0,W,H);

      function text(str,x,y,size,color,align,weight){
        ctx.fillStyle=color||'#F4F1EA';
        ctx.font=(weight||'900')+' '+size+'px sans-serif';
        ctx.textAlign=align||'center';
        ctx.textBaseline='alphabetic';
        ctx.fillText(str,x,y);
      }
      function roundRect(x,y,w,h,r){
        ctx.beginPath();
        ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r);
        ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath();
      }

      var brand=${JSON.stringify(brand)};
      var cols=${JSON.stringify(colorsArr)};
      ctx.font='900 64px sans-serif';
      ctx.textAlign='left';
      var totalW=0;
      for(var i=0;i<brand.length;i++) totalW+=ctx.measureText(brand[i]).width+4;
      var bx=(W-totalW)/2;
      for(var i=0;i<brand.length;i++){
        ctx.fillStyle=cols[i%cols.length];
        ctx.fillText(brand[i], bx, 150);
        bx+=ctx.measureText(brand[i]).width+4;
      }

      roundRect(720, 100, 280, 52, 26);
      ctx.fillStyle='#C8F54A'; ctx.fill();
      text(${JSON.stringify(p.resultBadge||'MATCH RESULT')}, 860, 136, 22, '#0B0C10', 'center', '900');

      text(${JSON.stringify((p.emoji||'')+' '+(p.sport||''))}, 540, 230, 34, '#C8F54A', 'center', '800');

      var name=${JSON.stringify(p.resultLabel||'')};
      var won=${JSON.stringify(p.wonWord||'WON')};
      ctx.font='900 48px sans-serif';
      ctx.textAlign='left';
      var nw=ctx.measureText(name+' ').width;
      var ww=ctx.measureText(won).width;
      var start=(W-nw-ww)/2;
      ctx.fillStyle='#F4F1EA'; ctx.fillText(name+' ', start, 340);
      ctx.fillStyle='#C8F54A'; ctx.fillText(won, start+nw, 340);

      // Opak panel — stroke solid, alpha yok
      roundRect(72, 400, W-144, 640, 28);
      ctx.fillStyle='#16181F'; ctx.fill();
      ctx.strokeStyle='#2A2D36'; ctx.lineWidth=3; ctx.stroke();

      text(${JSON.stringify(p.colPlayer||'PLAYER')}, 200, 460, 22, '#78716C', 'left', '800');
      var pairs=${JSON.stringify(setPairs)};
      var setXs=[];
      for(var s=0;s<Math.max(pairs.length,1);s++){
        var sx=640+s*130;
        setXs.push(sx);
        text('SET '+(s+1), sx, 460, 22, '#78716C', 'center', '800');
      }

      function drawPlayerRow(y, label, elo, scores, highlight){
        if(highlight){
          roundRect(96, y-52, W-192, 120, 18);
          ctx.fillStyle='#1C1F28'; ctx.fill();
        }
        text(label, 200, y, 36, '#F4F1EA', 'left', '900');
        if(elo) text(elo, 200, y+42, 28, '#C8F54A', 'left', '800');
        for(var i=0;i<scores.length;i++){
          text(String(scores[i]), setXs[i]||(640+i*130), y+12, 44, '#F4F1EA', 'center', '900');
        }
      }

      var L=pairs.map(function(p){return p[0];});
      var R=pairs.map(function(p){return p[1];});
      drawPlayerRow(560, ${JSON.stringify(p.leftLabel||'')}, ${JSON.stringify(p.leftElo||'')}, L, ${p.winnerSide==='left'});
      drawPlayerRow(720, ${JSON.stringify(p.rightLabel||'')}, ${JSON.stringify(p.rightElo||'')}, R, ${p.winnerSide==='right'});

      text(${JSON.stringify(String(p.leftSets)+' – '+String(p.rightSets))}, 540, 920, 68, '#C8F54A', 'center', '900');

      var dy=1080;
      var details=${JSON.stringify(details)};
      details.forEach(function(d){
        text(d, 540, dy, 36, '#A8A29A', 'center', '700');
        dy+=56;
      });

      roundRect(200, 1720, 680, 88, 44);
      ctx.fillStyle='#C8F54A'; ctx.fill();
      text(${JSON.stringify(p.ctaLabel||'AcTiViTy · Uygulamayı indir')}, 540, 1778, 30, '#0B0C10', 'center', '900');

      if(window.ReactNativeWebView) window.ReactNativeWebView.postMessage(canvas.toDataURL('image/png'));
    }catch(e){
      if(window.ReactNativeWebView) window.ReactNativeWebView.postMessage('ERR:'+String(e&&e.message||e));
    }
  }
  setTimeout(go,60);
})();
</script></body></html>`;
}

export default function MatchResultShareModal({ visible, match, onClose }) {
    const t = useT();
    const lang = useSelector(s => s.lang?.lang) || 'tr';
    const insets = useSafeAreaInsets();
    const payload = useMemo(() => {
        if (!visible || !match) return null;
        const base = buildMatchSharePayload(match, t, lang);
        if (!base) return null;
        return {
            ...base,
            ctaLabel: t.shareMatchStoreCta || 'AcTiViTy · Uygulamayı indir',
            wonWord: t.shareMatchWonWord || (lang === 'tr' ? 'KAZANDI' : lang === 'ru' ? 'ПОБЕДИЛ' : lang === 'de' ? 'GEWINNT' : 'WON'),
            resultBadge: t.shareMatchResultBadge || (lang === 'tr' ? 'MAÇ SONUCU' : lang === 'ru' ? 'РЕЗУЛЬТАТ' : lang === 'de' ? 'ERGEBNIS' : 'MATCH RESULT'),
            colPlayer: t.shareMatchColPlayer || (lang === 'tr' ? 'OYUNCU' : lang === 'ru' ? 'ИГРОК' : lang === 'de' ? 'SPIELER' : 'PLAYER'),
        };
    }, [visible, match, t, lang]);
    const [busy, setBusy] = useState(false);
    const [needCapture, setNeedCapture] = useState(false);
    const pendingAction = useRef(null);

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
        const action = pendingAction.current;
        pendingAction.current = null;
        try {
            const b64 = dataUrl.replace(/^data:image\/png;base64,/, '');
            const path = `${FileSystem.cacheDirectory}activity-match-${payload.id}.png`;
            await FileSystem.writeAsStringAsync(path, b64, { encoding: FileSystem.EncodingType.Base64 });
            const message = matchShareMessage(payload, t);

            if (action === 'save') {
                const ok = await ensureGallerySave(path);
                if (!ok) Alert.alert(t.error, t.shareMatchGalleryDenied);
                else Alert.alert('', t.shareMatchSaved);
                return;
            }
            if (action === 'whatsapp') {
                await shareToWhatsApp({ filePath: path, message });
                onClose?.();
                return;
            }
            if (action === 'wa_status') {
                // Durum = sadece görsel (metin WA'yı yazı durumuna düşürüyordu)
                await shareToWhatsAppStatus({ filePath: path, message: '', t });
                onClose?.();
                return;
            }
            if (action === 'ig_story') {
                await shareToInstagramStory({
                    filePath: path,
                    t,
                    linkUrl: payload.url || PLAY_STORE_URL,
                });
                onClose?.();
                return;
            }
            await shareViaSystemSheet({ filePath: path, message });
            onClose?.();
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

    const targets = [
        { id: 'whatsapp', emoji: '💬', label: 'WhatsApp' },
        { id: 'wa_status', emoji: '🟢', label: t.shareMatchWaStatus || 'WhatsApp Status' },
        { id: 'ig_story', emoji: '📱', label: t.shareMatchIgStory || 'Instagram Story' },
        { id: 'save', emoji: '📥', label: t.shareMatchSaveBtn || 'Save to gallery' },
        { id: 'more', emoji: '⋯', label: t.shareMatchMore || 'More apps' },
    ];

    if (!payload) {
        return (
            <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
                <View style={s.overlay} />
            </Modal>
        );
    }

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <View style={[s.overlay, { paddingBottom: Math.max(insets.bottom, 10) }]}>
                <TouchableOpacity style={s.backdropTap} activeOpacity={1} onPress={onClose} />
                <View style={s.sheet}>
                    <View style={s.handle} />
                    <View style={s.header}>
                        <Text style={s.title}>{t.shareMatchTitle}</Text>
                        <TouchableOpacity onPress={onClose} hitSlop={12}><Text style={s.close}>✕</Text></TouchableOpacity>
                    </View>

                    <View style={s.preview}>
                        <View style={s.brandRow}>
                            {(payload.brand || 'AcTiViTy').split('').map((ch, i) => (
                                <Text key={i} style={{ color: BRAND_LETTER_COLORS[i % BRAND_LETTER_COLORS.length], fontWeight: '900', fontSize: 16 }}>
                                    {ch}
                                </Text>
                            ))}
                        </View>
                        <Text style={s.sport}>{payload.emoji} {payload.sport}</Text>
                        <Text style={s.winnerLine} numberOfLines={1}>
                            <Text style={{ color: '#F4F1EA' }}>{payload.resultLabel} </Text>
                            <Text style={{ color: '#C8F54A' }}>{payload.wonWord}</Text>
                        </Text>
                        <View style={s.vsRow}>
                            <View style={{ flex: 1 }}>
                                <Text style={s.side} numberOfLines={1}>{payload.leftLabel}</Text>
                                {!!payload.leftElo && <Text style={s.elo}>{payload.leftElo}</Text>}
                            </View>
                            <Text style={s.score}>{payload.leftSets}–{payload.rightSets}</Text>
                            <View style={{ flex: 1 }}>
                                <Text style={s.side} numberOfLines={1}>{payload.rightLabel}</Text>
                                {!!payload.rightElo && <Text style={s.elo}>{payload.rightElo}</Text>}
                            </View>
                        </View>
                    </View>

                    {busy ? (
                        <ActivityIndicator color="#C8F54A" style={{ marginVertical: 28 }} />
                    ) : (
                        <ScrollView
                            style={s.list}
                            contentContainerStyle={{ paddingBottom: 8 }}
                            showsVerticalScrollIndicator
                            bounces={false}
                            keyboardShouldPersistTaps="handled"
                        >
                            {targets.map((it) => (
                                <TouchableOpacity
                                    key={it.id}
                                    style={s.row}
                                    activeOpacity={0.75}
                                    onPress={() => start(it.id)}
                                >
                                    <Text style={s.emoji}>{it.emoji}</Text>
                                    <Text style={s.rowLabel}>{it.label}</Text>
                                    <Text style={s.chev}>›</Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    )}
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
    backdropTap: { flex: 1 },
    sheet: {
        backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
        paddingHorizontal: 16, paddingTop: 8, paddingBottom: 10, maxHeight: '78%',
    },
    handle: {
        alignSelf: 'center', width: 40, height: 4, borderRadius: 2,
        backgroundColor: '#ffffff33', marginBottom: 10,
    },
    header: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
    title: { color: '#fff', fontSize: 17, fontWeight: '900', flex: 1 },
    close: { color: colors.textMuted, fontSize: 22 },
    preview: {
        borderRadius: 14, overflow: 'hidden', marginBottom: 12, paddingVertical: 12, paddingHorizontal: 14,
        backgroundColor: '#0B0C10', borderWidth: 1, borderColor: '#2A2D36',
    },
    brandRow: { flexDirection: 'row', justifyContent: 'center', marginBottom: 4 },
    sport: { color: '#C8F54A', fontSize: 12, fontWeight: '800', textAlign: 'center', marginBottom: 6 },
    winnerLine: { textAlign: 'center', fontSize: 15, fontWeight: '900', marginBottom: 10 },
    vsRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    side: { color: '#F4F1EA', fontSize: 12, fontWeight: '800', textAlign: 'center' },
    elo: { color: '#C8F54A', fontSize: 11, fontWeight: '700', textAlign: 'center', marginTop: 2 },
    score: { color: '#C8F54A', fontSize: 22, fontWeight: '900', minWidth: 56, textAlign: 'center' },
    list: { flexGrow: 0 },
    row: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        backgroundColor: colors.surface2 || '#222',
        borderRadius: 14, paddingVertical: 14, paddingHorizontal: 14,
        marginBottom: 8, borderWidth: 1, borderColor: colors.border || '#333',
    },
    emoji: { fontSize: 22, width: 28, textAlign: 'center' },
    rowLabel: { color: '#fff', fontSize: 15, fontWeight: '700', flex: 1 },
    chev: { color: colors.textMuted, fontSize: 22, fontWeight: '600' },
    hidden: { position: 'absolute', width: 1, height: 1, opacity: 0, left: -20, top: -20 },
});
