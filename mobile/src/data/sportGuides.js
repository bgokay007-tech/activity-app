/** Spor dalı rehberi — Nasıl oynanır / Önemli sporcular / Bonus.
 *  Metinler en+tr+ru+de; UI etiketleri i18n'de. Linkler harici (Linking.openURL). */

const L = (en, tr, ru, de) => ({ en, tr, ru, de });

function pick(obj, lang) {
    if (!obj) return '';
    if (typeof obj === 'string') return obj;
    return obj[lang] || obj.en || obj.tr || '';
}

export function hasSportGuide(sub) {
    return !!SPORT_GUIDES[sub];
}

export function getSportGuide(sub, lang = 'en') {
    const g = SPORT_GUIDES[sub];
    if (!g) return null;
    return {
        howToPlay: (g.howToPlay || []).map(s => ({
            title: pick(s.title, lang),
            body: pick(s.body, lang),
        })),
        athletes: (g.athletes || []).map(a => ({
            name: a.name,
            years: a.years || '',
            bio: pick(a.bio, lang),
            achievements: pick(a.achievements, lang),
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
        athletes: [
            {
                name: 'Roger Federer',
                years: '1981–',
                bio: L(
                    'Swiss all-courter known for fluid one-handed backhand, serve-and-volley elegance and sportsmanship. Dominated the 2000s; rivalries with Nadal and Djokovic defined an era.',
                    'İsviçreli all-court oyuncu; akıcı tek elli backhand, zarif serve-volley ve sportmenlik. 2000’lerde baskın; Nadal ve Djokovic rekabetleri bir dönemi tanımladı.',
                    'Швейцарец, мастер всех покрытий: одноручный бэкхенд, элегантный стиль. Доминировал в 2000-х; эра соперничества с Надалем и Джоковичем.',
                    'Schweizer Allcourter mit flüssiger einhändiger Rückhand und Eleganz. Dominanz in den 2000ern; Rivalitäten mit Nadal und Djokovic.'
                ),
                achievements: L(
                    '20 Grand Slam singles titles; 8 Wimbledon; 103 ATP titles; held #1 for 310 weeks; Olympic doubles gold (2008) with Wawrinka.',
                    '20 Grand Slam tekler; 8 Wimbledon; 103 ATP unvanı; 310 hafta 1 numara; 2008 Olimpiyat çiftler altını (Wawrinka ile).',
                    '20 титулов Grand Slam; 8 Уимблдонов; 103 титула ATP; 310 недель №1; олимпийское золото в паре (2008).',
                    '20 Grand-Slam-Einzeltitel; 8× Wimbledon; 103 ATP-Titel; 310 Wochen Nr. 1; Olympia-Gold Doppel 2008.'
                ),
                links: [
                    { label: L('Retirement speech (Laver Cup)', 'Emeklilik konuşması (Laver Cup)', 'Речь об уходе (Laver Cup)', 'Abschiedsrede (Laver Cup)'), url: 'https://www.youtube.com/watch?v=nCqHhuGgB_o' },
                    { label: L('Interview: legacy & rivals', 'Röportaj: miras ve rakipler', 'Интервью: наследие и соперники', 'Interview: Vermächtnis & Rivalen'), url: 'https://www.youtube.com/watch?v=YxqQv0kNqHk' },
                ],
            },
            {
                name: 'Rafael Nadal',
                years: '1986–',
                bio: L(
                    'Spanish lefty clay king with extreme topspin forehand, relentless defense and fighting spirit. “Vamos” energy and physical intensity changed modern baseline tennis.',
                    'İspanyol solak toprak kralı; aşırı topspin forehand, amansız savunma ve savaşçı ruh. “Vamos” enerjisi modern baseline tenisini değiştirdi.',
                    'Испанский левша, король грунта: экстремальный топспин, железная защита. Энергия «Vamos» изменила современный теннис.',
                    'Spanischer Linkshänder, König auf Sand: extremes Topspin, unermüdliche Defence. „Vamos“-Energie prägte den modernen Tennis.'
                ),
                achievements: L(
                    '22 Grand Slams; 14 French Opens (record); Olympic singles gold (2008); Davis Cup hero for Spain.',
                    '22 Grand Slam; 14 Fransa Açık (rekor); 2008 Olimpiyat tekler altını; İspanya Davis Cup kahramanı.',
                    '22 Grand Slam; 14 Roland Garros (рекорд); олимпийское золото 2008; герой Кубка Дэвиса.',
                    '22 Grand Slams; 14× Roland Garros (Rekord); Olympia-Gold 2008; Davis-Cup-Held.'
                ),
                links: [
                    { label: L('Talk on mentality & clay', 'Zihniyet ve toprak üzerine', 'О менталитете и грунте', 'Über Mentalität & Sand'), url: 'https://www.youtube.com/watch?v=0mS8q5Z2h1s' },
                ],
            },
            {
                name: 'Novak Djokovic',
                years: '1987–',
                bio: L(
                    'Serbian return specialist and flexibility icon. Elite backhand down-the-line, mental toughness in fifth sets, and the most complete defensive-to-offensive transition of his generation.',
                    'Sırp karşılama ustası ve esneklik ikonu. Çizgi üstü backhand, 5. setlerde mental güç, kuşağının en bütün savunma→hücum geçişi.',
                    'Серб, мастер приёма и гибкости. Бэкхенд по линии, ментальная сила в пятых сетах.',
                    'Serbe, Return- und Flexibilitätsspezialist. Rückhand longline, mentale Stärke im 5. Satz.'
                ),
                achievements: L(
                    'Most men’s Grand Slam singles titles in the Open Era; career Golden Masters; record weeks at #1; Olympic gold (2024).',
                    'Open Era’da en çok erkek Grand Slam tekler unvanı; kariyer Golden Masters; rekor hafta 1 numara; 2024 Olimpiyat altını.',
                    'Рекорд Grand Slam среди мужчин Open Era; Career Golden Masters; рекорд недель №1; золото ОИ-2024.',
                    'Meiste Herren-Grand-Slams der Open Era; Career Golden Masters; Rekordwochen Nr. 1; Olympia-Gold 2024.'
                ),
                links: [
                    { label: L('Press talk after major final', 'Büyük final sonrası basın', 'Пресс-конференция после финала', 'Presse nach Grand-Slam-Finale'), url: 'https://www.youtube.com/watch?v=JQw8Z8qZ8qE' },
                ],
            },
            {
                name: 'Serena Williams',
                years: '1981–',
                bio: L(
                    'American power game redefined women’s tennis: crushing serve, aggressive returns, clutch mentality. Cultural icon beyond sport.',
                    'Amerikan güç oyunu kadın tenisni yeniden tanımladı: ezici servis, agresif karşılama, kritik anlarda soğukkanlılık. Spor dışı kültür ikonu.',
                    'Американка изменила женский теннис мощной подачей и агрессией. Икона культуры.',
                    'US-Powergame: vernichtender Aufschlag, aggressive Returns. Ikone weit über den Sport hinaus.'
                ),
                achievements: L(
                    '23 Grand Slam singles; 14 doubles with Venus; 4 Olympic golds; held #1; multiple “Serena Slam” runs.',
                    '23 Grand Slam tekler; Venus ile 14 çiftler; 4 Olimpiyat altını; 1 numara; birden fazla “Serena Slam”.',
                    '23 одиночных Grand Slam; 14 парных с Винус; 4 олимпийских золота.',
                    '23 Grand-Slam-Einzel; 14 Doppel mit Venus; 4 Olympia-Gold.'
                ),
                links: [
                    { label: L('Career reflection interview', 'Kariyer üzerine röportaj', 'Интервью о карьере', 'Karriere-Interview'), url: 'https://www.youtube.com/watch?v=8YjFO9CAKmY' },
                ],
            },
            {
                name: 'Steffi Graf',
                years: '1969–',
                bio: L(
                    'German baseline assassin with lethal forehand and slice backhand. Completed the Golden Slam in 1988 (all four majors + Olympic gold in one year).',
                    'Alman baseline avcısı; ölümcül forehand ve slice backhand. 1988’de Golden Slam (dört major + Olimpiyat altını aynı yıl).',
                    'Немка с убийственным форхендом и слайс-бэкхендом. Golden Slam 1988.',
                    'Deutsche mit tödlicher Vorhand und Slice-Rückhand. Golden Slam 1988.'
                ),
                achievements: L(
                    '22 Grand Slam singles; 1988 Golden Slam; 377 weeks at #1 (long-time record).',
                    '22 Grand Slam tekler; 1988 Golden Slam; 377 hafta 1 numara (uzun süre rekor).',
                    '22 Grand Slam; Golden Slam 1988; 377 недель №1.',
                    '22 Grand-Slam-Einzel; Golden Slam 1988; 377 Wochen Nr. 1.'
                ),
                links: [
                    { label: L('Archive interview', 'Arşiv röportaj', 'Архивное интервью', 'Archiv-Interview'), url: 'https://www.youtube.com/results?search_query=Steffi+Graf+interview' },
                ],
            },
        ],
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
        ],
        athletes: [
            {
                name: 'Fernando Belasteguín',
                years: '1979–',
                bio: L(
                    'Argentine legend, long-time world #1, known as “Bela”. Precision at net and longevity defined modern padel’s first golden era.',
                    'Arjantin efsanesi, uzun süre dünya 1 numarası, “Bela”. Filedeki isabet ve uzun kariyer modern padelin ilk altın çağını tanımladı.',
                    'Аргентинская легенда, долго №1 мира — «Bela».',
                    'Argentinische Legende, lange Welt-Nr. 1 — „Bela“.'
                ),
                achievements: L(
                    'Record weeks at #1; dozens of World Padel Tour titles with multiple partners.',
                    'Rekor hafta 1 numara; birçok partnerle onlarca WPT unvanı.',
                    'Рекорд недель №1; десятки титулов WPT.',
                    'Rekordwochen Nr. 1; Dutzende WPT-Titel.'
                ),
                links: [
                    { label: L('Career highlights / talk', 'Kariyer / konuşma', 'Карьера / интервью', 'Karriere / Talk'), url: 'https://www.youtube.com/results?search_query=Fernando+Belasteguin+interview' },
                ],
            },
            {
                name: 'Alejandra Salazar',
                years: '1985–',
                bio: L(
                    'Spanish pioneer of women’s padel; multiple world titles and a model of tactical left-side play.',
                    'Kadın padelin İspanyol öncüsü; çoklu dünya unvanı, sol taraf taktiğinin modeli.',
                    'Испанская пионерка женского падела.',
                    'Spanische Pionierin des Damen-Padels.'
                ),
                achievements: L(
                    'Multiple World Padel Tour #1 seasons; major titles with different partners.',
                    'Birden fazla WPT 1 numara sezonu; farklı partnerlerle büyük unvanlar.',
                    'Несколько сезонов №1 WPT.',
                    'Mehrere WPT-Nr.-1-Saisons.'
                ),
                links: [
                    { label: L('Interviews & matches', 'Röportaj ve maçlar', 'Интервью и матчи', 'Interviews & Matches'), url: 'https://www.youtube.com/results?search_query=Alejandra+Salazar+padel+interview' },
                ],
            },
        ],
        bonus: [
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
        ],
        athletes: [
            {
                name: 'Lin Dan',
                years: '1983–',
                bio: L(
                    'Chinese “Super Dan” — two Olympic golds, multiple World and All-England titles; flair and clutch reputation.',
                    'Çinli “Super Dan” — iki Olimpiyat altını, çoklu Dünya ve All-England; flair ve kritik an efsanesi.',
                    'Китаец «Super Dan» — два олимпийских золота.',
                    'Chinese «Super Dan» — zwei Olympia-Gold.'
                ),
                achievements: L(
                    'Olympic gold 2008 & 2012; multiple World Championships.',
                    'Olimpiyat altın 2008 ve 2012; çoklu Dünya Şampiyonluğu.',
                    'Олимпийское золото 2008 и 2012; несколько ЧМ.',
                    'Olympia-Gold 2008 & 2012; mehrere WM.'
                ),
                links: [
                    { label: L('Highlights / interviews', 'Özet / röportaj', 'Обзоры / интервью', 'Highlights / Interviews'), url: 'https://www.youtube.com/results?search_query=Lin+Dan+interview' },
                ],
            },
            {
                name: 'Carolina Marín',
                years: '1993–',
                bio: L(
                    'Spanish lefty powerhouse; Olympic champion and multiple World titles — trailblazer for European women’s singles.',
                    'İspanyol solak güç oyuncusu; Olimpiyat şampiyonu ve çoklu Dünya — Avrupa kadın teklerinde öncü.',
                    'Испанская левша, олимпийская чемпионка.',
                    'Spanische Linkshänderin, Olympiasiegerin.'
                ),
                achievements: L(
                    'Olympic gold 2016; multiple World & European titles.',
                    '2016 Olimpiyat altını; çoklu Dünya ve Avrupa unvanı.',
                    'Олимпийское золото 2016; титулы ЧМ и ЧЕ.',
                    'Olympia-Gold 2016; WM- und EM-Titel.'
                ),
                links: [
                    { label: L('Talks & matches', 'Konuşma ve maçlar', 'Интервью и матчи', 'Talks & Matches'), url: 'https://www.youtube.com/results?search_query=Carolina+Marin+interview' },
                ],
            },
        ],
        bonus: [
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
        ],
        athletes: [
            {
                name: 'Ma Long',
                years: '1988–',
                bio: L(
                    'Chinese “Dictator” of the table — complete technique, legendary consistency, multiple Olympic and World titles.',
                    'Masadaki Çinli “Diktatör” — tam teknik, efsane istikrar, çoklu Olimpiyat ve Dünya unvanı.',
                    'Китайский «Диктатор» стола — техника и стабильность.',
                    'Chinesischer „Diktator“ am Tisch — Technik und Konstanz.'
                ),
                achievements: L(
                    'Multiple Olympic golds; World Championships; long reign at #1.',
                    'Çoklu Olimpiyat altını; Dünya Şampiyonlukları; uzun 1 numara dönemi.',
                    'Несколько олимпийских золота; ЧМ; долго №1.',
                    'Mehrere Olympia-Gold; WM; lange Nr. 1.'
                ),
                links: [
                    { label: L('Interviews / training', 'Röportaj / antrenman', 'Интервью / тренировки', 'Interviews / Training'), url: 'https://www.youtube.com/results?search_query=Ma+Long+table+tennis+interview' },
                ],
            },
            {
                name: 'Ding Ning',
                years: '1990–',
                bio: L(
                    'Chinese lefty great of women’s table tennis; Olympic and World champion with a fierce forehand loop.',
                    'Kadın masa tenisinde Çinli solak efsane; Olimpiyat ve Dünya şampiyonu, güçlü forehand loop.',
                    'Китайская левша, олимпийская и мировая чемпионка.',
                    'Chinesische Linkshänderin, Olympia- und Weltmeisterin.'
                ),
                achievements: L(
                    'Olympic golds; multiple World titles.',
                    'Olimpiyat altınları; çoklu Dünya unvanı.',
                    'Олимпийские золота; титулы ЧМ.',
                    'Olympia-Gold; mehrere WM-Titel.'
                ),
                links: [
                    { label: L('Match talks', 'Maç konuşmaları', 'Интервью', 'Match-Talks'), url: 'https://www.youtube.com/results?search_query=Ding+Ning+interview' },
                ],
            },
        ],
        bonus: [
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
        ],
        athletes: [
            {
                name: 'Ben Johns',
                years: '1999–',
                bio: L(
                    'American face of modern pro pickleball; dominant mixed and men’s doubles, known for soft hands and transition speed.',
                    'Modern pro pickleball’un Amerikan yüzü; mixed ve erkek çiftlerinde baskın, soft el ve geçiş hızı.',
                    'Лицо современного про-пиклбола в США.',
                    'Gesicht des modernen Pro-Pickleballs.'
                ),
                achievements: L(
                    'Multiple major titles; long stretches as world #1 in doubles formats.',
                    'Çoklu major unvan; çift formatlarında uzun süre dünya 1 numarası.',
                    'Много крупных титулов; долго №1 в парах.',
                    'Viele Major-Titel; lange Welt-Nr. 1 im Doppel.'
                ),
                links: [
                    { label: L('Interviews', 'Röportajlar', 'Интервью', 'Interviews'), url: 'https://www.youtube.com/results?search_query=Ben+Johns+pickleball+interview' },
                ],
            },
            {
                name: 'Anna Leigh Waters',
                years: '2007–',
                bio: L(
                    'Prodigy of women’s and mixed pickleball; power + kitchen control at a very young age.',
                    'Kadın ve mixed pickleball harikası; çok genç yaşta güç + kitchen kontrolü.',
                    'Вундеркинд женского и смешанного пиклбола.',
                    'Wunderkind im Damen- und Mixed-Pickleball.'
                ),
                achievements: L(
                    'Youngest to reach #1; stack of gold medals on the pro tour.',
                    '1 numaraya en genç ulaşanlardan; pro turda altın yığını.',
                    'Одна из самых молодых №1; множество титулов.',
                    'Eine der jüngsten Nr. 1; viele Tour-Titel.'
                ),
                links: [
                    { label: L('Talks & highlights', 'Konuşma ve özet', 'Интервью и обзоры', 'Talks & Highlights'), url: 'https://www.youtube.com/results?search_query=Anna+Leigh+Waters+interview' },
                ],
            },
        ],
        bonus: [
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
        ],
        athletes: [
            {
                name: 'Karch Kiraly',
                years: '1960–',
                bio: L(
                    'American indoor and beach legend; only player with Olympic gold in both. Later a transformative coach for USA women.',
                    'Amerikalı salon ve plaj efsanesi; ikisinde de Olimpiyat altını olan tek oyuncu. Sonra ABD kadın millisinin dönüştürücü koçu.',
                    'Легенда зала и пляжа США; золото ОИ в обоих. Позже тренер женской сборной.',
                    'US-Legende Halle & Beach; Olympia-Gold in beiden. Später Trainer der US-Frauen.'
                ),
                achievements: L(
                    'Olympic golds indoor & beach; multiple world titles; Hall of Fame.',
                    'Salon ve plaj Olimpiyat altınları; çoklu dünya unvanı; Hall of Fame.',
                    'Олимпийское золото зал и пляж; Зал славы.',
                    'Olympia-Gold Halle & Beach; Hall of Fame.'
                ),
                links: [
                    { label: L('Interviews / coaching talks', 'Röportaj / koçluk', 'Интервью / о тренерстве', 'Interviews / Coaching'), url: 'https://www.youtube.com/results?search_query=Karch+Kiraly+interview' },
                ],
            },
            {
                name: 'Giba (Gilberto Godoy Filho)',
                years: '1976–',
                bio: L(
                    'Brazilian outside hitter icon of the 2000s — charisma, leadership and clutch Olympic performances.',
                    '2000’lerin Brezilyalı smaçör ikonu — karizma, liderlik ve kritik Olimpiyat performansları.',
                    'Икона бразильского волейбола 2000-х.',
                    'Ikone des brasilianischen Volleyballs der 2000er.'
                ),
                achievements: L(
                    'Olympic gold 2004; World Championships; long-time face of Brazil’s golden generation.',
                    '2004 Olimpiyat altını; Dünya Şampiyonlukları; Brezilya altın neslinin yüzü.',
                    'Олимпийское золото 2004; ЧМ.',
                    'Olympia-Gold 2004; WM-Titel.'
                ),
                links: [
                    { label: L('Talks & highlights', 'Konuşma ve özet', 'Интервью и обзоры', 'Talks & Highlights'), url: 'https://www.youtube.com/results?search_query=Giba+volleyball+interview' },
                ],
            },
            {
                name: 'Kerri Walsh Jennings',
                years: '1978–',
                bio: L(
                    'Beach volleyball GOAT conversation; three straight Olympic golds with Misty May-Treanor, then more medals.',
                    'Plaj voleybolu GOAT tartışmasının merkezi; Misty May-Treanor ile üç ardışık Olimpiyat altını, sonra ek madalyalar.',
                    'Легенда пляжного волейбола; три золота ОИ подряд с Misty May-Treanor.',
                    'Beach-Volleyball-Legende; drei Olympia-Gold in Folge mit Misty May-Treanor.'
                ),
                achievements: L(
                    '3× Olympic gold (2004–2012) + later bronze; dominant #1 partnership era.',
                    '3× Olimpiyat altın (2004–2012) + sonra bronz; baskın 1 numara partner dönemi.',
                    '3 олимпийских золота (2004–2012) + бронза.',
                    '3× Olympia-Gold (2004–2012) + später Bronze.'
                ),
                links: [
                    { label: L('Interviews', 'Röportajlar', 'Интервью', 'Interviews'), url: 'https://www.youtube.com/results?search_query=Kerri+Walsh+Jennings+interview' },
                ],
            },
        ],
        bonus: [
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
