import prisma from '../config/prisma.js';
import { BACKEND_URL, IOS_APP_STORE_URL, ANDROID_PLAY_STORE_URL, ANDROID_APK_URL } from '../config/env.js';

// Bu route'lar auth'suz herkese açık (WhatsApp/Telegram/Instagram önizleme botları giriş
// yapamaz) — sadece özet/genel bilgi döndürülür, hassas alanlar (id'ler, iletişim vs.) yok.

function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatDate(d) {
    if (!d) return null;
    try {
        return new Date(d).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
    } catch { return null; }
}

function tournTypeLabel(tp) {
    if (tp === '1') return 'Bireysel Rekabetçi';
    if (tp === '2') return 'Çiftler Rekabetçi';
    if (tp === '3') return 'Bireysel Antrenman';
    if (tp === '4') return 'Çiftler Antrenman';
    return tp ? `Tür ${tp}` : 'Belirlenmedi';
}

function subCategoryLabel(sub) {
    if (!sub) return '';
    return sub.charAt(0).toUpperCase() + sub.slice(1);
}

function renderSharePage({ title, description, deepLink, pageUrl, notFound = false }) {
    const ogImage = `${BACKEND_URL}/icon-512.png`;
    // Uygulama henüz Play Store'da değil — varsa gerçek mağaza linki, yoksa geçici olarak
    // doğrudan APK indirme linki kullanılır (bkz. ANDROID_APK_URL, ekran görüntüsü/metin de
    // buna göre değişir — "Google Play'den İndir" değil "Uygulamayı İndir (APK)").
    const androidUrl = ANDROID_PLAY_STORE_URL || ANDROID_APK_URL;
    const androidLabel = ANDROID_PLAY_STORE_URL ? "Google Play'den İndir" : '⬇️ Uygulamayı İndir (APK)';
    const storeButtons = [];
    if (IOS_APP_STORE_URL) storeButtons.push(`<a class="store-btn" href="${escapeHtml(IOS_APP_STORE_URL)}">App Store'dan İndir</a>`);
    if (androidUrl) storeButtons.push(`<a class="store-btn" href="${escapeHtml(androidUrl)}">${androidLabel}</a>`);
    if (!ANDROID_PLAY_STORE_URL && ANDROID_APK_URL) {
        storeButtons.push(`<p class="hint" style="margin-top:6px;">Android'de "Bilinmeyen kaynaklardan yükleme" izni gerekebilir.</p>`);
    }

    return `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:image" content="${ogImage}">
<meta property="og:url" content="${escapeHtml(pageUrl)}">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(description)}">
<meta name="twitter:image" content="${ogImage}">
<style>
  body { font-family: -apple-system, Segoe UI, Roboto, sans-serif; background:#0A0A0A; color:#fff; margin:0; padding:24px; display:flex; flex-direction:column; align-items:center; text-align:center; min-height:100vh; box-sizing:border-box; }
  img.icon { width:88px; height:88px; border-radius:20px; margin-top:32px; }
  h1 { font-size:20px; margin:20px 0 8px; }
  p.desc { color:#b3b3b3; font-size:15px; line-height:1.5; max-width:420px; }
  .open-btn { display:inline-block; margin:20px 8px 8px; padding:14px 26px; border-radius:12px; background:#6d28d9; color:#fff; text-decoration:none; font-weight:700; font-size:16px; }
  .store-btn { display:inline-block; margin:8px; padding:12px 20px; border-radius:10px; background:#ffffff14; color:#fff; text-decoration:none; font-weight:600; }
  .hint { color:#777; font-size:13px; margin-top:28px; }
</style>
</head>
<body>
  <img class="icon" src="${ogImage}" alt="Activity">
  <h1>${escapeHtml(title)}</h1>
  <p class="desc">${escapeHtml(description)}</p>
  ${notFound ? '' : `
  <a class="open-btn" id="open-app-btn" href="${escapeHtml(deepLink)}">📱 Uygulamada Aç</a>
  <div id="store-buttons" style="margin-top:8px;">${storeButtons.join('')}${storeButtons.length ? '' : '<p class=\"hint\">Uygulamayı henüz yüklemediyseniz, yakında mağazalarda!</p>'}</div>
  <script>
    (function() {
      // Kullanıcı raporu: uygulama telefonda YÜKLÜ DEĞİLSE "Uygulamada Aç" butonuna
      // (activityapp:// özel şeması) dokununca hiçbir şey olmuyordu ("tepkisiz") — özel URL
      // şemaları, ilgili uygulama yüklü değilse çoğu tarayıcıda SESSİZCE başarısız olur,
      // hata da vermez, mağazaya da yönlendirmez. Artık: butona dokununca hem şema denenir
      // hem de kısa bir süre sonra (sayfa hâlâ görünürse — yani uygulama açılıp bu sekmeden
      // uzaklaşılmadıysa) platforma göre mağaza linkine (varsa) otomatik yönlendirilir.
      var ua = navigator.userAgent || '';
      var isMobile = /Android|iPhone|iPad|iPod/i.test(ua);
      var isIOS = /iPhone|iPad|iPod/i.test(ua);
      var storeUrl = isIOS ? ${JSON.stringify(IOS_APP_STORE_URL || null)} : ${JSON.stringify(androidUrl || null)};
      function goToStoreIfStillHere() {
        if (document.hidden) return; // uygulama açıldıysa sekme zaten arka planda/kapanmış olur
        if (storeUrl) window.location.href = storeUrl;
      }
      var btn = document.getElementById('open-app-btn');
      if (btn) {
        btn.addEventListener('click', function() {
          setTimeout(goToStoreIfStillHere, 1800);
        });
      }
      if (!isMobile) return;
      window.location.href = ${JSON.stringify(deepLink)};
      setTimeout(goToStoreIfStillHere, 1800);
    })();
  </script>`}
</body>
</html>`;
}

export const getRivalSharePage = async (req, res, next) => {
    try {
        const { id } = req.params;
        const rival = await prisma.activityRequest.findUnique({
            where: { id },
            select: {
                category: true, subCategory: true, courtName: true, location: true,
                matchDate: true, matchTime: true, matchType: true, matchMode: true,
                participants: true, senderTeam: true,
                sender: { select: { fullName: true, username: true } },
            },
        });
        const pageUrl = `${BACKEND_URL}/share/rival/${id}`;
        if (!rival) {
            res.set('Content-Type', 'text/html; charset=utf-8');
            return res.status(404).send(renderSharePage({
                title: 'İlan bulunamadı', description: 'Bu rakip bul ilanı artık mevcut değil.',
                pageUrl, notFound: true,
            }));
        }
        const playerLabel = p => p?.fullName || p?.username;
        const senderTeamArr = Array.isArray(rival.senderTeam) ? rival.senderTeam : [];
        const participantsArr = Array.isArray(rival.participants) ? rival.participants : [];
        const sub = subCategoryLabel(rival.subCategory);
        const place = rival.courtName || rival.location;
        const dateStr = formatDate(rival.matchDate);
        const title = `${sub} Rakip Arıyor${place ? ' · ' + place : ''}`;
        const descParts = [];
        if (dateStr) descParts.push(`📅 ${dateStr}${rival.matchTime ? ' ' + rival.matchTime : ''}`);
        if (place) descParts.push(`📍 ${place}`);
        descParts.push(rival.matchType === 'DOUBLE' ? '👥 Çiftler' : '🧍 Tekli');
        descParts.push(rival.matchMode === 'COMPETITIVE' ? '🏆 Rekabetçi' : '🎾 Antrenman');
        // Çiftler + iki takım da tamamsa takım gruplu göster, aksi halde düz katılımcı listesi
        const isDoubleFull = rival.matchType === 'DOUBLE' && senderTeamArr[0] && participantsArr[0] && participantsArr[1];
        if (isDoubleFull) {
            const team1 = [playerLabel(rival.sender), playerLabel(senderTeamArr[0])].filter(Boolean).join(' & ');
            const team2 = [playerLabel(participantsArr[0]), playerLabel(participantsArr[1])].filter(Boolean).join(' & ');
            if (team1) descParts.push(`Takım 1: ${team1}`);
            if (team2) descParts.push(`Takım 2: ${team2}`);
        } else {
            const participantNames = participantsArr.map(playerLabel).filter(Boolean);
            if (participantNames.length) descParts.push(`Katılanlar: ${participantNames.join(', ')}`);
        }
        const description = descParts.join(' • ');

        res.set('Content-Type', 'text/html; charset=utf-8');
        res.send(renderSharePage({ title, description, deepLink: `activityapp://rival/${id}`, pageUrl }));
    } catch (e) { next(e); }
};

export const getTournamentSharePage = async (req, res, next) => {
    try {
        const { id } = req.params;
        const tournament = await prisma.tournament.findUnique({
            where: { id },
            select: {
                name: true, type: true, category: true, subCategory: true,
                location: true, city: true, eventDate: true, eventTime: true,
                minPlayers: true, maxPlayers: true,
                _count: { select: { participants: { where: { status: 'ACCEPTED' } } } },
            },
        });
        const pageUrl = `${BACKEND_URL}/share/tournament/${id}`;
        if (!tournament) {
            res.set('Content-Type', 'text/html; charset=utf-8');
            return res.status(404).send(renderSharePage({
                title: 'Turnuva bulunamadı', description: 'Bu turnuva artık mevcut değil.',
                pageUrl, notFound: true,
            }));
        }
        const sub = subCategoryLabel(tournament.subCategory);
        const place = tournament.location || tournament.city;
        const dateStr = formatDate(tournament.eventDate);
        const title = tournament.name || `${sub} Turnuvası`;
        const descParts = [`🏆 ${tournTypeLabel(tournament.type)}`, `${sub}`];
        if (dateStr) descParts.push(`📅 ${dateStr}${tournament.eventTime ? ' ' + tournament.eventTime : ''}`);
        if (place) descParts.push(`📍 ${place}`);
        descParts.push(`👥 ${tournament._count.participants}/${tournament.maxPlayers} katılımcı`);
        const description = descParts.join(' • ');

        res.set('Content-Type', 'text/html; charset=utf-8');
        res.send(renderSharePage({ title, description, deepLink: `activityapp://tournament/${id}`, pageUrl }));
    } catch (e) { next(e); }
};
