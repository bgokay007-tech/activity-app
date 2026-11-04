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

/**
 * Tam 9:16 opak kart.
 * TOP_SAFE (~280px): IG kullanıcı adı / müzik / X ile çakışmasın diye boş.
 * Çift isimleri " & " ile alt satıra kırılır.
 */
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
      var TOP=300; // IG chrome altı — marka/rozet buradan başlar
      ctx.fillStyle='#0B0C10';
      ctx.fillRect(0,0,W,H);
      var g=ctx.createRadialGradient(540,TOP+200,40,540,TOP+200,520);
      g.addColorStop(0,'rgba(200,245,74,0.14)');
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
      // Çift/uzun isim: " & " ile satır kır; yoksa kelime kaydır
      function nameLines(label, maxW, size){
        ctx.font='900 '+size+'px sans-serif';
        var raw=String(label||'');
        if(raw.indexOf(' & ')>=0){
          return raw.split(' & ').map(function(p,i,a){ return i<a.length-1 ? p+' &' : p; });
        }
        if(ctx.measureText(raw).width<=maxW) return [raw];
        var words=raw.split(/\\s+/), lines=[], cur='';
        words.forEach(function(w){
          var t=cur ? cur+' '+w : w;
          if(ctx.measureText(t).width<=maxW) cur=t;
          else { if(cur) lines.push(cur); cur=w; }
        });
        if(cur) lines.push(cur);
        return lines.length?lines:[raw];
      }

      var brand=${JSON.stringify(brand)};
      var cols=${JSON.stringify(colorsArr)};
      ctx.font='900 58px sans-serif';
      ctx.textAlign='left';
      var totalW=0;
      for(var i=0;i<brand.length;i++) totalW+=ctx.measureText(brand[i]).width+3;
      var bx=(W-totalW)/2;
      for(var i=0;i<brand.length;i++){
        ctx.fillStyle=cols[i%cols.length];
        ctx.fillText(brand[i], bx, TOP);
        bx+=ctx.measureText(brand[i]).width+3;
      }

      // Rozet — markanın sağında değil, altında ortada (IG sağ ikonlarla çakışmasın)
      var badge=${JSON.stringify(p.resultBadge||'MATCH RESULT')};
      ctx.font='900 22px sans-serif';
      var bw=Math.max(260, ctx.measureText(badge).width+48);
      roundRect((W-bw)/2, TOP+28, bw, 48, 24);
      ctx.fillStyle='#C8F54A'; ctx.fill();
      text(badge, W/2, TOP+60, 22, '#0B0C10', 'center', '900');

      text(${JSON.stringify((p.emoji||'')+' '+(p.sport||''))}, 540, TOP+120, 32, '#C8F54A', 'center', '800');

      // Kazanan: isim satırları + KAZANDI
      var name=${JSON.stringify(p.resultLabel||'')};
      var won=${JSON.stringify(p.wonWord||'WON')};
      var nLines=nameLines(name, 900, 44);
      var ny=TOP+190;
      nLines.forEach(function(ln){ text(ln, 540, ny, 44, '#F4F1EA', 'center', '900'); ny+=52; });
      text(won, 540, ny+8, 44, '#C8F54A', 'center', '900');
      ny+=70;

      var panelTop=ny;
      var pairs=${JSON.stringify(setPairs)};
      var leftLabel=${JSON.stringify(p.leftLabel||'')};
      var rightLabel=${JSON.stringify(p.rightLabel||'')};
      var leftElo=${JSON.stringify(p.leftElo||'')};
      var rightElo=${JSON.stringify(p.rightElo||'')};
      var leftWrap=nameLines(leftLabel, 420, 32);
      var rightWrap=nameLines(rightLabel, 420, 32);
      var rowH=Math.max(110, 36+leftWrap.length*36+ (leftElo?34:0));
      var rowH2=Math.max(110, 36+rightWrap.length*36+ (rightElo?34:0));
      var panelH=80+rowH+rowH2+100;

      roundRect(72, panelTop, W-144, panelH, 28);
      ctx.fillStyle='#16181F'; ctx.fill();
      ctx.strokeStyle='#2A2D36'; ctx.lineWidth=3; ctx.stroke();

      text(${JSON.stringify(p.colPlayer||'PLAYER')}, 200, panelTop+40, 22, '#78716C', 'left', '800');
      var setXs=[];
      for(var s=0;s<Math.max(pairs.length,1);s++){
        var sx=640+s*130;
        setXs.push(sx);
        text('SET '+(s+1), sx, panelTop+40, 22, '#78716C', 'center', '800');
      }

      function drawPlayerRow(y, lines, elo, scores, highlight, h){
        if(highlight){
          roundRect(96, y-40, W-192, h, 18);
          ctx.fillStyle='#1C1F28'; ctx.fill();
        }
        var ty=y;
        lines.forEach(function(ln){ text(ln, 200, ty, 32, '#F4F1EA', 'left', '900'); ty+=36; });
        if(elo) text(elo, 200, ty+4, 26, '#C8F54A', 'left', '800');
        var midY=y+Math.min(20, (h/2)-10);
        for(var i=0;i<scores.length;i++){
          text(String(scores[i]), setXs[i]||(640+i*130), midY, 42, '#F4F1EA', 'center', '900');
        }
      }

      var L=pairs.map(function(p){return p[0];});
      var R=pairs.map(function(p){return p[1];});
      var y1=panelTop+100;
      drawPlayerRow(y1, leftWrap, leftElo, L, ${p.winnerSide==='left'}, rowH);
      var y2=y1+rowH+16;
      drawPlayerRow(y2, rightWrap, rightElo, R, ${p.winnerSide==='right'}, rowH2);

      var scoreY=panelTop+panelH+70;
      text(${JSON.stringify(String(p.leftSets)+' – '+String(p.rightSets))}, 540, scoreY, 64, '#C8F54A', 'center', '900');

      var dy=scoreY+70;
      var details=${JSON.stringify(details)};
      details.forEach(function(d){
        text(d, 540, dy, 34, '#A8A29A', 'center', '700');
        dy+=52;
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
                // Modal'ı önce kapat — Status intent / izin diyalogu arkada kalmasın
                onClose?.();
                await new Promise((r) => setTimeout(r, 350));
                await shareToWhatsAppStatus({ filePath: path, message: '', t });
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
