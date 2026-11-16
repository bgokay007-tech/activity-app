/** Spor dalı rehberi — Nasıl oynanır / Önemli sporcular / Bonus.
 *  Metinler en+tr+ru+de; UI etiketleri i18n'de. Linkler harici (Linking.openURL). */

import { ATHLETES_BY_SUB } from './sportGuideAthletes.js';

const L = (en, tr, ru, de) => ({ en, tr, ru, de });

function pick(obj, lang) {
    if (!obj) return '';
    if (typeof obj === 'string') return obj;
    return obj[lang] || obj.en || obj.tr || '';
}

function normKey(s) {
    return String(s || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

export function hasSportGuide(sub) {
    return !!SPORT_GUIDES[sub];
}

/** Canlı sıralama (tours.ATP / tours.WTA) ile birleştirip sıralar. */
export function mergeAthleteRankings(athletes, tours = {}) {
    const map = new Map();
    for (const [tour, list] of Object.entries(tours || {})) {
        for (const p of list || []) {
            const k = normKey(p.key || p.name);
            if (!k) continue;
            map.set(k, { rank: p.rank, tour, points: p.points || null });
        }
    }
    const enriched = (athletes || []).map((a) => {
        const hit = map.get(normKey(a.rankingKey || a.name));
        const worldRank = hit?.rank ?? (a.status === 'active' ? a.fallbackRank : null) ?? null;
        return {
            ...a,
            worldRank,
            tourLabel: hit?.tour || a.tour || null,
            rankLive: !!hit,
        };
    });
    return enriched.sort((a, b) => {
        const ar = a.worldRank != null ? a.worldRank : null;
        const br = b.worldRank != null ? b.worldRank : null;
        if (ar != null && br != null) return ar - br;
        if (ar != null) return -1;
        if (br != null) return 1;
        if (a.status === 'active' && b.status !== 'active') return -1;
        if (b.status === 'active' && a.status !== 'active') return 1;
        return (a.peakRank || 999) - (b.peakRank || 999);
    });
}

const SPORT_SOURCE_BANK = {
    tennis: [
        { label: L('ATP Tour', 'ATP Tour', 'ATP Tour', 'ATP Tour'), url: 'https://www.atptour.com/' },
        { label: L('WTA', 'WTA', 'WTA', 'WTA'), url: 'https://www.wtatennis.com/' },
        { label: L('Olympics — tennis greats', 'Olimpiyat — tenis efsaneleri', 'Олимпиада — легенды тенниса', 'Olympia — Tennis-Legenden'), url: 'https://www.olympics.com/en/news/top-tennis-players-best-men-women-rank-greatest-all-time' },
        { label: L('ESPN Top 20 all-time', 'ESPN tüm zamanlar Top 20', 'ESPN топ-20 всех времён', 'ESPN Top 20 aller Zeiten'), url: 'https://www.espn.com/espn/feature/story/_/id/16371992/tennis-top-20' },
    ],
    padel: [
        { label: L('Premier Padel / FIP', 'Premier Padel / FIP', 'Premier Padel / FIP', 'Premier Padel / FIP'), url: 'https://www.padelfip.com/ranking-history/' },
        { label: L('Padel Magazine — legends', 'Padel Magazine — efsaneler', 'Padel Magazine — легенды', 'Padel Magazine — Legenden'), url: 'https://padel-magazine.co.uk/From-corcuera-to-coello--a-look-back-at-the-legends-who-made-padel/' },
    ],
    badminton: [
        { label: L('BWF', 'BWF', 'BWF', 'BWF'), url: 'https://bwfbadminton.com/' },
        { label: L('Olympics / badminton', 'Olimpiyat / badminton', 'Олимпиада / бадминтон', 'Olympia / Badminton'), url: 'https://www.olympics.com/en/sports/badminton/' },
    ],
    table_tennis: [
        { label: L('ITTF', 'ITTF', 'ITTF', 'ITTF'), url: 'https://www.ittf.com/' },
        { label: L('Olympics / table tennis', 'Olimpiyat / masa tenisi', 'Олимпиада / настольный теннис', 'Olympia / Tischtennis'), url: 'https://www.olympics.com/en/sports/table-tennis/' },
    ],
    pickleball: [
        { label: L('PPA Tour', 'PPA Tour', 'PPA Tour', 'PPA Tour'), url: 'https://www.ppatour.com/' },
        { label: L('Pickleball.com culture', 'Pickleball.com', 'Pickleball.com', 'Pickleball.com'), url: 'https://pickleball.com/culture/who-belongs-on-pickleball-mount-rushmore' },
    ],
    volleyball: [
        { label: L('FIVB', 'FIVB', 'FIVB', 'FIVB'), url: 'https://www.fivb.com/' },
        { label: L('Olympics / volleyball', 'Olimpiyat / voleybol', 'Олимпиада / волейбол', 'Olympia / Volleyball'), url: 'https://www.olympics.com/en/sports/volleyball/' },
    ],
};

function defaultSourcesFor(sub, athlete) {
    const wikiSlug = (athlete.wiki || athlete.name || '')
        .replace(/ /g, '_')
        .replace(/'/g, '%27');
    const wiki = {
        label: L('Wikipedia', 'Wikipedia', 'Википедия', 'Wikipedia'),
        url: `https://en.wikipedia.org/wiki/${wikiSlug}`,
    };
    return [wiki, ...(SPORT_SOURCE_BANK[sub] || [])];
}

export function getSportGuide(sub, lang = 'en') {
    const g = SPORT_GUIDES[sub];
    if (!g) return null;
    const rawAthletes = ATHLETES_BY_SUB[sub] || g.athletes || [];
    return {
        rankingSport: !!g.rankingSport,
        howToPlay: (g.howToPlay || []).map(s => ({
            title: pick(s.title, lang),
            body: pick(s.body, lang),
        })),
        athletes: rawAthletes.map(a => {
            const rawSources = (a.sources && a.sources.length)
                ? a.sources
                : defaultSourcesFor(sub, a);
            return {
            id: a.id,
            name: a.name,
            years: a.years || '',
            country: a.country || '',
            tour: a.tour || null,
            status: a.status || 'active',
            peakRank: a.peakRank ?? null,
            fallbackRank: a.fallbackRank ?? null,
            rankingKey: a.rankingKey || a.name.toLowerCase(),
            bio: pick(a.bio, lang),
            detail: {
                life: pick(a.detail?.life, lang),
                achievements: pick(a.detail?.achievements || a.achievements, lang),
                advice: pick(a.detail?.advice, lang),
                style: pick(a.detail?.style, lang),
            },
            links: (a.links || []).map(l => ({
                label: pick(l.label, lang),
                url: l.url,
            })),
            // Detay modalının en altında gösterilen kaynaklar (Wikipedia + dal kaynakları).
            sources: rawSources.map(s => ({
                label: pick(s.label, lang),
                url: s.url,
            })),
        };
        }),
        bonus: (g.bonus || []).map(b => ({
            title: pick(b.title, lang),
            body: pick(b.body, lang),
            diagram: b.diagram || null,
            imageUrl: b.imageUrl || null,
            imageCredit: pick(b.imageCredit, lang),
            tips: (b.tips || []).map(tip => pick(tip, lang)),
            links: (b.links || []).map(l => ({
                label: pick(l.label, lang),
                url: l.url,
            })),
        })),
    };
}

const SPORT_GUIDES = {
    tennis: {
        rankingSport: true,
        howToPlay: [
            {
                title: L('Court & equipment', 'Kort ve ekipman', 'Корт и инвентарь', 'Platz & Ausrüstung'),
                body: L(
                    'Singles court is 23.77 × 8.23 m; doubles adds alleys to 10.97 m width. Net is 0.914 m at the center. Play with a strung racket and pressurized yellow balls (Stage 1–3 balls for juniors). Outdoor surfaces: clay, hard, grass — each changes bounce and slide.',
                    'Tekler kortu 23,77 × 8,23 m; çiftlerde koridorlarla genişlik 10,97 m olur. File ortada 0,914 m. Raket + basınçlı sarı top (minörlerde Stage 1–3). Açık yüzeyler: toprak, sert, çim — sektirme ve kayma değişir.',
                    'Одиночный корт 23,77 × 8,23 м; в паре с коридорами ширина 10,97 м. Сетка по центру 0,914 м. Ракетка + мячи (для юниоров Stage 1–3). Покрытия: грунт, хард, трава.',
                    'Einzelplatz 23,77 × 8,23 m; Doppel mit Gassen 10,97 m breit. Netzmitte 0,914 m. Schläger + Druckbälle (Jugend Stage 1–3). Beläge: Sand, Hartplatz, Rasen.'
                ),
            },
            {
                title: L('Scoring (game → set → match)', 'Sayı sistemi (oyun → set → maç)', 'Счёт (гейм → сет → матч)', 'Zählweise (Spiel → Satz → Match)'),
                body: L(
                    'Points: 0 → 15 → 30 → 40 → game. Deuce (40–40): need advantage then another point (or no-ad: next point wins). Set: first to 6 games by 2; at 6–6 a tiebreak (usually first to 7 by 2). Match: best of 3 or 5 sets. Announce server’s score first.',
                    'Puan: 0 → 15 → 30 → 40 → oyun. Deuce (40–40): avantaj + bir puan daha (veya no-ad: sonraki puan alır). Set: 2 farkla 6 oyun; 6–6’da tiebreak (genelde 2 farkla 7). Maç: 3 veya 5 setten iyi olan. Önce servis atan skor söylenir.',
                    'Очки: 0 → 15 → 30 → 40 → гейм. Равенство: преимущество + ещё очко (или no-ad). Сет: до 6 с разницей 2; при 6–6 тай-брейк. Матч: до 2 или 3 сетов.',
                    'Punkte: 0 → 15 → 30 → 40 → Spiel. Einstand: Vorteil + Punkt (oder No-Ad). Satz: 6 Spiele mit 2 Diff.; bei 6–6 Tie-Break. Match: Best of 3 oder 5.'
                ),
            },
            {
                title: L('Serve & return', 'Servis ve karşılama', 'Подача и приём', 'Aufschlag & Return'),
                body: L(
                    'Serve from behind the baseline, diagonally into the service box. Feet must not touch the line before contact (foot fault). Two serves per point. Faults: into net, long/wide, or foot fault. Let on the net that then lands in → replay that serve. Return: split-step as the ball is struck; block or drive based on pace.',
                    'Baseline arkasından çapraz servis kutusuna. Temastan önce ayak çizgiye değmez (foot fault). Puan başına 2 servis. Hata: file, dışarı, foot fault. Fileye çarpıp kutuya düşen let → aynı servis tekrar. Karşılama: topa vurulurken split-step; tempolu topu bloke veya drive.',
                    'Подача из-за задней линии по диагонали в квадрат. Две попытки. Лет — переподача. Приём: сплит-степ в момент удара.',
                    'Aufschlag hinter der Grundlinie diagonal. Zwei Versuche. Let = Wiederholung. Return: Split-Step beim Treffpunkt.'
                ),
            },
            {
                title: L('Forehand', 'Forehand (ön el)', 'Форхенд', 'Vorhand'),
                body: L(
                    'Unit turn → racket drops below the ball → low-to-high swing for topspin → contact in front of the body → finish over the shoulder. Semi-western / western grips add spin; eastern is flatter. Weight transfers from back foot to front foot.',
                    'Ünite dönüş → raket topun altına iner → alttan üste topspin salınımı → temas gövdenin önünde → omuz üstü bitiş. Semi-western / western grip spin; eastern daha düz. Ağırlık arka ayaktan öne geçer.',
                    'Поворот корпуса → ракетка ниже мяча → снизу вверх (топспин) → удар впереди → финиш через плечо.',
                    'Unit Turn → Schläger unter den Ball → tief-hoch für Topspin → Treffpunkt vor dem Körper → Finish über der Schulter.'
                ),
            },
            {
                title: L('Backhand (1H / 2H)', 'Backhand (tek / çift el)', 'Бэкхенд (1/2 руки)', 'Rückhand (1H / 2H)'),
                body: L(
                    'Two-handed: left hand drives (for righties), compact and stable on returns. One-handed: longer take-back, contact out front, elegant slice option. Always turn sideways; don’t face the net square.',
                    'Çift el: (sağcılarda) sol el iter, karşılama için kompakt. Tek el: uzun geri çekiş, önde temas, zarif slice seçeneği. Her zaman yana dön; fileye kare bakma.',
                    'Двуручный: компактный и стабильный. Одноручный: длинный замах, контакт впереди, удобный слайс. Всегда боком.',
                    'Beidhändig: kompakt & stabil. Einhändig: langer Aushol, Treffpunkt vorne, Slice-Option. Immer seitlich.'
                ),
            },
            {
                title: L('Serve: flat · slice · kick', 'Servis: düz · slice · kick', 'Подача: плоская · слайс · кик', 'Aufschlag: flat · Slice · Kick'),
                body: L(
                    'Trophy pose → knee bend → up together → pronation through contact. Flat: through the middle for pace. Slice: brush the side (curves wide). Kick/topspin: brush up the back of the ball (high bounce, safer 2nd serve). Aim Wide / Body / T.',
                    'Trophy pose → diz → birlikte yukarı → temasta pronasyon. Düz: tempo için ortadan. Slice: yandan fırça (geniş kıvrılır). Kick: topun arkasını yukarı fırçala (yüksek sektirme, güvenli 2. servis). Hedef: Geniş / Body / T.',
                    'Трофи → сгиб колен → вместе вверх → пронация. Плоская — темп; слайс — в сторону; кик — вверх по мячу.',
                    'Trophy → Knie → zusammen hoch → Pronation. Flat = Tempo; Slice = seitlich; Kick = hoch am Ball.'
                ),
            },
            {
                title: L('Slice', 'Slice (kesik)', 'Слайс', 'Slice'),
                body: L(
                    'High-to-low swing path, open racket face, underspin. Keeps the ball low after the bounce — great for neutralizing pace, approach shots, and defensive floating. Common on the one-handed backhand wing.',
                    'Yukarıdan aşağı salınım, açık raket yüzü, underspin. Sektirmeden sonra topu alçak tutar — tempo kesmek, yaklaşma ve savunma için. Tek el backhand’de sık.',
                    'Сверху вниз, открытая ракетка, подкрут. Низкий отскок — для нейтрализации и выхода.',
                    'Hoch-tief, offene Schlagfläche, Unterschnitt. Hält den Ball tief — Neutralisieren & Herangehen.'
                ),
            },
            {
                title: L('Volley & overhead', 'Vole ve overhead', 'Волей и смэш', 'Volley & Overhead'),
                body: L(
                    'Volley: short punch, no big swing; meet the ball in front; continental grip. Half-volley: scoop just after the bounce. Overhead smash: turn, track the lob, point up with the non-racket arm, hit like a serve.',
                    'Vole: kısa yumruk, büyük salınım yok; topu önde karşıla; continental grip. Half-volley: sektikten hemen sonra. Overhead: dön, lobu takip et, serbest kol yukarı, servis gibi vur.',
                    'Волей: короткий удар, встреча впереди. Полуволей сразу после отскока. Смэш как подача.',
                    'Volley: kurzer Punch, Treffpunkt vorne. Half-Volley direkt nach Absprung. Smash wie Aufschlag.'
                ),
            },
            {
                title: L('Lob & drop shot', 'Lob ve drop shot', 'Лоб и дроп', 'Lob & Dropshot'),
                body: L(
                    'Lob: lift over a net-rushing opponent; offensive lob lands deep; defensive lob buys time. Drop shot: soft touch just over the net — disguise from the same preparation as a drive.',
                    'Lob: fileye gelen rakibin üstünden; ofansif lob derin düşer; defansif lob zaman kazandırır. Drop: file üstünden yumuşak — drive ile aynı hazırlıktan gizle.',
                    'Лоб через вышедшего к сетке; дроп — мягко у сетки, маскируйте замахом.',
                    'Lob über den Netzstürmer; Drop weich übers Netz — aus Drive-Aushol tarne.'
                ),
            },
            {
                title: L('Must-know terms', 'Bilinmesi gereken terimler', 'Важные термины', 'Wichtige Begriffe'),
                body: L(
                    'Ace · Double fault · Break / Break point · Hold · Deuce · Advantage (Ad) · Let · Fault · Foot fault · Tiebreak · No-ad · Split-step · NML (no-man’s-land) · Inside-out / Inside-in · Poach · Unforced error · Winner · Rally · Bagel (6–0) · Breadstick (6–1).',
                    'Ace · Çift hata · Break / Break puanı · Hold · Deuce · Avantaj (Ad) · Let · Fault · Foot fault · Tiebreak · No-ad · Split-step · NML (orta kort boşluğu) · Inside-out / Inside-in · Poach · Unforced error · Winner · Ralli · Bagel (6–0) · Breadstick (6–1).',
                    'Эйс · Двойная ошибка · Брейк · Хоулд · Равенство · Адвантаж · Лет · Фолт · Тай-брейк · Сплит-степ · NML · Инсайд-аут · Поуч · Невьнужденная · Винер.',
                    'Ass · Doppelfehler · Break · Hold · Einstand · Advantage · Let · Fehler · Tie-Break · Split-Step · NML · Inside-out · Poach · Unforced Error · Winner.'
                ),
            },
            {
                title: L('Tactics snapshot', 'Taktik özeti', 'Краткая тактика', 'Taktik-Kurzüberblick'),
                body: L(
                    'Rally from baseline; finish with approach + volley or wrong-foot the opponent. Singles: open the court with angles. Doubles: one at net, communicate “mine/yours”, poach carefully. More maps & patterns live in the Bonus tab.',
                    'Baseline ralli; yaklaşma + vole veya rakibi yanlış ayakta bırak. Tekler: açı ile kort aç. Çiftler: biri filede, “benim/senin”, dikkatli poach. Harita ve kalıplar Bonus sekmesinde.',
                    'Розыгрыш с задней; выход + волей. В паре — один у сетки. Карты — во вкладке Бонус.',
                    'Grundlinienrallye; Herangehen + Volley. Doppel: einer am Netz. Karten im Bonus-Tab.'
                ),
            },
            {
                title: L('Etiquette', 'Centilmenlik', 'Этикет', 'Etikette'),
                body: L(
                    'Call lines honestly on your side; replay if unsure. Don’t walk behind a court mid-point. Balls to the server between points. Shake hands / racket tap after the match. Quiet during the point.',
                    'Kendi tarafındaki çizgiyi dürüst söyle; emin değilsen tekrarla. Puan ortasında kort arkasına geçme. Topları servis atana ver. Maç sonu el / raket tokalaşması. Puan sırasında sessiz ol.',
                    'Честно судите линии на своей половине. Не ходите за кортом во время розыгрыша. Мячи подающему. Рукопожатие после матча.',
                    'Linien auf der eigenen Seite ehrlich. Nicht hinter dem Platz während des Punkts. Bälle zum Aufschläger. Handshake danach.'
                ),
            },
        ],
        // Sporcular: sportGuideAthletes.js (ATHLETES_BY_SUB.tennis)
        bonus: [
            {
                title: L('Films & series to watch', 'İzlenebilecek film & diziler', 'Фильмы и сериалы', 'Filme & Serien'),
                body: L(
                    'Story + tennis culture picks (stream where available in your country). Documentaries teach patterns; dramas are mood — not technique manuals.',
                    'Hikâye + tenis kültürü seçkisi (ülkendeki platformlara göre). Belgeseller kalıp öğretir; dramalar ruh hali — teknik el kitabı değil.',
                    'Истории и культура тенниса. Документалки полезнее для паттернов, чем художественные фильмы.',
                    'Story & Tennis-Kultur. Dokus helfen bei Mustern mehr als Spielfilme.'
                ),
                tips: [
                    L('King Richard (2021) — Williams sisters origin', 'King Richard (2021) — Williams kardeşlerin çıkışı', 'King Richard (2021) — путь сестёр Уильямс', 'King Richard (2021) — Williams-Schwestern'),
                    L('Borg vs McEnroe (2017) — rivalry & freeze-frame tension', 'Borg vs McEnroe (2017) — rekabet ve gerilim', 'Borg vs McEnroe (2017) — соперничество', 'Borg vs McEnroe (2017) — Rivalität'),
                    L('Battle of the Sexes (2017) — King vs Riggs, 1973', 'Battle of the Sexes (2017) — King vs Riggs, 1973', 'Battle of the Sexes (2017) — King против Riggs', 'Battle of the Sexes (2017) — King vs. Riggs'),
                    L('Challengers (2024) — modern tour psychology', 'Challengers (2024) — modern tur psikolojisi', 'Challengers (2024) — психология тура', 'Challengers (2024) — Tour-Psychologie'),
                    L('Wimbledon (2004) — light rom-com on grass', 'Wimbledon (2004) — çimde hafif romantik komedi', 'Wimbledon (2004) — лёгкая комедия на траве', 'Wimbledon (2004) — leichte Rasen-RomCom'),
                    L('Break Point (Netflix) — behind-the-scenes tour life', 'Break Point (Netflix) — turun arkası', 'Break Point (Netflix) — закулисье тура', 'Break Point (Netflix) — Tour hinter den Kulissen'),
                ],
                links: [
                    { label: L('MIT OCW — stroke photo galleries (free)', 'MIT OCW — vuruş foto galerileri (ücretsiz)', 'MIT OCW — галереи ударов (бесплатно)', 'MIT OCW — Schlag-Galerien (kostenlos)'), url: 'https://ocw.mit.edu/courses/pe-710-tennis-spring-2007/pages/image-galleries/' },
                    { label: L('Wikimedia — Tennis shots (CC photos)', 'Wikimedia — Tenis vuruşları (CC foto)', 'Wikimedia — удары (CC фото)', 'Wikimedia — Schläge (CC-Fotos)'), url: 'https://commons.wikimedia.org/wiki/Category:Tennis_shots' },
                ],
            },
            {
                title: L('Forehand — visual phases', 'Forehand — görsel fazlar', 'Форхенд — фазы', 'Vorhand — Phasen'),
                body: L(
                    'Schematic of the three teaching phases. Pair with MIT OCW / Commons photos for real-player frames — there is no free “stroke diagram API”; we draw this in-app.',
                    'Üç öğretim fazının şeması. Gerçek kareler için MIT OCW / Commons fotoğraflarına bak — ücretsiz “vuruş diyagramı API”si yok; şema uygulama içi.',
                    'Три фазы обучения. Реальные кадры — MIT OCW / Commons. Бесплатного API схем ударов нет.',
                    'Drei Lehrphasen. Echte Fotos: MIT OCW / Commons. Kein kostenloses Schlag-Diagramm-API.'
                ),
                diagram: 'stroke_forehand',
                tips: [
                    L('Phase 1 Preparation · 2 Contact out front · 3 Follow-through', '1 Hazırlık · 2 Önde temas · 3 Bitiş', '1 Замах · 2 Контакт впереди · 3 Проводка', '1 Aushol · 2 Treffpunkt vorne · 3 Ausschwung'),
                ],
                imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/9/99/Tennis_forehand_by_random_dave.jpeg',
                imageCredit: L('Photo: Ben Lancaster / CC BY 2.0 (Wikimedia)', 'Foto: Ben Lancaster / CC BY 2.0 (Wikimedia)', 'Фото: Ben Lancaster / CC BY 2.0 (Wikimedia)', 'Foto: Ben Lancaster / CC BY 2.0 (Wikimedia)'),
            },
            {
                title: L('Backhand — visual phases', 'Backhand — görsel fazlar', 'Бэкхенд — фазы', 'Rückhand — Phasen'),
                body: L(
                    'Two-hand drive path vs one-hand slice path. Contact still out in front; finish across or over the shoulder.',
                    'Çift el drive yolu vs tek el slice yolu. Temas yine önde; bitiş çapraz veya omuz üstü.',
                    'Двуручный драйв vs одноручный слайс. Контакт впереди.',
                    'Beidhändiger Drive vs. einhändiger Slice. Treffpunkt vorne.'
                ),
                diagram: 'stroke_backhand',
                imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/4/4e/Andy_Murray_Backhand.jpg',
                imageCredit: L('Photo: Wikimedia Commons (see file page for license)', 'Foto: Wikimedia Commons (lisans için dosya sayfası)', 'Фото: Wikimedia Commons (лицензия на странице файла)', 'Foto: Wikimedia Commons (Lizenz auf der Dateiseite)'),
            },
            {
                title: L('Serve — visual phases', 'Servis — görsel fazlar', 'Подача — фазы', 'Aufschlag — Phasen'),
                body: L(
                    'Trophy → launch → contact above the head → pronation finish. Targets Wide / Body / T are on the serve-box diagram below in tactics.',
                    'Trophy → fırlatış → kafa üstü temas → pronasyon bitişi. Geniş / Body / T hedefleri aşağıdaki taktik diyagramında.',
                    'Трофи → подброс → контакт над головой → пронация.',
                    'Trophy → Wurf → Treffpunkt über dem Kopf → Pronation.'
                ),
                diagram: 'stroke_serve',
            },
            {
                title: L('Slice — visual path', 'Slice — görsel yol', 'Слайс — траектория', 'Slice — Bahn'),
                body: L(
                    'High-to-low brush; ball stays low after bounce. Use to change rhythm or approach the net behind a skidding ball.',
                    'Yukarıdan aşağı fırça; sektikten sonra top alçak kalır. Ritim bozmak veya kayan topun ardından fileye gelmek için.',
                    'Сверху вниз; низкий отскок. Смена ритма или выход к сетке.',
                    'Hoch-tief; tiefer Absprung. Rhythmuswechsel oder Netzangriff.'
                ),
                diagram: 'stroke_slice',
            },
            {
                title: L('Volley — visual punch', 'Vole — görsel yumruk', 'Волей — короткий удар', 'Volley — Punch'),
                body: L(
                    'No loop: block / punch in front of the body. Soft hands on low balls; firm on shoulder-height sitters.',
                    'Döngü yok: gövdenin önünde bloke / yumruk. Alçak toplarda yumuşak el; omuz hizasında sıkı.',
                    'Без большого замаха: блок/панч впереди.',
                    'Kein Loop: Block/Punch vor dem Körper.'
                ),
                diagram: 'stroke_volley',
            },
            {
                title: L('Court zones (tactical map)', 'Kort bölgeleri (taktik harita)', 'Зоны корта (тактика)', 'Platzzonen (Taktik)'),
                body: L(
                    'Own the “T” and the center behind the baseline. Force the opponent wide, then hit into the open court. Avoid getting stuck in no-man’s-land (mid-court) without a finishing plan.',
                    '“T” ve baseline arkasındaki merkezi kontrol et. Rakibi dışarı aç, sonra boş korta vur. Bitirme planı olmadan no-man’s-land’de (orta kort) kalma.',
                    'Контролируйте «Т» и центр у задней линии. Уводите соперника в угол, затем в открытый корт. Не зависайте в середине без плана.',
                    '„T“ und Mitte hinter der Grundlinie kontrollieren. Gegner breit ziehen, dann in die Lücke. Nicht ohne Plan im Mittelfeld stecken bleiben.'
                ),
                diagram: 'tennis_court',
                tips: [
                    L('Serve wide → next ball into open side', 'Geniş servis → sonraki top açık tarafa', 'Широкая подача → следующий удар в открытую сторону', 'Weit aufschlagen → nächster Ball in die offene Seite'),
                    L('On clay: higher bounce → set up with heavy topspin', 'Toprakta: yüksek sektirme → ağır topspin ile kur', 'На грунте: высокий отскок → тяжёлый топспин', 'Auf Sand: hoher Absprung → mit Topspin vorbereiten'),
                    L('On grass: shorter points → first-strike tennis', 'Çimde: kısa puanlar → ilk vuruş agresyonu', 'На траве: короткие розыгрыши → агрессия с первого удара', 'Auf Rasen: kurze Punkte → First-Strike'),
                ],
            },
            {
                title: L('Serve patterns that win free points', 'Bedava puan getiren servis kalıpları', 'Схемы подач под «бесплатные» очки', 'Aufschlagmuster für Free Points'),
                body: L(
                    'Mix body serves (jam the elbow) with wide and T. On ad court, a lefty’s wide serve opens the forehand alley; righties often go T on break points. Track opponent’s weaker return wing.',
                    'Body (dirseği sıkıştır), geniş ve T’yi karıştır. Avantaj kortunda solak geniş servis forehand koridorunu açar; sağcılar break puanında sık T’ye gider. Rakibin zayıf karşılama kanadını takip et.',
                    'Чередуйте подачу в корпус, широко и в T. На приёме следите за слабым ударом соперника.',
                    'Body, weit und T mischen. Schwächeren Return-Flügel des Gegners ausnutzen.'
                ),
                diagram: 'serve_targets',
                tips: [
                    L('Second serve: kick high to the backhand', 'İkinci servis: backhand’e yüksek kick', 'Вторая: кик высоко в бэкхенд', 'Zweiter Aufschlag: Kick hoch auf die Rückhand'),
                    L('Change direction only when balanced', 'Yönü sadece dengeliyken değiştir', 'Меняйте направление только в балансе', 'Richtung nur aus der Balance wechseln'),
                ],
            },
            {
                title: L('Rare IQ: between-the-legs & wrong-foot', 'Nadir IQ: bacak arası ve yanlış ayak', 'Редкий IQ: между ног и «не та нога»', 'Rares IQ: Twix & Wrong-Foot'),
                body: L(
                    'Hot-dog (tweeners) are last-resort lobs when sprinting past the ball. Wrong-foot: hit behind a recovering opponent who already planted to cover the open court — classic Federer/Nadal pattern on clay.',
                    'Hot-dog (tweener) topu geçtikten sonra son çare lobdur. Wrong-foot: açık kortu kapatmak için ayağını basmış rakibin arkasına vur — toprak klasikleri Federer/Nadal.',
                    'Твинер — крайний лоб. Wrong-foot — удар за спину сопернику, уже закрывшему открытый корт.',
                    'Tweener nur als Not-Lob. Wrong-Foot: hinter den schon gesetzten Gegner spielen.'
                ),
                tips: [
                    L('Disguise drop shots from the same swing path as a drive', 'Drop’u drive ile aynı salınım yolundan gizle', 'Маскируйте дроп тем же замахом, что и удар', 'Drop aus derselben Schwungbahn wie der Drive tarne'),
                ],
            },
        ],
    },

    padel: {
        howToPlay: [
            {
                title: L('Court & walls', 'Kort ve duvarlar', 'Корт и стены', 'Platz & Wände'),
                body: L(
                    'Enclosed 20 × 10 m court with glass/mesh walls. Ball may bounce off walls after the first bounce on the floor. Solid perforated paddles (no strings). Underhand serve from waist height or below.',
                    '20 × 10 m kapalı kort (cam/tel). Top ilk yer sektirmesinden sonra duvardan oynanabilir. Delikli katı padel raketi (tel yok). Bel hizasından veya altından alttan servis.',
                    'Корт 20 × 10 м со стенами. После первого отскока можно играть от стенок. Ракетка без струн. Подача снизу не выше пояса.',
                    '20 × 10 m mit Wänden. Nach erstem Bodenabsprung Spiel von der Wand erlaubt. Solider Padel-Schläger. Aufschlag von unten max. Hüfthöhe.'
                ),
            },
            {
                title: L('Scoring & doubles', 'Sayı ve çiftler', 'Счёт и пара', 'Zählweise & Doppel'),
                body: L(
                    'Same point system as tennis (15-30-40). Almost always doubles. Net play and bandeja/vibora overheads are core. Let the ball die in the corner or smash after a high lob.',
                    'Tenisle aynı puan (15-30-40). Neredeyse hep çiftler. File oyunu ve bandeja/vibora overhead’ler temel. Topu köşede öldür veya yüksek lob sonrası smaç.',
                    'Счёт как в теннисе. Почти всегда пара. Игра у сетки, бандеха/вибора. Убивайте мяч в углу или смэш после лоба.',
                    'Zählweise wie Tennis. Fast immer Doppel. Netzspiel, Bandeja/Vibora. Ball in der Ecke töten oder Smash nach Lob.'
                ),
            },
        ],bonus: [
            {
                title: L('Glass geometry', 'Cam geometrisi', 'Геометрия стекла', 'Glas-Geometrie'),
                body: L(
                    'Read the rebound angle: deep lobs that kiss the back glass often sit up for a bandeja. Fake the smash, then drop soft into the fence corner.',
                    'Sekme açısını oku: arka cama değen derin loblar bandeja için yükselir. Smaç numarası yap, sonra tel köşesine yumuşak drop.',
                    'Читайте угол отскока от стекла. Финт смэша → мягкий дроп в угол.',
                    'Absprungwinkel am Glas lesen. Smash vortäuschen → weicher Drop in die Ecke.'
                ),
                diagram: 'padel_zones',
                tips: [
                    L('Left player often finishes; right builds', 'Sol genellikle bitirir; sağ kurar', 'Левый чаще завершает, правый строит', 'Links schließt oft ab; rechts baut auf'),
                ],
            },
        ],
    },

    badminton: {
        howToPlay: [
            {
                title: L('Court & shuttle', 'Kort ve volan', 'Корт и волан', 'Feld & Federball'),
                body: L(
                    'Court 13.4 × 6.1 m (doubles width). Feather or nylon shuttle. Very fast reaction sport — smash can exceed 400 km/h in elite play. Serve must be underhand and below the rib line under modern rules.',
                    'Kort 13,4 × 6,1 m (çift genişliği). Tüy veya naylon volan. Çok hızlı reaksiyon — elit smaç 400 km/s’yi aşabilir. Servis alttan ve modern kurallarda kaburga hizasının altında.',
                    'Корт 13,4 × 6,1 м. Волан. Подача снизу. Элитный смэш >400 км/ч.',
                    'Feld 13,4 × 6,1 m. Federball. Aufschlag von unten. Elite-Smash >400 km/h.'
                ),
            },
            {
                title: L('Scoring', 'Sayı', 'Счёт', 'Zählweise'),
                body: L(
                    'Rally point to 21; must win by 2; cap often at 30. Change ends each game; in the 3rd game at 11. Singles and doubles have slightly different service courts.',
                    'Ralli sayı 21’e; 2 fark; tavan genelde 30. Her set sonunda saha değiş; 3. sette 11’de. Tek/çift servis alanları biraz farklı.',
                    'До 21, разница 2, потолок часто 30. Смена сторон.',
                    'Bis 21, 2 Differenz, oft Cap 30. Seitenwechsel.'
                ),
            },
        ],bonus: [
            {
                title: L('Deception & length', 'Aldatma ve derinlik', 'Обман и глубина', 'Täuschung & Länge'),
                body: L(
                    'Same preparation for drop and clear; disguise late. Push the opponent to the four corners; attack when they are stretched.',
                    'Drop ve clear için aynı hazırlık; geç gizle. Rakibi dört köşeye it; gerildiğinde saldır.',
                    'Одинаковый замах для дропа и клира. Гоняйте по углам.',
                    'Gleicher Aushol für Drop und Clear. Gegner in die Ecken treiben.'
                ),
                tips: [
                    L('Net kill only when shuttle is above the tape', 'File kill sadece volan bandın üstündeyken', 'Убийство у сетки — только если волан выше ленты', 'Netz-Kill nur wenn der Ball über dem Band ist'),
                ],
            },
        ],
    },

    table_tennis: {
        howToPlay: [
            {
                title: L('Table & rules', 'Masa ve kurallar', 'Стол и правила', 'Tisch & Regeln'),
                body: L(
                    'Table 2.74 × 1.525 m, net 15.25 cm. Serve must bounce on your side then opponent’s; toss ≥16 cm visible. Game to 11, win by 2. Alternate serve every 2 points (every 1 at deuce).',
                    'Masa 2,74 × 1,525 m, file 15,25 cm. Servis önce senin tarafta sonra rakipte sekmeli; ≥16 cm görünür toss. Oyun 11, 2 fark. Her 2 puanda servis değiş (deuce’ta 1’er).',
                    'Стол 2,74 × 1,525 м. Подача: отскок у себя, затем у соперника. До 11, разница 2.',
                    'Tisch 2,74 × 1,525 m. Aufschlag muss auf beiden Seiten aufkommen. Bis 11, 2 Diff.'
                ),
            },
            {
                title: L('Spin language', 'Spin dili', 'Язык вращения', 'Spin-Sprache'),
                body: L(
                    'Topspin loops, backspin pushes/chops, sidespin serves. Read rubber color and contact; adjust racket angle (close for topspin, open for backspin).',
                    'Topspin loop, backspin push/chop, sidespin servis. Lastik rengi ve teması oku; raket açısını ayarla (topspin’de kapat, backspin’de aç).',
                    'Топспин, подрезка, сайдспин. Читайте контакт и угол ракетки.',
                    'Topspin, Backspin, Sidespin. Schlägerwinkel anpassen.'
                ),
            },
        ],bonus: [
            {
                title: L('Serve receive triangle', 'Servis karşılama üçgeni', 'Треугольник приёма', 'Return-Dreieck'),
                body: L(
                    'Stand ready to cover short, half-long and long serves. Soft hands on short backspin; step in early. Attack half-long serves before they bounce twice.',
                    'Kısa, yarı uzun ve uzun servisi karşılayacak hazırlık. Kısa backspin’de yumuşak el; erken gir. Yarı uzun servisi ikinci sektirmeden saldır.',
                    'Готовьтесь к короткой, полудлинной и длинной подаче. Атакуйте полудлинные до второго отскока.',
                    'Kurz, halblang, lang abdecken. Halblange vor dem 2. Absprung angreifen.'
                ),
                diagram: 'tt_serve',
                tips: [
                    L('Hide serve with shoulder + toss variation', 'Servisi omuz + toss varyasyonuyla gizle', 'Маскируйте подачу плечом и подбросом', 'Aufschlag mit Schulter + Wurf tarne'),
                ],
            },
        ],
    },

    pickleball: {
        howToPlay: [
            {
                title: L('Court & kitchen', 'Kort ve kitchen', 'Корт и kitchen', 'Feld & Kitchen'),
                body: L(
                    '20 × 44 ft court. Non-volley zone (“kitchen”) extends 7 ft from the net — you may not volley while touching it. Underhand serve; two-bounce rule (serve and return must bounce once each) before volleys.',
                    '20 × 44 ft kort. Non-volley zone (“kitchen”) fileden 7 ft — içinde vole yasak (ayak değiyorsa). Alttan servis; iki sektirme kuralı (servis ve karşılama birer kez sektikten sonra vole).',
                    'Корт 20×44 фута. Зона kitchen — нельзя волей, касаясь её. Подача снизу; правило двух отскоков.',
                    '20×44 ft. Kitchen: kein Volley bei Berührung. Aufschlag von unten; Zwei-Absprung-Regel.'
                ),
            },
            {
                title: L('Scoring (classic)', 'Sayı (klasik)', 'Счёт (классика)', 'Zählweise (klassisch)'),
                body: L(
                    'Only the serving side scores (traditional side-out scoring) to 11/15/21 by 2 — many clubs now use rally scoring; check local rules. Soft game at the kitchen line wins more than pure power.',
                    'Klasikte sadece servis tarafı sayı alır (side-out) 11/15/21, 2 fark — birçok kulüp rally scoring kullanır; yerel kurala bak. Kitchen çizgisinde soft oyun, saf güçten daha çok kazanır.',
                    'Классика: очки только у подающих. Часто уже rally scoring. Мягкая игра у kitchen важнее силы.',
                    'Klassisch: nur Aufschläger punkten. Oft schon Rally-Scoring. Soft am Kitchen schlägt reine Power.'
                ),
            },
        ],bonus: [
            {
                title: L('Dink battles', 'Dink savaşları', 'Битвы динков', 'Dink-Duelle'),
                body: L(
                    'Keep dinks low over the net so the opponent cannot speed up. When you speed up, aim at the hip/shoulder and be ready for the counter.',
                    'Dink’leri file üzerinden alçak tut ki rakip hızlandıramasın. Hızlandırınca kalça/omuza nişan al, kontra için hazır ol.',
                    'Держите динки низко. Ускоряясь — в корпус, готовьтесь к контрудару.',
                    'Dinks flach halten. Beim Tempo: auf Hüfte/Schulter, Konter erwarten.'
                ),
                diagram: 'pickle_kitchen',
                tips: [
                    L('Third-shot drop resets you to the NVZ', 'Üçüncü vuruş drop seni NVZ’ye getirir', 'Третий удар-дроп возвращает к kitchen', 'Third-Shot-Drop bringt euch an die NVZ'),
                ],
            },
        ],
    },

    squash: {
        howToPlay: [
            {
                title: L('Court & tin', 'Kort ve tin', 'Корт и tin', 'Feld & Tin'),
                body: L(
                    'Four-wall indoor court. Ball must hit the front wall above the tin (metal strip) and below the out line. Side and back walls are in play. Serve from alternate boxes; after the serve, either player may volley.',
                    'Dört duvarlı kapalı kort. Top ön duvara tin’in (metal şerit) üstünden ve out çizgisinin altından çarpmalı. Yan ve arka duvarlar oyunda. Servis sırayla kutulardan; servisten sonra vole serbest.',
                    'Четыре стены. Мяч — в переднюю стену выше tin и ниже out. Боковые и задняя в игре. Подача из боксов по очереди.',
                    'Vier-Wand-Halle. Ball an die Frontwand über dem Tin, unter der Out-Linie. Seiten- und Rückwand spielen. Aufschlag abwechselnd aus den Boxen.'
                ),
            },
            {
                title: L('PAR scoring to 11', 'PAR sayı 11’e', 'PAR до 11', 'PAR bis 11'),
                body: L(
                    'Point-a-rally (PAR) to 11 — every rally scores; must win by 2 if tied 10–10. Older “hand-in / hand-out” scoring still appears in some clubs; ask before you play.',
                    'Point-a-rally (PAR) 11’e — her ralli sayı; 10–10’da 2 fark gerekir. Eski “hand-in / hand-out” bazı kulüplerde hâlâ var; oynamadan sorun.',
                    'PAR до 11 — каждый розыгрыш очко; при 10–10 нужна разница 2. Старый hand-in/out ещё встречается.',
                    'PAR bis 11 — jeder Ballwechsel zählt; bei 10–10 Differenz 2. Altes Hand-in/out gibt es noch in manchen Clubs.'
                ),
            },
        ],
        bonus: [
            {
                title: L('Boast, rails & length', 'Boast, ray ve uzunluk', 'Boast, рейлы и длина', 'Boast, Rails & Länge'),
                body: L(
                    'A boast uses a side wall then front wall to recover or create an angle. Drive deep to the back corners (length); volley when you can to take time away. Keep clear of your opponent’s swing — let calls and interference are part of the game.',
                    'Boast: yan duvar → ön duvar (kurtarma veya açı). Derin arka köşelere (uzunluk) vur; vole ile rakibin zamanını çal. Rakibin vuruş alanını boş bırak — let / interference oyunun parçası.',
                    'Boast: боковая → передняя. Длина в задние углы; волей, когда можно. Не мешайте замаху — let/interference норма.',
                    'Boast: Seitenwand → Front. Länge in die hinteren Ecken; Volley nehmen Zeit. Freiraum lassen — Let/Interference gehört dazu.'
                ),
                tips: [
                    L('Watch the tin — soft length beats a tin error', 'Tin’e dikkat — yumuşak uzunluk, tin hatasından iyidir', 'Смотрите tin — мягкая длина лучше ошибки в tin', 'Tin im Blick — weiche Länge schlägt Tin-Fehler'),
                ],
            },
        ],
    },

    volleyball: {
        howToPlay: [
            {
                title: L('Court & rotations', 'Saha ve rotasyon', 'Площадка и ротация', 'Feld & Rotation'),
                body: L(
                    '18 × 9 m court, net ~2.43 m men / ~2.24 m women. Six players; rotate clockwise when your team wins the right to serve. Libero specializes in back-row defense (restricted attack/serve).',
                    '18 × 9 m saha, file ~2,43 m erkek / ~2,24 m kadın. Altı oyuncu; servis hakkını kazanınca saat yönünde rotasyon. Libero arka savunma uzmanı (saldırı/servis kısıtlı).',
                    'Площадка 18×9 м. Шесть игроков, ротация по часовой. Либеро — защита 2-й линии.',
                    'Feld 18×9 m. Sechs Spieler, Rotation im Uhrzeigersinn. Libero = Abwehrspezialist.'
                ),
            },
            {
                title: L('Rally & contacts', 'Ralli ve temalar', 'Розыгрыш и касания', 'Ballwechsel & Kontakte'),
                body: L(
                    'Max three contacts per side (block touch doesn’t count as team contact in FIVB rules). Typical sequence: pass (bump) → set → attack (spike). Let the ball cross; play clean — no catch/throw.',
                    'Taraf başına en fazla 3 temas (FIVB’de blok takım teması sayılmaz). Tipik: pas (manşet) → smaç pası → hücum. Topu tutup atmak yok.',
                    'Макс. 3 касания. Пас → передача → атака. Без захвата мяча.',
                    'Max. 3 Kontakte. Annahme → Zuspiel → Angriff. Kein Fangen/Werfen.'
                ),
            },
            {
                title: L('Scoring', 'Sayı', 'Счёт', 'Zählweise'),
                body: L(
                    'Rally scoring to 25 (must win by 2); deciding set often to 15. Side-out era is gone at elite level — every rally scores.',
                    'Ralli sayı 25 (2 fark); karar seti genelde 15. Elitte side-out yok — her ralli sayı.',
                    'До 25 (разница 2); решающий часто до 15.',
                    'Bis 25 (2 Diff.); Entscheidungssatz oft bis 15.'
                ),
            },
        ],bonus: [
            {
                title: L('Block read & tip', 'Blok okuma ve tip', 'Чтение блока и скидка', 'Block lesen & Tip'),
                body: L(
                    'Hitters read the block seam; tip over the hands when the double is late. Setters disguise dump vs high ball. Serve tough to the weak passer seam.',
                    'Smaçör blok boşluğunu okur; çift blok geç kalırsa ellerin üzerinden tip. Pasör dump ile yüksek topu gizler. Zayıf pasör boşluğuna sert servis.',
                    'Атакующий читает шов блока; скидка поверх рук. Жёсткая подача в шов приёма.',
                    'Angreifer liest Block-Naht; Tip über die Hände. Hart auf die Annahme-Naht aufschlagen.'
                ),
                diagram: 'vb_court',
                tips: [
                    L('Middle tempo (1) beats a slow slide block', 'Orta tempo (1) yavaş slide bloğu geçer', 'Темп 1 бьёт медленный блок', 'Tempo-1 schlägt langsamen Slide-Block'),
                ],
            },
        ],
    },
};

export default SPORT_GUIDES;
