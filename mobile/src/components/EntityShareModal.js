import { useEffect, useMemo, useRef, useState } from 'react';
import {
    Modal, View, Text, TouchableOpacity, StyleSheet, ActivityIndicator,
    Alert, ScrollView,     Linking, Share, Clipboard,
} from 'react-native';
import { WebView } from 'react-native-webview';
import * as FileSystem from 'expo-file-system/legacy';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSelector } from 'react-redux';
import useT from '../hooks/useT';
import colors from '../theme/colors';
import { buildEntitySharePayload, BRAND_LETTER_COLORS } from '../utils/entityShareCard';
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

/** Kapak URL → data URL (CORS’suz canvas; Cloudinary fotoğrafı karta gömülsün). */
async function coverToDataUrl(remoteUrl) {
    if (!remoteUrl || typeof remoteUrl !== 'string') return null;
    if (remoteUrl.startsWith('data:')) return remoteUrl;
    try {
        const dest = `${FileSystem.cacheDirectory}entity-share-cover-${Date.now()}.img`;
        const dl = await FileSystem.downloadAsync(remoteUrl, dest);
        if (!dl?.uri || (dl.status != null && dl.status !== 200)) return null;
        const b64 = await FileSystem.readAsStringAsync(dl.uri, {
            encoding: FileSystem.EncodingType.Base64,
        });
        const mime = remoteUrl.includes('.png') || remoteUrl.includes('image/png')
            ? 'image/png'
            : 'image/jpeg';
        return `data:${mime};base64,${b64}`;
    } catch {
        return null;
    }
}

/**
 * 9:16 hikâye kartı — spor/zemin arka planı (toprak/sert/salon/plaj/padel) +
 * yarı saydam overlay; marka ve başlık büyük.
 */
function cardHtml(p, coverDataUrl, bgDataUrl) {
    const brand = p.brand || 'AcTiViTy';
    const colorsArr = p.brandColors || BRAND_LETTER_COLORS;
    return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<meta name="viewport" content="width=${W}, initial-scale=1"/>
</head><body style="margin:0;background:#0B0C10">
<canvas id="c" width="${W}" height="${H}"></canvas>
<script>
(function(){
  function paint(coverImg, bgImg){
    try{
      var canvas=document.getElementById('c');
      var ctx=canvas.getContext('2d');
      var W=${W}, H=${H}, TOP=240;

      if(bgImg){
        var bs=Math.max(W/bgImg.width, H/bgImg.height);
        var bdw=bgImg.width*bs, bdh=bgImg.height*bs;
        ctx.drawImage(bgImg, (W-bdw)/2, (H-bdh)/2, bdw, bdh);
      } else {
        ctx.fillStyle='#0B0C10'; ctx.fillRect(0,0,W,H);
      }
      ctx.fillStyle='rgba(8,10,14,0.72)';
      ctx.fillRect(0,0,W,H);
      var vg=ctx.createLinearGradient(0,0,0,H);
      vg.addColorStop(0,'rgba(8,10,14,0.55)');
      vg.addColorStop(0.4,'rgba(8,10,14,0.35)');
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
      function wrap(str,maxW,size){
        ctx.font='800 '+size+'px sans-serif';
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
      ctx.font='900 72px sans-serif'; ctx.textAlign='left';
      var totalW=0;
      for(var i=0;i<brand.length;i++) totalW+=ctx.measureText(brand[i]).width+4;
      var bx=(W-totalW)/2;
      for(var i=0;i<brand.length;i++){
        ctx.fillStyle=cols[i%cols.length];
        ctx.fillText(brand[i], bx, TOP);
        bx+=ctx.measureText(brand[i]).width+4;
      }

      var badge=${JSON.stringify(p.badge||'')};
      ctx.font='900 26px sans-serif';
      var bw=Math.max(280, ctx.measureText(badge).width+56);
      roundRect((W-bw)/2, TOP+26, bw, 54, 27);
      ctx.fillStyle='#C8F54A'; ctx.fill();
      text(badge, W/2, TOP+62, 26, '#0B0C10', 'center', '900');

      text(${JSON.stringify(p.sport||'')}, 540, TOP+128, 36, '#C8F54A', 'center', '800');

      var titleLines=wrap(${JSON.stringify(p.title||'')}, 940, 48);
      var ny=TOP+196;
      titleLines.slice(0,3).forEach(function(ln){ text(ln, 540, ny, 48, '#F4F1EA', 'center', '900'); ny+=56; });

      var priceLabel=${JSON.stringify(p.priceLabel||'')};
      if(priceLabel){ text(priceLabel, 540, ny+20, 64, '#C8F54A', 'center', '900'); ny+=80; }

      if(coverImg){
        var iw=880, ih=480, ix=(W-iw)/2, iy=ny+12;
        ctx.save();
        roundRect(ix, iy, iw, ih, 28);
        ctx.clip();
        var s=Math.max(iw/coverImg.width, ih/coverImg.height);
        var dw=coverImg.width*s, dh=coverImg.height*s;
        ctx.drawImage(coverImg, ix+(iw-dw)/2, iy+(ih-dh)/2, dw, dh);
        ctx.restore();
        ctx.strokeStyle='rgba(255,255,255,0.18)'; ctx.lineWidth=3;
        roundRect(ix, iy, iw, ih, 28); ctx.stroke();
        ny=iy+ih+44;
      } else {
        ny+=28;
      }

      var lines=${JSON.stringify(p.lines||[])};
      if(priceLabel) lines=lines.filter(function(ln){ return ln.indexOf(priceLabel)<0; });
      roundRect(56, ny-40, W-112, Math.max(180, 44+lines.length*54+44), 28);
      ctx.fillStyle='rgba(22,24,31,0.78)'; ctx.fill();
      ctx.strokeStyle='rgba(255,255,255,0.12)'; ctx.lineWidth=2; ctx.stroke();
      lines.forEach(function(ln){
        var wl=wrap(ln, 900, 34);
        wl.forEach(function(w){ text(w, 540, ny, 34, '#E7E5E4', 'center', '700'); ny+=44; });
        ny+=8;
      });

      roundRect(180, 1715, 720, 92, 46);
      ctx.fillStyle='#C8F54A'; ctx.fill();
      text(${JSON.stringify(p.ctaLabel||'AcTiViTy')}, 540, 1776, 32, '#0B0C10', 'center', '900');

      if(window.ReactNativeWebView) window.ReactNativeWebView.postMessage(canvas.toDataURL('image/png'));
    }catch(e){
      if(window.ReactNativeWebView) window.ReactNativeWebView.postMessage('ERR:'+String(e&&e.message||e));
    }
  }

  var coverData=${JSON.stringify(coverDataUrl||'')};
  var bgData=${JSON.stringify(bgDataUrl||'')};
  var coverImg=null, bgImg=null, pending=0;
  function maybeGo(){ if(pending===0) paint(coverImg, bgImg); }
  function load(src, assign){
    if(!src) return;
    pending++;
    var img=new Image();
    img.onload=function(){ assign(img); pending--; maybeGo(); };
    img.onerror=function(){ pending--; maybeGo(); };
    img.src=src;
  }
  load(coverData, function(i){ coverImg=i; });
  load(bgData, function(i){ bgImg=i; });
  if(pending===0) setTimeout(function(){ paint(null,null); }, 60);
})();
</script></body></html>`;
}

async function openOrFallback(url, fallbackFn) {
    try {
        const can = await Linking.canOpenURL(url);
        if (can) {
            await Linking.openURL(url);
            return;
        }
    } catch { /* fall */ }
    if (fallbackFn) await fallbackFn();
}

/**
 * İlan / turnuva / ekipman / antrenör / kurs / kulüp — görsel kart + metin,
 * WhatsApp / Durum / IG Hikâye / Telegram / FB / galeri / kopyala / diğer.
 */
export default function EntityShareModal({ visible, kind, item, onClose }) {
    const t = useT();
    const lang = useSelector((s) => s.lang?.lang) || 'tr';
    const insets = useSafeAreaInsets();
    const payload = useMemo(() => {
        if (!visible || !kind || !item) return null;
        return buildEntitySharePayload(kind, item, t, lang);
    }, [visible, kind, item, t, lang]);

    const [busy, setBusy] = useState(false);
    const [needCapture, setNeedCapture] = useState(false);
    const [captureHtml, setCaptureHtml] = useState(null);
    const pendingAction = useRef(null);
    const pngPath = useRef(null);
    const coverDataRef = useRef(null);
    const bgDataRef = useRef(null);

    useEffect(() => {
        if (!visible) {
            setNeedCapture(false);
            setCaptureHtml(null);
            setBusy(false);
            pendingAction.current = null;
            pngPath.current = null;
            coverDataRef.current = null;
            bgDataRef.current = null;
        }
    }, [visible]);

    // Kapak + arka plan: ekipmanda 2. foto varsa o arka plan; yoksa spor/zemin görseli
    useEffect(() => {
        if (!visible || !payload) {
            coverDataRef.current = null;
            bgDataRef.current = null;
            return undefined;
        }
        let cancelled = false;
        coverDataRef.current = null;
        bgDataRef.current = null;
        pngPath.current = null;
        (async () => {
            const resolveBg = async () => {
                // Kullanıcı isteği: ekipman paylaşımında 1. resim kapak, 2. resim arka plan
                if (payload.bgUrl) {
                    const custom = await coverToDataUrl(payload.bgUrl);
                    if (custom) return custom;
                }
                return shareBackgroundToDataUrl(payload.subCategory, payload.surfaceRaw);
            };
            const [cover, bg] = await Promise.all([
                payload.coverUrl ? coverToDataUrl(payload.coverUrl) : Promise.resolve(null),
                resolveBg(),
            ]);
            if (!cancelled) {
                coverDataRef.current = cover;
                bgDataRef.current = bg;
            }
        })();
        return () => { cancelled = true; };
    }, [visible, payload?.id, payload?.coverUrl, payload?.bgUrl, payload?.subCategory, payload?.surfaceRaw]);

    const ensurePng = async () => {
        if (pngPath.current) return pngPath.current;
        if (payload?.coverUrl && !coverDataRef.current) {
            coverDataRef.current = await coverToDataUrl(payload.coverUrl);
        }
        if (!bgDataRef.current) {
            if (payload?.bgUrl) {
                bgDataRef.current = await coverToDataUrl(payload.bgUrl);
            }
            if (!bgDataRef.current && payload?.subCategory) {
                bgDataRef.current = await shareBackgroundToDataUrl(payload.subCategory, payload.surfaceRaw);
            }
        }
        return new Promise((resolve, reject) => {
            pendingAction.current = { type: 'capture', resolve, reject };
            setCaptureHtml(cardHtml(payload, coverDataRef.current, bgDataRef.current));
            setNeedCapture(true);
        });
    };

    const onPng = async (dataUrl) => {
        setNeedCapture(false);
        setCaptureHtml(null);
        const pending = pendingAction.current;
        pendingAction.current = null;
        if (!dataUrl || dataUrl.startsWith('ERR:')) {
            setBusy(false);
            pending?.reject?.(new Error('fail'));
            Alert.alert(t.error || 'Error', t.shareMatchFail || t.shareEntityFail || '');
            return;
        }
        try {
            const b64 = dataUrl.replace(/^data:image\/png;base64,/, '');
            const path = `${FileSystem.cacheDirectory}activity-share-${payload.kind}-${payload.id}.png`;
            await FileSystem.writeAsStringAsync(path, b64, { encoding: FileSystem.EncodingType.Base64 });
            pngPath.current = path;
            if (pending?.type === 'capture') {
                pending.resolve(path);
                return;
            }
            await runWithPath(pending?.action, path);
        } catch {
            Alert.alert(t.error || 'Error', t.shareMatchFail || t.shareEntityFail || '');
        } finally {
            setBusy(false);
        }
    };

    const runWithPath = async (action, path) => {
        const message = payload.message || '';
        const url = payload.url || '';
        if (action === 'save') {
            const ok = await ensureGallerySave(path);
            if (!ok) Alert.alert(t.error || 'Error', t.shareMatchGalleryDenied || '');
            else Alert.alert('', t.shareMatchSaved || t.shareEntitySaved || '');
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
            // Modal üstte kalırsa ADD_TO_STORY çoğu telefonda görseli düşürüyor
            onClose?.();
            await new Promise((r) => setTimeout(r, 350));
            await shareToInstagramStory({
                filePath: path,
                t,
                linkUrl: url || PLAY_STORE_URL,
            });
            return;
        }
        if (action === 'more') {
            await shareViaSystemSheet({ filePath: path, message });
            onClose?.();
        }
    };

    const startVisual = async (action) => {
        if (!payload || busy) return;
        setBusy(true);
        try {
            const path = await ensurePng();
            await runWithPath(action, path);
        } catch {
            Alert.alert(t.error || 'Error', t.shareMatchFail || t.shareEntityFail || '');
        } finally {
            setBusy(false);
        }
    };

    const startText = async (fn) => {
        if (!payload || busy) return;
        setBusy(true);
        try {
            await fn();
            onClose?.();
        } catch (e) {
            Alert.alert(t.error || 'Error', e?.message || t.shareEntityFail || '');
        } finally {
            setBusy(false);
        }
    };

    const targets = [
        { id: 'whatsapp', emoji: '💬', label: 'WhatsApp', visual: true },
        { id: 'wa_status', emoji: '🟢', label: t.shareMatchWaStatus || t.media_ext_wa_status || 'WhatsApp Status', visual: true },
        { id: 'ig_story', emoji: '📱', label: t.shareMatchIgStory || t.media_ext_ig_story || 'Instagram Story', visual: true },
        {
            id: 'telegram', emoji: '✈️', label: 'Telegram', visual: false,
            go: () => openOrFallback(
                `https://t.me/share/url?url=${encodeURIComponent(payload?.url || '')}&text=${encodeURIComponent(payload?.message || '')}`,
                () => Share.share({ message: payload?.message || '', url: payload?.url }),
            ),
        },
        {
            id: 'facebook', emoji: '📘', label: 'Facebook', visual: false,
            go: () => openOrFallback(
                `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(payload?.url || '')}`,
                () => Share.share({ message: payload?.message || '', url: payload?.url }),
            ),
        },
        {
            id: 'threads', emoji: '🧵', label: 'Threads', visual: false,
            go: () => openOrFallback(
                `https://www.threads.net/intent/post?text=${encodeURIComponent(payload?.message || '')}`,
                () => Share.share({ message: payload?.message || '' }),
            ),
        },
        {
            id: 'email', emoji: '✉️', label: 'Email', visual: false,
            go: () => Linking.openURL(
                `mailto:?subject=${encodeURIComponent('AcTiViTy')}&body=${encodeURIComponent(payload?.message || '')}`,
            ),
        },
        { id: 'save', emoji: '📥', label: t.shareMatchSaveBtn || t.media_ext_photos || 'Gallery', visual: true },
        {
            id: 'copy', emoji: '🔗', label: t.media_ext_copy || 'Copy link', visual: false,
            go: async () => {
                Clipboard.setString(payload?.url || payload?.message || '');
                Alert.alert('', t.media_ext_copied || 'Copied');
            },
        },
        { id: 'more', emoji: '⋯', label: t.shareMatchMore || t.media_ext_more || 'More', visual: true },
    ];

    if (!payload) {
        return (
            <Modal visible={!!visible} transparent animationType="fade" onRequestClose={onClose}>
                <View style={s.overlay} />
            </Modal>
        );
    }

    return (
        <Modal visible={!!visible} transparent animationType="slide" onRequestClose={onClose}>
            <View style={[s.overlay, { paddingBottom: Math.max(insets.bottom, 10) }]}>
                <TouchableOpacity style={s.backdropTap} activeOpacity={1} onPress={onClose} />
                <View style={s.sheet}>
                    <View style={s.handle} />
                    <View style={s.header}>
                        <Text style={s.title}>{t.shareEntityTitle || t.shareBtn || 'Share'}</Text>
                        <TouchableOpacity onPress={onClose} hitSlop={12}><Text style={s.close}>✕</Text></TouchableOpacity>
                    </View>

                    <View style={s.preview}>
                        <View style={s.brandRow}>
                            {(payload.brand || 'AcTiViTy').split('').map((ch, i) => (
                                <Text key={i} style={{ color: BRAND_LETTER_COLORS[i % BRAND_LETTER_COLORS.length], fontWeight: '900', fontSize: 22 }}>
                                    {ch}
                                </Text>
                            ))}
                        </View>
                        <Text style={s.badge}>{payload.badge}</Text>
                        <Text style={s.sport}>{payload.sport}</Text>
                        <Text style={s.cardTitle} numberOfLines={2}>{payload.title}</Text>
                        {!!payload.priceLabel && (
                            <Text style={s.pricePrev}>{payload.priceLabel}</Text>
                        )}
                        {(payload.lines || []).slice(0, 4).map((ln, i) => (
                            <Text key={i} style={s.line} numberOfLines={1}>{ln}</Text>
                        ))}
                    </View>

                    {busy ? (
                        <ActivityIndicator color="#C8F54A" style={{ marginVertical: 28 }} />
                    ) : (
                        <ScrollView
                            style={s.list}
                            contentContainerStyle={{ paddingBottom: 8 }}
                            showsVerticalScrollIndicator
                            keyboardShouldPersistTaps="handled"
                        >
                            {targets.map((it) => (
                                <TouchableOpacity
                                    key={it.id}
                                    style={s.row}
                                    activeOpacity={0.75}
                                    onPress={() => {
                                        if (it.visual) startVisual(it.id);
                                        else startText(it.go);
                                    }}
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
        paddingHorizontal: 16, paddingTop: 8, paddingBottom: 10, maxHeight: '82%',
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
    badge: {
        alignSelf: 'center', color: '#0B0C10', backgroundColor: '#C8F54A', overflow: 'hidden',
        fontSize: 11, fontWeight: '900', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10, marginBottom: 6,
    },
    sport: { color: '#C8F54A', fontSize: 12, fontWeight: '800', textAlign: 'center', marginBottom: 6 },
    cardTitle: { color: '#F4F1EA', fontSize: 17, fontWeight: '900', textAlign: 'center', marginBottom: 4 },
    pricePrev: { color: '#C8F54A', fontSize: 20, fontWeight: '900', textAlign: 'center', marginBottom: 8 },
    line: { color: '#A8A29A', fontSize: 13, textAlign: 'center', marginBottom: 2 },
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
