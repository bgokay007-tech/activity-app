import prisma from '../config/prisma.js';
import { BACKEND_URL, IOS_APP_STORE_URL, ANDROID_PLAY_STORE_URL } from '../config/env.js';

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
    const storeButtons = [];
    if (IOS_APP_STORE_URL) storeButtons.push(`<a class="store-btn" href="${escapeHtml(IOS_APP_STORE_URL)}">App Store'dan İndir</a>`);
    if (ANDROID_PLAY_STORE_URL) storeButtons.push(`<a class="store-btn" href="${escapeHtml(ANDROID_PLAY_STORE_URL)}">Google Play'den İndir</a>`);

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
  .store-btn { display:inline-block; margin:8px; padding:12px 20px; border-radius:10px; background:#6d28d9; color:#fff; text-decoration:none; font-weight:600; }
  .hint { color:#777; font-size:13px; margin-top:28px; }
</style>
</head>
<body>
  <img class="icon" src="${ogImage}" alt="Activity">
  <h1>${escapeHtml(title)}</h1>
  <p class="desc">${escapeHtml(description)}</p>
  ${notFound ? '' : `<div id="store-buttons" style="display:none; margin-top:16px;">${storeButtons.join('')}${storeButtons.length ? '' : '<p class=\"hint\">Uygulamayı henüz yüklemediyseniz, yakında mağazalarda!</p>'}</div>`}
  ${notFound ? '' : `<script>
    (function() {
      var ua = navigator.userAgent || '';
      var isMobile = /Android|iPhone|iPad|iPod/i.test(ua);
      if (!isMobile) { document.getElementById('store-buttons').style.display = 'block'; return; }
      var opened = false;
      window.addEventListener('blur', function() { opened = true; });
      document.addEventListener('visibilitychange', function() { if (document.hidden) opened = true; });
      window.location.href = ${JSON.stringify(deepLink)};
      setTimeout(function() {
        if (!opened) document.getElementById('store-buttons').style.display = 'block';
      }, 1200);
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
