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
        athletes: rawAthletes.map(a => ({
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
        })),
        bonus: (g.bonus || []).map(b => ({
            title: pick(b.title, lang),
            body: pick(b.body, lang),
            diagram: b.diagram || null,
            tips: (b.tips || []).map(t => pick(t, lang)),
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
                title: L('Basic strokes & tactics', 'Temel vuruşlar ve taktik', 'Удары и тактика', 'Grundschläge & Taktik'),
                body: L(
                    'Forehand / backhand (one- or two-handed), volley at net, overhead smash, drop shot, lob. Rally from baseline; finish with approach + volley or wrong-foot the opponent. Singles: open the court with angles; doubles: one at net, communicate “mine/yours”, poach carefully.',
                    'Forehand / backhand (tek veya çift el), filede vole, overhead smaç, drop, lob. Baseline ralli; yaklaşma + vole veya rakibi yanlış ayakta bırakma. Tekler: açı ile kort aç; çiftler: biri filede, “benim/senin”, dikkatli poach.',
                    'Форхенд/бэкхенд, волей у сетки, смэш, дроп, лоб. С задней линии; выход + волей. В паре: один у сетки, коммуникация.',
                    'Vorhand/Rückhand, Volley, Smash, Drop, Lob. Grundlinienrallye; Herangehen + Volley. Doppel: einer am Netz, absprechen.'
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
