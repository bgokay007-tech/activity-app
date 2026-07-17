// Assessment questions per sport branch
// Each option has a `points` value (0–30)
// Max score = questions.length * 30 → level thresholds are % based

// Padel: her soru kullanıcının kendini 0-5 arası puanladığı tek tip 6 seçenekli
// bir ölçek kullanır; `max` o sorunun toplam puana katkısının üst sınırıdır
// (kategori ağırlığını uygulamak için 0-5'i orantılı olarak `max`'a ölçekler).
function ratingOptions(max) {
    const labels = [
        { text: '0 — Not at all',     tr: '0 — Hiç / Yapamıyorum' },
        { text: '1 — Very weak',      tr: '1 — Çok zayıf' },
        { text: '2 — Weak',           tr: '2 — Zayıf' },
        { text: '3 — Average',        tr: '3 — Orta' },
        { text: '4 — Good',           tr: '4 — İyi' },
        { text: '5 — Very good',      tr: '5 — Çok iyi' },
    ];
    return labels.map((l, i) => ({ ...l, points: parseFloat((max * i / 5).toFixed(4)) }));
}

const QUESTIONS = {
    // ─── TENNIS — weighted 4-section assessment (total max = 100 pts → rating 0-5) ───
    // Section 1 (3 q, max 20):  20% — Experience & Level Perception
    // Section 2 (4 q, max 30):  30% — Technical Skills
    // Section 3 (3 q, max 30):  30% — Tactics & Game Intelligence
    // Section 4 (2 q, max 20):  20% — Physical & Mental
    tennis: [
        // ── Section 1: Experience & Level Perception ─────────────────────────
        {
            id: 'q1', section: 1,
            question: 'Which of the following best describes your tennis experience and level?',
            tr: 'Tenis deneyimini ve seviyeni en iyi hangisi tanımlıyor?',
            options: [
                { text: 'Complete Beginner — still learning the basic strokes',                          tr: 'Tam yeni başlayan — temel vuruşları öğreniyorum',                                   points: 0 },
                { text: 'Early Beginner — can hit basic strokes but rallies are very short',             tr: 'Başlangıç — temel vuruşları yapabiliyorum ama ralliler çok kısa',                  points: 2 },
                { text: 'Intermediate — can sustain rallies and play matches; limited tactical variety', tr: 'Orta — ralli yapıp maç oynuyorum; sınırlı taktik çeşitliliği',                   points: 5 },
                { text: 'Advanced — tournament experience; use spin, power and strategy in matches',    tr: 'İleri — turnuva deneyimim var; spin, güç ve strateji kullanıyorum',               points: 7 },
            ],
        },
        {
            id: 'q2', section: 1,
            question: 'How often do you play tennis? (average hours per week)',
            tr: 'Tenis ne sıklıkla oynuyorsun? (haftada ortalama saat)',
            options: [
                { text: 'Rarely or never (less than 2 hours per month)', tr: 'Nadiren veya hiç (ayda 2 saatten az)', points: 0 },
                { text: '1–2 hours per week',                            tr: 'Haftada 1–2 saat',                     points: 2 },
                { text: '3–5 hours per week',                            tr: 'Haftada 3–5 saat',                     points: 5 },
                { text: '6+ hours per week',                             tr: 'Haftada 6+ saat',                      points: 7 },
            ],
        },
        {
            id: 'q3', section: 1,
            question: 'Have you ever played in a licensed or official tournament?',
            tr: 'Hiç lisanslı veya resmi bir turnuvaya katıldın mı?',
            options: [
                { text: 'Never — I only play casually',                               tr: 'Hayır — sadece sosyal oynuyorum',                              points: 0 },
                { text: 'Yes, I participated but did not advance far',                tr: 'Evet, katıldım ama fazla ilerleyemedim',                       points: 2 },
                { text: 'Yes, I reached the knockout stage or semi-finals',           tr: 'Evet, çeyrek final veya yarı finale kadar çıktım',            points: 4 },
                { text: 'Yes, I won a tournament or competed at regional/national level', tr: 'Evet, turnuva kazandım veya bölgesel/ulusal düzeyde yarıştım', points: 6 },
            ],
        },

        // ── Section 2: Technical Skills ───────────────────────────────────────
        {
            id: 'q4', section: 2,
            question: 'How confident are you with your forehand shot? (1 = Very uncertain → 5 = Reliable weapon)',
            tr: 'Forehand vuruşuna olan güvenin nasıl? (1 = Çok belirsiz → 5 = Güvenilir silah)',
            options: [
                { text: 'Very uncertain; often hits out or into the net', tr: 'Çok belirsiz; sık sık dışarı veya fileye gidiyor',          points: 0 },
                { text: 'Inconsistent but improving',                     tr: 'Tutarsız ama gelişiyor',                                    points: 2 },
                { text: 'Fairly consistent with decent pace',             tr: 'Makul hızda oldukça tutarlı',                               points: 4 },
                { text: 'Confident; can direct and add spin',             tr: 'Güvenilir; yönlendirebiliyorum ve spin ekleyebiliyorum',    points: 6 },
                { text: 'Fully reliable; aggressive offensive weapon',    tr: 'Tamamen güvenilir; agresif saldırı silahı',                 points: 8 },
            ],
        },
        {
            id: 'q5', section: 2,
            question: 'How do you prefer to use your backhand?',
            tr: 'Backhand vuruşunu nasıl tercih ediyorsun?',
            options: [
                { text: 'I have no reliable backhand yet',                          tr: 'Henüz güvenilir bir backhandım yok',                          points: 0 },
                { text: 'Slice only — used defensively',                            tr: 'Sadece slice — savunma amaçlı',                               points: 2 },
                { text: 'Single-handed — mainly defensive, limited direction control', tr: 'Tek elle — ağırlıklı savunma, sınırlı yön kontrolü',      points: 4 },
                { text: 'Double-handed — strong and directional',                   tr: 'Çift elle — güçlü ve yönlü',                                  points: 6 },
                { text: 'Both topspin and slice; consistent from both sides',       tr: 'Hem topspin hem slice; her iki taraftan tutarlı',             points: 8 },
            ],
        },
        {
            id: 'q6', section: 2,
            question: 'Which of the following serves can you consistently execute in a match?',
            tr: 'Aşağıdaki servislerden hangilerini maçta tutarlı biçimde kullanabiliyorsun?',
            options: [
                { text: 'I cannot serve reliably yet',                 tr: 'Henüz güvenilir servisim yok',                            points: 0 },
                { text: 'Flat (basic) serve only',                     tr: 'Sadece düz (temel) servis',                               points: 2 },
                { text: 'Flat serve with some direction control',      tr: 'Biraz yön kontrolüyle düz servis',                        points: 4 },
                { text: 'Flat + Slice serves',                         tr: 'Düz + Slice servisler',                                   points: 6 },
                { text: 'Flat + Kick/Topspin + Slice — full variety', tr: 'Düz + Kick/Topspin + Slice — tam çeşitlilik',             points: 8 },
            ],
        },
        {
            id: 'q7', section: 2,
            question: 'How often do you approach the net, and how successful are you? (1 = Never → 5 = Strong net game)',
            tr: 'Ağa ne sıklıkla yaklaşıyorsun ve ne kadar başarılısın? (1 = Hiç → 5 = Güçlü ağ oyunu)',
            options: [
                { text: 'I never go to the net',                              tr: 'Ağa hiç çıkmıyorum',                                        points: 0 },
                { text: 'Rarely; and usually lose the point',                 tr: 'Nadiren; ve genellikle sayıyı kaybediyorum',                points: 1 },
                { text: 'Sometimes; I win about half the net points',         tr: 'Bazen; ağ sayılarının yaklaşık yarısını kazanıyorum',       points: 3 },
                { text: 'Often; comfortable with volleys and overheads',      tr: 'Sık sık; vole ve smaçta rahatsın',                         points: 5 },
                { text: 'Frequently; net play is a core part of my strategy', tr: 'Çok sık; ağ oyunu stratejimin temel parçası',             points: 6 },
            ],
        },

        // ── Section 3: Tactics & Game Intelligence ────────────────────────────
        {
            id: 'q8', section: 3,
            question: 'Can you develop and execute strategic game plans against different opponents?',
            tr: 'Farklı rakiplere karşı stratejik oyun planları geliştirip uygulayabiliyor musun?',
            options: [
                { text: 'No — I just rally without thinking about tactics',            tr: 'Hayır — taktik düşünmeden sadece ralli yapıyorum',                points: 0 },
                { text: 'I know my own strengths but rarely adapt to opponents',       tr: 'Kendi güçlü yanlarımı biliyorum ama rakibe nadiren uyum sağlıyorum', points: 3 },
                { text: 'I can identify weaknesses and try to exploit them',           tr: 'Zayıflıkları tespit edip bunları kullanmaya çalışıyorum',          points: 6 },
                { text: 'I build tactical patterns and adjust them during matches',    tr: 'Taktik kalıplar oluşturuyorum ve maç sırasında ayarlıyorum',       points: 8 },
                { text: 'I fully construct game plans and execute them under pressure',tr: 'Oyun planlarını tam kuruyorum ve baskı altında uyguluyorum',      points: 10 },
            ],
        },
        {
            id: 'q9', section: 3,
            question: 'How do you typically finish points under pressure or in difficult situations?',
            tr: 'Baskı altında veya zor durumlarda sayıları genellikle nasıl bitiriyorsun?',
            options: [
                { text: 'I panic and make unforced errors',                              tr: 'Panikleyip zorunlu olmayan hatalar yapıyorum',                        points: 0 },
                { text: 'I try to keep the ball in but rarely create winners',           tr: 'Topu içeride tutmaya çalışıyorum ama nadiren winner yapıyorum',      points: 3 },
                { text: 'I can construct the point and find openings',                   tr: 'Sayıyı inşa edip açık alan bulabiliyorum',                           points: 6 },
                { text: 'I produce winners or force errors consistently under pressure', tr: 'Baskı altında tutarlı biçimde winner yapıyor veya hata yaptırıyorum',points: 8 },
                { text: 'I thrive under pressure — closing points is a clear strength', tr: 'Baskı altında parlıyorum — sayıları kapatmak belirgin güçlü yanım', points: 10 },
            ],
        },
        {
            id: 'q10', section: 3,
            question: 'How well can you sustain the ball in deep, high-tempo rallies?',
            tr: 'Derin, yüksek tempolu rallilerde topu ne kadar iyi sürdürebiliyorsun?',
            options: [
                { text: 'I break down quickly — long rallies are very difficult',          tr: 'Çabuk çöküyorum — uzun ralliler çok zor',                              points: 0 },
                { text: 'I can last a few shots but consistency drops quickly',            tr: 'Birkaç vuruş yapabiliyorum ama tutarlılık hızla düşüyor',              points: 3 },
                { text: 'I sustain rallies reasonably well under moderate pace',           tr: 'Orta tempoda rallileri makul şekilde sürdürüyorum',                    points: 6 },
                { text: 'I control pace and depth even in extended, high-tempo rallies',   tr: 'Uzun, yüksek tempolu rallilerde tempo ve derinliği kontrol ediyorum', points: 8 },
                { text: 'I dictate high-tempo rallies — aggressive and consistent',       tr: 'Yüksek tempolu rallileri yönetiyorum — agresif ve tutarlıyım',        points: 10 },
            ],
        },

        // ── Section 4: Physical & Mental ──────────────────────────────────────
        {
            id: 'q11', section: 4,
            question: 'Can you complete a demanding 3-set match without noticeable physical decline?',
            tr: 'Zorlu 3 setlik bir maçı belirgin fiziksel düşüş olmadan tamamlayabiliyor musun?',
            options: [
                { text: 'No — I tire significantly by the second set',         tr: 'Hayır — ikinci sette önemli ölçüde yoruluyorum',           points: 0 },
                { text: 'I slow down noticeably but can still finish',          tr: 'Fark edilir biçimde yavaşlıyorum ama bitirebiliyorum',     points: 3 },
                { text: 'I maintain my level throughout a full match',          tr: 'Maç boyunca seviyemi koruyorum',                           points: 6 },
                { text: 'I can play at high tempo across all three sets',       tr: 'Üç set boyunca yüksek tempoda oynayabiliyorum',            points: 8 },
                { text: 'My fitness is a competitive advantage in long matches',tr: 'Kondisyonum uzun maçlarda rekabet avantajım',              points: 10 },
            ],
        },
        {
            id: 'q12', section: 4,
            question: 'How well do you maintain focus after errors or losing critical points? (1 = Lose focus → 5 = Mental strength)',
            tr: 'Hata yaptıktan veya kritik sayılar kaybettikten sonra odağını ne kadar iyi koruyorsun?',
            options: [
                { text: 'I get frustrated and my game falls apart',             tr: 'Sinirleniyorum ve oyunum çöküyor',                                      points: 0 },
                { text: 'Difficult, but I try to reset',                        tr: 'Zor, ama sıfırlamaya çalışıyorum',                                      points: 2 },
                { text: 'I usually recover within 1–2 games',                   tr: 'Genellikle 1–2 oyunda toparlıyorum',                                    points: 5 },
                { text: 'Good mental reset; errors rarely affect my next points',tr: 'İyi zihinsel sıfırlama; hatalar nadiren sonraki sayılarımı etkiliyor', points: 8 },
                { text: 'Strong mental game; errors often make me sharper',     tr: 'Güçlü zihin oyunu; hatalar çoğunlukla beni daha da keskinleştiriyor', points: 10 },
            ],
        },
    ],

    // ─── PADEL — 3-category weighted self-assessment (total max = 100 pts → rating 0-5) ───
    // Each question is self-rated 0-5; per-question max points are scaled so the
    // category totals land exactly on the requested weights:
    // Category 1 (4 q, max 40):  40% — Vuruş Teknikleri ve Kontrol (Teknik)
    // Category 2 (3 q, max 35):  35% — Taktik ve Oyun Anlayışı (Oyun Bilgisi)
    // Category 3 (2 q, max 25):  25% — Deneyim ve Maç Geçmişi (Tecrübe)
    padel: [
        // ── Category 1: Vuruş Teknikleri ve Kontrol (Teknik) — 40%, 10 pts/soru ──
        {
            id: 'q1', section: 1,
            question: 'Serving ability: Do your serves often hit the net or go out? Can you place your serve in the corner you want, at the speed you want?',
            tr: 'Servis Atma Becerisi: Servisleriniz genelde fileye takılıyor veya dışarı mı gidiyor? Rakip sahada istediğiniz köşeye ve hızda servis atabiliyor musunuz?',
            options: ratingOptions(10),
        },
        {
            id: 'q2', section: 1,
            question: 'Wall play (Bandeja / Bajada): How well can you handle balls bouncing off the glass? Can you turn balls coming off the wall into an attack?',
            tr: 'Duvar Kullanımı (Bandeja / Bajada): Camdan seken topları ne kadar iyi karşılayabiliyorsunuz? Camdan gelen topları hücuma dönüştürebilir misiniz?',
            options: ratingOptions(10),
        },
        {
            id: 'q3', section: 1,
            question: 'Volley and net play: How are your reflexes at the net? Can you direct your volleys to the depth and tempo you want?',
            tr: 'Vole ve File Oyunu: File önündeki refleksleriniz nasıl? Volelerde topu istediğiniz derinliğe ve tempoya sokabiliyor musunuz?',
            options: ratingOptions(10),
        },
        {
            id: 'q4', section: 1,
            question: 'Smash: When you smash, can you direct the ball to the spot you want in the opponent’s court, or send it out by bouncing it off the glass?',
            tr: 'Smash / Smaç: Smaç vurduğunuzda topu rakip sahada istenilen noktaya yönlendirebiliyor veya sektirerek dışarı çıkarabiliyor musunuz?',
            options: ratingOptions(10),
        },

        // ── Category 2: Taktik ve Oyun Anlayışı (Oyun Bilgisi) — 35%, 35/3 pts/soru ──
        {
            id: 'q5', section: 2,
            question: 'Building the point: During a match, can you spot your opponent’s weaknesses and play tactical shots (lobs, short balls) accordingly?',
            tr: 'Oyun Kurma: Maç sırasında rakibin zayıf yönlerini tespit edip buna göre taktiksel vuruşlar (loblar, kısa vuruşlar) yapabiliyor musunuz?',
            options: ratingOptions(35 / 3),
        },
        {
            id: 'q6', section: 2,
            question: 'Positioning: Can you and your partner stay in the correct attacking/defending positions throughout the point?',
            tr: 'Pozisyon Alma: Puan süresince partnerinizle birlikte hücum ve savunma bölgelerinde doğru pozisyonda kalabiliyor musunuz?',
            options: ratingOptions(35 / 3),
        },
        {
            id: 'q7', section: 2,
            question: 'Patience and rally management: Can you keep the ball in play for more than 5-6 shots without unforced errors?',
            tr: 'Sabır ve Ralli Yönetimi: Basit hata yapmadan (unforced error) topu 5-6 vuruştan fazla oyunda tutabiliyor musunuz?',
            options: ratingOptions(35 / 3),
        },

        // ── Category 3: Deneyim ve Maç Geçmişi (Tecrübe) — 25%, 12.5 pts/soru ──
        {
            id: 'q8', section: 3,
            question: 'Playing frequency: How many hours per week do you play padel on average?',
            tr: 'Aktif Oynama Sıklığı: Haftada ortalama kaç saat padel oynuyorsunuz?',
            options: ratingOptions(12.5),
        },
        {
            id: 'q9', section: 3,
            question: 'Tournament / match experience: Do you take part in official, amateur or club tournaments? If so, what results have you had?',
            tr: 'Turnuva/Maç Tecrübesi: Resmi, amatör veya kulüp içi turnuvalara katılıyor musunuz? Katılıyorsanız ne tür başarılarınız var?',
            options: ratingOptions(12.5),
        },
    ],

    // Generic football (fallback)
    football: [
        { id: 'q1', question: 'How long have you been playing football?', tr: 'Kaç yıldır futbol oynuyorsun?', options: [
            { text: 'Never seriously',  tr: 'Hiç / çok az',     points: 0 },
            { text: 'Less than 1 year', tr: '1 yıldan az',      points: 6 },
            { text: '1–4 years',        tr: '1–4 yıl',          points: 14 },
            { text: '4–8 years',        tr: '4–8 yıl',          points: 22 },
            { text: '8+ years',         tr: '8+ yıl',           points: 30 },
        ]},
        { id: 'q2', question: 'How well do you control the ball (first touch, dribbling)?', tr: 'Top kontrolün (ilk dokunuş, dribling) nasıl?', options: [
            { text: 'Often lose the ball',          tr: 'Sık sık top kaybediyorum',         points: 0 },
            { text: 'Decent control at low speed',  tr: 'Düşük hızda makul kontrol',        points: 8 },
            { text: 'Good control under pressure',  tr: 'Baskı altında iyi kontrol',        points: 16 },
            { text: 'Quick turns, tight dribbling', tr: 'Hızlı çevrim, sıkı dribling',     points: 24 },
            { text: 'Elite ball control at speed',  tr: 'Hızda elit top kontrolü',          points: 30 },
        ]},
        { id: 'q3', question: 'How accurate and powerful is your shooting?', tr: 'Şutun isabetliliği ve gücü nasıl?', options: [
            { text: 'Struggle to hit on target',         tr: 'İsabetli vurmakta zorlanıyorum',         points: 0 },
            { text: 'Hit on target sometimes',           tr: 'Bazen isabetli vurabiliyorum',            points: 8 },
            { text: 'Good accuracy, moderate power',     tr: 'İyi isabetlilik, orta güç',              points: 16 },
            { text: 'Strong and accurate from distance', tr: 'Uzak mesafeden güçlü ve isabetli',       points: 24 },
            { text: 'Both feet, powerful and precise',   tr: 'Her iki ayakla güçlü ve isabetli',       points: 30 },
        ]},
        { id: 'q4', question: 'What level have you played at?', tr: 'Hangi seviyede oynadın?', options: [
            { text: 'Casual park / pickup',            tr: 'Arkadaş maçı / pickup',                points: 0 },
            { text: 'Amateur club level',              tr: 'Amatör kulüp',                         points: 8 },
            { text: 'Regional / district league',      tr: 'Bölgesel / ilçe ligi',                 points: 16 },
            { text: 'National amateur or semi-pro',    tr: 'Ulusal amatör / yarı profesyonel',     points: 24 },
            { text: 'Professional / academy graduate', tr: 'Profesyonel / akademi mezunu',         points: 30 },
        ]},
        { id: 'q5', question: 'How is your tactical understanding (positioning, pressing)?', tr: 'Taktik anlayışın (pozisyon alma, pressing) nasıl?', options: [
            { text: 'I don\'t think about tactics',       tr: 'Taktik hakkında düşünmüyorum',            points: 0 },
            { text: 'Basic positional awareness',         tr: 'Temel pozisyon farkındalığı',              points: 8 },
            { text: 'Understand my role in a team',       tr: 'Takımdaki rolümü anlıyorum',               points: 16 },
            { text: 'Read the game well, press smartly',  tr: 'Oyunu iyi okuyor, akıllı pressing yapıyorum', points: 24 },
            { text: 'High tactical IQ, can play systems', tr: 'Yüksek taktik zekâ, sistem oynayabiliyorum', points: 30 },
        ]},
    ],

    // ── POSITION-SPECIFIC FOOTBALL SETS ──────────────────────────────────────

    football_goalkeeper: [
        { id: 'q1', question: 'How long have you been playing as a goalkeeper?', tr: 'Kaleci olarak kaç yıldır oynuyorsun?', options: [
            { text: 'Never / barely played',    tr: 'Hiç / çok az',     points: 0 },
            { text: 'Less than 1 year',         tr: '1 yıldan az',      points: 6 },
            { text: '1–4 years',                tr: '1–4 yıl',          points: 14 },
            { text: '4–8 years',                tr: '4–8 yıl',          points: 22 },
            { text: '8+ years',                 tr: '8+ yıl',           points: 30 },
        ]},
        { id: 'q2', question: 'How good are your shot-stopping reflexes?', tr: 'Şut kurtarma reflekslerin nasıl?', options: [
            { text: 'I let in most shots',                       tr: 'Çoğu şutu tutamıyorum',                   points: 0 },
            { text: 'Can save close-range attempts',             tr: 'Yakın mesafeden kurtarabiliyorum',        points: 8 },
            { text: 'Solid mid-range shot stopping',             tr: 'Orta mesafe şutlarda iyiyim',             points: 16 },
            { text: 'Save powerful and corner shots regularly',  tr: 'Güçlü ve köşe şutlarını tutabiliyorum',  points: 24 },
            { text: 'Elite reflexes across all shot types',      tr: 'Reflekslerim elit seviyede',              points: 30 },
        ]},
        { id: 'q3', question: 'How well do you command your penalty area (crosses, aerial duels)?', tr: 'Ceza sahasına hakimiyetin nasıl (orta karşılama, hava topları)?', options: [
            { text: 'I rarely come off my line',                      tr: 'Neredeyse hiç çıkmıyorum',                       points: 0 },
            { text: 'Collect nearby crosses',                         tr: 'Yakın ortaları çıkabilirim',                     points: 8 },
            { text: 'Read crosses well, claim most balls',            tr: 'Ortaları iyi okuyorum, çoğunu çıkarım',         points: 16 },
            { text: 'Dominant in the box, organise defenders',        tr: 'Ceza sahasına hâkimim, savunmayı yönetiyorum', points: 24 },
            { text: 'Excellent aerial command and box authority',     tr: 'Mükemmel hava hakimiyeti ve otorite',           points: 30 },
        ]},
        { id: 'q4', question: 'How comfortable are you with your feet and distribution?', tr: 'Ayakla top kullanımın ve pasın nasıl?', options: [
            { text: 'Very poor with the ball at feet',               tr: 'Ayakta çok zayıfım',                       points: 0 },
            { text: 'Can play short passes safely',                  tr: 'Kısa pas verebiliyorum',                   points: 8 },
            { text: 'Reliable short and medium distribution',        tr: 'Güvenli kısa-orta mesafe pas',             points: 16 },
            { text: 'Confident with long passes too',                tr: 'Uzun pasları da iyi kontrol ediyorum',     points: 24 },
            { text: 'Sweeper-keeper level, like an outfield player', tr: 'Ayakta saha oyuncusu gibi oynayabiliyorum', points: 30 },
        ]},
        { id: 'q5', question: 'What level have you played at as a goalkeeper?', tr: 'Kaleci olarak hangi seviyede oynadın?', options: [
            { text: 'Casual / five-a-side',            tr: 'Arkadaş maçı / halı saha',         points: 0 },
            { text: 'Amateur club',                    tr: 'Amatör kulüp',                     points: 8 },
            { text: 'Regional / district league',      tr: 'Bölgesel / ilçe ligi',             points: 16 },
            { text: 'National amateur or semi-pro',    tr: 'Ulusal amatör / yarı profesyonel', points: 24 },
            { text: 'Professional / academy graduate', tr: 'Profesyonel / akademi mezunu',     points: 30 },
        ]},
    ],

    football_defender: [
        { id: 'q1', question: 'How long have you been playing as a defender?', tr: 'Defans oyuncusu olarak kaç yıldır oynuyorsun?', options: [
            { text: 'Never / barely played', tr: 'Hiç / çok az',  points: 0 },
            { text: 'Less than 1 year',      tr: '1 yıldan az',   points: 6 },
            { text: '1–4 years',             tr: '1–4 yıl',       points: 14 },
            { text: '4–8 years',             tr: '4–8 yıl',       points: 22 },
            { text: '8+ years',              tr: '8+ yıl',        points: 30 },
        ]},
        { id: 'q2', question: 'How strong is your 1v1 defending and tackling?', tr: '1v1 savunma ve müdahale yeteneğin nasıl?', options: [
            { text: 'I get beaten most of the time',                   tr: 'Çoğu zaman geçiliyorum',                       points: 0 },
            { text: 'Can stop some, but timing is inconsistent',       tr: 'Bazen durdurabiliyorum ama zamanlama tutarsız', points: 8 },
            { text: 'Well-timed challenges, rarely get dribbled past', tr: 'İyi zamanlanmış müdahaleler, nadiren geçiliyorum', points: 16 },
            { text: 'Aggressive, disciplined, and dominant 1v1',       tr: 'Agresif, disiplinli ve baskın savunma',        points: 24 },
            { text: 'Elite defending — almost never beaten',           tr: 'Elit savunma — neredeyse hiç geçilmiyorum',   points: 30 },
        ]},
        { id: 'q3', question: 'How good is your positioning and reading of the game?', tr: 'Pozisyon alma ve oyun okuma becerin nasıl?', options: [
            { text: 'I don\'t think about positioning',           tr: 'Pozisyon almayı düşünmüyorum',             points: 0 },
            { text: 'Basic positional awareness',                 tr: 'Temel pozisyon farkındalığı',              points: 8 },
            { text: 'Can read attackers\' movements',             tr: 'Rakibin hareketlerini okuyabiliyorum',     points: 16 },
            { text: 'Manage the defensive line well',             tr: 'Savunma çizgisini iyi yönetiyorum',       points: 24 },
            { text: 'Elite game reading, control offside line',   tr: 'Elit oyun okuma, ofsayd çizgisini kontrol', points: 30 },
        ]},
        { id: 'q4', question: 'How do you perform in aerial duels?', tr: 'Hava toplarındaki performansın nasıl?', options: [
            { text: 'Very weak in the air',                    tr: 'Havada çok zayıfım',                  points: 0 },
            { text: 'Win some nearby headers',                 tr: 'Yakın topları kazanabiliyorum',        points: 8 },
            { text: 'Win most aerial challenges',              tr: 'Çoğu havada düelloyu kazanıyorum',     points: 16 },
            { text: 'Powerful and committed in the air',       tr: 'Güçlü ve kararlı kafa vuruşu',        points: 24 },
            { text: 'Dominant aerial presence, rarely beaten', tr: 'Havada baskın, neredeyse yenilmiyorum', points: 30 },
        ]},
        { id: 'q5', question: 'How well do you distribute the ball under pressure?', tr: 'Baskı altında top dağıtımın nasıl?', options: [
            { text: 'Often make mistakes under pressure',             tr: 'Baskı altında çok hata yapıyorum',         points: 0 },
            { text: 'Can play safe short passes',                     tr: 'Güvenli kısa pas verebiliyorum',          points: 8 },
            { text: 'Reliable short and medium range passing',        tr: 'Kısa ve orta mesafe pas güvenilir',       points: 16 },
            { text: 'Comfortable with long diagonal passes too',      tr: 'Uzun diyagonal pasları da kullanabiliyorum', points: 24 },
            { text: 'Can build attacks from the back under pressure', tr: 'Arkadan hücum başlatabiliyorum',          points: 30 },
        ]},
    ],

    football_midfielder: [
        { id: 'q1', question: 'How long have you been playing as a midfielder?', tr: 'Orta saha oyuncusu olarak kaç yıldır oynuyorsun?', options: [
            { text: 'Never / barely played', tr: 'Hiç / çok az',  points: 0 },
            { text: 'Less than 1 year',      tr: '1 yıldan az',   points: 6 },
            { text: '1–4 years',             tr: '1–4 yıl',       points: 14 },
            { text: '4–8 years',             tr: '4–8 yıl',       points: 22 },
            { text: '8+ years',              tr: '8+ yıl',        points: 30 },
        ]},
        { id: 'q2', question: 'How accurate are your short and long passes?', tr: 'Kısa ve uzun mesafe pas isabetliliğin nasıl?', options: [
            { text: 'Lose the ball frequently',                     tr: 'Sık sık top kaybediyorum',                   points: 0 },
            { text: 'Short passes reliable, long passes weak',      tr: 'Kısa paslar güvenilir, uzunlar zayıf',       points: 8 },
            { text: 'Decent accuracy at both ranges',               tr: 'Her iki mesafede de makul isabetlilik',       points: 16 },
            { text: 'Confident with long diagonals too',            tr: 'Uzun diyagonalları da güvenle kullanırım',   points: 24 },
            { text: 'Creative and precise with wide vision',        tr: 'Yaratıcı ve isabetli, geniş alan görüşü',    points: 30 },
        ]},
        { id: 'q3', question: 'How creative and composed are you in tight spaces?', tr: 'Dar alanda yaratıcılık ve top koruma yeteneğin?', options: [
            { text: 'Lose the ball quickly under pressure',         tr: 'Baskı altında çabuk top kaybediyorum',     points: 0 },
            { text: 'Sometimes hold it, sometimes lose it',         tr: 'Bazen koruyorum, bazen kaybediyorum',      points: 8 },
            { text: 'Good first touch, can turn and play out',      tr: 'İyi ilk dokunuş, dönerek oynayabiliyorum', points: 16 },
            { text: 'Calm and creative under pressure',             tr: 'Baskı altında sakin ve yaratıcıyım',       points: 24 },
            { text: 'Elite close control in tight areas',           tr: 'Dar alanda elit top kontrolü',             points: 30 },
        ]},
        { id: 'q4', question: 'How well do you press and cover ground?', tr: 'Pressing ve alan kapatma yeteneğin nasıl?', options: [
            { text: 'I rarely think about defending',                 tr: 'Savunmayı pek düşünmüyorum',              points: 0 },
            { text: 'Press when the opponent has the ball near me',  tr: 'Yakınımda topla ilgilendiğinde müdahale', points: 8 },
            { text: 'Contribute to team press',                      tr: 'Takım pressine katkı sağlıyorum',         points: 16 },
            { text: 'Smart pressing, good space coverage',           tr: 'Akıllı pressing, iyi alan kapatma',       points: 24 },
            { text: 'Can play both as a box-to-box and a DM / CAM', tr: 'Hem DM hem CAM olarak oynayabilirim',     points: 30 },
        ]},
        { id: 'q5', question: 'How effective is your shooting and goal contribution?', tr: 'Uzaktan şut ve gole katkı yeteneğin?', options: [
            { text: 'I avoid shooting',                             tr: 'Şut atmaktan kaçınıyorum',                 points: 0 },
            { text: 'Only shoot close range when the chance is clear', tr: 'Sadece net pozisyonda yakın şut atarım', points: 8 },
            { text: 'Accurate from midrange',                       tr: 'Orta mesafeden isabetli şutlarım var',     points: 16 },
            { text: 'Powerful and accurate from distance',          tr: 'Uzaktan güçlü ve isabetli şut atabilirim', points: 24 },
            { text: 'Creative midfielder — both goals and assists',  tr: 'Hem gol hem asist üreten yaratıcı orta',  points: 30 },
        ]},
    ],

    football_forward: [
        { id: 'q1', question: 'How long have you been playing as a forward or winger?', tr: 'Forvet / kanat olarak kaç yıldır oynuyorsun?', options: [
            { text: 'Never / barely played', tr: 'Hiç / çok az',  points: 0 },
            { text: 'Less than 1 year',      tr: '1 yıldan az',   points: 6 },
            { text: '1–4 years',             tr: '1–4 yıl',       points: 14 },
            { text: '4–8 years',             tr: '4–8 yıl',       points: 22 },
            { text: '8+ years',              tr: '8+ yıl',        points: 30 },
        ]},
        { id: 'q2', question: 'How clinical are you in front of goal?', tr: 'Kaleciyle karşı karşıya geldiğinde ne kadar isabetlisin?', options: [
            { text: 'Miss most clear chances',                         tr: 'Çoğu net pozisyonu kaçırıyorum',                     points: 0 },
            { text: 'Score occasionally',                              tr: 'Zaman zaman gol atabiliyorum',                       points: 8 },
            { text: 'Convert most clear-cut chances',                  tr: 'Net pozisyonların büyük çoğunluğunu gole çeviriyorum', points: 16 },
            { text: 'Cool-headed finisher with a powerful strike',     tr: 'Soğukkanlı ve güçlü bitiricilik',                    points: 24 },
            { text: 'Elite finishing across all shot types',           tr: 'Her şut tipinde elit bitiricilik',                    points: 30 },
        ]},
        { id: 'q3', question: 'How good is your movement to find space?', tr: 'Alan bulmak için hareket ve koşu yeteneğin nasıl?', options: [
            { text: 'I mostly stand still and wait for the ball',     tr: 'Genelde duruyorum ve topu bekliyorum',          points: 0 },
            { text: 'Make simple runs',                                tr: 'Basit koşular yapabiliyorum',                   points: 8 },
            { text: 'Make runs in behind and into channels',           tr: 'Arkaya koşu ve boşluğa açılmalar yapıyorum',    points: 16 },
            { text: 'Constant movement, tiring for defenders',        tr: 'Sürekli hareket, rakibi yoruyorum',             points: 24 },
            { text: 'Intelligent runs that break defensive lines',    tr: 'Savunmayı parçalayan zekice hareketler',        points: 30 },
        ]},
        { id: 'q4', question: 'How well can you hold up play with your back to goal?', tr: 'Sırtı dönük top alma ve koruma yeteneğin?', options: [
            { text: 'Lose the ball often when back is to goal',       tr: 'Sırtım dönük çok hata yapıyorum',              points: 0 },
            { text: 'Sometimes hold, sometimes lose it',              tr: 'Bazen koruyorum, bazen kaybediyorum',          points: 8 },
            { text: 'Can protect the ball under pressure',            tr: 'Baskı altında topu koruyabiliyorum',           points: 16 },
            { text: 'Strong body use, good link-up play',             tr: 'Güçlü vücut kullanımı, iyi bağlantı oyunu',   points: 24 },
            { text: 'Powerful and quick — hard to dispossess',        tr: 'Güçlü ve hızlı — toptan koparılması zor',     points: 30 },
        ]},
        { id: 'q5', question: 'How effective are you on the counter-attack?', tr: 'Kontr atakta hız ve etkinliğin nasıl?', options: [
            { text: 'Not effective on counters',                       tr: 'Kontrlarda pek etkili değilim',                  points: 0 },
            { text: 'Can burst forward when the chance is obvious',   tr: 'Fırsat belirince hızlanabiliyorum',              points: 8 },
            { text: 'Good on the counter, create danger',             tr: 'Kontra iyi çıkıyorum, tehlike yaratıyorum',      points: 16 },
            { text: 'Fast and decisive, bypass defenders',            tr: 'Hızlı ve kararlı, savunmayı geçebiliyorum',     points: 24 },
            { text: 'Nearly unstoppable in transition',               tr: 'Kontrlarda neredeyse durdurulamıyorum',          points: 30 },
        ]},
    ],

    football_allrounder: [
        { id: 'q1', question: 'How long have you been playing football?', tr: 'Kaç yıldır futbol oynuyorsun?', options: [
            { text: 'Never / barely played', tr: 'Hiç / çok az',  points: 0 },
            { text: 'Less than 1 year',      tr: '1 yıldan az',   points: 6 },
            { text: '1–4 years',             tr: '1–4 yıl',       points: 14 },
            { text: '4–8 years',             tr: '4–8 yıl',       points: 22 },
            { text: '8+ years',              tr: '8+ yıl',        points: 30 },
        ]},
        { id: 'q2', question: 'How good is your overall ball control and first touch?', tr: 'Genel top kontrolü ve ilk dokunuşun nasıl?', options: [
            { text: 'Lose the ball frequently',                   tr: 'Sık sık top kaybediyorum',              points: 0 },
            { text: 'Decent control on an open pitch',            tr: 'Açık zeminde makul kontrol',            points: 8 },
            { text: 'Good first touch under pressure',            tr: 'Baskı altında iyi ilk dokunuş',         points: 16 },
            { text: 'Quick turns and control in tight spaces',    tr: 'Dar alanda hızlı çevrim ve kontrol',    points: 24 },
            { text: 'Elite ball control across all positions',    tr: 'Her pozisyonda elit top kontrolü',      points: 30 },
        ]},
        { id: 'q3', question: 'How well do you understand team tactics and positioning?', tr: 'Takım taktiklerini ve pozisyon almayı ne kadar anlıyorsun?', options: [
            { text: 'I don\'t think about tactics',                  tr: 'Taktik hakkında düşünmüyorum',             points: 0 },
            { text: 'Basic positional awareness',                    tr: 'Temel pozisyon farkındalığı',               points: 8 },
            { text: 'Understand my role in the team',                tr: 'Takımdaki rolümü anlıyorum',                points: 16 },
            { text: 'Read the game well, adapt to different systems',tr: 'Oyunu iyi okuyorum, farklı sistemlere uyum', points: 24 },
            { text: 'High tactical IQ — fit into any formation',     tr: 'Yüksek taktik zekâ, her formasyona uyum',  points: 30 },
        ]},
        { id: 'q4', question: 'How fit and athletic are you on the pitch?', tr: 'Fiziksel kondisyon ve saha içi atletizm nasıl?', options: [
            { text: 'Tire quickly, struggle to cover ground',       tr: 'Çabuk yoruluyorum, alan kapatmakta zorlanıyorum', points: 0 },
            { text: 'Average fitness',                              tr: 'Orta düzey kondisyon',                           points: 8 },
            { text: 'Stay active throughout a full match',          tr: 'Maç süresince aktif kalabiliyorum',               points: 16 },
            { text: 'High tempo, strong and agile',                 tr: 'Yüksek tempo, güçlü ve çevik',                    points: 24 },
            { text: 'Elite fitness — high pace from start to finish', tr: 'Elit fizik, baştan sona yüksek tempo',        points: 30 },
        ]},
        { id: 'q5', question: 'What level have you played at?', tr: 'Hangi seviyede oynadın?', options: [
            { text: 'Casual / five-a-side',            tr: 'Arkadaş maçı / halı saha',         points: 0 },
            { text: 'Amateur club',                    tr: 'Amatör kulüp',                     points: 8 },
            { text: 'Regional / district league',      tr: 'Bölgesel / ilçe ligi',             points: 16 },
            { text: 'National amateur or semi-pro',    tr: 'Ulusal amatör / yarı profesyonel', points: 24 },
            { text: 'Professional / academy graduate', tr: 'Profesyonel / akademi mezunu',     points: 30 },
        ]},
    ],

    basketball: [
        {
            id: 'q1',
            question: 'How long have you been playing basketball?',
            tr: 'Kaç yıldır basketbol oynuyorsun?',
            options: [
                { text: 'Less than 1 year', tr: '1 yıldan az',   points: 0 },
                { text: '1–3 years',        tr: '1–3 yıl',       points: 8 },
                { text: '3–6 years',        tr: '3–6 yıl',       points: 16 },
                { text: '6–10 years',       tr: '6–10 yıl',      points: 24 },
                { text: '10+ years',        tr: '10+ yıl',       points: 30 },
            ],
        },
        {
            id: 'q2',
            question: 'How consistent is your shooting (mid-range, 3-point)?',
            tr: 'Atışlarının (orta mesafe, 3 sayılık) tutarlılığı nasıl?',
            options: [
                { text: 'Can\'t shoot reliably',               tr: 'Güvenilir atışım yok',                   points: 0 },
                { text: 'Good layups, weak outside',           tr: 'Layup iyi, uzak atışlar zayıf',          points: 8 },
                { text: 'Mid-range is solid',                  tr: 'Orta mesafe sağlam',                     points: 16 },
                { text: '3-point shooting above 35%',          tr: '3 sayılık isabetim %35 üzeri',           points: 24 },
                { text: 'Consistent from all ranges',          tr: 'Her mesafeden tutarlı',                  points: 30 },
            ],
        },
        {
            id: 'q3',
            question: 'How good is your ball-handling and passing?',
            tr: 'Top kontrolün ve pasın nasıl?',
            options: [
                { text: 'Struggle to dribble with pressure',   tr: 'Baskı altında dribling yapmakta zorlanıyorum', points: 0 },
                { text: 'Decent with one hand',                tr: 'Tek elle makul',                               points: 8 },
                { text: 'Both hands, good vision',             tr: 'Her iki elle, iyi vizyon',                    points: 16 },
                { text: 'Creative passes, tight dribbling',    tr: 'Yaratıcı paslar, sıkı dribling',              points: 24 },
                { text: 'Playmaker level, elite handles',      tr: 'Playmaker seviyesi, elit kontrol',            points: 30 },
            ],
        },
        {
            id: 'q4',
            question: 'What level have you competed at?',
            tr: 'Hangi seviyede mücadele ettin?',
            options: [
                { text: 'Pickup and recreational',        tr: 'Sokak / rekreasyon',                    points: 0 },
                { text: 'School / club team',             tr: 'Okul / kulüp takımı',                   points: 8 },
                { text: 'District / regional league',     tr: 'İlçe / bölge ligi',                     points: 16 },
                { text: 'National amateur level',         tr: 'Ulusal amatör seviye',                  points: 24 },
                { text: 'Semi-pro or professional',       tr: 'Yarı profesyonel veya profesyonel',     points: 30 },
            ],
        },
        {
            id: 'q5',
            question: 'How is your defensive intensity and awareness?',
            tr: 'Savunma yoğunluğun ve farkındalığın nasıl?',
            options: [
                { text: 'Rarely defend actively',              tr: 'Nadiren aktif savunma yapıyorum',              points: 0 },
                { text: 'Basic on-ball defense',               tr: 'Temel top üstü savunma',                       points: 8 },
                { text: 'Understand help defense',             tr: 'Yardım savunmasını anlıyorum',                 points: 16 },
                { text: 'Disciplined, can guard multiple',     tr: 'Disiplinli, birden fazla oyuncuyu savunurum',  points: 24 },
                { text: 'Lockdown defender, reads offense',    tr: 'Kilit savunucu, hücumu okuyorum',              points: 30 },
            ],
        },
    ],

    // ─── VOLLEYBALL — 5-category weighted assessment (0-5 puan skalası, kategori
    // puanları dogrudan agirlikla carpilip toplanir; getQuestions()/calculateLevel()
    // yerine calculateVolleyballScore() kullanilir, bkz. asagida). Her sorunun
    // `weight`'i kategori agirligidir (toplam 1.00).
    volleyball: [
        {
            id: 'q1', section: 1, weight: 0.15,
            question: 'Which best describes your volleyball experience and growth?',
            tr: 'Deneyimini ve gelişimini en iyi hangisi tanımlıyor?',
            options: [
                { text: "I'm new, still learning the rules by watching matches", tr: 'Tamamen yeni başlıyorum, kuralları maç izledikçe öğreniyorum', points: 0 },
                { text: "I've played casually on the beach/picnics for years, no intention to improve", tr: 'Yıllardır sadece sahilde veya piknikte keyfine oynarım, kendimi geliştirmek gibi bir amacım olmadı', points: 1 },
                { text: "I play hobby matches 1-2 days a week, been playing for years but no formal coaching, I play my own way", tr: 'Haftada 1-2 gün hobi amaçlı maçlara gidiyorum. Yıllardır oynuyorum ama düzenli bir antrenör eğitimi almadım, kendi tarzımla oynuyorum', points: 2.5 },
                { text: 'I trained regularly and competed in tournaments with school, university or company teams', tr: 'Okul, üniversite veya şirket takımlarında düzenli antrenman yaptım ve turnuvalara katıldım', points: 4 },
                { text: 'I had youth academy training, played/play licensed at regional/national club level', tr: 'Altyapı eğitimi aldım, lisanslı olarak kulüplerde bölgesel/ulusal liglerde oynadım veya aktif oynuyorum', points: 5 },
            ],
        },
        {
            id: 'q2', section: 2, weight: 0.25,
            question: 'How would you describe your passing/setting technique (manşet/pas)?',
            tr: 'Teknik becerini (manşet/pas) en iyi hangisi tanımlıyor?',
            options: [
                { text: 'Touching the ball hurts, I cannot direct it', tr: 'Topa vururken canım acıyor, yönlendiremiyorum', points: 0 },
                { text: "I can bump/set easy balls but they don't reach the setter precisely, I just keep the ball in play", tr: 'Basit gelen toplara manşet veya parmak pas atabiliyorum ama pasöre tam gitmiyor, top sahada kalsın yeter kafasındayım', points: 1.5 },
                { text: 'I can deliver hard serves/spikes to the setter (position 3) about 50% of the time', tr: 'Gelen sert servisleri veya smaçları %50 oranında pasörün önüne (3 numara) ulaştırabiliyorum', points: 3 },
                { text: 'As a setter, I can deliberately set the hitter high/low, front/back at the height I choose', tr: 'Pasörüm; her türlü manşeti/parmak pası smaçöre bilerek, arkaya veya öne istenen yükseklikte (kurşun pas, yüksek pas) atabilirim', points: 4.5 },
                { text: 'Professional-level technique — one-foot attack pass, dump/set-attack, pinpoint set after a dive', tr: 'Profesyonel düzeyde tekniğe sahibim; tek ayak hücum pası, smaç pas veya plonjon sonrası nokta pas çıkarabilirim', points: 5 },
            ],
        },
        {
            id: 'q3', section: 3, weight: 0.20,
            question: 'How would you describe your physicality and spike power?',
            tr: 'Fizik ve smaç gücünü en iyi hangisi tanımlıyor?',
            options: [
                { text: "I can't reach the net, I just throw the ball across", tr: 'Fileye uzanamıyorum, topları sadece karşıya fırlatıyorum', points: 0 },
                { text: "My height/jump isn't enough for a clean spike, I usually place softly or push it over with my wrist", tr: 'Boyum veya sıçramam net smaç vurmaya yetmiyor; genelde boşluklara plase (yavaş bırakma) veya bilek hareketiyle orta sertlikte vuruyorum', points: 2 },
                { text: 'I can spike cleanly over the net but make mistakes against blocks or bad sets', tr: 'File üzerinden net smaç vurabiliyorum ancak blok gördüğümde veya top kötü geldiğinde hata yapıyorum', points: 3.5 },
                { text: 'High jump, I can spike hard over/around the block, pick and kill the line or cross I want', tr: 'Sıçrama çizgim yüksek, bloğun üzerinden veya arasından sert smaç vurabiliyorum. İstediğim paraleli veya çaprazı seçip topu "öldürebiliyorum"', points: 5 },
            ],
        },
        {
            id: 'q4', section: 4, weight: 0.20,
            question: 'How would you describe your positional/court knowledge?',
            tr: 'Pozisyon ve saha bilgini en iyi hangisi tanımlıyor?',
            options: [
                { text: "I don't know where to stand on court, I just hit whatever comes to me", tr: 'Sahada nerede duracağımı bilmiyorum, top bana gelince vuruyorum', points: 0 },
                { text: "I know basic rotation (1 to 6) but get confused who's the setter/hitter in play, I rarely cover the back of the block", tr: 'Temel dönüşleri (1\'den 6\'ya dönmeyi) biliyorum ama oyun içinde kim pasör, kim smaçör karışıyor; arka alanda dublaja (bloğun arkasını korumaya) pek girmem', points: 2 },
                { text: 'I know the 4-2 or 5-1 system in theory, I position myself knowing where to move on serve-receive and who covers what', tr: '4-2 veya 5-1 sistemini teorik olarak biliyorum. Servis karşılanırken nereye kaçacağımı, sahada kimin arkasını kapatacağımı bilerek pozisyon alırım', points: 3.5 },
                { text: 'I play the 5-1 system flawlessly, never make rotation errors, can shift the defensive line (perimeter/mid/corner) live based on the opponent attack', tr: '5-1 sistemini kusursuz oynarım. Dönüşlerde (rotasyon) asla hata yapmam, rakip hücumuna göre savunma hattını (hata, orta, köşe) anlık kaydırabilirim', points: 5 },
            ],
        },
        {
            id: 'q5', section: 5, weight: 0.20,
            question: 'How would you describe your mental game and team fit?',
            tr: 'Mental ve takım içi uyumunu en iyi hangisi tanımlıyor?',
            options: [
                { text: 'I get upset when a teammate makes a mistake, my concentration drops immediately', tr: 'Takım arkadaşım hata yapınca sinirlenirim, oyun konsantrasyonum hemen düşer', points: 0 },
                { text: "I play quietly, I don't communicate much on court. My mood drops when the team falls behind but I don't say anything to anyone", tr: 'Sessiz oynarım, sahada pek iletişim kurmam. Takım geriye düştüğünde modum düşer ama kimseye de bir şey demem', points: 2 },
                { text: "I'm a team player, I constantly talk saying \"mine\" or \"leave it\", I applaud and support a teammate even after a mistake", tr: 'Takım oyuncusuyumdur, sürekli "bende" veya "bırak" diyerek konuşarak oynarım. Arkadaşım hata yapsa da alkışlar, moral veririm', points: 3.5 },
                { text: "I'm a real on-court leader (captain character). I lift the team when it's collapsing, warn teammates tactically, and can stay calm and turn a match around", tr: 'Tam bir saha içi lideriyim (Kaptan karakteri). Takım çöktüğünde ayağa kaldırırım, taktiksel olarak arkadaşları uyarırım ve sakin kalıp maçı çevirebilirim', points: 5 },
            ],
        },
    ],

    // Shared default for sports without specific questions
    _default: [
        {
            id: 'q1',
            question: 'How long have you been involved in this activity?',
            tr: 'Bu aktiviteye ne kadar süredir devam ediyorsun?',
            options: [
                { text: 'Just starting out',    tr: 'Yeni başlıyorum',      points: 0 },
                { text: 'Less than 1 year',      tr: '1 yıldan az',          points: 8 },
                { text: '1–3 years',             tr: '1–3 yıl',              points: 16 },
                { text: '3–6 years',             tr: '3–6 yıl',              points: 23 },
                { text: '6+ years',              tr: '6+ yıl',               points: 30 },
            ],
        },
        {
            id: 'q2',
            question: 'How would you rate your current skill level?',
            tr: 'Mevcut beceri seviyeni nasıl değerlendirirsin?',
            options: [
                { text: 'Complete beginner',                  tr: 'Tam yeni başlayan',                      points: 0 },
                { text: 'Still learning basics',              tr: 'Hâlâ temelleri öğreniyorum',             points: 8 },
                { text: 'Comfortable with most fundamentals', tr: 'Çoğu temel konuda rahatım',              points: 16 },
                { text: 'Advanced practitioner',              tr: 'İleri seviye',                           points: 24 },
                { text: 'Expert / near-professional',         tr: 'Uzman / neredeyse profesyonel',          points: 30 },
            ],
        },
        {
            id: 'q3',
            question: 'Have you received any formal training or coaching?',
            tr: 'Resmi bir eğitim veya antrenörlük aldın mı?',
            options: [
                { text: 'No training at all',             tr: 'Hiç eğitim almadım',                        points: 0 },
                { text: 'Brief introduction / workshop',  tr: 'Kısa tanıtım / atölye',                     points: 8 },
                { text: 'Regular coaching or lessons',    tr: 'Düzenli antrenörlük veya ders',             points: 16 },
                { text: 'Long-term structured training',  tr: 'Uzun süreli yapılandırılmış antrenman',     points: 24 },
                { text: 'Professional coaching program',  tr: 'Profesyonel antrenörlük programı',          points: 30 },
            ],
        },
        {
            id: 'q4',
            question: 'Have you competed or performed publicly in this activity?',
            tr: 'Bu aktivitede yarıştın veya kamuoyu önünde performans sergiledin mi?',
            options: [
                { text: 'Never',                         tr: 'Hiç',                                        points: 0 },
                { text: 'Casual / friendly competitions', tr: 'Sosyal / dostluk yarışmaları',              points: 8 },
                { text: 'Local competitions',            tr: 'Yerel yarışmalar',                           points: 16 },
                { text: 'Regional or national events',   tr: 'Bölgesel veya ulusal etkinlikler',           points: 24 },
                { text: 'International level',           tr: 'Uluslararası seviye',                        points: 30 },
            ],
        },
        {
            id: 'q5',
            question: 'How many hours per week do you dedicate to this activity?',
            tr: 'Bu aktiviteye haftada kaç saat ayırıyorsun?',
            options: [
                { text: 'Less than 1 hour',    tr: '1 saatten az',     points: 0 },
                { text: '1–3 hours',           tr: '1–3 saat',         points: 8 },
                { text: '3–6 hours',           tr: '3–6 saat',         points: 16 },
                { text: '6–10 hours',          tr: '6–10 saat',        points: 24 },
                { text: '10+ hours',           tr: '10+ saat',         points: 30 },
            ],
        },
    ],
};

// Get questions for a sport (falls back to _default), localised to lang ('en'|'tr')
export function getQuestions(subCategory, lang = 'en') {
    const raw = QUESTIONS[subCategory.toLowerCase()] || QUESTIONS._default;
    if (lang === 'en') return raw;
    // Map each question to its TR text when available, fall back to English
    return raw.map(q => ({
        ...q,
        question: q.tr || q.question,
        options: q.options.map(o => ({ ...o, text: o.tr || o.text })),
    }));
}

// Calculate level, skillRating (0.00–5.00) and points from assessment score
export function calculateLevel(totalScore, maxScore) {
    const pct = maxScore > 0 ? totalScore / maxScore : 0;

    // skillRating: 0.00 – 5.00 with 2 decimal places
    const skillRating = parseFloat((pct * 5).toFixed(2));

    // totalPoints: exact score mapped to 0–100 scale
    const totalPoints = Math.round(pct * 100);

    // Level thresholds based on percentage
    let level;
    if (pct >= 0.80) level = 'PRO';
    else if (pct >= 0.56) level = 'ADVANCED';
    else if (pct >= 0.28) level = 'INTERMEDIATE';
    else level = 'BEGINNER';

    return { level, skillRating, totalPoints };
}

// ─── VOLLEYBALL honeypot — sadece 'q4' (Pozisyon) sorusuna en üst şık (5 puan,
// "5-1 sistemini kusursuz oynarım...") seçilirse tetiklenir. Dogru cevap (correctIndex)
// asla client'a gönderilmez; sadece getVolleyballHoneypotPublic() ile filtrelenmiş hali gider.
export const VOLLEYBALL_HONEYPOT = {
    id: 'honeypot_v1',
    triggerQuestionId: 'q4',
    triggerOptionPoints: 5,
    question: 'In the 5-1 system, when the setter rotates to the front row, who runs the offense?',
    tr: '5-1 sisteminde pasör ön sıraya döndüğünde, hücumu kim organize eder?',
    correctIndex: 2,
    options: [
        { text: 'The libero, from the back row', tr: 'Libero, arka sıradan', },
        { text: 'The opposite hitter takes over as setter', tr: 'Pasör-karşısı (opposite) devreye girip pasörlük yapar', },
        { text: 'The setter still sets, but from the front row (right-front)', tr: 'Pasör yine pas atar, ama ön sıradan (sağ ön) çıkar', },
        { text: 'The team switches to a 6-2 rotation automatically', tr: 'Takım otomatik olarak 6-2 rotasyonuna geçer', },
    ],
};

export function getVolleyballHoneypotPublic(lang = 'en') {
    const { correctIndex, ...rest } = VOLLEYBALL_HONEYPOT;
    if (lang === 'en') return rest;
    return {
        ...rest,
        question: rest.tr || rest.question,
        options: rest.options.map(o => ({ ...o, text: o.tr || o.text })),
    };
}

// Voleybol için ağırlıklı kategori puanlaması: finalScore = Σ(points_i × weight_i).
// Honeypot yanlış cevaplanmışsa (üst Pozisyon şıkkı seçilip takip sorusu yanlışsa),
// q4'ün katkısı kullanıcıya sebep gösterilmeden 5 yerine 2.5 üzerinden hesaplanır.
// calculateLevel() ile aynı eşikleri kullanır ama onu DEĞİŞTİRMEZ — bağımsız fonksiyon.
export function calculateVolleyballScore(answers, honeypotOptionIndex = null) {
    const questions = QUESTIONS.volleyball;
    let finalScore = 0;

    for (const q of questions) {
        const ans = answers[q.id];
        const opt = q.options[ans];
        if (!opt) continue;

        let points = opt.points;
        if (
            q.id === VOLLEYBALL_HONEYPOT.triggerQuestionId &&
            points === VOLLEYBALL_HONEYPOT.triggerOptionPoints &&
            honeypotOptionIndex !== null &&
            honeypotOptionIndex !== VOLLEYBALL_HONEYPOT.correctIndex
        ) {
            points = 2.5;
        }

        finalScore += points * q.weight;
    }

    finalScore = parseFloat(finalScore.toFixed(2));
    const pct = finalScore / 5;

    let level;
    if (pct >= 0.80) level = 'PRO';
    else if (pct >= 0.56) level = 'ADVANCED';
    else if (pct >= 0.28) level = 'INTERMEDIATE';
    else level = 'BEGINNER';

    const skillRating = finalScore;
    const totalPoints = Math.round(pct * 100);

    return { level, skillRating, totalPoints };
}
