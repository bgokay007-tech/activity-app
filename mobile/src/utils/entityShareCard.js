import { getSubCategoryLabel } from './subCategoryLabels';
import { sportEquipmentShareBadge } from './sportFacilityLabels';
import { BASE_URL } from '../services/api';
import { BRAND_LETTER_COLORS } from './matchShareCard';

const SHARE_HOST = BASE_URL.replace(/\/api\/?$/, '');

const SUB_EMOJI = {
    football: '⚽', basketball: '🏀', tennis: '🎾', padel: '🏓', volleyball: '🏐',
    badminton: '🏸', table_tennis: '🏓', pickleball: '🥒', running: '🏃', climbing: '🧗',
};

function sportMeta(sub, lang) {
    const sport = getSubCategoryLabel(sub, lang) || sub || '';
    const emoji = SUB_EMOJI[sub] || '🏅';
    return { sport, emoji };
}

function fmtDate(d, lang) {
    if (!d) return '';
    try {
        const loc = lang === 'tr' ? 'tr-TR' : lang === 'ru' ? 'ru-RU' : lang === 'de' ? 'de-DE' : 'en-GB';
        return new Date(d).toLocaleDateString(loc, { day: 'numeric', month: 'short', year: 'numeric' });
    } catch {
        return '';
    }
}

function nameOf(p) {
    return p?.fullName || p?.username || p?.manualName || '';
}

function surfaceLabel(item, t) {
    const sf = item?.surface;
    if (!sf) return '';
    const key = `surface${String(sf).toUpperCase()}`;
    return t?.[key] || String(sf);
}

function shareMeta(item, extra = {}) {
    return {
        subCategory: item?.subCategory || null,
        surfaceRaw: item?.surface || null,
        ...extra,
    };
}

/**
 * Ortak kart payload — EntityShareModal canvas + metin paylaşımı.
 * { kind, id, url, title, badge, emoji, sport, lines[], message, ctaLabel, brand, brandColors, coverUrl? }
 */
export function buildEntitySharePayload(kind, item, t, lang = 'tr') {
    if (!item?.id) return null;
    switch (kind) {
        case 'rival': return buildRival(item, t, lang);
        case 'tournament': return buildTournament(item, t, lang);
        case 'equipment': return buildEquipment(item, t, lang);
        case 'coach': return buildCoach(item, t, lang, false);
        case 'course': return buildCoach(item, t, lang, true);
        case 'club': return buildClub(item, t, lang);
        default: return null;
    }
}

function buildRival(rival, t, lang) {
    const { sport, emoji } = sportMeta(rival.subCategory, lang);
    const url = `${SHARE_HOST}/share/rival/${rival.id}`;
    const place = rival.courtName || rival.location || rival.city || '';
    // MATCHED = Yaklaşan Maçlar — ilan (OPEN) ile aynı kart/paylaşım akışı, metinler farklı.
    const isUpcoming = String(rival.status || '').toUpperCase() === 'MATCHED';
    const isVolleyballPlayerAd = !isUpcoming && rival.subCategory === 'volleyball' && rival.matchType !== 'PLAYER_WANTED';
    const intro = isUpcoming
        ? (t?.shareUpcomingMatchIntro || 'Upcoming match')
        : isVolleyballPlayerAd
            ? (t?.sharePlayerWantedIntro || 'Looking for players')
            : (t?.shareRivalIntro || 'Looking for a rival');
    const badge = isUpcoming
        ? (t?.shareEntityBadgeUpcoming || (lang === 'tr' ? 'YAKLAŞAN MAÇ' : lang === 'ru' ? 'ПРЕДСТОЯЩИЙ' : lang === 'de' ? 'NÄCHSTES MATCH' : 'UPCOMING'))
        : (t?.shareEntityBadgeRival || (lang === 'tr' ? 'MAÇ İLANI' : lang === 'ru' ? 'ОБЪЯВЛЕНИЕ' : lang === 'de' ? 'ANZEIGE' : 'MATCH AD'));
    const lines = [];
    const surface = surfaceLabel(rival, t);
    if (surface) lines.push(`🏟 ${surface}`);
    if (place) lines.push(`📍 ${place}`);
    if (rival.matchDate) {
        lines.push(`📅 ${fmtDate(rival.matchDate, lang)}${rival.matchTime ? ` · ${rival.matchTime}` : ''}`);
    }
    if (rival.duration) lines.push(`⏱ ${rival.duration} ${t?.timeMinSuffix || 'min'}`);
    const label = (n) => (t?.cardParticipantLabel ? t.cardParticipantLabel(n) : `P${n}`);
    const confirmed = [];
    if (rival.matchType === 'DOUBLE') {
        const partner = Array.isArray(rival.senderTeam) ? rival.senderTeam[0] : null;
        const slots = [rival.sender, partner, rival.participants?.[0], rival.participants?.[1]].filter((p) => p?.id);
        slots.forEach((p, i) => confirmed.push(`${label(i + 1)}: ${nameOf(p)}`));
    } else {
        const teamPlayers = [
            rival.sender,
            ...(Array.isArray(rival.senderTeam) ? rival.senderTeam : []),
            ...(Array.isArray(rival.participants) ? rival.participants : []),
            ...(Array.isArray(rival.unassignedPlayers) ? rival.unassignedPlayers : []),
        ].filter((p) => p?.id);
        teamPlayers.forEach((p, i) => confirmed.push(`${label(i + 1)}: ${nameOf(p)}`));
    }
    if (confirmed.length) lines.push(`👥 ${confirmed.join(', ')}`);

    const message = [intro, ...lines, url].filter(Boolean).join('\n');
    return {
        kind: 'rival',
        id: rival.id,
        url,
        title: intro,
        badge,
        emoji,
        sport: `${emoji} ${sport}`.trim(),
        lines,
        message,
        ctaLabel: t?.shareMatchStoreCta || 'AcTiViTy · Download',
        brand: lang === 'tr' ? 'AkTiViTe' : 'AcTiViTy',
        brandColors: BRAND_LETTER_COLORS,
        ...shareMeta(rival),
    };
}

function buildTournament(tournament, t, lang) {
    const { sport, emoji } = sportMeta(tournament.subCategory, lang);
    const url = `${SHARE_HOST}/share/tournament/${tournament.id}`;
    const intro = t?.shareTournamentIntro || 'Join the tournament!';
    const name = tournament.name || sport;
    const badge = t?.shareEntityBadgeTournament || (lang === 'tr' ? 'TURNUVA' : lang === 'ru' ? 'ТУРНИР' : lang === 'de' ? 'TURNIER' : 'TOURNAMENT');
    const place = tournament.location || tournament.city || '';
    const lines = [];
    if (place) lines.push(`📍 ${place}`);
    if (tournament.eventDate) {
        lines.push(`📅 ${fmtDate(tournament.eventDate, lang)}${tournament.eventTime ? ` · ${tournament.eventTime}` : ''}`);
    }
    if (tournament.maxPlayers) {
        const n = tournament._count?.participants ?? tournament.participantCount;
        if (n != null) lines.push(`👥 ${n}/${tournament.maxPlayers}`);
    }
    const message = [`${intro} 🏆 ${name}`.trim(), ...lines, url].filter(Boolean).join('\n');
    return {
        kind: 'tournament',
        id: tournament.id,
        url,
        title: name,
        badge,
        emoji: '🏆',
        sport: `${emoji} ${sport}`.trim(),
        lines: [intro, ...lines],
        message,
        ctaLabel: t?.shareMatchStoreCta || 'AcTiViTy · Download',
        brand: lang === 'tr' ? 'AkTiViTe' : 'AcTiViTy',
        brandColors: BRAND_LETTER_COLORS,
        ...shareMeta(tournament),
    };
}

/** Fotoğraf URL'leri (video hariç) — seçim sırası korunur. */
function equipmentPhotoUrls(images) {
    if (!Array.isArray(images)) return [];
    return images.filter((img) => typeof img === 'string' && img && !img.includes('/video/upload/'));
}

function buildEquipment(eq, t, lang) {
    const { sport, emoji } = sportMeta(eq.subCategory, lang);
    const url = `${SHARE_HOST}/share/equipment/${eq.id}`;
    // Spor-özel rozet: "EKİPMAN" değil "Tenis Ekipmanı"
    const badge = sportEquipmentShareBadge(eq.subCategory, sport, lang, t);
    const intro = t?.shareEquipmentIntroSport
        ? t.shareEquipmentIntroSport(sport)
        : (t?.shareEquipmentIntro || (lang === 'tr' ? `Satılık ${sport} ekipmanı` : `${sport} equipment for sale`));
    const price = eq.price > 0 ? `${eq.price} ₺` : (t?.sc_0903 || '—');
    const cond = eq.condition === 'NEW'
        ? (t?.sc_0901 || 'New')
        : (t?.sc_0902 || 'Used');
    const seller = eq.user?.fullName || eq.user?.username || '';
    const place = [eq.location, eq.city].filter(Boolean).join(' · ');
    const lines = [
        `💰 ${price}`,
        `🏷️ ${cond}`,
    ];
    if (place) lines.push(`📍 ${place}`);
    if (seller) lines.push(`👤 ${seller}`);
    if (eq.description) lines.push(String(eq.description).trim().slice(0, 140));
    // 1. seçilen foto = kapak (normal resim); 2. seçilen = paylaşım arka planı
    const photos = equipmentPhotoUrls(eq.images);
    const coverUrl = photos[0] || null;
    const bgUrl = photos[1] || null;
    const message = [`${intro}: ${eq.title}`, ...lines, url].filter(Boolean).join('\n');
    return {
        kind: 'equipment',
        id: eq.id,
        url,
        title: eq.title || intro,
        priceLabel: price,
        badge,
        emoji: '📦',
        sport: `${emoji} ${sport}`.trim(),
        lines,
        message,
        coverUrl,
        bgUrl,
        ctaLabel: t?.shareMatchStoreCta || 'AcTiViTy · Download',
        brand: lang === 'tr' ? 'AkTiViTe' : 'AcTiViTy',
        brandColors: BRAND_LETTER_COLORS,
        ...shareMeta(eq),
    };
}

function buildCoach(c, t, lang, asCourse) {
    const { sport, emoji } = sportMeta(c.subCategory, lang);
    const path = asCourse ? 'course' : 'coach';
    const url = `${SHARE_HOST}/share/${path}/${c.id}`;
    const badge = asCourse
        ? (t?.shareEntityBadgeCourse || (lang === 'tr' ? 'KURS' : lang === 'ru' ? 'КУРС' : lang === 'de' ? 'KURS' : 'COURSE'))
        : (t?.shareEntityBadgeCoach || (lang === 'tr' ? 'ANTRENÖR' : lang === 'ru' ? 'ТРЕНЕР' : lang === 'de' ? 'TRAINER' : 'COACH'));
    const intro = asCourse
        ? (t?.shareCourseIntro || (lang === 'tr' ? 'Grupa katıl / kurs' : 'Join the course'))
        : (t?.shareCoachIntro || (lang === 'tr' ? 'Antrenör / destek' : 'Coach available'));
    const title = c.personalFullName || c.user?.fullName || c.user?.username || c.credentialLevel || intro;
    const lines = [];
    if (c.credentialLevel) lines.push(String(c.credentialLevel));
    if (c.certName) lines.push(c.certName);
    if (c.individual && c.priceIndividual > 0) lines.push(`👤 ${c.priceIndividual}₺`);
    if (c.group && c.priceGroup > 0) lines.push(`👥 ${c.priceGroup}₺`);
    const cities = Array.isArray(c.cities) && c.cities.length ? c.cities.join(', ') : (c.city || '');
    if (cities || c.location) lines.push(`📍 ${[cities, c.location].filter(Boolean).join(' / ')}`);
    if (c.experience > 0) lines.push(`⏱ ${c.experience} ${t?.sc_0936 || 'yr'}`);
    if (c.description) lines.push(String(c.description).trim().slice(0, 120));
    const message = [`${intro}: ${title}`, ...lines, url].filter(Boolean).join('\n');
    return {
        kind: asCourse ? 'course' : 'coach',
        id: c.id,
        url,
        title,
        badge,
        emoji: asCourse ? '📚' : '🎓',
        sport: `${emoji} ${sport}`.trim(),
        lines,
        message,
        coverUrl: c.profilePhotoUrl || null,
        ctaLabel: t?.shareMatchStoreCta || 'AcTiViTy · Download',
        brand: lang === 'tr' ? 'AkTiViTe' : 'AcTiViTy',
        brandColors: BRAND_LETTER_COLORS,
        ...shareMeta(c),
    };
}

function buildClub(cl, t, lang) {
    const { sport, emoji } = sportMeta(cl.subCategory, lang);
    const url = `${SHARE_HOST}/share/club/${cl.id}`;
    const badge = t?.shareEntityBadgeClub || (lang === 'tr' ? 'KULÜP' : lang === 'ru' ? 'КЛУБ' : lang === 'de' ? 'VEREIN' : 'CLUB');
    const intro = t?.shareClubIntro || (lang === 'tr' ? 'Kulübe göz at' : 'Check out this club');
    const lines = [];
    const cities = Array.isArray(cl.cities) && cl.cities.length ? cl.cities.join(', ') : (cl.city || '');
    if (cities || cl.location) lines.push(`📍 ${[cities, cl.location].filter(Boolean).join(' / ')}`);
    if (cl.membershipFee > 0) lines.push(`💳 ${cl.membershipFee}₺ / ${t?.clubFeeMonth || 'mo'}`);
    if (cl.contactPhone) lines.push(`📞 ${cl.contactPhone}`);
    if (cl.website) lines.push(`🌐 ${cl.website}`);
    if (cl.description) lines.push(String(cl.description).trim().slice(0, 120));
    const message = [`${intro}: ${cl.name}`, ...lines, url].filter(Boolean).join('\n');
    return {
        kind: 'club',
        id: cl.id,
        url,
        title: cl.name || intro,
        badge,
        emoji: '🏟️',
        sport: `${emoji} ${sport}`.trim(),
        lines,
        message,
        coverUrl: cl.photoUrl || null,
        ctaLabel: t?.shareMatchStoreCta || 'AcTiViTy · Download',
        brand: lang === 'tr' ? 'AkTiViTe' : 'AcTiViTy',
        brandColors: BRAND_LETTER_COLORS,
        ...shareMeta(cl),
    };
}

export { BRAND_LETTER_COLORS, SHARE_HOST };
