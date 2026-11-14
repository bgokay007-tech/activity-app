import { getSubCategoryLabel } from './subCategoryLabels';
import { sportEquipmentShareBadge } from './sportFacilityLabels';
import { BASE_URL } from '../services/api';
import { BRAND_LETTER_COLORS, buildMatchSharePayload, teamsAreSet } from './matchShareCard';
import { tournFormatLabel } from './tournamentFormats';
import { tournPlayoffCardText } from './tournamentCardText';

const SHARE_HOST = BASE_URL.replace(/\/api\/?$/, '');

const SUB_EMOJI = {
    football: '⚽', basketball: '🏀', tennis: '🎾', padel: '🏓', volleyball: '🏐',
    badminton: '🏸', table_tennis: '🏓', pickleball: '🥒', squash: '🟡', running: '🏃', climbing: '🧗',
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
    const isPlayed = ['COMPLETED', 'SCORE_PENDING', 'DISPUTED'].includes(String(rival.status || '').toUpperCase())
        || !!rival.score;
    const isVolleyballPlayerAd = !isUpcoming && !isPlayed && rival.subCategory === 'volleyball' && rival.matchType !== 'PLAYER_WANTED';
    const intro = isUpcoming
        ? (t?.shareUpcomingMatchIntro || 'Upcoming match')
        : isPlayed
            ? (t?.sharePlayedMatchIntro || t?.shareUpcomingMatchIntro || 'Match')
            : isVolleyballPlayerAd
                ? (t?.sharePlayerWantedIntro || 'Looking for players')
                : (t?.shareRivalIntro || 'Looking for a rival');
    const badge = isUpcoming
        ? (t?.shareEntityBadgeUpcoming || (lang === 'tr' ? 'YAKLAŞAN MAÇ' : lang === 'ru' ? 'ПРЕДСТОЯЩИЙ' : lang === 'de' ? 'NÄCHSTES MATCH' : 'UPCOMING'))
        : isPlayed
            ? (t?.shareEntityBadgePlayed || (lang === 'tr' ? 'OYNANAN MAÇ' : lang === 'ru' ? 'СЫГРАННЫЙ' : lang === 'de' ? 'GESPIELT' : 'PLAYED'))
            : (t?.shareEntityBadgeRival || (lang === 'tr' ? 'MAÇ İLANI' : lang === 'ru' ? 'ОБЪЯВЛЕНИЕ' : lang === 'de' ? 'ANZEIGE' : 'MATCH AD'));
    const lines = [];
    const surface = surfaceLabel(rival, t);
    if (surface) lines.push(`🏟 ${surface}`);
    if (place) lines.push(`📍 ${place}`);
    if (rival.matchDate) {
        lines.push(`📅 ${fmtDate(rival.matchDate, lang)}${rival.matchTime ? ` · ${rival.matchTime}` : ''}`);
    }
    if (rival.duration) lines.push(`⏱ ${rival.duration} ${t?.timeMinSuffix || 'min'}`);

    // Takımlar belliysa (iki taraf dolu) — kart + metinde kadro + format ELO (tekli/çiftler).
    let teams = null;
    const teamsKnown = teamsAreSet(rival);
    if (teamsKnown) {
        const mp = buildMatchSharePayload(rival, t, lang);
        if (mp?.teamsKnown) {
            teams = {
                teamATitle: mp.teamATitle,
                teamBTitle: mp.teamBTitle,
                leftRoster: mp.leftRoster,
                rightRoster: mp.rightRoster,
                isDoubles: mp.isDoubles,
            };
            lines.push(`🟢 ${mp.teamATitle}: ${mp.leftRoster.map((r) => `${r.name}${r.elo ? ` ${r.elo}` : ''}`).join(' · ')}`);
            lines.push(`🔴 ${mp.teamBTitle}: ${mp.rightRoster.map((r) => `${r.name}${r.elo ? ` ${r.elo}` : ''}`).join(' · ')}`);
        }
    }
    if (!teams) {
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
    }

    const message = [intro, ...lines, url].filter(Boolean).join('\n');
    const sfRaw = String(rival.surface || '').trim().toUpperCase();
    // Zemin yok / oyuncular seçer → yarı sert-toprak görsel + daha açık overlay
    const undecidedSurface = !sfRaw || sfRaw === 'PLAYERS_DECIDE' || sfRaw === 'UNKNOWN' || sfRaw === 'ANY';
    return {
        kind: 'rival',
        id: rival.id,
        url,
        title: intro,
        badge,
        emoji,
        sport: `${emoji} ${sport}`.trim(),
        lines,
        teams,
        message,
        ctaLabel: t?.shareMatchStoreCta || 'AcTiViTy · Download',
        brand: lang === 'tr' ? 'AkTiViTe' : 'AcTiViTy',
        brandColors: BRAND_LETTER_COLORS,
        bgPlayersDecide: undecidedSurface,
        ...shareMeta(rival),
    };
}

function stripLeadEmoji(s) {
    return String(s || '').replace(/^[^\p{L}\p{N}]+/u, '').trim();
}

function fmtTournDateTime(d, tm, lang) {
    if (!d) return '';
    const base = fmtDate(d, lang);
    return tm ? `${base} ${tm}` : base;
}

/**
 * Turnuva paylaşımı: ilan kartındaki bilgiler (EFT IBAN + turnuva kuralları HARİÇ).
 * PLAYERS_DECIDE zeminde kart arka planı yarı sert / yarı toprak olur (EntityShareModal).
 */
function buildTournament(tournament, t, lang) {
    const { sport, emoji } = sportMeta(tournament.subCategory, lang);
    const url = `${SHARE_HOST}/share/tournament/${tournament.id}`;
    const intro = t?.shareTournamentIntro || 'Join the tournament!';
    const name = tournament.name || sport;
    const badge = t?.shareEntityBadgeTournament || (lang === 'tr' ? 'TURNUVA' : lang === 'ru' ? 'ТУРНИР' : lang === 'de' ? 'TURNIER' : 'TOURNAMENT');
    const lines = [];

    const format = tournFormatLabel(tournament, t);
    if (format) lines.push(`🏆 ${format}`);

    const placeRaw = tournament.location || tournament.city || '';
    const place = placeRaw === 'Dünya'
        ? (t?.sc_0395 || placeRaw)
        : (placeRaw || (tournament.scope === 'ULUSLARARASI' ? t?.sc_0395 : tournament.scope === 'ULUSAL' ? t?.sc_0396 : t?.sc_0397) || '');
    // Belirli kort yoksa “oyuncular seçer” metni
    const noSpecificCourt = !String(tournament.location || '').trim()
        || /ortaklaşa|oyuncular|players decide|gemeinsam|соглас/i.test(String(tournament.location || ''));
    if (place && !noSpecificCourt) lines.push(`📍 ${place}`);
    else if (noSpecificCourt) {
        lines.push(`📍 ${tournament.subCategory === 'airsoft'
            ? (t?.tournCourtPlayersArrange || t?.sc_0402 || '')
            : (t?.tournCourtPlayersArrange || t?.tournCourtPlayersDecide || '')}`);
    }

    const creator = tournament.creator?.fullName || tournament.creator?.username || '';
    if (creator) lines.push(`👤 ${creator}${tournament.contactPhone ? ` · 📞 ${tournament.contactPhone}` : ''}`);
    else if (tournament.contactPhone) lines.push(`📞 ${tournament.contactPhone}`);

    if (tournament.endDate) {
        lines.push(`${t?.sc_0400 || 'Entry deadline:'} ${fmtTournDateTime(tournament.endDate, tournament.endTime, lang)}`);
    }

    const metaBits = [];
    if (tournament.genderType) {
        const gKey = `tournGender${tournament.genderType.charAt(0)}${String(tournament.genderType).slice(1).toLowerCase()}`;
        metaBits.push(stripLeadEmoji(t?.[gKey] || tournament.genderType));
    }
    if (tournament.minRating != null || tournament.maxRating != null) {
        metaBits.push(`⭐ ${tournament.minRating != null ? tournament.minRating : '0'}–${tournament.maxRating != null ? tournament.maxRating : '5'}★`);
    }
    if (tournament.setsPerMatch) {
        metaBits.push(`${t?.sc_0401 || 'Sets:'} ${tournament.setsPerMatch}${tournament.decidingTiebreak ? ` · ${t?.tournThirdSetTb || 'TB'}` : ''}`);
    }
    if (tournament.advantageScoring !== undefined) {
        const scoring = tournament.advantageScoring === null
            ? t?.tournFreeScoring
            : tournament.advantageScoring ? t?.tournAdvantage : t?.tournDeciding;
        if (scoring) metaBits.push(stripLeadEmoji(scoring));
    }
    if (metaBits.length) lines.push(metaBits.join(' · '));

    const sf = String(tournament.surface || '').toUpperCase();
    if (sf && sf !== 'PLAYERS_DECIDE') {
        const sLabel = surfaceLabel(tournament, t);
        if (sLabel) lines.push(`🏟 ${sLabel}`);
    } else if (sf === 'PLAYERS_DECIDE') {
        lines.push(`🏟 ${t?.tournSurfacePlayersDecide || t?.surfacePLAYERS_DECIDE || 'Players decide'}`);
    }

    const playoffTxt = tournPlayoffCardText(tournament, t);
    if (playoffTxt) lines.push(playoffTxt);

    const max = tournament.maxPlayers;
    const participantCount = tournament._count?.participants
        ?? tournament.participantCount
        ?? (Array.isArray(tournament.participants) ? tournament.participants.length : null);
    if (max || participantCount != null) {
        const asCount = max && participantCount != null ? Math.min(participantCount, max) : participantCount;
        const yedek = max && participantCount != null ? Math.max(0, participantCount - max) : 0;
        const base = max ? `${asCount ?? 0}/${max}` : `${participantCount ?? 0}`;
        const txt = yedek > 0 && t?.sc_0406 ? t.sc_0406(base, yedek) : base;
        lines.push(`👥 ${t?.sc_0407 ? t.sc_0407(txt, tournament.minPlayers > 2 ? ` · min ${tournament.minPlayers}` : '') : txt}`);
    }

    const flags = [];
    if (tournament.dayTrip) flags.push(t?.sc_0408 || 'Day trip');
    if (tournament.availabilityMatchEnabled) flags.push(t?.tournAvailBadge || 'Availability matching');
    if (tournament.matchFrequency === 'WEEKLY_1') flags.push(t?.sc_0409 || 'Weekly');
    else if (tournament.matchFrequency && tournament.matchFrequency !== 'FLEXIBLE') flags.push(t?.sc_0410 || 'Twice a week');
    if (flags.length) lines.push(flags.join(' · '));

    if (tournament.eventDate || tournament.eventEndDate) {
        const start = fmtTournDateTime(tournament.eventDate, tournament.eventTime, lang);
        const end = fmtTournDateTime(tournament.eventEndDate, tournament.eventEndTime, lang);
        const range = [start, end].filter(Boolean).join(' – ');
        lines.push(t?.sc_0411 ? t.sc_0411(range) : range);
    }

    // Ücret / ödeme yöntemi — IBAN / hesap sahibi (EFT bilgileri) YOK
    if (tournament.isPaid || tournament.feeType === 'SHARED' || tournament.feeType === 'SPONSORED' || tournament.feeType === 'INCLUDED') {
        if (tournament.isPaid) {
            const fee = tournament.playerFee != null && tournament.playerFee !== '' ? `${tournament.playerFee}₺` : '—';
            lines.push(`${t?.sc_0412 || 'Entry fee:'} ${fee}`);
        }
        const feeKind = tournament.feeType === 'INCLUDED'
            ? (t?.sc_0414 || 'Included')
            : tournament.feeType === 'SPONSORED'
                ? (t?.sc_0415 || 'Sponsored')
                : (t?.sc_0416 || 'Shared');
        lines.push(`${t?.sc_0413 || 'Court fee:'} ${feeKind}`);
        if (tournament.isPaid && tournament.paymentMethod) {
            const m = String(tournament.paymentMethod || '').toUpperCase();
            const payLabel = (m === 'EFT_CASH' || m === 'BOTH' || m === 'EFT+CASH')
                ? (t?.sc_0418 || 'Transfer + cash')
                : m === 'EFT' ? 'EFT'
                    : m === 'CASH' ? (t?.sc_0419 || 'Cash')
                        : m;
            lines.push(`${t?.sc_0417 || 'Payment:'} ${payLabel}`);
        }
    }

    const prizes = [
        tournament.prize1 ? `🥇 ${tournament.prize1}` : null,
        tournament.prize2 ? `🥈 ${tournament.prize2}` : null,
        tournament.prize3 ? `🥉 ${tournament.prize3}` : null,
        tournament.surpriseGifts ? `🎁 ${tournament.surpriseGifts}` : null,
    ].filter(Boolean);
    if (prizes.length) lines.push(prizes.join(' · '));

    if (Array.isArray(tournament.extraServices) && tournament.extraServices.length) {
        const extras = tournament.extraServices
            .map((s) => (typeof s === 'string' ? s : (s?.name || s?.title || '')))
            .filter(Boolean)
            .slice(0, 4)
            .join(' · ');
        if (extras) lines.push(`✨ ${t?.sc_0164 || 'Extras'}: ${extras}`);
    }

    if (tournament.description) {
        lines.push(String(tournament.description).trim().slice(0, 160));
    }

    // Turnuva kuralları (tournRules*) bilinçli olarak eklenmiyor.
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
        // Oyuncular zemin seçer → tek kort yarı sert/toprak görseli, daha açık overlay
        bgPlayersDecide: sf === 'PLAYERS_DECIDE',
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
