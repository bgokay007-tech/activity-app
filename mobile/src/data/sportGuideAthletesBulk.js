/**
 * Spor rehberi — ek sporcu havuzu (tenis + diğer dallar).
 * Kaynaklar: ATP/WTA, Olympics, ESPN Top 20, FIP/Premier Padel, BWF, ITTF, FIVB, PPA.
 * Detay modalında Wikipedia + dal kaynakları otomatik eklenir (sportGuides.js).
 */

const L = (en, tr, ru, de) => ({ en, tr, ru, de });

function Q({
    id, name, years, country = '', status = 'legend', peakRank = 1,
    tour = null, fallbackRank = null, wiki,
    bio, life, ach, adv, sty,
}) {
    const wikiSlug = wiki || name.replace(/ /g, '_');
    return {
        id,
        name,
        years: years || '',
        country,
        tour,
        status,
        peakRank,
        fallbackRank,
        rankingKey: name.toLowerCase(),
        wiki: wikiSlug,
        bio,
        detail: {
            life: life || bio,
            achievements: ach || bio,
            advice: adv || L(
                'Study match film of their best surface; copy patterns, not just highlights.',
                'En iyi zeminindeki maç filmlerini izle; sadece highlight değil kalıpları kopyala.',
                'Смотрите матчи на их лучшем покрытии; копируйте схемы, не только хайлайты.',
                'Matchfilme auf ihrer besten Oberfläche studieren; Muster kopieren, nicht nur Highlights.'
            ),
            style: sty || bio,
        },
        links: [{
            label: L('Interviews / talks', 'Röportaj / konuşma', 'Интервью', 'Interviews'),
            url: `https://www.youtube.com/results?search_query=${encodeURIComponent(name + ' interview')}`,
        }],
        // sources boş bırakılır → getSportGuide Wikipedia + dal kaynak bankasını ekler
        sources: [],
    };
}

/* ─── TENNIS MORE (~40) ─── */
export const TENNIS_MORE = [
    Q({
        id: 'sampras', name: 'Pete Sampras', years: '1971–', country: '🇺🇸', peakRank: 1, wiki: 'Pete_Sampras',
        bio: L('Serve-and-volley king of the 90s — 14 majors before the Big Three era.', '90’ların servis-vole kralı — Big Three öncesi 14 major.', 'Король подачи-воллея 90-х — 14 мейджоров до Big Three.', 'Serve-and-Volley-König der 90er — 14 Majors vor der Big Three.'),
        ach: L('14 Grand Slams; 6 Wimbledon; 5 US Open; 286 weeks at No. 1.', '14 Grand Slam; 6 Wimbledon; 5 US Open; 286 hafta 1 numara.', '14 Grand Slam; 6 Уимблдон; 5 US Open; 286 недель №1.', '14 Grand Slams; 6× Wimbledon; 5× US Open; 286 Wochen Nr. 1.'),
        sty: L('First-strike serve; chip-charge; calm big-point gene.', 'First-strike servis; chip-charge; sakin kritik puan geni.', 'Атакующая подача; chip-charge; спокойствие в больших очках.', 'First-Strike-Aufschlag; Chip-Charge; Ruhe bei Big Points.'),
    }),
    Q({
        id: 'agassi', name: 'Andre Agassi', years: '1970–', country: '🇺🇸', peakRank: 1, wiki: 'Andre_Agassi',
        bio: L('Career Slam + Olympic gold; return genius who reinvented himself mid-career.', 'Kariyer Slam + Olimpiyat altını; mid-career yeniden doğan karşılama dehası.', 'Карьерный Slam + олимпийское золото; гений приёма с перезапуском карьеры.', 'Career Slam + Olympia-Gold; Return-Genie mit Karriere-Neustart.'),
        ach: L('8 majors; Career Golden Slam; Davis Cup; long No. 1 stretches.', '8 major; Kariyer Golden Slam; Davis Cup; uzun 1 numara.', '8 мейджоров; карьерный Golden Slam; Кубок Дэвиса.', '8 Majors; Career Golden Slam; Davis Cup; Nr.-1-Phasen.'),
        sty: L('Best return of his era; take the ball early; aggressive baseline.', 'Döneminin en iyi karşılaması; topu erken al; agresif baseline.', 'Лучший приём эпохи; ранний удар; агрессивная база.', 'Bester Return seiner Ära; früh treffen; aggressive Baseline.'),
    }),
    Q({
        id: 'mcenroe', name: 'John McEnroe', years: '1959–', country: '🇺🇸', peakRank: 1, wiki: 'John_McEnroe',
        bio: L('Touch artist — lefty angles, soft hands, fiery temperament; 7 majors.', 'Dokunuş sanatçısı — solak açılar, yumuşak eller, ateşli mizaç; 7 major.', 'Мастер касания — левые углы, мягкие руки, темперамент; 7 мейджоров.', 'Touch-Künstler — linke Winkel, weiche Hände, Temperament; 7 Majors.'),
        ach: L('7 Grand Slams; 77 titles; 170 weeks No. 1; doubles legend.', '7 Grand Slam; 77 unvan; 170 hafta 1 numara; çiftler efsanesi.', '7 Grand Slam; 77 титулов; 170 недель №1; легенда пар.', '7 Grand Slams; 77 Titel; 170 Wochen Nr. 1; Doppel-Legende.'),
        sty: L('Feel volleys; lefty serve wide; improvisation under pressure.', 'His voleleri; solak geniş servis; baskıda doğaçlama.', 'Чувствительные волеи; широкая левая подача; импровизация.', 'Gefühl-Volleys; linker weiter Aufschlag; Improvisation.'),
    }),
    Q({
        id: 'connors', name: 'Jimmy Connors', years: '1952–', country: '🇺🇸', peakRank: 1, wiki: 'Jimmy_Connors',
        bio: L('Open-era title king (109) — two-handed BH pioneer, never-quit fighter.', 'Open era unvan kralı (109) — çift elli BH öncüsü, asla pes etmeyen savaşçı.', 'Король титулов Open Era (109) — пионер двуручного БХ.', 'Titelkönig der Open Era (109) — Pionier der zweihändigen RH.'),
        ach: L('8 majors; 109 singles titles (men’s record); 160 weeks No. 1.', '8 major; 109 tekler unvanı (erkek rekoru); 160 hafta 1 numara.', '8 мейджоров; 109 титулов (рекорд); 160 недель №1.', '8 Majors; 109 Einzeltitel (Rekord); 160 Wochen Nr. 1.'),
        sty: L('Flat two-hand BH; return aggression; crowd-fuelled intensity.', 'Düz çift elli BH; agresif karşılama; tribün yakıtlı yoğunluk.', 'Плоский двуручный БХ; агрессивный приём; энергия толпы.', 'Flache zweihändige RH; aggressiver Return; Crowd-Intensität.'),
    }),
    Q({
        id: 'lendl', name: 'Ivan Lendl', years: '1960–', country: '🇨🇿', peakRank: 1, wiki: 'Ivan_Lendl',
        bio: L('Power baseline blueprint of the 80s — 8 majors, fitness culture pioneer.', '80’lerin güç baseline planı — 8 major, fitness kültürü öncüsü.', 'Чертёж мощной базы 80-х — 8 мейджоров, пионер фитнеса.', 'Power-Baseline-Blaupause der 80er — 8 Majors, Fitness-Pionier.'),
        ach: L('8 Grand Slams; 94 titles; 270 weeks No. 1; 19 major finals.', '8 Grand Slam; 94 unvan; 270 hafta 1 numara; 19 major final.', '8 Grand Slam; 94 титула; 270 недель №1; 19 финалов.', '8 Grand Slams; 94 Titel; 270 Wochen Nr. 1; 19 Major-Finals.'),
        sty: L('Heavy FH; serve placement; mental steel after early finals losses.', 'Ağır FH; servis yerleştirme; erken final kayıpları sonrası çelik zihin.', 'Тяжёлый ФХ; размещение подачи; стальной ментал.', 'Schwere VH; Aufschlag-Platzierung; mentale Stärke.'),
    }),
    Q({
        id: 'borg', name: 'Björn Borg', years: '1956–', country: '🇸🇪', peakRank: 1, wiki: 'Björn_Borg',
        bio: L('Ice-man of clay and grass — 11 majors, 5 straight Wimbledons, teenage icon.', 'Toprak ve çimin buz adamı — 11 major, 5 üst üste Wimbledon, gençlik ikonu.', 'Ледяной король грунта и травы — 11 мейджоров, 5 Уимблдонов подряд.', 'Eismann von Sand und Rasen — 11 Majors, 5 Wimbledons in Folge.'),
        ach: L('11 Grand Slams; 6 French Opens; 5 Wimbledon; 109-match clay streak.', '11 Grand Slam; 6 Fransa Açık; 5 Wimbledon; 109 maçlık toprak serisi.', '11 Grand Slam; 6 RG; 5 Уимблдон; серия 109 на грунте.', '11 Grand Slams; 6× RG; 5× Wimbledon; 109er Sand-Serie.'),
        sty: L('Heavy topspin; ice temperament; unmatched clay-to-grass switch.', 'Ağır topspin; buz mizaç; eşsiz toprak-çim geçişi.', 'Сильный топспин; ледяной характер; переход грунт→трава.', 'Schweres Topspin; Eis-Temperament; Sand→Rasen-Wechsel.'),
    }),
    Q({
        id: 'laver', name: 'Rod Laver', years: '1938–', country: '🇦🇺', peakRank: 1, wiki: 'Rod_Laver',
        bio: L('Only man with two calendar Grand Slams (1962, 1969) — the Rocket.', 'Takvim Grand Slam’ini iki kez yapan tek erkek (1962, 1969) — Rocket.', 'Единственный с двумя календарными Slam (1962, 1969) — Rocket.', 'Einziger Mann mit zwei Kalender-Slams (1962, 1969) — Rocket.'),
        ach: L('11 majors (20 counting pre-Open); dual calendar Slam; lefty all-court genius.', '11 major (Open öncesi 20); çift takvim Slam; solak all-court deha.', '11 мейджоров (20 с до-Open); два календарных Slam.', '11 Majors (20 inkl. Pre-Open); zwei Kalender-Slams.'),
        sty: L('Lefty whip; serve-volley and baseline alike; court craft.', 'Solak kırbaç; servis-vole ve baseline; kort zekâsı.', 'Левый хлёст; и у сетки, и с базы; мастерство.', 'Linker Whip; Serve-Volley und Baseline; Court-Craft.'),
    }),
    Q({
        id: 'becker', name: 'Boris Becker', years: '1967–', country: '🇩🇪', peakRank: 1, wiki: 'Boris_Becker',
        bio: L('Boom Boom — youngest Wimbledon men’s champ; diving volleys, huge serve.', 'Boom Boom — en genç Wimbledon erkek şampiyonu; dalış vole, koca servis.', 'Boom Boom — самый молодой чемпион Уимблдона; нырки у сетки.', 'Boom Boom — jüngster Wimbledon-Herrenchampion; Flug-Volleys.'),
        ach: L('6 majors; 49 titles; 12 weeks No. 1; Davis Cup hero for Germany.', '6 major; 49 unvan; 12 hafta 1 numara; Almanya Davis Cup kahramanı.', '6 мейджоров; 49 титулов; 12 недель №1; герой Кубка Дэвиса.', '6 Majors; 49 Titel; 12 Wochen Nr. 1; Davis-Cup-Held.'),
        sty: L('Serve + dive volley; grass specialist who also won on hard/clay.', 'Servis + dalış vole; çim uzmanı, sert/toprakta da şampiyon.', 'Подача + нырок-волей; специалист травы.', 'Aufschlag + Flug-Volley; Rasen-Spezialist.'),
    }),
    Q({
        id: 'edberg', name: 'Stefan Edberg', years: '1966–', country: '🇸🇪', peakRank: 1, wiki: 'Stefan_Edberg',
        bio: L('Elegant serve-volley Swede — 6 majors, one of the purest net games ever.', 'Zarif servis-vole İsveçlisi — 6 major, gelmiş geçmiş en saf file oyunlarından.', 'Элегантный швед у сетки — 6 мейджоров, чистейшая игра у сетки.', 'Eleganter Serve-Volley-Schwede — 6 Majors, reinstes Netzspiel.'),
        ach: L('6 Grand Slams; 41 titles; 72 weeks No. 1; Sportsmanship Award namesake.', '6 Grand Slam; 41 unvan; 72 hafta 1 numara; Sportsmanship ödülüne adını verdi.', '6 Grand Slam; 41 титул; 72 недели №1.', '6 Grand Slams; 41 Titel; 72 Wochen Nr. 1.'),
        sty: L('Kick serve + first volley; one-hand BH slice; gentleman intensity.', 'Kick servis + ilk vole; tek elli BH slice; centilmen yoğunluk.', 'Кик-подача + первый волей; одноручный слайс.', 'Kick-Aufschlag + erster Volley; einhändiger Slice.'),
    }),
    Q({
        id: 'wilander', name: 'Mats Wilander', years: '1964–', country: '🇸🇪', peakRank: 1, wiki: 'Mats_Wilander',
        bio: L('Swedish all-surface champion — 7 majors including three in 1988.', 'İsveçli tüm zemin şampiyonu — 7 major, 1988’de üçü.', 'Шведский чемпион всех покрытий — 7 мейджоров, три в 1988.', 'Schwedischer All-Surface-Champion — 7 Majors, drei 1988.'),
        ach: L('7 Grand Slams; 33 titles; 20 weeks No. 1; Davis Cup cornerstone.', '7 Grand Slam; 33 unvan; 20 hafta 1 numara; Davis Cup direği.', '7 Grand Slam; 33 титула; 20 недель №1.', '7 Grand Slams; 33 Titel; 20 Wochen Nr. 1.'),
        sty: L('Counter-puncher IQ; clay patience; hard-court adaptation.', 'Kontra IQ; toprak sabrı; sert kort adaptasyonu.', 'Контрпанчерский IQ; терпение на грунте.', 'Konter-IQ; Sand-Geduld; Hartplatz-Anpassung.'),
    }),
    Q({
        id: 'murray', name: 'Andy Murray', years: '1987–', country: '🇬🇧', status: 'legend', peakRank: 1, wiki: 'Andy_Murray',
        bio: L('Britain’s modern Slam hero — Olympic golds, Wimbledon drought-breaker, defensive genius.', 'Britanya’nın modern Slam kahramanı — Olimpiyat altınları, Wimbledon kuraklığını bozan, savunma dehası.', 'Герой Британии — олимпийское золото, Уимблдон после засухи.', 'Britischer Slam-Held — Olympia-Gold, Wimbledon-Dürrebrecher.'),
        ach: L('3 majors; 2 Olympic golds; ATP Finals; weeks at No. 1; Davis Cup.', '3 major; 2 Olimpiyat altını; ATP Finals; 1 numara haftaları; Davis Cup.', '3 мейджора; 2 золота ОИ; Итоговый; недели №1.', '3 Majors; 2 Olympia-Gold; ATP Finals; Nr.-1-Wochen.'),
        sty: L('Elite defense; two-hand BH; tactical variety; block return.', 'Elit savunma; çift elli BH; taktik çeşitlilik; blok karşılama.', 'Элитная защита; двуручный БХ; тактика.', 'Elite-Defence; zweihändige RH; taktische Vielfalt.'),
    }),
    Q({
        id: 'wawrinka', name: 'Stan Wawrinka', years: '1985–', country: '🇨🇭', status: 'active', peakRank: 3, fallbackRank: 150, wiki: 'Stan_Wawrinka',
        bio: L('One-hand BH thunder — 3 majors in the Big Three era; “Stanimal” peak.', 'Tek elli BH gök gürültüsü — Big Three döneminde 3 major; “Stanimal” zirvesi.', 'Гром одноручного БХ — 3 мейджора в эру Big Three.', 'Einhändige RH-Donner — 3 Majors in der Big-Three-Ära.'),
        ach: L('AO 2014, FO 2015, USO 2016; Olympic doubles gold with Federer.', 'AO 2014, FO 2015, USO 2016; Federer ile Olimpiyat çiftler altını.', 'AO 2014, RG 2015, USO 2016; олимпийское золото в парах.', 'AO 2014, RG 2015, USO 2016; Olympia-Doppelgold.'),
        sty: L('Crushing one-hand BH; first-strike when hot; clay/hard peaks.', 'Ezici tek elli BH; formdayken first-strike; toprak/sert zirveler.', 'Убийственный одноручный БХ; first-strike в пике.', 'Vernichtende einhändige RH; First-Strike in Form.'),
    }),
    Q({
        id: 'delpotro', name: 'Juan Martín del Potro', years: '1988–', country: '🇦🇷', status: 'legend', peakRank: 3, wiki: 'Juan_Martín_del_Potro',
        bio: L('Towering FH — 2009 US Open giant-killer; Olympic medals; injury warrior.', 'Kule FH — 2009 US Open dev katili; Olimpiyat madalyaları; sakatlık savaşçısı.', 'Башня ФХ — убийца гигантов US Open 2009; олимпийские медали.', 'FH-Turm — US-Open-Riesenkiller 2009; Olympia-Medaillen.'),
        ach: L('US Open 2009; Olympic silver/bronze; multiple Masters; comebacks.', 'US Open 2009; Olimpiyat gümüş/bronz; Masters’lar; dönüşler.', 'US Open 2009; серебро/бронза ОИ; Masters; камбэки.', 'US Open 2009; Olympia Silber/Bronze; Masters; Comebacks.'),
        sty: L('Heaviest FH of his generation; improving serve; big-match calm.', 'Kuşağının en ağır FH’si; gelişen servis; büyük maç sakinliği.', 'Самый тяжёлый ФХ поколения; растущая подача.', 'Schwerste VH seiner Generation; besserer Aufschlag.'),
    }),
    Q({
        id: 'kuerten', name: 'Gustavo Kuerten', years: '1976–', country: '🇧🇷', peakRank: 1, wiki: 'Gustavo_Kuerten',
        bio: L('Guga — three French Opens, samba energy, one-hand BH clay art.', 'Guga — üç Fransa Açık, samba enerjisi, tek elli BH toprak sanatı.', 'Guga — три RG, энергия самбы, искусство грунта.', 'Guga — drei French Opens, Samba-Energie, Sand-Kunst.'),
        ach: L('3 French Opens; year-end No. 1 (2000); Masters haul; Brazil icon.', '3 Fransa Açık; yıl sonu 1 numara (2000); Masters; Brezilya ikonu.', '3 RG; №1 сезона (2000); Masters; икона Бразилии.', '3× RG; Jahresend-Nr. 1 (2000); Masters; Brasilien-Ikone.'),
        sty: L('Spinning one-hand BH; clay sliding; joy as a weapon.', 'Dönen tek elli BH; toprak kayışı; silah olarak sevinç.', 'Вращающийся одноручный БХ; скольжение; радость как оружие.', 'Drehende einhändige RH; Sand-Rutsch; Freude als Waffe.'),
    }),
    Q({
        id: 'hewitt', name: 'Lleyton Hewitt', years: '1981–', country: '🇦🇺', peakRank: 1, wiki: 'Lleyton_Hewitt',
        bio: L('“C’mon!” — youngest ATP No. 1; counter-punching intensity machine.', '“C’mon!” — en genç ATP 1 numarası; kontra yoğunluk makinesi.', '«C’mon!» — самый молодой №1 ATP; машина интенсивности.', '„C’mon!“ — jüngste ATP-Nr. 1; Konter-Intensitätsmaschine.'),
        ach: L('US Open 2001; Wimbledon 2002; ATP Finals; Davis Cup leader.', 'US Open 2001; Wimbledon 2002; ATP Finals; Davis Cup lideri.', 'US Open 2001; Уимблдон 2002; Итоговый; лидер Кубка Дэвиса.', 'US Open 2001; Wimbledon 2002; ATP Finals; Davis-Cup-Führer.'),
        sty: L('Retrieve everything; two-hand BH; take time away with early returns.', 'Her şeyi kurtar; çift elli BH; erken karşılama ile zamanı çal.', 'Забирайте всё; двуручный БХ; ранний приём.', 'Alles retten; zweihändige RH; frühe Returns.'),
    }),
    Q({
        id: 'safin', name: 'Marat Safin', years: '1980–', country: '🇷🇺', peakRank: 1, wiki: 'Marat_Safin',
        bio: L('Explosive talent — US Open 2000, AO 2005; racket-smash charisma.', 'Patlayıcı yetenek — US Open 2000, AO 2005; raket kıran karizma.', 'Взрывной талант — US Open 2000, AO 2005; харизма.', 'Explosives Talent — US Open 2000, AO 2005; Charisma.'),
        ach: L('2 majors; weeks at No. 1; Davis Cup for Russia; Masters titles.', '2 major; 1 numara haftaları; Rusya Davis Cup; Masters.', '2 мейджора; недели №1; Кубок Дэвиса; Masters.', '2 Majors; Nr.-1-Wochen; Davis Cup; Masters.'),
        sty: L('Power baseline; huge serve days; fearless when locked in.', 'Güç baseline; koca servis günleri; odaklanınca korkusuz.', 'Мощная база; дни огромной подачи; бесстрашие в фокусе.', 'Power-Baseline; große Aufschlag-Tage; furchtlos im Flow.'),
    }),
    Q({
        id: 'roddick', name: 'Andy Roddick', years: '1982–', country: '🇺🇸', peakRank: 1, wiki: 'Andy_Roddick',
        bio: L('Cannon serve era face — US Open 2003 champ; Wimbledon finals vs Federer.', 'Top servis döneminin yüzü — US Open 2003; Federer’e karşı Wimbledon finalleri.', 'Лицо эры пушечной подачи — US Open 2003; финалы Уимблдона.', 'Gesicht der Kanonen-Aufschlag-Ära — US Open 2003.'),
        ach: L('US Open 2003; 32 titles; weeks at No. 1; Davis Cup.', 'US Open 2003; 32 unvan; 1 numara haftaları; Davis Cup.', 'US Open 2003; 32 титула; недели №1.', 'US Open 2003; 32 Titel; Nr.-1-Wochen.'),
        sty: L('Biggest serve of his peak; FH first-strike; improving volleys late.', 'Zirvede en büyük servis; FH first-strike; geç dönemde vole.', 'Мощнейшая подача пика; first-strike ФХ.', 'Größter Aufschlag seiner Peak-Zeit; FH First-Strike.'),
    }),
    Q({
        id: 'tsitsipas', name: 'Stefanos Tsitsipas', years: '1998–', country: '🇬🇷', status: 'active', peakRank: 3, fallbackRank: 12, tour: 'ATP', wiki: 'Stefanos_Tsitsipas',
        bio: L('One-hand BH stylist — AO finalist, Monte-Carlo king, all-court flair.', 'Tek elli BH stilisti — AO finalisti, Monte-Carlo kralı, all-court flair.', 'Стилист с одноручным БХ — финалист AO, король Monte-Carlo.', 'Einhändiger RH-Stylist — AO-Finalist, Monte-Carlo-König.'),
        ach: L('ATP Finals champion; multiple Masters; Grand Slam finalist.', 'ATP Finals şampiyonu; Masters’lar; Grand Slam finalisti.', 'Чемпион Итогового; Masters; финалист Slam.', 'ATP-Finals-Sieger; Masters; Slam-Finalist.'),
        sty: L('Drop-shot + one-hand BH; clay comfort; net forays.', 'Drop-shot + tek elli BH; toprak rahatlığı; file çıkışları.', 'Дропшот + одноручный БХ; комфорт на грунте.', 'Dropshot + einhändige RH; Sand-Komfort; Netzausflüge.'),
    }),
    Q({
        id: 'rublev', name: 'Andrey Rublev', years: '1997–', country: '🇷🇺', status: 'active', peakRank: 5, fallbackRank: 8, tour: 'ATP', wiki: 'Andrey_Rublev',
        bio: L('Relentless FH pressure — Masters champion, Davis Cup hero, high intensity.', 'Amansız FH baskısı — Masters şampiyonu, Davis Cup kahramanı, yüksek yoğunluk.', 'Безжалостное давление ФХ — чемпион Masters, герой Кубка Дэвиса.', 'Unerbittlicher VH-Druck — Masters-Sieger, Davis-Cup-Held.'),
        ach: L('Multiple Masters 1000; ATP Finals contender; Davis Cup titles.', 'Çoklu Masters 1000; ATP Finals adayı; Davis Cup unvanları.', 'Несколько Masters 1000; претендент Итогового.', 'Mehrere Masters 1000; ATP-Finals-Anwärter.'),
        sty: L('Flat FH take-early; serve improve; emotional engine.', 'Düz erken FH; gelişen servis; duygusal motor.', 'Плоский ранний ФХ; рост подачи; эмоциональный мотор.', 'Flache frühe VH; besserer Aufschlag; Emotions-Motor.'),
    }),
    Q({
        id: 'navratilova', name: 'Martina Navratilova', years: '1956–', country: '🇺🇸', peakRank: 1, wiki: 'Martina_Navratilova',
        bio: L('Singles + doubles GOAT debate staple — 18 Slam singles, 31 doubles, fitness pioneer.', 'Tekler + çiftler GOAT tartışmasının temel taşı — 18 Slam tekler, 31 çiftler, fitness öncüsü.', 'Опора споров о GOAT — 18 одиночных Slam, 31 парных.', 'GOAT-Debatten-Stütze — 18 Slam-Einzel, 31 Doppel.'),
        ach: L('18 majors singles; 31 doubles; 167 singles titles; long No. 1.', '18 major tekler; 31 çiftler; 167 tekler unvanı; uzun 1 numara.', '18 одиночных; 31 парных; 167 титулов; долгое №1.', '18 Einzel-Majors; 31 Doppel; 167 Einzeltitel.'),
        sty: L('Lefty serve-volley; athleticism; doubles IQ transferred to singles.', 'Solak servis-vole; atletizm; çiftler IQ’sunu teklere taşıdı.', 'Левый serve-volley; атлетизм; IQ пар в одиночке.', 'Linker Serve-Volley; Athletik; Doppel-IQ im Einzel.'),
    }),
    Q({
        id: 'evert', name: 'Chris Evert', years: '1954–', country: '🇺🇸', peakRank: 1, wiki: 'Chris_Evert',
        bio: L('Clay queen and two-hand BH pioneer — 18 majors, ice composure.', 'Toprak kraliçesi ve çift elli BH öncüsü — 18 major, buz soğukkanlılık.', 'Королева грунта и пионер двуручного БХ — 18 мейджоров.', 'Sandkönigin und Pionierin der zweihändigen RH — 18 Majors.'),
        ach: L('18 Grand Slam singles; 157 titles; years at No. 1; Navratilova rivalry.', '18 Grand Slam tekler; 157 unvan; 1 numara yılları; Navratilova rekabeti.', '18 одиночных Slam; 157 титулов; годы №1.', '18 Grand-Slam-Einzel; 157 Titel; Jahre Nr. 1.'),
        sty: L('Two-hand BH consistency; clay patience; mental steel.', 'Çift elli BH istikrarı; toprak sabrı; zihinsel çelik.', 'Стабильность двуручного БХ; терпение на грунте.', 'Zweihändige RH-Konstanz; Sand-Geduld; mentale Stärke.'),
    }),
    Q({
        id: 'court', name: 'Margaret Court', years: '1942–', country: '🇦🇺', peakRank: 1, wiki: 'Margaret_Court',
        bio: L('All-time Slam singles record (24) — calendar Slam 1970, towering athletic serve.', 'Tüm zamanlar Slam tekler rekoru (24) — 1970 takvim Slam, atletik servis.', 'Рекорд Slam в одиночке (24) — календарный Slam 1970.', 'Allzeit-Slam-Rekord (24) — Kalender-Slam 1970.'),
        ach: L('24 majors singles; calendar Slam 1970; dominant doubles too.', '24 major tekler; 1970 takvim Slam; baskın çiftler.', '24 одиночных; календарный Slam 1970; доминирование в парах.', '24 Einzel-Majors; Kalender-Slam 1970; Doppel-Dominanz.'),
        sty: L('Athletic serve-volley; all-court; power before the modern era.', 'Atletik servis-vole; all-court; modern öncesi güç.', 'Атлетичный serve-volley; all-court; сила до современной эры.', 'Athletischer Serve-Volley; All-Court; Power vor der Moderne.'),
    }),
    Q({
        id: 'venus', name: 'Venus Williams', years: '1980–', country: '🇺🇸', status: 'legend', peakRank: 1, wiki: 'Venus_Williams',
        bio: L('Power pioneer with Serena — 7 majors, Olympic golds, equal-pay activist.', 'Serena ile güç öncüsü — 7 major, Olimpiyat altınları, eşit ödeme aktivisti.', 'Пионер силы с Сереной — 7 мейджоров, олимпийское золото.', 'Power-Pionierin mit Serena — 7 Majors, Olympia-Gold.'),
        ach: L('7 Grand Slam singles; 14 doubles with Serena; Olympic golds; weeks No. 1.', '7 Grand Slam tekler; Serena ile 14 çiftler; Olimpiyat altınları; 1 numara.', '7 одиночных; 14 парных с Сереной; золото ОИ.', '7 Einzel-Majors; 14 Doppel mit Serena; Olympia-Gold.'),
        sty: L('First-strike serve/FH; long wingspan; grass peak.', 'First-strike servis/FH; uzun kanat açıklığı; çim zirvesi.', 'First-strike подача/ФХ; размах рук; пик на траве.', 'First-Strike Aufschlag/VH; Spannweite; Rasen-Peak.'),
    }),
    Q({
        id: 'sharapova', name: 'Maria Sharapova', years: '1987–', country: '🇷🇺', peakRank: 1, wiki: 'Maria_Sharapova',
        bio: L('Siberian ice scream — Career Slam, Wimbledon teen champ, global icon.', 'Sibirya buz çığlığı — Kariyer Slam, genç Wimbledon şampiyonu, global ikon.', 'Сибирский лёд — карьерный Slam, чемпионка Уимблдона-подросток.', 'Sibirisches Eis — Career Slam, Teen-Wimbledon-Champ.'),
        ach: L('5 majors; Career Slam; weeks at No. 1; multiple comebacks.', '5 major; Kariyer Slam; 1 numara haftaları; çoklu dönüş.', '5 мейджоров; карьерный Slam; недели №1.', '5 Majors; Career Slam; Nr.-1-Wochen.'),
        sty: L('Aggressive baseline; huge serve days; mental toughness brand.', 'Agresif baseline; koca servis günleri; zihinsel sertlik markası.', 'Агрессивная база; дни большой подачи; ментальный бренд.', 'Aggressive Baseline; große Aufschlag-Tage; Mental-Marke.'),
    }),
    Q({
        id: 'seles', name: 'Monica Seles', years: '1973–', country: '🇺🇸', peakRank: 1, wiki: 'Monica_Seles',
        bio: L('Teen twin-wing baseliner — 9 majors before tragedy; two-hand both sides.', 'Genç çift kanat baseline — trajediden önce 9 major; iki yanda çift el.', 'Подростковая база с двумя руками — 9 мейджоров до трагедии.', 'Teen-Baseline mit zwei Händen — 9 Majors vor der Tragödie.'),
        ach: L('9 Grand Slam singles; weeks at No. 1; early-90s dominance.', '9 Grand Slam tekler; 1 numara haftaları; 90’ların başı baskınlığı.', '9 одиночных Slam; недели №1; доминирование начала 90-х.', '9 Einzel-Majors; Nr.-1-Wochen; Dominanz der frühen 90er.'),
        sty: L('Two-hand FH and BH; take early; relentless depth.', 'Çift elli FH ve BH; erken al; amansız derinlik.', 'Двуручный ФХ и БХ; ранний удар; глубина.', 'Zweihändige VH und RH; früh treffen; Tiefe.'),
    }),
    Q({
        id: 'henin', name: 'Justine Henin', years: '1982–', country: '🇧🇪', peakRank: 1, wiki: 'Justine_Henin',
        bio: L('One-hand BH masterpiece — 7 majors, Olympic gold, complete all-court game.', 'Tek elli BH başyapıt — 7 major, Olimpiyat altını, tam all-court.', 'Шедевр одноручного БХ — 7 мейджоров, олимпийское золото.', 'Meisterwerk einhändiger RH — 7 Majors, Olympia-Gold.'),
        ach: L('7 Grand Slams; Olympic gold 2004; weeks at No. 1; French Open queen.', '7 Grand Slam; 2004 Olimpiyat altını; 1 numara; Fransa Açık kraliçesi.', '7 Slam; золото ОИ-2004; недели №1; королева RG.', '7 Grand Slams; Olympia-Gold 2004; Nr. 1; RG-Königin.'),
        sty: L('Variety: slice, drop, one-hand BH drive; elite movement.', 'Çeşitlilik: slice, drop, tek elli BH drive; elit hareket.', 'Разнообразие: слайс, дроп, удар одноручным; движение.', 'Vielfalt: Slice, Drop, einhändiger Drive; Elite-Bewegung.'),
    }),
    Q({
        id: 'hingis', name: 'Martina Hingis', years: '1980–', country: '🇨🇭', peakRank: 1, wiki: 'Martina_Hingis',
        bio: L('Teenage tactician — youngest No. 1, 5 majors, doubles wizard forever.', 'Genç taktikçi — en genç 1 numara, 5 major, sonsuza dek çiftler sihirbazı.', 'Подростковый тактик — самый молодой №1, 5 мейджоров, волшебница пар.', 'Teen-Taktikerin — jüngste Nr. 1, 5 Majors, Doppel-Zauberin.'),
        ach: L('5 majors singles; 13 doubles; weeks at No. 1 as a teen; Hall of Fame.', '5 major tekler; 13 çiftler; genç yaşta 1 numara; Hall of Fame.', '5 одиночных; 13 парных; №1 подростком.', '5 Einzel-Majors; 13 Doppel; Nr. 1 als Teen.'),
        sty: L('Anticipation; soft hands; redirect pace; doubles DNA.', 'Öngörü; yumuşak eller; temoyu yönlendir; çiftler DNA’sı.', 'Антиципация; мягкие руки; перенаправление темпа.', 'Antizipation; weiche Hände; Tempo umleiten.'),
    }),
    Q({
        id: 'bjking', name: 'Billie Jean King', years: '1943–', country: '🇺🇸', peakRank: 1, wiki: 'Billie_Jean_King',
        bio: L('Champion and activist — 12 majors, Battle of the Sexes, equal rights icon.', 'Şampiyon ve aktivist — 12 major, Battle of the Sexes, eşit hak ikonu.', 'Чемпионка и активистка — 12 мейджоров, Battle of the Sexes.', 'Championin und Aktivistin — 12 Majors, Battle of the Sexes.'),
        ach: L('12 Slam singles; 39 total majors counting doubles/mixed; WTA founder energy.', '12 Slam tekler; çiftler/mixed ile 39 major; WTA kurucu enerjisi.', '12 одиночных; 39 всего с парами; энергия основательницы WTA.', '12 Einzel-Slams; 39 insgesamt inkl. Doppel; WTA-Gründerenergie.'),
        sty: L('Serve-volley grit; big-match nerve; left-court craft.', 'Servis-vole azmi; büyük maç siniri; sol kort işçiliği.', 'Serve-volley характер; нервы больших матчей.', 'Serve-Volley-Kampfgeist; Big-Match-Nerven.'),
    }),
    Q({
        id: 'goolagong', name: 'Evonne Goolagong Cawley', years: '1951–', country: '🇦🇺', peakRank: 1, wiki: 'Evonne_Goolagong_Cawley',
        bio: L('Graceful Indigenous Australian icon — 7 majors, flowing all-court style.', 'Zarif Yerli Avustralyalı ikon — 7 major, akıcı all-court stil.', 'Изящная икона — 7 мейджоров, плавный all-court.', 'Anmutige Ikone — 7 Majors, fließender All-Court-Stil.'),
        ach: L('7 Grand Slam singles; Wimbledon & AO titles; trailblazer legacy.', '7 Grand Slam tekler; Wimbledon ve AO; öncü miras.', '7 одиночных; титулы Уимблдона и AO.', '7 Einzel-Majors; Wimbledon- & AO-Titel.'),
        sty: L('Fluid movement; slice; smile under pressure.', 'Akışkan hareket; slice; baskıda gülümseme.', 'Плавное движение; слайс; улыбка под давлением.', 'Fließende Bewegung; Slice; Lächeln unter Druck.'),
    }),
    Q({
        id: 'osaka', name: 'Naomi Osaka', years: '1997–', country: '🇯🇵', status: 'active', peakRank: 1, fallbackRank: 40, tour: 'WTA', wiki: 'Naomi_Osaka',
        bio: L('Power-era face — 4 majors, mental-health advocate, first-strike tennis.', 'Güç döneminin yüzü — 4 major, ruh sağlığı savunucusu, first-strike tenis.', 'Лицо силовой эры — 4 мейджора, адвокатка ментального здоровья.', 'Gesicht der Power-Ära — 4 Majors, Mental-Health-Stimme.'),
        ach: L('4 Grand Slams (AO/USO); weeks at No. 1; global cultural impact.', '4 Grand Slam (AO/USO); 1 numara haftaları; küresel kültürel etki.', '4 Slam (AO/USO); недели №1; культурное влияние.', '4 Grand Slams (AO/USO); Nr.-1-Wochen.'),
        sty: L('Huge serve + FH; first-strike hard courts; improving variety.', 'Koca servis + FH; sert kort first-strike; gelişen çeşitlilik.', 'Мощная подача + ФХ; first-strike на харде.', 'Großer Aufschlag + VH; First-Strike Hartplatz.'),
    }),
    Q({
        id: 'barty', name: 'Ashleigh Barty', years: '1996–', country: '🇦🇺', status: 'legend', peakRank: 1, wiki: 'Ashleigh_Barty',
        bio: L('Complete modern champion — Career Slam-ish peak, Wimbledon/AO, early retirement icon.', 'Tam modern şampiyon — zirvede Slam hasadı, Wimbledon/AO, erken emeklilik ikonu.', 'Полный современный чемпион — пик со Slam, Уимблдон/AO.', 'Komplette moderne Championin — Slam-Peak, Wimbledon/AO.'),
        ach: L('3 majors; year-end No. 1s; Olympic bronze doubles; graceful exit at peak.', '3 major; yıl sonu 1 numaralar; Olimpiyat bronz çiftler; zirvede zarif çıkış.', '3 мейджора; №1 сезона; бронза ОИ в парах.', '3 Majors; Jahresend-Nr. 1; Olympia-Bronze Doppel.'),
        sty: L('Slice BH; variety; kick serve; cricket-honed timing.', 'Slice BH; çeşitlilik; kick servis; kriket zamanlaması.', 'Слайс БХ; разнообразие; кик-подача.', 'Slice-RH; Vielfalt; Kick-Aufschlag.'),
    }),
    Q({
        id: 'halep', name: 'Simona Halep', years: '1991–', country: '🇷🇴', status: 'legend', peakRank: 1, wiki: 'Simona_Halep',
        bio: L('Counter-punch queen — FO 2018, Wimbledon 2019, years at No. 1.', 'Kontra kraliçesi — FO 2018, Wimbledon 2019, yıllarca 1 numara.', 'Королева контрпанка — RG 2018, Уимблдон 2019.', 'Konter-Königin — RG 2018, Wimbledon 2019.'),
        ach: L('2 majors; weeks at No. 1; French Open & Wimbledon titles.', '2 major; 1 numara haftaları; Fransa Açık ve Wimbledon.', '2 мейджора; недели №1; RG и Уимблдон.', '2 Majors; Nr.-1-Wochen; RG & Wimbledon.'),
        sty: L('Elite defense-to-offense; footwork; two-hand BH redirect.', 'Elit savunmadan hücuma; ayak işi; çift elli BH yönlendirme.', 'Элитный переход защита→атака; работа ног.', 'Elite Defence→Offense; Fußarbeit; zweihändige RH.'),
    }),
    Q({
        id: 'kerber', name: 'Angelique Kerber', years: '1988–', country: '🇩🇪', status: 'legend', peakRank: 1, wiki: 'Angelique_Kerber',
        bio: L('Lefty counter — 3 majors in 2016–18 surge, Olympic silver, German icon.', 'Solak kontra — 2016–18’de 3 major, Olimpiyat gümüşü, Alman ikon.', 'Левый контрпанчер — 3 мейджора в 2016–18, серебро ОИ.', 'Linke Konterin — 3 Majors 2016–18, Olympia-Silber.'),
        ach: L('AO, Wimbledon, US Open titles; year-end No. 1 2016; Olympic silver.', 'AO, Wimbledon, US Open; 2016 yıl sonu 1 numara; Olimpiyat gümüşü.', 'AO, Уимблдон, US Open; №1 сезона 2016.', 'AO, Wimbledon, US Open; Jahresend-Nr. 1 2016.'),
        sty: L('Lefty angles; retrieve + redirect; big-match belief surge.', 'Solak açılar; kurtar + yönlendir; büyük maç inanç patlaması.', 'Левые углы; сейв + перенаправление.', 'Linke Winkel; Retten + Umleiten.'),
    }),
    Q({
        id: 'li_na', name: 'Li Na', years: '1982–', country: '🇨🇳', peakRank: 2, wiki: 'Li_Na',
        bio: L('Asia’s Slam trailblazer — FO 2011, AO 2014; opened the door for a continent.', 'Asya’nın Slam öncüsü — FO 2011, AO 2014; kıtaya kapı açtı.', 'Пионер Slam Азии — RG 2011, AO 2014.', 'Asiens Slam-Pionierin — RG 2011, AO 2014.'),
        ach: L('2 majors; Top 2 peak; cultural breakthrough for Chinese tennis.', '2 major; Top 2 zirve; Çin tenisi için kültürel kırılma.', '2 мейджора; пик топ-2; культурный прорыв.', '2 Majors; Peak Top 2; kultureller Durchbruch.'),
        sty: L('Aggressive FH; flat take-early; fearless big stages.', 'Agresif FH; düz erken vuruş; korkusuz büyük sahneler.', 'Агрессивный ФХ; ранний плоский удар.', 'Aggressive VH; flach früh; furchtlos auf großer Bühne.'),
    }),
    Q({
        id: 'clijsters', name: 'Kim Clijsters', years: '1983–', country: '🇧🇪', peakRank: 1, wiki: 'Kim_Clijsters',
        bio: L('Comeback mom icon — US Open titles after motherhood, elite athleticism.', 'Dönüş anne ikonu — annelik sonrası US Open’lar, elit atletizm.', 'Икона камбэка-мамы — US Open после материнства.', 'Comeback-Mama-Ikone — US Opens nach Mutterschaft.'),
        ach: L('4 majors; weeks at No. 1; multiple US Opens; popular fan favourite.', '4 major; 1 numara haftaları; çoklu US Open; taraftar favorisi.', '4 мейджора; недели №1; несколько US Open.', '4 Majors; Nr.-1-Wochen; mehrere US Opens.'),
        sty: L('Sliding defense; FH power; soft hands at net.', 'Kayarak savunma; FH gücü; filede yumuşak eller.', 'Скольжение в защите; мощь ФХ; мягкие руки у сетки.', 'Rutsch-Defence; VH-Power; weiche Hände am Netz.'),
    }),
    Q({
        id: 'davenport', name: 'Lindsay Davenport', years: '1976–', country: '🇺🇸', peakRank: 1, wiki: 'Lindsay_Davenport',
        bio: L('Clean ball-striker — 3 majors, Olympic gold, weeks at No. 1.', 'Temiz vuruşçu — 3 major, Olimpiyat altını, 1 numara haftaları.', 'Чистый удар — 3 мейджора, олимпийское золото.', 'Sauberer Ballschläger — 3 Majors, Olympia-Gold.'),
        ach: L('3 Grand Slams; Olympic gold 1996; year-end No. 1 seasons.', '3 Grand Slam; 1996 Olimpiyat altını; yıl sonu 1 numara sezonları.', '3 Slam; золото ОИ-1996; сезоны №1.', '3 Grand Slams; Olympia-Gold 1996; Jahresend-Nr. 1.'),
        sty: L('Flat power; early take; efficient movement for her size.', 'Düz güç; erken al; boyuna göre verimli hareket.', 'Плоская мощь; ранний удар; эффективное движение.', 'Flache Power; früh treffen; effiziente Bewegung.'),
    }),
    Q({
        id: 'kvitova', name: 'Petra Kvitová', years: '1990–', country: '🇨🇿', status: 'legend', peakRank: 2, wiki: 'Petra_Kvitová',
        bio: L('Lefty grass thunder — 2 Wimbledons, Fed Cup hero, comeback warrior.', 'Solak çim gök gürültüsü — 2 Wimbledon, Fed Cup kahramanı, dönüş savaşçısı.', 'Левый гром травы — 2 Уимблдона, героиня Fed Cup.', 'Linker Rasen-Donner — 2 Wimbledons, Fed-Cup-Heldin.'),
        ach: L('2 Wimbledon titles; WTA Finals; Billie Jean King Cup heroics.', '2 Wimbledon; WTA Finals; Billie Jean King Cup kahramanlıkları.', '2 Уимблдона; Итоговый WTA; героизм BJK Cup.', '2× Wimbledon; WTA Finals; BJK-Cup-Heldentaten.'),
        sty: L('Lefty FH bombs; grass first-strike; high-risk high-reward.', 'Solak FH bombaları; çim first-strike; yüksek risk/ödül.', 'Левые бомбы ФХ; first-strike на траве.', 'Linke VH-Bomben; First-Strike Rasen.'),
    }),
    Q({
        id: 'azarenka', name: 'Victoria Azarenka', years: '1989–', country: '🇧🇾', status: 'active', peakRank: 1, fallbackRank: 80, tour: 'WTA', wiki: 'Victoria_Azarenka',
        bio: L('Intensity personified — 2 AO titles, Olympic medals, elite return.', 'Yoğunluğun kişileşmiş hali — 2 AO, Olimpiyat madalyaları, elit karşılama.', 'Интенсивность — 2 AO, олимпийские медали, элитный приём.', 'Intensität — 2 AO, Olympia-Medaillen, Elite-Return.'),
        ach: L('2 Australian Opens; Olympic medals; weeks at No. 1.', '2 Avustralya Açık; Olimpiyat madalyaları; 1 numara haftaları.', '2 AO; олимпийские медали; недели №1.', '2 Australian Opens; Olympia-Medaillen; Nr.-1-Wochen.'),
        sty: L('Aggressive return; two-hand BH; mental fire.', 'Agresif karşılama; çift elli BH; zihinsel ateş.', 'Агрессивный приём; двуручный БХ; ментальный огонь.', 'Aggressiver Return; zweihändige RH; mentales Feuer.'),
    }),
    Q({
        id: 'wozniacki', name: 'Caroline Wozniacki', years: '1990–', country: '🇩🇰', status: 'legend', peakRank: 1, wiki: 'Caroline_Wozniacki',
        bio: L('Defensive wall who finally won AO 2018 — longevity, fitness, comebacks.', 'Savunma duvarı, sonunda AO 2018 — uzun ömür, fitness, dönüşler.', 'Стена в защите, наконец AO 2018 — долголетие, фитнес.', 'Defensivmauer, endlich AO 2018 — Longevity, Fitness.'),
        ach: L('Australian Open 2018; weeks at No. 1; year-end No. 1 seasons.', 'Avustralya Açık 2018; 1 numara haftaları; yıl sonu 1 numara.', 'AO 2018; недели №1; сезоны №1.', 'Australian Open 2018; Nr.-1-Wochen.'),
        sty: L('Retrieve + redirect; fitness; improved offense late career.', 'Kurtar + yönlendir; fitness; geç kariyerde gelişen hücum.', 'Сейв + перенаправление; фитнес; рост атаки.', 'Retten + Umleiten; Fitness; späte Offensive.'),
    }),
    Q({
        id: 'sanchez_vicario', name: 'Arantxa Sánchez Vicario', years: '1971–', country: '🇪🇸', peakRank: 1, wiki: 'Arantxa_Sánchez_Vicario',
        bio: L('Spanish clay fighter — 4 majors, tireless defense, doubles force.', 'İspanyol toprak savaşçısı — 4 major, yorulmaz savunma, çiftler gücü.', 'Испанская бойца грунта — 4 мейджора, неутомимая защита.', 'Spanische Sandkämpferin — 4 Majors, unermüdliche Defence.'),
        ach: L('4 Grand Slam singles; many doubles majors; Fed Cup legend.', '4 Grand Slam tekler; çoklu çiftler major; Fed Cup efsanesi.', '4 одиночных; много парных; легенда Fed Cup.', '4 Einzel-Majors; viele Doppel-Majors; Fed-Cup-Legende.'),
        sty: L('Endless legs; clay grind; competitive fire.', 'Bitmeyen bacaklar; toprak öğütme; rekabet ateşi.', 'Бесконечные ноги; гринды на грунте.', 'Endlose Beine; Sand-Grind; Wettbewerbsfeuer.'),
    }),
    Q({
        id: 'mauresmo', name: 'Amélie Mauresmo', years: '1979–', country: '🇫🇷', peakRank: 1, wiki: 'Amélie_Mauresmo',
        bio: L('One-hand BH elegance — Wimbledon & AO champion, Olympic silver, coach later.', 'Tek elli BH zarafeti — Wimbledon ve AO şampiyonu, Olimpiyat gümüşü, sonra koç.', 'Элегантность одноручного БХ — Уимблдон и AO, серебро ОИ.', 'Einhändige RH-Eleganz — Wimbledon & AO, Olympia-Silber.'),
        ach: L('2 majors; weeks at No. 1; Olympic silver; Fed Cup.', '2 major; 1 numara haftaları; Olimpiyat gümüşü; Fed Cup.', '2 мейджора; недели №1; серебро ОИ.', '2 Majors; Nr.-1-Wochen; Olympia-Silber.'),
        sty: L('Serve-volley options; one-hand BH; variety over pure power.', 'Servis-vole seçenekleri; tek elli BH; saf güçten çok çeşitlilik.', 'Варианты serve-volley; одноручный БХ; разнообразие.', 'Serve-Volley-Optionen; einhändige RH; Vielfalt.'),
    }),
];

/* ─── PADEL MORE ─── */
export const PADEL_MORE = [
    Q({
        id: 'maxi', name: 'Maxi Sánchez', years: '1986–', country: '🇦🇷', peakRank: 1, wiki: 'Maxi_Sánchez',
        bio: L('World #1 with Sanyo — soft hands, big IQ, bridge between eras.', 'Sanyo ile dünya 1 numarası — yumuşak eller, yüksek IQ, çağlar arası köprü.', '№1 с Саньо — мягкие руки, высокий IQ.', 'Nr. 1 mit Sanyo — weiche Hände, hoher IQ.'),
        ach: L('Multiple #1 seasons; Masters and World titles with Gutiérrez.', 'Çoklu 1 numara sezonu; Gutiérrez ile Masters ve Dünya unvanları.', 'Несколько сезонов №1; титулы с Гутьерресом.', 'Mehrere Nr.-1-Saisons; Titel mit Gutiérrez.'),
    }),
    Q({
        id: 'mieres', name: 'Juani Mieres', years: '1980–', country: '🇦🇷', peakRank: 1, wiki: 'Juan_Mieres',
        bio: L('Classic-era left-side star — titles across the Pro Padel / early WPT years.', 'Klasik çağ sol taraf yıldızı — Pro Padel / erken WPT unvanları.', 'Звезда левой стороны классики — титулы Pro Padel / ранний WPT.', 'Linke Klassik-Ära — Titel Pro Padel / frühes WPT.'),
    }),
    Q({
        id: 'stupaczuk', name: 'Franco Stupaczuk', years: '1993–', country: '🇦🇷', status: 'active', peakRank: 2, fallbackRank: 5, wiki: 'Franco_Stupaczuk',
        bio: L('Creative left — titles with Sanyo and Di Nenno; flash and fight.', 'Yaratıcı sol — Sanyo ve Di Nenno ile unvanlar; flash ve savaş.', 'Креативный левый — титулы с Саньо и Ди Ненно.', 'Kreativer Links — Titel mit Sanyo und Di Nenno.'),
    }),
    Q({
        id: 'dinenno', name: 'Martín Di Nenno', years: '1993–', country: '🇦🇷', status: 'active', peakRank: 2, fallbackRank: 6, wiki: 'Martín_Di_Nenno',
        bio: L('Athletic right-side — Majors contention with Stupaczuk and others.', 'Atletik sağ taraf — Stupaczuk ve diğerleriyle Major yarışı.', 'Атлетичный правый — борьба за Major со Ступачуком.', 'Athletische Rechte — Major-Kampf mit Stupaczuk.'),
    }),
    Q({
        id: 'momo', name: 'Momo González', years: '1993–', country: '🇪🇸', status: 'active', peakRank: 3, fallbackRank: 10, wiki: 'Momo_González_(padel)',
        bio: L('Spanish power left — explosive smash, Top pairs contender.', 'İspanyol güç sol — patlayıcı smaç, Top çiftler adayı.', 'Испанский мощный левый — взрывной смэш.', 'Spanischer Power-Links — explosiver Smash.'),
    }),
    Q({
        id: 'lamperti', name: 'Miguel Lamperti', years: '1979–', country: '🇦🇷', peakRank: 2, wiki: 'Miguel_Lamperti',
        bio: L('Showman of the classic tour — longevity, crowd favourite, titles.', 'Klasik turun şovmeni — uzun ömür, tribün favorisi, unvanlar.', 'Шоумен классического тура — долголетие, любимец публики.', 'Showman der Klassik-Tour — Longevity, Publikumsliebling.'),
    }),
    Q({
        id: 'navarro_c', name: 'Carolina Navarro', years: '1976–', country: '🇪🇸', peakRank: 1, wiki: 'Carolina_Navarro_Björk',
        bio: L('Women’s padel pioneer — years at #1 with Reiter, equal-pay voice.', 'Kadın padel öncüsü — Reiter ile yıllarca 1 numara, eşit ödeme sesi.', 'Пионер женского падела — годы №1 с Рейтер.', 'Pionierin des Damenpadels — Jahre Nr. 1 mit Reiter.'),
        ach: L('Multiple world titles; long #1 reign with Cecilia Reiter.', 'Çoklu dünya unvanı; Cecilia Reiter ile uzun 1 numara saltanatı.', 'Несколько мировых титулов; долгое №1 с Рейтер.', 'Mehrere Welt-Titel; lange Nr.-1-Ära mit Reiter.'),
    }),
    Q({
        id: 'reiter', name: 'Cecilia Reiter', years: '1983–', country: '🇦🇷', peakRank: 1, wiki: 'Cecilia_Reiter',
        bio: L('Navarro’s legendary partner — Master Finals, near-unbeaten seasons.', 'Navarro’nun efsane partneri — Master Finals, neredeyse yenilgisiz sezonlar.', 'Легендарный партнёр Наварро — Master Finals.', 'Legendäre Partnerin von Navarro — Master Finals.'),
    }),
    Q({
        id: 'mapi', name: 'Mapi Sánchez Alayeto', years: '1984–', country: '🇪🇸', peakRank: 1, wiki: 'Mapi_Sánchez_Alayeto',
        bio: L('Alayeto twin — four #1 seasons with sister Majo; resilience icon.', 'Alayeto ikizi — kız kardeşi Majo ile dört 1 numara sezonu; direnç ikonu.', 'Близнец Алаето — четыре сезона №1 с сестрой.', 'Alayeto-Zwilling — vier Nr.-1-Saisons mit Schwester.'),
    }),
    Q({
        id: 'majo', name: 'Majo Sánchez Alayeto', years: '1984–', country: '🇪🇸', peakRank: 1, wiki: 'Majo_Sánchez_Alayeto',
        bio: L('Alayeto twin — 30+ titles with Mapi; family dynasty of women’s padel.', 'Alayeto ikizi — Mapi ile 30+ unvan; kadın padelin aile hanedanı.', 'Близнец Алаето — 30+ титулов с Мапи.', 'Alayeto-Zwilling — 30+ Titel mit Mapi.'),
    }),
    Q({
        id: 'marrero', name: 'Marta Marrero', years: '1983–', country: '🇪🇸', peakRank: 1, wiki: 'Marta_Marrero',
        bio: L('Former tennis pro turned padel #1 — tennis IQ on the glass.', 'Eski tenis pro’sundan padel 1 numarasına — camda tenis IQ’su.', 'Экс-теннисистка → №1 в паделе — теннисный IQ у стекла.', 'Ex-Tennisprofi zur Padel-Nr. 1 — Tennis-IQ am Glas.'),
    }),
    Q({
        id: 'brea', name: 'Delfina Brea', years: '2000–', country: '🇦🇷', status: 'active', peakRank: 1, fallbackRank: 2, wiki: 'Delfina_Brea',
        bio: L('Modern women’s elite — #1 pairing seasons, athletic left/right craft.', 'Modern kadın elite — 1 numara çift sezonları, atletik sol/sağ işçiliği.', 'Современная элита — сезоны пары №1.', 'Moderne Damen-Elite — Nr.-1-Paar-Saisons.'),
    }),
    Q({
        id: 'sainz', name: 'Lucía Sainz', years: '1984–', country: '🇪🇸', peakRank: 1, wiki: 'Lucía_Sainz',
        bio: L('Triay’s former #1 partner — titles and Top pair seasons.', 'Triay’nin eski 1 numara partneri — unvanlar ve Top çift sezonları.', 'Бывший партнёр Триай №1 — титулы и топ-пары.', 'Ehemalige Nr.-1-Partnerin von Triay — Titel und Top-Paare.'),
    }),
    Q({
        id: 'llaguno', name: 'Patty Llaguno', years: '1983–', country: '🇪🇸', peakRank: 1, wiki: 'Patricia_Llaguno',
        bio: L('With Eli Amatriain — early WPT women’s #1 pair era.', 'Eli Amatriain ile — erken WPT kadın 1 numara çift dönemi.', 'С Эли Аматриайн — ранняя эра пары №1 WPT.', 'Mit Eli Amatriain — frühe WPT-Damen-Nr.-1-Paar-Ära.'),
    }),
    Q({
        id: 'montes', name: 'Iciar Montes', years: '1975–', country: '🇪🇸', peakRank: 1, wiki: 'Iciar_Montes',
        bio: L('Early women’s GOAT conversation — multiple world titles, strategist.', 'Erken kadın GOAT tartışması — çoklu dünya unvanı, stratejist.', 'Ранний разговор о GOAT — несколько мировых титулов.', 'Frühe GOAT-Debatte — mehrere Welt-Titel, Strategin.'),
    }),
];

/* ─── BADMINTON MORE ─── */
export const BADMINTON_MORE = [
    Q({
        id: 'hartono', name: 'Rudy Hartono', years: '1949–', country: '🇮🇩', peakRank: 1, wiki: 'Rudy_Hartono',
        bio: L('All England record machine — Indonesian legend of the amateur/pro bridge era.', 'All England rekor makinesi — amatör/pro köprü çağının Endonezya efsanesi.', 'Машина рекордов All England — легенда Индонезии.', 'All-England-Rekordmaschine — indonesische Legende.'),
    }),
    Q({
        id: 'taufik', name: 'Taufik Hidayat', years: '1981–', country: '🇮🇩', peakRank: 1, wiki: 'Taufik_Hidayat',
        bio: L('Backhand artist — Olympic gold 2004, World Champion, unique wrist magic.', 'Backhand sanatçısı — 2004 Olimpiyat altını, Dünya Şampiyonu, bilek sihri.', 'Мастер бэкхенда — золото ОИ-2004, чемпион мира.', 'Rückhand-Künstler — Olympia-Gold 2004, Weltmeister.'),
    }),
    Q({
        id: 'momota', name: 'Kento Momota', years: '1994–', country: '🇯🇵', status: 'active', peakRank: 1, fallbackRank: 20, wiki: 'Kento_Momota',
        bio: L('World #1 Japanese maestro — World titles, All England, comeback after crash.', 'Dünya 1 numarası Japon maestro — Dünya unvanları, All England, kaza sonrası dönüş.', 'Японский маэстро №1 — титулы ЧМ, All England.', 'Japanischer Maestro Nr. 1 — WM-Titel, All England.'),
    }),
    Q({
        id: 'gade', name: 'Peter Gade', years: '1976–', country: '🇩🇰', peakRank: 1, wiki: 'Peter_Gade',
        bio: L('Danish deception king — years near #1, European icon, net wizard.', 'Danimarkalı aldatma kralı — yıllarca 1 numara yakını, Avrupa ikonu.', 'Датский король обмана — годы у №1, икона Европы.', 'Dänischer Täuschungskönig — Jahre nahe Nr. 1.'),
    }),
    Q({
        id: 'frost', name: 'Morten Frost', years: '1958–', country: '🇩🇰', peakRank: 1, wiki: 'Morten_Frost',
        bio: L('Danish golden era face — All England titles, coach of champions later.', 'Danimarka altın çağın yüzü — All England unvanları, sonra şampiyon koçu.', 'Лицо датской золотой эры — титулы All England.', 'Gesicht der dänischen Goldära — All-England-Titel.'),
    }),
    Q({
        id: 'susanti', name: 'Susi Susanti', years: '1971–', country: '🇮🇩', peakRank: 1, wiki: 'Susi_Susanti',
        bio: L('First Olympic badminton women’s gold (1992) — Indonesian national hero.', 'İlk Olimpiyat badminton kadın altını (1992) — Endonezya milli kahramanı.', 'Первое олимпийское золото женщин (1992) — героиня Индонезии.', 'Erstes Olympia-Gold der Frauen (1992) — Nationalheldin.'),
    }),
    Q({
        id: 'zhangning', name: 'Zhang Ning', years: '1975–', country: '🇨🇳', peakRank: 1, wiki: 'Zhang_Ning',
        bio: L('Back-to-back Olympic golds — longevity queen of women’s singles.', 'Arka arkaya Olimpiyat altınları — kadın tekler uzun ömür kraliçesi.', 'Два олимпийских золота подряд — королева долголетия.', 'Zwei Olympia-Golds in Folge — Longevity-Königin.'),
    }),
    Q({
        id: 'gaoling', name: 'Gao Ling', years: '1979–', country: '🇨🇳', peakRank: 1, wiki: 'Gao_Ling',
        bio: L('Doubles GOAT conversation — Olympic medals mountain, pair chemistry master.', 'Çiftler GOAT tartışması — Olimpiyat madalya dağı, çift kimyası ustası.', 'Спор о GOAT в парах — гора олимпийских медалей.', 'Doppel-GOAT-Debatte — Olympia-Medaillenberg.'),
    }),
    Q({
        id: 'chenyufei', name: 'Chen Yufei', years: '1998–', country: '🇨🇳', status: 'active', peakRank: 1, fallbackRank: 3, wiki: 'Chen_Yufei',
        bio: L('Tokyo Olympic gold — athletic Chinese singles star of the 2020s.', 'Tokyo Olimpiyat altını — 2020’lerin atletik Çin tekler yıldızı.', 'Золото Токио — атлетичная звезда одиночки 2020-х.', 'Tokio-Olympia-Gold — athletischer China-Star der 2020er.'),
    }),
    Q({
        id: 'yamaguchi', name: 'Akane Yamaguchi', years: '1997–', country: '🇯🇵', status: 'active', peakRank: 1, fallbackRank: 4, wiki: 'Akane_Yamaguchi',
        bio: L('World Champion Japanese fighter — tiny stature, huge heart, elite retrieval.', 'Dünya Şampiyonu Japon savaşçı — küçük boy, koca yürek, elit kurtarma.', 'Чемпионка мира — малый рост, огромное сердце.', 'Weltmeisterin — kleine Statur, großes Herz.'),
    }),
    Q({
        id: 'intanon', name: 'Ratchanok Intanon', years: '1995–', country: '🇹🇭', status: 'active', peakRank: 1, fallbackRank: 15, wiki: 'Ratchanok_Intanon',
        bio: L('Youngest women’s World Champion — Thai flair, deceptive net game.', 'En genç kadın Dünya Şampiyonu — Tay flair, aldatıcı file oyunu.', 'Самая молодая чемпионка мира — тайский флэр.', 'Jüngste Frauen-Weltmeisterin — thailändischer Flair.'),
    }),
    Q({
        id: 'fuhaifeng', name: 'Fu Haifeng', years: '1983–', country: '🇨🇳', peakRank: 1, wiki: 'Fu_Haifeng',
        bio: L('Men’s doubles power — Olympic golds with Cai Yun / Zhang Nan.', 'Erkek çiftler gücü — Cai Yun / Zhang Nan ile Olimpiyat altınları.', 'Мощь мужских пар — золото ОИ с Цай Юнем / Чжан Нанем.', 'Herren-Doppel-Power — Olympia-Gold mit Cai Yun / Zhang Nan.'),
    }),
    Q({
        id: 'zhengsiwei', name: 'Zheng Siwei', years: '1997–', country: '🇨🇳', status: 'active', peakRank: 1, fallbackRank: 1, wiki: 'Zheng_Siwei',
        bio: L('Mixed doubles modern king — World titles with Huang Yaqiong.', 'Mixed çiftler modern kralı — Huang Yaqiong ile Dünya unvanları.', 'Король микста — титулы ЧМ с Хуан Яцюн.', 'Mixed-Doppel-König — WM-Titel mit Huang Yaqiong.'),
    }),
    Q({
        id: 'huangyaqiong', name: 'Huang Yaqiong', years: '1994–', country: '🇨🇳', status: 'active', peakRank: 1, fallbackRank: 1, wiki: 'Huang_Yaqiong',
        bio: L('Mixed doubles queen — Olympic gold contention, years at #1 with Zheng.', 'Mixed çiftler kraliçesi — Olimpiyat altın yarışı, Zheng ile yıllarca 1 numara.', 'Королева микста — борьба за золото ОИ, годы №1.', 'Mixed-Doppel-Königin — Olympia-Kampf, Jahre Nr. 1.'),
    }),
];

/* ─── TABLE TENNIS MORE ─── */
export const TABLE_TENNIS_MORE = [
    Q({
        id: 'waldner', name: 'Jan-Ove Waldner', years: '1965–', country: '🇸🇪', peakRank: 1, wiki: 'Jan-Ove_Waldner',
        bio: L('Mozart of table tennis — Olympic gold 1992, China’s respected Mozart.', 'Masa tenisinin Mozart’ı — 1992 Olimpiyat altını, Çin’in saygı duyduğu Mozart.', 'Моцарт настольного тенниса — золото ОИ-1992.', 'Mozart des Tischtennis — Olympia-Gold 1992.'),
    }),
    Q({
        id: 'zhangyining', name: 'Zhang Yining', years: '1981–', country: '🇨🇳', peakRank: 1, wiki: 'Zhang_Yining',
        bio: L('Double Olympic singles gold — women’s GOAT shortlist forever.', 'Çift Olimpiyat tekler altını — kadın GOAT kısa listesinde sonsuza dek.', 'Два олимпийских золота в одиночке — шорт-лист GOAT.', 'Zwei Olympia-Einzelgold — Frauen-GOAT-Shortlist.'),
    }),
    Q({
        id: 'chenmeng', name: 'Chen Meng', years: '1994–', country: '🇨🇳', status: 'active', peakRank: 1, fallbackRank: 2, wiki: 'Chen_Meng',
        bio: L('Tokyo + Paris Olympic singles gold — precision and clutch gene.', 'Tokyo + Paris Olimpiyat tekler altını — hassasiyet ve kritik gen.', 'Золото Токио и Парижа в одиночке — точность и характер.', 'Tokio- + Paris-Olympia-Einzelgold — Präzision und Clutch.'),
    }),
    Q({
        id: 'wangliqin', name: 'Wang Liqin', years: '1978–', country: '🇨🇳', peakRank: 1, wiki: 'Wang_Liqin',
        bio: L('Power FH era king — World titles, Olympic medals, Chinese legend.', 'Güç FH dönemi kralı — Dünya unvanları, Olimpiyat madalyaları.', 'Король эры мощного ФХ — титулы ЧМ, олимпийские медали.', 'König der Power-VH-Ära — WM-Titel, Olympia-Medaillen.'),
    }),
    Q({
        id: 'wanghao', name: 'Wang Hao', years: '1983–', country: '🇨🇳', peakRank: 1, wiki: 'Wang_Hao_(table_tennis)',
        bio: L('Penhold modernizer — World Champion, Olympic silvers, unique FH.', 'Penhold modernleştirici — Dünya Şampiyonu, Olimpiyat gümüşleri.', 'Модернизатор пеnhold — чемпион мира, серебро ОИ.', 'Penhold-Modernisierer — Weltmeister, Olympia-Silber.'),
    }),
    Q({
        id: 'liuguoliang', name: 'Liu Guoliang', years: '1976–', country: '🇨🇳', peakRank: 1, wiki: 'Liu_Guoliang',
        bio: L('Olympic/World champion turned coaching architect of China’s dynasty.', 'Olimpiyat/Dünya şampiyonundan Çin hanedanının koç mimarına.', 'Чемпион ОИ/мира → архитектор тренерской династии Китая.', 'Olympia-/Weltmeister → Trainer-Architekt Chinas.'),
    }),
    Q({
        id: 'wangnan', name: 'Wang Nan', years: '1978–', country: '🇨🇳', peakRank: 1, wiki: 'Wang_Nan_(table_tennis)',
        bio: L('Grand Slam woman — Olympic golds, World titles, lefty pioneer aura.', 'Grand Slam kadın — Olimpiyat altınları, Dünya unvanları, solak aura.', 'Grand Slam у женщин — золото ОИ, титулы ЧМ.', 'Grand-Slam-Frau — Olympia-Gold, WM-Titel.'),
    }),
    Q({
        id: 'lixiaoxia', name: 'Li Xiaoxia', years: '1988–', country: '🇨🇳', peakRank: 1, wiki: 'Li_Xiaoxia',
        bio: L('London Olympic singles gold — World Champion, complete offensive game.', 'Londra Olimpiyat tekler altını — Dünya Şampiyonu, tam hücum oyunu.', 'Золото Лондона в одиночке — чемпионка мира.', 'London-Olympia-Einzelgold — Weltmeisterin.'),
    }),
    Q({
        id: 'xuxin', name: 'Xu Xin', years: '1990–', country: '🇨🇳', peakRank: 1, wiki: 'Xu_Xin_(table_tennis)',
        bio: L('Lefty penhold magician — doubles force, World titles, creative genius.', 'Solak penhold sihirbazı — çiftler gücü, Dünya unvanları, yaratıcı deha.', 'Левый пеnhold-маг — сила пар, титулы ЧМ.', 'Linker Penhold-Magier — Doppel-Kraft, WM-Titel.'),
    }),
    Q({
        id: 'ovtcharov', name: 'Dimitrij Ovtcharov', years: '1988–', country: '🇩🇪', status: 'active', peakRank: 1, fallbackRank: 15, wiki: 'Dimitrij_Ovtcharov',
        bio: L('German Olympic medalist — longevity outside China, creative serves.', 'Alman Olimpiyat madalyalı — Çin dışı uzun ömür, yaratıcı servisler.', 'Немецкий призёр ОИ — долголетие вне Китая.', 'Deutscher Olympia-Medaillengewinner — Longevity außerhalb Chinas.'),
    }),
    Q({
        id: 'calderano', name: 'Hugo Calderano', years: '1996–', country: '🇧🇷', status: 'active', peakRank: 3, fallbackRank: 4, wiki: 'Hugo_Calderano',
        bio: L('Best of the Americas — Top 5 fixture, Olympic contender, athletic FH.', 'Amerika’nın en iyisi — Top 5 sabit, Olimpiyat adayı, atletik FH.', 'Лучший Америк — топ-5, претендент ОИ.', 'Bester der Amerikas — Top-5-Fixpunkt, Olympia-Anwärter.'),
    }),
    Q({
        id: 'samsonov', name: 'Vladimir Samsonov', years: '1976–', country: '🇧🇾', peakRank: 1, wiki: 'Vladimir_Samsonov',
        bio: L('European consistency king — decades in Top 10, World Cup titles.', 'Avrupa istikrar kralı — on yıllarca Top 10, Dünya Kupası unvanları.', 'Король стабильности Европы — десятилетия в топ-10.', 'Europäischer Konstanz-König — Jahrzehnte Top 10.'),
    }),
];

/* ─── PICKLEBALL MORE ─── */
export const PICKLEBALL_MORE = [
    Q({
        id: 'collin', name: 'Collin Johns', years: '1990s–', country: '🇺🇸', status: 'active', peakRank: 2, fallbackRank: 5, wiki: 'Collin_Johns',
        bio: L('Ben’s brother — doubles specialist, multiple PPA titles, soft-game IQ.', 'Ben’in kardeşi — çiftler uzmanı, çoklu PPA unvanı, soft oyun IQ’su.', 'Брат Бена — специалист пар, титулы PPA.', 'Bens Bruder — Doppel-Spezialist, PPA-Titel.'),
    }),
    Q({
        id: 'bright', name: 'Anna Bright', years: '1990s–', country: '🇺🇸', status: 'active', peakRank: 2, fallbackRank: 4, wiki: 'Anna_Bright_(pickleball)',
        bio: L('Top women’s doubles/mixed force — athletic, vocal leader on tour.', 'Üst düzey kadın çiftler/mixed gücü — atletik, turda sesli lider.', 'Топ сила женских пар/микст — атлетичная лидерша.', 'Top Damen-Doppel/Mixed — athletisch, stimmlich führend.'),
    }),
    Q({
        id: 'devilliers', name: 'Jay Devilliers', years: '1990s–', country: '🇫🇷', status: 'active', peakRank: 3, fallbackRank: 8, wiki: 'Jay_Devilliers',
        bio: L('French flair on the PPA — creative hands, international face of the sport.', 'PPA’da Fransız flair — yaratıcı eller, sporun uluslararası yüzü.', 'Французский флэр на PPA — креативные руки.', 'Französischer Flair auf der PPA — kreative Hände.'),
    }),
    Q({
        id: 'newman', name: 'Riley Newman', years: '1980s–', country: '🇺🇸', status: 'legend', peakRank: 1, wiki: 'Riley_Newman',
        bio: L('Early pro era champion — titles before the Johns/Waters explosion.', 'Erken pro çağ şampiyonu — Johns/Waters patlamasından önce unvanlar.', 'Чемпион ранней про-эры — титулы до взрыва Johns/Waters.', 'Champion der frühen Pro-Ära — Titel vor Johns/Waters.'),
    }),
    Q({
        id: 'kovalova', name: 'Lucy Kovalova', years: '1980s–', country: '🇺🇦', status: 'legend', peakRank: 1, wiki: 'Lucy_Kovalova',
        bio: L('Early women’s pro standout — soft hands, pioneer of the women’s tour.', 'Erken kadın pro öne çıkan — yumuşak eller, kadın turun öncüsü.', 'Ранняя звезда женского про — мягкие руки, пионер тура.', 'Frühe Damen-Pro-Größe — weiche Hände, Tour-Pionierin.'),
    }),
    Q({
        id: 'wright', name: 'Matt Wright', years: '1980s–', country: '🇺🇸', status: 'active', peakRank: 2, fallbackRank: 12, wiki: 'Matt_Wright_(pickleball)',
        bio: L('Doubles veteran — multiple titles, tough competitor, tour mainstay.', 'Çiftler veteranı — çoklu unvan, sert rakip, tur direği.', 'Ветеран пар — много титулов, жёсткий конкурент.', 'Doppel-Veteran — viele Titel, harter Konkurrent.'),
    }),
    Q({
        id: 'jansen', name: 'Lea Jansen', years: '1990s–', country: '🇺🇸', status: 'active', peakRank: 3, fallbackRank: 10, wiki: 'Lea_Jansen',
        bio: L('Rising / established women’s contender — power and presence on PPA.', 'Yükselen/yerleşik kadın adayı — PPA’da güç ve varlık.', 'Претендентка — сила и присутствие на PPA.', 'Anwärterin — Power und Präsenz auf der PPA.'),
    }),
    Q({
        id: 'dekel', name: 'Dekel Bar', years: '1990s–', country: '🇮🇱', status: 'active', peakRank: 5, fallbackRank: 15, wiki: 'Dekel_Bar',
        bio: L('International men’s contender — athletic singles/doubles threat.', 'Uluslararası erkek adayı — atletik tekler/çiftler tehdidi.', 'Международный претендент — атлетичная угроза.', 'Internationaler Anwärter — athletische Einzel-/Doppel-Gefahr.'),
    }),
];

/* ─── VOLLEYBALL MORE ─── */
export const VOLLEYBALL_MORE = [
    Q({
        id: 'mireya', name: 'Mireya Luis', years: '1967–', country: '🇨🇺', peakRank: 1, wiki: 'Mireya_Luis',
        bio: L('Cuban outside legend — Olympic golds, World titles, jumping icon.', 'Kübalı smaçör efsanesi — Olimpiyat altınları, Dünya unvanları, sıçrama ikonu.', 'Кубинская легенда — золото ОИ, титулы ЧМ, икона прыжка.', 'Kubanische Legende — Olympia-Gold, WM-Titel, Sprung-Ikone.'),
    }),
    Q({
        id: 'reglabell', name: 'Regla Bell', years: '1970–', country: '🇨🇺', peakRank: 1, wiki: 'Regla_Bell',
        bio: L('Cuban dynasty star — Olympic golds, World Cups, outside power.', 'Küba hanedanı yıldızı — Olimpiyat altınları, Dünya Kupaları.', 'Звезда кубинской династии — золото ОИ, Кубки мира.', 'Star der Kuba-Dynastie — Olympia-Gold, World Cups.'),
    }),
    Q({
        id: 'fabiana', name: 'Fabiana Claudino', years: '1985–', country: '🇧🇷', peakRank: 1, wiki: 'Fabiana_Claudino',
        bio: L('Brazilian middle blocker captain — Olympic golds, World titles.', 'Brezilyalı orta bloker kaptan — Olimpiyat altınları, Dünya unvanları.', 'Бразильский центральный — золото ОИ, титулы ЧМ.', 'Brasilianische Mittelblockerin — Olympia-Gold, WM-Titel.'),
    }),
    Q({
        id: 'ricardo', name: 'Ricardo Santos', years: '1975–', country: '🇧🇷', peakRank: 1, wiki: 'Ricardo_Santos_(beach_volleyball)',
        bio: L('Beach volleyball Olympic champion — Brazil’s sand dynasty face.', 'Plaj voleybolu Olimpiyat şampiyonu — Brezilya’nın kum hanedanı yüzü.', 'Олимпийский чемпион пляжа — лицо песчаной династии Бразилии.', 'Olympia-Champion Beach — Gesicht der Brasilien-Sand-Dynastie.'),
    }),
    Q({
        id: 'sinjin', name: 'Sinjin Smith', years: '1957–', country: '🇺🇸', peakRank: 1, wiki: 'Sinjin_Smith',
        bio: L('Beach pioneer — titles mountain with Hovland, early pro beach icon.', 'Plaj öncüsü — Hovland ile unvan dağı, erken pro plaj ikonu.', 'Пионер пляжа — гора титулов с Ховландом.', 'Beach-Pionier — Titelberg mit Hovland.'),
    }),
    Q({
        id: 'gamova', name: 'Yekaterina Gamova', years: '1980–', country: '🇷🇺', peakRank: 1, wiki: 'Yekaterina_Gamova',
        bio: L('2.02m opposite force — World Champion, club legend, blocking wall.', '2.02m pasör çaprazı gücü — Dünya Şampiyonu, kulüp efsanesi.', 'Диагональ 2,02 м — чемпионка мира, легенда клуба.', 'Diagonalangreiferin 2,02 m — Weltmeisterin, Klub-Legende.'),
    }),
    Q({
        id: 'boskovic', name: 'Tijana Bošković', years: '1997–', country: '🇷🇸', status: 'active', peakRank: 1, fallbackRank: 1, wiki: 'Tijana_Bošković',
        bio: L('Serbian opposite superstar — World/Euro titles, club MVP machine.', 'Sırp pasör çaprazı süperstar — Dünya/Avrupa unvanları, kulüp MVP.', 'Сербская суперзвезда диагонали — титулы ЧМ/Европы.', 'Serbische Diagonal-Superstar — WM-/EM-Titel, Klub-MVP.'),
    }),
    Q({
        id: 'zaytsev', name: 'Ivan Zaytsev', years: '1988–', country: '🇮🇹', status: 'active', peakRank: 2, fallbackRank: 10, wiki: 'Ivan_Zaytsev',
        bio: L('“Lo Zar” — Italian opposite, Olympic medals, serve cannon.', '“Lo Zar” — İtalyan pasör çaprazı, Olimpiyat madalyaları, servis topu.', '«Lo Zar» — итальянская диагональ, медали ОИ.', '„Lo Zar“ — italienische Diagonale, Olympia-Medaillen.'),
    }),
    Q({
        id: 'bruninho', name: 'Bruno Rezende', years: '1986–', country: '🇧🇷', status: 'active', peakRank: 1, fallbackRank: 5, wiki: 'Bruno_Rezende',
        bio: L('Bruninho — Olympic gold setter, Brazil’s brain on the court.', 'Bruninho — Olimpiyat altınlı pasör, Brezilya’nın sahadaki beyni.', 'Bruninho — олимпийский связующий, мозг Бразилии.', 'Bruninho — Olympia-Gold-Zuspieler, Gehirn Brasiliens.'),
    }),
    Q({
        id: 'flohyman', name: 'Flo Hyman', years: '1954–1986', country: '🇺🇸', peakRank: 1, wiki: 'Flo_Hyman',
        bio: L('American outdoor legend — Olympic silver 1984, towering presence, activist.', 'Amerikan açık efsane — 1984 Olimpiyat gümüşü, kule varlık, aktivist.', 'Американская легенда — серебро ОИ-1984, активистка.', 'US-Legende — Olympia-Silber 1984, Aktivistin.'),
    }),
    Q({
        id: 'yuri', name: 'Yuri Romanò', years: '1997–', country: '🇮🇹', status: 'active', peakRank: 5, fallbackRank: 20, wiki: 'Yuri_Romanò',
        bio: L('Modern Italian opposite prospect — club and national team contributor.', 'Modern İtalyan pasör çaprazı — kulüp ve milli takım katkısı.', 'Современная итальянская диагональ — клуб и сборная.', 'Moderne italienische Diagonale — Klub und Nationalteam.'),
    }),
    Q({
        id: 'thaisa', name: 'Thaísa Daher', years: '1987–', country: '🇧🇷', status: 'active', peakRank: 1, fallbackRank: 8, wiki: 'Thaísa_Daher',
        bio: L('Brazilian middle — Olympic golds, World titles, elite block/attack.', 'Brezilyalı orta — Olimpiyat altınları, Dünya unvanları, elit blok/hücum.', 'Бразильский центральный — золото ОИ, титулы ЧМ.', 'Brasilianische Mitte — Olympia-Gold, WM-Titel.'),
    }),
];
