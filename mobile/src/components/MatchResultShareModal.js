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
import { shareBackgroundToDataUrl } from '../utils/matchShareBackground';
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
 * 9:16 skor kartı — spor/zemin arka planı + yarı saydam koyu overlay,
 * skor tablosu + canlı takip istatistikleri + saat/sağlık workout paneli.
 * IG üst chrome için TOP boşluk.
 */
function cardHtml(p, bgDataUrl) {
    const brand = p.brand || 'AcTiViTy';
    const colorsArr = p.brandColors || BRAND_LETTER_COLORS;
    const setPairs = (p.lines || []).map((line) => {
        const m = String(line).match(/(\d+)\s*[-–]\s*(\d+)/);
        return m ? [m[1], m[2]] : ['', ''];
    });
    const stats = p.shareStats || null;
    return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<meta name="viewport" content="width=${W}, initial-scale=1"/>
</head><body style="margin:0;background:#0B0C10">
<canvas id="c" width="${W}" height="${H}"></canvas>
<script>
(function(){
  function go(bgImg){
    try{
      var canvas=document.getElementById('c');
      var ctx=canvas.getContext('2d');
      var W=${W}, H=${H}, TOP=220;

      // Spor-yüzey arka plan (toprak/sert/salon/plaj/padel…) — yarı saydam overlay ile okunur
      if(bgImg){
        var s=Math.max(W/bgImg.width, H/bgImg.height);
        var dw=bgImg.width*s, dh=bgImg.height*s;
        ctx.drawImage(bgImg, (W-dw)/2, (H-dh)/2, dw, dh);
      } else {
        ctx.fillStyle='#0B0C10'; ctx.fillRect(0,0,W,H);
      }
      ctx.fillStyle='rgba(8,10,14,0.72)';
      ctx.fillRect(0,0,W,H);
      var vg=ctx.createLinearGradient(0,0,0,H);
      vg.addColorStop(0,'rgba(8,10,14,0.55)');
      vg.addColorStop(0.35,'rgba(8,10,14,0.35)');
      vg.addColorStop(1,'rgba(8,10,14,0.82)');
      ctx.fillStyle=vg; ctx.fillRect(0,0,W,H);

      function text(str,x,y,size,color,align,weight){
        ctx.fillStyle=color||'#F4F1EA';
        ctx.font=(weight||'900')+' '+size+'px sans-serif';
        ctx.textAlign=align||'center';
        ctx.textBaseline='alphabetic';
        ctx.fillText(String(str||''),x,y);
      }
      function roundRect(x,y,w,h,r){
        ctx.beginPath();
        ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r);
        ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath();
      }
      function panel(x,y,w,h){
        roundRect(x,y,w,h,22);
        ctx.fillStyle='rgba(22,24,31,0.78)'; ctx.fill();
        ctx.strokeStyle='rgba(255,255,255,0.12)'; ctx.lineWidth=2; ctx.stroke();
      }
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
      function wrap(str,maxW,size){
        ctx.font='700 '+size+'px sans-serif';
        var words=String(str||'').split(/\\s+/), lines=[], cur='';
        words.forEach(function(w){
          var t=cur?cur+' '+w:w;
          if(ctx.measureText(t).width<=maxW) cur=t;
          else { if(cur) lines.push(cur); cur=w; }
        });
        if(cur) lines.push(cur);
        return lines.length?lines:[String(str||'')];
      }

      var brand=${JSON.stringify(brand)};
      var cols=${JSON.stringify(colorsArr)};
      ctx.font='900 52px sans-serif'; ctx.textAlign='left';
      var totalW=0;
      for(var i=0;i<brand.length;i++) totalW+=ctx.measureText(brand[i]).width+2;
      var bx=(W-totalW)/2;
      for(var i=0;i<brand.length;i++){
        ctx.fillStyle=cols[i%cols.length];
        ctx.fillText(brand[i], bx, TOP);
        bx+=ctx.measureText(brand[i]).width+2;
      }

      var badge=${JSON.stringify(p.resultBadge||'MATCH RESULT')};
      ctx.font='900 20px sans-serif';
      var bw=Math.max(240, ctx.measureText(badge).width+44);
      roundRect((W-bw)/2, TOP+18, bw, 42, 21);
      ctx.fillStyle='#C8F54A'; ctx.fill();
      text(badge, W/2, TOP+46, 20, '#0B0C10', 'center', '900');

      text(${JSON.stringify((p.emoji||'')+' '+(p.sport||''))}, 540, TOP+100, 28, '#C8F54A', 'center', '800');
      var formatLine=${JSON.stringify(p.formatLine||'')};
      if(formatLine) text(formatLine, 540, TOP+138, 24, '#A8A29A', 'center', '700');

      var name=${JSON.stringify(p.resultLabel||'')};
      var won=${JSON.stringify(p.wonWord||'WON')};
      var nLines=nameLines(name, 900, 40);
      var ny=TOP+(formatLine?170:150);
      nLines.forEach(function(ln){ text(ln, 540, ny, 40, '#F4F1EA', 'center', '900'); ny+=46; });
      text(won, 540, ny+4, 36, '#C8F54A', 'center', '900');
      ny+=54;

      // Skor tablosu
      var pairs=${JSON.stringify(setPairs)};
      var leftLabel=${JSON.stringify(p.leftLabel||'')};
      var rightLabel=${JSON.stringify(p.rightLabel||'')};
      var leftElo=${JSON.stringify(p.leftElo||'')};
      var rightElo=${JSON.stringify(p.rightElo||'')};
      var leftWrap=nameLines(leftLabel, 380, 28);
      var rightWrap=nameLines(rightLabel, 380, 28);
      var rowH=Math.max(88, 28+leftWrap.length*32+(leftElo?28:0));
      var rowH2=Math.max(88, 28+rightWrap.length*32+(rightElo?28:0));
      var panelH=64+rowH+rowH2+70;
      panel(56, ny, W-112, panelH);

      text(${JSON.stringify(p.colPlayer||'PLAYER')}, 180, ny+36, 18, '#78716C', 'left', '800');
      var setXs=[];
      for(var s=0;s<Math.max(pairs.length,1);s++){
        var sx=560+s*110;
        setXs.push(sx);
        text('S'+(s+1), sx, ny+36, 18, '#78716C', 'center', '800');
      }
      text(${JSON.stringify(p.colSets||'SETS')}, 920, ny+36, 18, '#78716C', 'center', '800');
      if(${JSON.stringify(p.leftGames != null)}) {
        text(${JSON.stringify(p.colGames||'GAMES')}, 1010, ny+36, 16, '#78716C', 'center', '800');
      }

      function drawPlayerRow(y, lines, elo, scores, setsWon, gamesWon, highlight, h){
        if(highlight){
          roundRect(72, y-32, W-144, h, 16);
          ctx.fillStyle='rgba(200,245,74,0.12)'; ctx.fill();
        }
        var ty=y;
        lines.forEach(function(ln){ text(ln, 180, ty, 28, '#F4F1EA', 'left', '900'); ty+=32; });
        if(elo) text(elo, 180, ty+2, 22, '#C8F54A', 'left', '800');
        var midY=y+Math.min(16, (h/2)-8);
        for(var i=0;i<scores.length;i++){
          text(String(scores[i]), setXs[i]||(560+i*110), midY, 34, '#F4F1EA', 'center', '900');
        }
        text(String(setsWon), 920, midY, 34, '#C8F54A', 'center', '900');
        if(gamesWon!=null) text(String(gamesWon), 1010, midY, 26, '#A8A29A', 'center', '800');
      }

      var L=pairs.map(function(p){return p[0];});
      var R=pairs.map(function(p){return p[1];});
      var y1=ny+78;
      drawPlayerRow(y1, leftWrap, leftElo, L, ${JSON.stringify(p.leftSets)}, ${JSON.stringify(p.leftGames)}, ${p.winnerSide==='left'}, rowH);
      var y2=y1+rowH+10;
      drawPlayerRow(y2, rightWrap, rightElo, R, ${JSON.stringify(p.rightSets)}, ${JSON.stringify(p.rightGames)}, ${p.winnerSide==='right'}, rowH2);

      ny = ny + panelH + 28;

      // Meta: tarih / süre / zemin / yer
      var metaBits=[];
      if(${JSON.stringify(!!p.dateStr)}) metaBits.push(${JSON.stringify('📅 '+(p.dateStr||''))});
      if(${JSON.stringify(!!p.durationLabel)}) metaBits.push(${JSON.stringify('⏱ '+(p.durationLabel||''))});
      if(${JSON.stringify(!!p.surface)}) metaBits.push(${JSON.stringify('🏟 '+(p.surface||''))});
      if(${JSON.stringify(!!p.place)}) metaBits.push(${JSON.stringify('📍 '+(p.place||''))});
      if(metaBits.length){
        panel(56, ny, W-112, 56 + Math.ceil(metaBits.length/2)*40);
        var mx=80, my=ny+40;
        metaBits.forEach(function(m,idx){
          text(m, mx, my, 24, '#E7E5E4', 'left', '700');
          if(idx%2===1){ mx=80; my+=40; } else { mx=560; }
        });
        ny += 56 + Math.ceil(metaBits.length/2)*40 + 20;
      }

      // İstatistik panelleri (2 sütun)
      var panels=${JSON.stringify((stats && stats.panels) || [])};
      var maxPanels = panels.length > 4 ? 4 : panels.length;
      var colW = (W-112-20)/2;
      var px = 56, py = ny;
      var rowMaxH = 0;
      for(var pi=0; pi<maxPanels; pi++){
        var pn=panels[pi];
        var tiles=pn.tiles||[];
        var th = 48 + tiles.length*46 + 16;
        if(pi%2===0){ px=56; if(pi>0) py += rowMaxH + 16; rowMaxH=0; }
        else { px=56+colW+20; }
        panel(px, py, colW, th);
        text(pn.title||'', px+20, py+34, 22, pn.accent||'#C8F54A', 'left', '900');
        var ty2=py+70;
        tiles.forEach(function(tile){
          text(tile.label||'', px+20, ty2, 18, '#A8A29A', 'left', '700');
          text(tile.value||'', px+colW-20, ty2, 24, '#F4F1EA', 'right', '900');
          ty2+=46;
        });
        rowMaxH=Math.max(rowMaxH, th);
      }
      if(maxPanels>0) ny = py + rowMaxH + 24;

      // Highlights
      var highs=${JSON.stringify((stats && stats.highlights) || [])};
      if(highs.length){
        var hx=56;
        highs.forEach(function(h){
          ctx.font='800 20px sans-serif';
          var tw=ctx.measureText(h).width+36;
          roundRect(hx, ny, tw, 40, 20);
          ctx.fillStyle='rgba(200,245,74,0.18)'; ctx.fill();
          ctx.strokeStyle='rgba(200,245,74,0.45)'; ctx.lineWidth=2; ctx.stroke();
          text(h, hx+tw/2, ny+27, 20, '#C8F54A', 'center', '800');
          hx+=tw+12;
        });
        ny+=56;
      }

      var src=${JSON.stringify((stats && stats.workoutSource) || '')};
      if(src) text(src, 540, 1688, 20, '#A8A29A', 'center', '700');

      roundRect(200, 1720, 680, 88, 44);
      ctx.fillStyle='#C8F54A'; ctx.fill();
      text(${JSON.stringify(p.ctaLabel||'AcTiViTy · Download')}, 540, 1778, 28, '#0B0C10', 'center', '900');

      if(window.ReactNativeWebView) window.ReactNativeWebView.postMessage(canvas.toDataURL('image/png'));
    }catch(e){
      if(window.ReactNativeWebView) window.ReactNativeWebView.postMessage('ERR:'+String(e&&e.message||e));
    }
  }

  var bgData=${JSON.stringify(bgDataUrl||'')};
  if(bgData){
    var img=new Image();
    img.onload=function(){ go(img); };
    img.onerror=function(){ go(null); };
    img.src=bgData;
  } else {
    setTimeout(function(){ go(null); }, 60);
  }
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
            colSets: t.shareMatchColSets || 'SETS',
            colGames: t.shareMatchColGames || 'GAMES',
        };
    }, [visible, match, t, lang]);
    const [busy, setBusy] = useState(false);
    const [needCapture, setNeedCapture] = useState(false);
    const [captureHtml, setCaptureHtml] = useState(null);
    const pendingAction = useRef(null);
    const bgDataRef = useRef(null);

    useEffect(() => {
        if (!visible) {
            setNeedCapture(false);
            setCaptureHtml(null);
            setBusy(false);
            pendingAction.current = null;
            bgDataRef.current = null;
        }
    }, [visible]);

    // Zemin/spor arka planını önceden yükle
    useEffect(() => {
        if (!visible || !payload) {
            bgDataRef.current = null;
            return undefined;
        }
        let cancelled = false;
        (async () => {
            const data = await shareBackgroundToDataUrl(payload.subCategory, payload.surfaceRaw);
            if (!cancelled) bgDataRef.current = data;
        })();
        return () => { cancelled = true; };
    }, [visible, payload?.id, payload?.subCategory, payload?.surfaceRaw]);

    const onPng = async (dataUrl) => {
        setNeedCapture(false);
        setCaptureHtml(null);
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
                onClose?.();
                await new Promise((r) => setTimeout(r, 350));
                await shareToWhatsAppStatus({ filePath: path, message: '', t });
                return;
            }
            if (action === 'ig_story') {
                onClose?.();
                await new Promise((r) => setTimeout(r, 350));
                await shareToInstagramStory({
                    filePath: path,
                    t,
                    linkUrl: payload.url || PLAY_STORE_URL,
                });
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

    const start = async (action) => {
        if (!payload || busy) return;
        pendingAction.current = action;
        setBusy(true);
        try {
            if (!bgDataRef.current) {
                bgDataRef.current = await shareBackgroundToDataUrl(payload.subCategory, payload.surfaceRaw);
            }
            setCaptureHtml(cardHtml(payload, bgDataRef.current));
            setNeedCapture(true);
        } catch {
            setBusy(false);
            Alert.alert(t.error, t.shareMatchFail);
        }
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

    const previewStats = payload.shareStats;

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
                        <Text style={s.sport}>{payload.emoji} {payload.sport}{payload.surface ? ` · ${payload.surface}` : ''}</Text>
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
                        {!!payload.durationLabel && (
                            <Text style={s.metaLine}>⏱ {payload.durationLabel}</Text>
                        )}
                        {previewStats?.hasWorkout && (
                            <Text style={s.metaLine}>♥ {t.statWorkout}{previewStats.workoutSource ? ` · ${previewStats.workoutSource}` : ''}</Text>
                        )}
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
            {needCapture && captureHtml && (
                <View style={s.hidden} pointerEvents="none">
                    <WebView
                        originWhitelist={['*']}
                        source={{ html: captureHtml }}
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
    metaLine: { color: '#A8A29A', fontSize: 11, fontWeight: '700', textAlign: 'center', marginTop: 8 },
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
