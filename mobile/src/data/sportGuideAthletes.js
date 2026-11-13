/** Spor rehberi — önemli sporcular (özet + detay). rankingKey canlı sıralama eşlemesi için. */

const L = (en, tr, ru, de) => ({ en, tr, ru, de });

function A({
    id, name, years, country = '', tour = null, status = 'active',
    peakRank = null, fallbackRank = null, bio, life, achievements, advice, style, links = [],
}) {
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
        bio,
        detail: { life, achievements, advice, style },
        links,
    };
}

export const TENNIS_ATHLETES = [
    A({
        id: 'zverev', name: 'Alexander Zverev', years: '1997–', country: '🇩🇪', tour: 'ATP',
        peakRank: 1, fallbackRank: 1,
        bio: L(
            'German power baseliner; huge serve and forehand. Long chase for a major finally paid off — now a fixture at the top of the ATP list.',
            'Alman güç baseline oyuncusu; büyük servis ve forehand. Grand Slam peşinden sonra zirveye yerleşti.',
            'Немецкий мощный базовый игрок; мощная подача и форхенд. Долго шёл к мейджору — теперь регулярно в топе ATP.',
            'Deutscher Power-Basisliner; großer Aufschlag und Vorhand. Lange Major-Jagd — jetzt fest in der ATP-Spitze.'
        ),
        life: L(
            'Born in Hamburg to Russian tennis parents who coached him early. Turned pro as a teenager, broke into the top 10 young, and rebuilt after injuries and high-profile finals losses. Known for a calm on-court demeanor that contrasts with explosive ball-striking.',
            'Hamburg doğumlu; Rus tenisçi ebeveynleri erken koçluk yaptı. Genç yaşta top 10’a girdi, sakatlıklar ve büyük final kayıplarından sonra toparlandı. Sahada sakin, vuruşlarda patlayıcı.',
            'Родился в Гамбурге в теннисной семье. Рано вошёл в топ-10, восстанавливался после травм и обидных финалов. Спокоен на корте при взрывных ударах.',
            'In Hamburg geboren, früh von den Eltern gecoacht. Jung in die Top 10, Comeback nach Verletzungen und schweren Finalniederlagen. Ruhig auf dem Platz, explosiv im Schlag.'
        ),
        achievements: L(
            'ATP Finals champion; multiple Masters 1000 titles; Grand Slam finalist/champion runs; Olympic medals; weeks as world No. 1.',
            'ATP Finals şampiyonu; çoklu Masters 1000; Grand Slam final/şampiyonluk serileri; Olimpiyat madalyaları; dünya 1 numarası haftaları.',
            'Чемпион Итогового; несколько Masters 1000; финалы/титулы Grand Slam; олимпийские медали; недели №1.',
            'ATP-Finals-Sieger; mehrere Masters 1000; Grand-Slam-Finals/Titel; Olympia-Medaillen; Wochen als Nr. 1.'
        ),
        advice: L(
            'Use the serve to set up the +1 forehand; don’t overhit second serves under pressure — kick high and build the point.',
            'Servisle +1 forehand kur; baskıda ikinci servisi fazla zorlama — yüksek kick at, puanı inşa et.',
            'Подача готовит +1 форхенд; вторую под давлением не убивайте — высокий кик и розыгрыш.',
            'Aufschlag für +1-Vorhand nutzen; zweiten unter Druck nicht überhitten — hoher Kick, Punkt aufbauen.'
        ),
        style: L(
            'First-strike tennis from the baseline; prefers hard courts; improving net transitions year by year.',
            'Baseline’den first-strike; sert kort tercihi; file geçişleri yıllar içinde gelişiyor.',
            'Атака с задней линии; любит хард; выход к сетке улучшается.',
            'First-Strike von der Grundlinie; Hartplatz bevorzugt; Netzübergänge besser.'
        ),
        links: [
            { label: L('Press / interviews', 'Basın / röportaj', 'Пресса / интервью', 'Presse / Interviews'), url: 'https://www.youtube.com/results?search_query=Alexander+Zverev+interview' },
        ],
    }),
    A({
        id: 'sinner', name: 'Jannik Sinner', years: '2001–', country: '🇮🇹', tour: 'ATP',
        peakRank: 1, fallbackRank: 2,
        bio: L(
            'Italian flat-hitter with elite timing and a quiet competitive fire. Multiple majors; redefined consistency at the top.',
            'İtalyan düz vuruş ustası; zamanlama ve sessiz rekabet ateşi. Birden fazla major; zirvede istikrarı yeniden tanımladı.',
            'Итальянец с плоскими ударами и элитным таймингом. Несколько мейджоров; эталон стабильности на вершине.',
            'Italiener mit flachen Schlägen und Timing. Mehrere Majors; Konstanz an der Spitze neu definiert.'
        ),
        life: L(
            'From South Tyrol; traded skiing potential for tennis. Coached through a rapid rise from Challengers to Slam champion. Soft-spoken off court, ruthless in long baseline exchanges.',
            'Güney Tirol’den; kayak potansiyelini tenis için bıraktı. Challenger’dan Slam şampiyonluğuna hızlı yükseliş. Kort dışında sakin, uzun rallilerde acımasız.',
            'Из Южного Тироля; ушёл из лыж в теннис. Быстрый путь от челленджеров к мейджорам. Спокоен вне корта, беспощаден в длинных розыгрышах.',
            'Südtirol; vom Ski zum Tennis. Rascher Aufstieg vom Challenger zum Slam-Sieger. Ruhig abseits, gnadenlos in langen Ballwechseln.'
        ),
        achievements: L(
            'Multiple Grand Slam titles; ATP Finals; long stretches at world No. 1; Davis Cup contributions for Italy.',
            'Birden fazla Grand Slam; ATP Finals; uzun süre dünya 1 numarası; İtalya Davis Cup katkıları.',
            'Несколько Grand Slam; Итоговый; долго №1; Кубок Дэвиса за Италию.',
            'Mehrere Grand Slams; ATP Finals; lange Nr. 1; Davis Cup für Italien.'
        ),
        advice: L(
            'Take the ball early on the rise; change direction only when balanced — his trademark is clean depth without wild risk.',
            'Topu yükselişte erken al; yönü sadece dengeliyken değiştir — imzası kontrollü derinlik, vahşi risk değil.',
            'Бейте по восходящему мячу; меняйте направление только в балансе — глубина без лишнего риска.',
            'Ball steigend früh nehmen; Richtung nur aus Balance wechseln — Tiefe ohne Wildheit.'
        ),
        style: L(
            'Compact preparation, heavy pace through the middle, improved serve locations under scoreboard pressure.',
            'Kompakt hazırlık, ortadan ağır tempo, skor baskısında gelişmiş servis yerleri.',
            'Компактный замах, темп через центр, улучшенные зоны подачи под счётом.',
            'Kompakter Aushol, Tempo durch die Mitte, bessere Aufschlagzonen unter Druck.'
        ),
        links: [
            { label: L('Interviews & talks', 'Röportajlar', 'Интервью', 'Interviews'), url: 'https://www.youtube.com/results?search_query=Jannik+Sinner+interview' },
        ],
    }),
    A({
        id: 'alcaraz', name: 'Carlos Alcaraz', years: '2003–', country: '🇪🇸', tour: 'ATP',
        peakRank: 1, fallbackRank: 3,
        bio: L(
            'Spanish all-court phenom: drop shots, sabre forehands, and athletic defense. Youngest men’s world No. 1 in the Open Era.',
            'İspanyol all-court harikası: drop, kılıç forehand, atletik savunma. Open Era’nın en genç erkek 1 numarası.',
            'Испанский вундеркинд всех покрытий: дропы, форхенд-сабля, атлетичная защита. Самый молодой №1 Open Era.',
            'Spanisches Allcourt-Phänomen: Drops, Säbel-Vorhand, athletische Defence. Jüngste Herren-Nr. 1 der Open Era.'
        ),
        life: L(
            'Raised in El Palmar (Murcia); Juan Carlos Ferrero’s academy shaped his game and mentality. Broke through with fearless shot-making and joy that fans instantly connected with.',
            'El Palmar (Murcia) yetişmesi; Juan Carlos Ferrero akademisi oyununu ve zihniyetini şekillendirdi. Korkusuz vuruşlar ve neşe ile hızla bağ kurdu.',
            'Вырос в Эль-Пальмаре; академия Ферреро сформировала игру и характер. Прорыв через смелые удары и радость игры.',
            'Aufgewachsen in El Palmar; Ferrero-Akademie prägte Spiel und Mentalität. Durchbruch mit mutigem Spiel und Freude.'
        ),
        achievements: L(
            'Multiple Grand Slams on different surfaces; weeks at No. 1; Olympic experience; face of the next generation rivalry with Sinner.',
            'Farklı yüzeylerde birden fazla Grand Slam; 1 numara haftaları; Olimpiyat deneyimi; Sinner ile yeni nesil rekabetin yüzü.',
            'Несколько Grand Slam на разных покрытиях; недели №1; Олимпиада; лицо соперничества с Синнером.',
            'Mehrere Grand Slams auf verschiedenen Belägen; Nr.-1-Wochen; Olympia; Gesicht der Rivalität mit Sinner.'
        ),
        advice: L(
            'Mix height and spin to open the court, then finish with a drop or inside-out forehand — variety beats pure pace.',
            'Kortu açmak için yükseklik ve spin karıştır, sonra drop veya inside-out forehand ile bitir — çeşitlilik saf temponun önüne geçer.',
            'Высота и спин открывают корт, затем дроп или inside-out — разнообразие важнее чистой скорости.',
            'Höhe und Spin öffnen den Platz, dann Drop oder Inside-Out — Vielfalt schlägt reines Tempo.'
        ),
        style: L(
            'Explosive movement; loves clay and hard; net instincts improving; iconic tweener/lob improvisation.',
            'Patlayıcı hareket; toprak ve sert sever; file içgüdüsü gelişiyor; ikonik tweener/lob doğaçlama.',
            'Взрывное передвижение; грунт и хард; выход к сетке растёт; твинеры и лобы.',
            'Explosives Bewegen; Sand und Hartplatz; Netzgefühl besser; Tweener/Lob-Improvisation.'
        ),
        links: [
            { label: L('Talks & highlights', 'Konuşma ve özet', 'Интервью и обзоры', 'Talks & Highlights'), url: 'https://www.youtube.com/results?search_query=Carlos+Alcaraz+interview' },
        ],
    }),
    A({
        id: 'shelton', name: 'Ben Shelton', years: '2002–', country: '🇺🇸', tour: 'ATP',
        peakRank: 4, fallbackRank: 4,
        bio: L(
            'American lefty with a rocket serve and fearless attacking style. Rapid climb into the ATP top tier.',
            'Amerikan solak; roket servis ve korkusuz hücum. ATP üst lige hızlı tırmanış.',
            'Американский левша с ракетной подачей и смелой атакой. Быстрый подъём в топ ATP.',
            'US-Linkshänder mit Raketenaufschlag und mutigem Angriff. Schneller Aufstieg in die ATP-Spitze.'
        ),
        life: L(
            'Son of coach Bryan Shelton; college star at Florida before turning pro. Charisma and highlight-reel athleticism made him a fan favourite on big stages.',
            'Koç Bryan Shelton’ın oğlu; pro olmadan Florida üniversite yıldızı. Karizma ve atletizmle büyük sahnelerin favorisi oldu.',
            'Сын тренера Брайана Шелтона; звезда колледжа Флориды. Харизма и атлетизм сделали его любимцем публики.',
            'Sohn von Coach Bryan Shelton; College-Star in Florida. Charisma und Athletik — Publikumsliebling.'
        ),
        achievements: L(
            'Grand Slam semi/final runs; Masters deep weeks; top-5 breakthrough; Davis Cup appearances for the USA.',
            'Grand Slam yarı/final koşuları; Masters derin koşular; top-5 kırılımı; ABD Davis Cup.',
            'Полуфиналы/финалы мейджоров; глубокие забеги на Masters; прорыв в топ-5; Кубок Дэвиса США.',
            'Grand-Slam-Halb-/Finals; tiefe Masters-Wochen; Top-5-Durchbruch; Davis Cup USA.'
        ),
        advice: L(
            'Serve patterns first: wide + body; don’t rush the first forehand after a big serve — set the +1.',
            'Önce servis kalıpları: geniş + body; büyük servisten sonra ilk forehand’i aceele etme — +1’i kur.',
            'Сначала схема подачи: широко + в корпус; после эйса не торопите +1 форхенд.',
            'Zuerst Aufschlagmuster: weit + Body; nach großem Serve +1 nicht hetzen.'
        ),
        style: L(
            'Lefty serve dominance, aggressive returns, improving clay patience.',
            'Solak servis baskını, agresif karşılama, toprakta sabır gelişiyor.',
            'Доминирование левой подачи, агрессивный приём, терпение на грунте растёт.',
            'Linke Aufschlag-Dominanz, aggressiver Return, mehr Geduld auf Sand.'
        ),
        links: [
            { label: L('Interviews', 'Röportajlar', 'Интервью', 'Interviews'), url: 'https://www.youtube.com/results?search_query=Ben+Shelton+interview' },
        ],
    }),
    A({
        id: 'medvedev', name: 'Daniil Medvedev', years: '1996–', country: '🇷🇺', tour: 'ATP',
        peakRank: 1, fallbackRank: 5,
        bio: L(
            'Russian counterpuncher with a unique flat backhand and chess-like tactics. US Open champion and long-time top-5 staple.',
            'Rus counterpuncher; özgün düz backhand ve satranç taktiği. US Open şampiyonu, uzun süre top-5.',
            'Российский контрпанчер с плоским бэкхендом и шахматной тактикой. Чемпион US Open, долго в топ-5.',
            'Russischer Counterpuncher mit flacher Rückhand und Schachtaktik. US-Open-Sieger, lange Top 5.'
        ),
        life: L(
            'Moscow-born; built a reputation for dry humor in press and for soaking up pace from the back of the court. Peak years included a historic hard-court streak and world No. 1.',
            'Moskova doğumlu; basında kuru mizahı ve kort arkasından tempo yutmasıyla tanındı. Zirve yıllarında tarihi sert kort serisi ve 1 numaralık.',
            'Родился в Москве; сухой юмор на пресс-конференциях и умение «съедать» темп с задней линии. Пик — серия на харде и №1.',
            'In Moskau geboren; trockener Humor und Tempo schlucken von hinten. Peak: Hartplatz-Serie und Nr. 1.'
        ),
        achievements: L(
            'US Open title; multiple Masters; ATP Finals; weeks at No. 1; deep runs at all majors.',
            'US Open unvanı; çoklu Masters; ATP Finals; 1 numara haftaları; tüm major’larda derin koşular.',
            'Титул US Open; несколько Masters; Итоговый; недели №1; глубокие забеги на всех мейджорах.',
            'US-Open-Titel; mehrere Masters; ATP Finals; Nr.-1-Wochen; tiefe Major-Läufe.'
        ),
        advice: L(
            'Absorb pace, redirect DTL, then wrong-foot — patience first, finish second.',
            'Tempoyu yut, DTL yön değiştir, sonra wrong-foot — önce sabır, sonra bitiriş.',
            'Гасите темп, переводите по линии, затем wrong-foot — сначала терпение.',
            'Tempo schlucken, longline umlenken, dann Wrong-Foot — erst Geduld.'
        ),
        style: L(
            'Deep flat groundstrokes, excellent return position, less comfortable on high-bounce clay.',
            'Derin düz yer vuruşları, iyi karşılama pozisyonu; yüksek sektirmeli toprakta daha az rahat.',
            'Глубокие плоские удары, сильный приём; на высоком грунте менее комфортно.',
            'Tiefe flache Grundschläge, starke Returnposition; auf hohem Sand weniger wohl.'
        ),
        links: [
            { label: L('Press conferences', 'Basın toplantıları', 'Пресс-конференции', 'Pressekonferenzen'), url: 'https://www.youtube.com/results?search_query=Daniil+Medvedev+interview' },
        ],
    }),
    A({
        id: 'djokovic', name: 'Novak Djokovic', years: '1987–', country: '🇷🇸', tour: 'ATP',
        peakRank: 1, fallbackRank: 12,
        bio: L(
            'Serbian return GOAT candidate; flexibility, mental steel, and the Open Era men’s Slam record. Still competing at the highest level.',
            'Sırp karşılama GOAT adayı; esneklik, mental çelik, Open Era erkek Slam rekoru. Hâlâ en üst seviyede.',
            'Кандидат в GOAT приёма; гибкость, менталитет, рекорд мейджоров Open Era. Всё ещё на высшем уровне.',
            'Return-GOAT-Kandidat; Flexibilität, Mentalität, Open-Era-Slam-Rekord. Weiter auf Topniveau.'
        ),
        life: L(
            'Grew up in Belgrade through the 1990s hardships; escaped into tennis with fierce focus. Built a nutrition/flexibility routine that extended his prime into his late 30s. Rivalries with Federer and Nadal defined modern tennis.',
            '1990’lar Belgrad zorluklarında büyüdü; tenise tutkuyla sarıldı. Beslenme/esneklik rutiniyle 30’ların sonuna kadar zirveyi uzattı. Federer ve Nadal rekabetleri modern tenisi tanımladı.',
            'Вырос в Белграде 90-х; ушёл в теннис. Питание и гибкость продлили пик. Соперничество с Федерером и Надалем.',
            'Aufgewachsen im Belgrad der 90er; Fokus auf Tennis. Ernährung/Flexibilität verlängerten die Prime. Rivalitäten mit Federer und Nadal.'
        ),
        achievements: L(
            'Most men’s Grand Slam singles titles (Open Era); record weeks at No. 1; Career Golden Masters; Olympic gold; multiple Australian Opens.',
            'Open Era en çok erkek Grand Slam tekler; rekor 1 numara haftası; Career Golden Masters; Olimpiyat altını; çoklu Avustralya Açık.',
            'Рекорд мейджоров Open Era среди мужчин; рекорд недель №1; Career Golden Masters; олимпийское золото.',
            'Meiste Herren-Grand-Slams der Open Era; Rekord-Nr.-1-Wochen; Career Golden Masters; Olympia-Gold.'
        ),
        advice: L(
            'Return position matters more than flash: deep middle first, then punish the short ball. Stay present point by point.',
            'Karşılama pozisyonu şovdan önemli: önce derin orta, sonra kısa topu cezalandır. Puan puan anda kal.',
            'Позиция на приёме важнее шоу: сначала глубокий центр, потом короткий мяч. Очко за очком.',
            'Returnposition vor Show: erst tiefe Mitte, dann kurze Bälle bestrafen. Punkt für Punkt.'
        ),
        style: L(
            'Best return in history debates; elastic defense; backhand DTL as a weapon; clutch fifth sets.',
            'Tarihin en iyi karşılama tartışmalarında; elastik savunma; backhand DTL silah; kritik 5. setler.',
            'Лучший приём в спорах истории; эластичная защита; бэкхенд по линии; пятые сеты.',
            'Bester Return der Debatte; elastische Defence; Rückhand longline; clutch 5. Sätze.'
        ),
        links: [
            { label: L('Legacy interviews', 'Miras röportajları', 'Интервью о наследии', 'Vermächtnis-Interviews'), url: 'https://www.youtube.com/results?search_query=Novak+Djokovic+interview' },
        ],
    }),
    A({
        id: 'fritz', name: 'Taylor Fritz', years: '1997–', country: '🇺🇸', tour: 'ATP',
        peakRank: 4, fallbackRank: 10,
        bio: L(
            'American first-strike player with a heavy serve-forehand combo; consistent top-10 presence and big hard-court results.',
            'Amerikan first-strike; ağır servis-forehand kombosu; istikrarlı top-10 ve büyük sert kort sonuçları.',
            'Американский first-strike с мощной подачей и форхендом; стабильный топ-10.',
            'US-First-Strike mit starkem Serve-Vorhand; konstant Top 10.'
        ),
        life: L(
            'California raised; turned pro young and steadily climbed with improved fitness and return depth. Known for straightforward press answers and workmanlike big-match approach.',
            'Kaliforniya’da yetişti; genç pro oldu, kondisyon ve karşılama derinliğiyle tırmandı. Düz basın cevapları ve işçi usulü büyük maç yaklaşımı.',
            'Вырос в Калифорнии; стабильный рост за счёт формы и приёма. Прямолинейные пресс-конференции.',
            'In Kalifornien aufgewachsen; Aufstieg über Fitness und Return. Direkte Presse, nüchtern in großen Matches.'
        ),
        achievements: L(
            'Masters titles; Grand Slam semi/final weeks; ATP Finals qualification stretches; Davis Cup for USA.',
            'Masters unvanları; Grand Slam yarı/final haftaları; ATP Finals kotası; ABD Davis Cup.',
            'Титулы Masters; полуфиналы мейджоров; Итоговый; Кубок Дэвиса США.',
            'Masters-Titel; Grand-Slam-Halbfinale; ATP Finals; Davis Cup USA.'
        ),
        advice: L(
            'Commit to the first ball after the serve; miss long rather than into the net when going for the corner.',
            'Servisten sonraki ilk topa bağlan; köşeye giderken fileye değil uzağa hata et.',
            'После подачи атакуйте первый мяч; в угол лучше длинная ошибка, чем в сетку.',
            'Nach dem Serve den ersten Ball committen; eher lang als ins Netz fehlern.'
        ),
        style: L(
            'Serve + forehand patterns; improving backhand stability; peaks on outdoor hard.',
            'Servis + forehand kalıpları; backhand istikrarı artıyor; açık sert kortta zirve.',
            'Схемы подача+форхенд; бэкхенд стабильнее; пик на харде.',
            'Serve+Vorhand-Muster; stabilere Rückhand; Peak auf Outdoor-Hart.'
        ),
        links: [
            { label: L('Interviews', 'Röportajlar', 'Интервью', 'Interviews'), url: 'https://www.youtube.com/results?search_query=Taylor+Fritz+interview' },
        ],
    }),
    A({
        id: 'rybakina', name: 'Elena Rybakina', years: '1999–', country: '🇰🇿', tour: 'WTA',
        peakRank: 1, fallbackRank: 1,
        bio: L(
            'Kazakh power player; Wimbledon champion with a quiet demeanor and one of the biggest serves in women’s tennis.',
            'Kazak güç oyuncusu; Wimbledon şampiyonu, sakin tavır, kadın tenisinde en büyük servislerden.',
            'Казахстанская «пушка»; чемпионка Уимблдона, спокойствие и одна из лучших подач тура.',
            'Kasachische Power-Spielerin; Wimbledon-Siegerin, ruhig, einer der besten Aufschläge.'
        ),
        life: L(
            'Born in Moscow, represents Kazakhstan. Rose with a simple, huge-hitting game and composure that coaches praise. Prefers to let racquet do the talking.',
            'Moskova doğumlu, Kazakistan’ı temsil ediyor. Basit ama büyük vuruşlu oyun ve koçların övdüğü soğukkanlılık. Raketin konuşmasını tercih eder.',
            'Родилась в Москве, играет за Казахстан. Простая мощная игра и хладнокровие. Предпочитает, чтобы говорила ракетка.',
            'In Moskau geboren, für Kasachstan. Einfaches Powergame und Kaltblütigkeit. Lässt den Schläger sprechen.'
        ),
        achievements: L(
            'Wimbledon title; multiple WTA 1000s; world No. 1 stretches; deep Slam weeks on hard and grass.',
            'Wimbledon unvanı; çoklu WTA 1000; dünya 1 numarası dönemleri; sert ve çimde derin Slam haftaları.',
            'Титул Уимблдона; несколько WTA 1000; отрезки №1; глубокие недели на харде и траве.',
            'Wimbledon-Titel; mehrere WTA 1000; Nr.-1-Phasen; tiefe Slam-Wochen auf Hart/Rasen.'
        ),
        advice: L(
            'Serve to the body to jam; keep the backhand deep cross before stepping around for the forehand finish.',
            'Body servisle sıkıştır; bitirmeden önce backhand’i derin çapraz tut, sonra forehand’e dön.',
            'Подача в корпус; держите бэкхенд глубоко кроссом, затем форхенд-финиш.',
            'Body-Aufschlag; Rückhand tief cross, dann Vorhand-Finish.'
        ),
        style: L(
            'First-strike from both wings; elite serve; improving movement on clay.',
            'Her iki kanattan first-strike; elit servis; toprakta hareket gelişiyor.',
            'Атака с обеих рук; элитная подача; движение на грунте лучше.',
            'First-Strike beidseitig; Elite-Aufschlag; Bewegung auf Sand besser.'
        ),
        links: [
            { label: L('Interviews', 'Röportajlar', 'Интервью', 'Interviews'), url: 'https://www.youtube.com/results?search_query=Elena+Rybakina+interview' },
        ],
    }),
    A({
        id: 'sabalenka', name: 'Aryna Sabalenka', years: '1998–', country: '🇧🇾', tour: 'WTA',
        peakRank: 1, fallbackRank: 2,
        bio: L(
            'Belarusian power baseliner; multiple Australian Opens, raw power refined into cleaner serving under pressure.',
            'Belarus güç baseline; birden fazla Avustralya Açık, baskıda daha temiz servise evrilen ham güç.',
            'Белорусская пушка с задней линии; несколько AO, мощь, стабилизованная подача.',
            'Belarussische Power-Basislinerin; mehrere AO, Power mit stabilerem Aufschlag.'
        ),
        life: L(
            'Minsk roots; known for emotional honesty and a roaring “come on”. Rebuilt her serve after a difficult double-fault stretch and came back stronger.',
            'Minsk kökenli; duygusal dürüstlük ve gür “come on” ile tanınır. Çift hata krizinden sonra servisi yeniden kurup daha güçlü döndü.',
            'Корни в Минске; эмоциональная честность. Пересобрала подачу после кризиса двойных и вернулась сильнее.',
            'Wurzeln in Minsk; emotionale Ehrlichkeit. Baute den Aufschlag nach Doppelfehler-Krise neu auf.'
        ),
        achievements: L(
            'Multiple Grand Slam titles; long No. 1 reigns; WTA Finals contender; hard-court dominance stretches.',
            'Birden fazla Grand Slam; uzun 1 numara dönemleri; WTA Finals adayı; sert kort baskın dönemleri.',
            'Несколько Grand Slam; долгие периоды №1; претендент на Итоговый; доминирование на харде.',
            'Mehrere Grand Slams; lange Nr.-1-Phasen; WTA-Finals-Anwärterin; Hartplatz-Dominanz.'
        ),
        advice: L(
            'When power deserts you, shorten the swing and aim big targets — height over the net beats flat panic.',
            'Güç yetmezse salınımı kısalt ve büyük hedefe nişan al — file üstü yükseklik, düz panikten iyidir.',
            'Когда нет мощности — короче замах и большие мишени; высота над сеткой лучше паники.',
            'Ohne Power: kürzer ausholen, große Ziele — Höhe über dem Netz statt Panik.'
        ),
        style: L(
            'Heavy forehand, aggressive return stance, improved serve percentage in big moments.',
            'Ağır forehand, agresif karşılama duruşu, büyük anlarda artmış servis yüzdesi.',
            'Тяжёлый форхенд, агрессивный приём, выше % подачи в большие моменты.',
            'Schwere Vorhand, aggressiver Return, bessere Aufschlagquote in Big Moments.'
        ),
        links: [
            { label: L('Talks', 'Konuşmalar', 'Интервью', 'Talks'), url: 'https://www.youtube.com/results?search_query=Aryna+Sabalenka+interview' },
        ],
    }),
    A({
        id: 'gauff', name: 'Coco Gauff', years: '2004–', country: '🇺🇸', tour: 'WTA',
        peakRank: 2, fallbackRank: 4,
        bio: L(
            'American all-courter; US Open champion, elite athleticism, and a growing all-court game with a sharp competitive voice off the court too.',
            'Amerikan all-court; US Open şampiyonu, elit atletizm, kort dışında da net rekabet sesi.',
            'Американка all-court; чемпионка US Open, атлетизм и растущая универсальность.',
            'US-Allcourterin; US-Open-Siegerin, Elite-Athletik, wachsendes Allcourt-Spiel.'
        ),
        life: L(
            'Florida raised; broke through as a teen at Wimbledon qualifying. Balances superstardom with outspoken social awareness and continuous technical tweaks (forehand/serve).',
            'Florida’da yetişti; Wimbledon elemelerinde genç yıldız oldu. Süperstarlığı sosyal farkındalık ve sürekli teknik ince ayarla dengeliyor.',
            'Выросла во Флориде; прорыв на Уимблдоне подростком. Баланс славы, социальной позиции и техники.',
            'In Florida aufgewachsen; Durchbruch als Teen in Wimbledon-Q. Balance aus Ruhm, Haltung und Technik-Feinschliff.'
        ),
        achievements: L(
            'US Open title; WTA 1000 trophies; weeks near No. 1; Olympic experience; doubles success early in career.',
            'US Open unvanı; WTA 1000 kupaları; 1 numaraya yakın haftalar; Olimpiyat; kariyer başında çiftler başarısı.',
            'Титул US Open; трофеи WTA 1000; недели у №1; Олимпиада; успех в паре.',
            'US-Open-Titel; WTA-1000-Pokale; Wochen nahe Nr. 1; Olympia; frühe Doppel-Erfolge.'
        ),
        advice: L(
            'Use speed to defend first, then step in — her best tennis starts when the legs set the hands free.',
            'Önce hızla savun, sonra içeri gir — en iyi tenisi bacaklar eli serbest bıraktığında başlar.',
            'Сначала защищайтесь ногами, потом входите — лучший теннис, когда ноги освобождают руки.',
            'Erst mit Beinen verteidigen, dann nach vorn — bestes Tennis, wenn Beine die Hände freimachen.'
        ),
        style: L(
            'Elite defense-to-offense; improving first-strike patterns; strong doubles instincts.',
            'Elit savunma→hücum; gelişen first-strike; güçlü çiftler içgüdüsü.',
            'Элитный переход защита→атака; растущий first-strike; инстинкт пары.',
            'Elite Defence-to-Offense; wachsende First-Strike-Muster; Doppel-Instinkt.'
        ),
        links: [
            { label: L('Interviews', 'Röportajlar', 'Интервью', 'Interviews'), url: 'https://www.youtube.com/results?search_query=Coco+Gauff+interview' },
        ],
    }),
    A({
        id: 'swiatek', name: 'Iga Swiatek', years: '2001–', country: '🇵🇱', tour: 'WTA',
        peakRank: 1, fallbackRank: 9,
        bio: L(
            'Polish clay-to-hard queen of the early 2020s; heavy topspin forehand, mental coaching pioneer among peers, multiple French Opens.',
            '2020’lerin başının Polonyalı toprak-sert kraliçesi; ağır topspin forehand, mental koçluk öncüsü, çoklu Fransa Açık.',
            'Польская королева грунта/харда начала 2020-х; тяжёлый топспин, ментальный коучинг, несколько RG.',
            'Polnische Sand-/Hartplatz-Königin der frühen 2020er; Topspin-Vorhand, Mental-Coaching, mehrere RG.'
        ),
        life: L(
            'Warsaw-raised; junior Slam pedigree before senior dominance. Open about working with a sports psychologist — normalized mental work at the top.',
            'Varşova’da yetişti; junior Slam’den senior baskınlığa. Spor psikoloğuyla çalışmayı açıkça konuşarak zirvede mental işi normalleştirdi.',
            'Выросла в Варшаве; путь от юниорских мейджоров. Открыто о работе с психологом — нормализовала ментальную работу.',
            'In Warschau aufgewachsen; von Junior-Slams zur Dominanz. Offen über Sportpsychologie — normalisierte Mental-Arbeit.'
        ),
        achievements: L(
            'Multiple French Opens; hard-court Slams; long No. 1 reign; WTA Finals; Olympic medals.',
            'Birden fazla Fransa Açık; sert kort Slam’leri; uzun 1 numara; WTA Finals; Olimpiyat madalyaları.',
            'Несколько Roland Garros; мейджоры на харде; долгое №1; Итоговый; олимпийские медали.',
            'Mehrere Roland Garros; Hartplatz-Slams; lange Nr. 1; WTA Finals; Olympia-Medaillen.'
        ),
        advice: L(
            'Shape with shape: use height and shape to push back, then accelerate into the open court — don’t flatten early.',
            'Şekil ile şekil: yükseklik ve spinle geri it, sonra açık korta hızlan — erken düzleştirme.',
            'Форма и высота оттесняют, затем ускорение в открытый корт — не уплощайте рано.',
            'Höhe/Form zurückdrücken, dann in die Lücke beschleunigen — nicht früh flach machen.'
        ),
        style: L(
            'Heavy FH topspin, elite intensity, improved serve years; peaks on clay.',
            'Ağır FH topspin, elit yoğunluk, yıllar içinde gelişen servis; toprakta zirve.',
            'Тяжёлый топспин ФХ, интенсивность, растущая подача; пик на грунте.',
            'Schweres FH-Topspin, Intensität, besserer Aufschlag; Peak auf Sand.'
        ),
        links: [
            { label: L('Interviews', 'Röportajlar', 'Интервью', 'Interviews'), url: 'https://www.youtube.com/results?search_query=Iga+Swiatek+interview' },
        ],
    }),
    // Legends — canlı sıralamada yok; peakRank ile sonda
    A({
        id: 'federer', name: 'Roger Federer', years: '1981–', country: '🇨🇭', status: 'legend', tour: null,
        peakRank: 1,
        bio: L(
            'Swiss elegance personified — one-handed backhand, serve-volley flair, and sportsmanship that transcended tennis.',
            'İsviçre zarafeti — tek elli backhand, serve-volley flair ve tenisi aşan sportmenlik.',
            'Швейцарская элегантность — одноручный бэкхенд, serve-and-volley и спортсменство выше спорта.',
            'Schweizer Eleganz — einhändige Rückhand, Serve-Volley und Sportsmanship über den Sport hinaus.'
        ),
        life: L(
            'Basel-raised; turned the 2000s into a golden era of shot-making artistry. Rivalries with Nadal and Djokovic became cultural events. Retired at Laver Cup with an emotional farewell.',
            'Basel’de yetişti; 2000’leri vuruş sanatı altın çağına çevirdi. Nadal ve Djokovic rekabetleri kültürel olay oldu. Laver Cup’ta duygusal vedayla emekli oldu.',
            'Вырос в Базеле; 2000-е — эпоха артистизма. Соперничество с Надалем и Джоковичем стало культурным событием. Прощание на Laver Cup.',
            'In Basel aufgewachsen; 2000er als Ära der Schlagkunst. Rivalitäten als Kulturereignis. Abschied bei der Laver Cup.'
        ),
        achievements: L(
            '20 Grand Slams; 8 Wimbledon; 103 ATP titles; 310 weeks at No. 1; Olympic doubles gold 2008.',
            '20 Grand Slam; 8 Wimbledon; 103 ATP; 310 hafta 1 numara; 2008 Olimpiyat çiftler altını.',
            '20 Grand Slam; 8 Уимблдонов; 103 титула ATP; 310 недель №1; олимпийское золото в паре 2008.',
            '20 Grand Slams; 8× Wimbledon; 103 ATP-Titel; 310 Wochen Nr. 1; Olympia-Gold Doppel 2008.'
        ),
        advice: L(
            'Play with variety: change height, spin and pace so the opponent never sees the same ball twice.',
            'Çeşitlilikle oyna: yükseklik, spin ve tempoyu değiştir ki rakip aynı topu iki kez görmesin.',
            'Разнообразие: меняйте высоту, спин и темп — соперник не должен видеть один и тот же мяч.',
            'Vielfalt: Höhe, Spin, Tempo wechseln — Gegner soll denselben Ball nicht zweimal sehen.'
        ),
        style: L(
            'All-court classic; SABR experiments late career; unmatched anticipation.',
            'Klasik all-court; kariyer sonunda SABR denemeleri; eşsiz öngörü.',
            'Классический all-court; SABR в конце карьеры; уникальное чтение.',
            'Klassisches Allcourt; späte SABR-Experimente; einzigartige Antizipation.'
        ),
        links: [
            { label: L('Retirement speech (Laver Cup)', 'Emeklilik konuşması (Laver Cup)', 'Речь об уходе (Laver Cup)', 'Abschiedsrede (Laver Cup)'), url: 'https://www.youtube.com/watch?v=nCqHhuGgB_o' },
            { label: L('Legacy interview', 'Miras röportajı', 'Интервью о наследии', 'Vermächtnis-Interview'), url: 'https://www.youtube.com/results?search_query=Roger+Federer+interview' },
        ],
    }),
    A({
        id: 'nadal', name: 'Rafael Nadal', years: '1986–', country: '🇪🇸', status: 'legend', tour: null,
        peakRank: 1,
        bio: L(
            'King of Clay — extreme topspin, tireless defense, and “Vamos” intensity that rewrote physical tennis.',
            'Toprak Kralı — aşırı topspin, yorulmaz savunma ve fiziksel tenisi yeniden yazan “Vamos” yoğunluğu.',
            'Король грунта — экстремальный топспин, железная защита и интенсивность «Vamos».',
            'König des Sands — extremes Topspin, unermüdliche Defence und „Vamos“-Intensität.'
        ),
        life: L(
            'Manacor, Mallorca; uncle Toni shaped his lefty game and humility. Fought chronic injuries while collecting a record French Open haul and completing the career Slam.',
            'Manacor, Mallorca; amcası Toni solak oyununu ve alçakgönüllülüğünü şekillendirdi. Kronik sakatlıklara rağmen rekor Fransa Açık ve kariyer Slam’i tamamladı.',
            'Манакор, Мальорка; дядя Тони сформировал игру и скромность. Хронические травмы — и рекорд RG плюс карьерный Slam.',
            'Manacor, Mallorca; Onkel Toni prägte Linkshänder-Spiel und Demut. Chronische Verletzungen — Rekord-RG und Career Slam.'
        ),
        achievements: L(
            '22 Grand Slams; 14 French Opens; Olympic singles gold 2008; Davis Cup hero; weeks at No. 1.',
            '22 Grand Slam; 14 Fransa Açık; 2008 Olimpiyat tekler altını; Davis Cup kahramanı; 1 numara haftaları.',
            '22 Grand Slam; 14 Roland Garros; золото ОИ-2008; герой Кубка Дэвиса; недели №1.',
            '22 Grand Slams; 14× RG; Olympia-Gold 2008; Davis-Cup-Held; Nr.-1-Wochen.'
        ),
        advice: L(
            'Compete every ball: intensity is a skill. High margin over the net on clay; accelerate when they give you a short ball.',
            'Her topa rekabet et: yoğunluk bir beceridir. Toprakta file üstü yüksek marj; kısa top gelince hızlan.',
            'Боритесь за каждый мяч: интенсивность — навык. Высокий запас над сеткой на грунте.',
            'Jeden Ball kämpfen: Intensität ist Skill. Hoher Netzabstand auf Sand; bei kurzen Bällen beschleunigen.'
        ),
        style: L(
            'Lefty high-bouncing FH; best sliding defense; improved serve over career; grass adaptation masterpiece (Wimbledon).',
            'Solak yüksek sektiren FH; en iyi kayarak savunma; kariyer boyunca gelişen servis; çim adaptasyonu (Wimbledon).',
            'Левый высокий ФХ; лучшая защита со скольжением; растущая подача; адаптация к траве.',
            'Linke hohe FH; beste Rutsch-Defence; besserer Aufschlag; Rasen-Anpassung (Wimbledon).'
        ),
        links: [
            { label: L('Mentality talks', 'Zihniyet konuşmaları', 'О менталитете', 'Mentalitäts-Talks'), url: 'https://www.youtube.com/results?search_query=Rafael+Nadal+interview' },
        ],
    }),
    A({
        id: 'serena', name: 'Serena Williams', years: '1981–', country: '🇺🇸', status: 'legend', tour: null,
        peakRank: 1,
        bio: L(
            'Power redefined women’s tennis — serve, return, clutch gene, and a cultural impact far beyond sport.',
            'Güç kadın tenisni yeniden tanımladı — servis, karşılama, kritik gen ve sporun ötesinde kültürel etki.',
            'Мощь изменила женский теннис — подача, приём, характер и влияние далеко за спортом.',
            'Power definierte Damentennis neu — Aufschlag, Return, Clutch und Kultur-Impact.'
        ),
        life: L(
            'Compton to world No. 1 with sister Venus under father Richard’s plan. Multiple comebacks after motherhood and injury; fashion and business ventures alongside historic Slam chases.',
            'Compton’dan Venus ile baba Richard’ın planıyla dünya 1 numarasına. Annelik ve sakatlık sonrası dönüşler; moda/iş + tarihi Slam koşuları.',
            'Из Комптона с сестрой Винус по плану отца Ричарда. Возвращения после материнства; мода/бизнес и погоня за мейджорами.',
            'Von Compton mit Venus nach Richards Plan zur Nr. 1. Comebacks nach Mutterschaft; Mode/Business neben Slam-Jagd.'
        ),
        achievements: L(
            '23 Grand Slam singles; 14 doubles with Venus; 4 Olympic golds; multiple “Serena Slam” runs; long No. 1.',
            '23 Grand Slam tekler; Venus ile 14 çiftler; 4 Olimpiyat altını; “Serena Slam”ler; uzun 1 numara.',
            '23 одиночных Grand Slam; 14 парных с Винус; 4 олимпийских золота; «Serena Slam»; долгое №1.',
            '23 Grand-Slam-Einzel; 14 Doppel mit Venus; 4 Olympia-Gold; Serena Slams; lange Nr. 1.'
        ),
        advice: L(
            'Believe the big moment is yours: first-strike return, claim the T, finish with the forehand.',
            'Büyük anın senin olduğuna inan: first-strike karşılama, T’yi sahiplen, forehand ile bitir.',
            'Верьте большому моменту: агрессивный приём, контроль «Т», финиш форхендом.',
            'Big Moment beanspruchen: First-Strike-Return, T besetzen, Vorhand-Finish.'
        ),
        style: L(
            'Most feared serve-return combo; intimidation presence; improved net game over career.',
            'En korkulan servis-karşılama kombosu; yıldırma varlığı; kariyer boyunca gelişen file.',
            'Самая грозная связка подача-приём; аура давления; рост игры у сетки.',
            'Gefürchtetste Serve-Return-Kombi; Präsenz; besseres Netzspiel über die Karriere.'
        ),
        links: [
            { label: L('Career interviews', 'Kariyer röportajları', 'Интервью о карьере', 'Karriere-Interviews'), url: 'https://www.youtube.com/results?search_query=Serena+Williams+interview' },
        ],
    }),
    A({
        id: 'graf', name: 'Steffi Graf', years: '1969–', country: '🇩🇪', status: 'legend', tour: null,
        peakRank: 1,
        bio: L(
            'Golden Slam 1988 — the ultimate single-season peak. Lethal forehand, slice backhand, athletic elegance.',
            '1988 Golden Slam — tek sezonun zirvesi. Ölümcül forehand, slice backhand, atletik zarafet.',
            'Golden Slam 1988 — пик сезона. Убийственный форхенд, слайс-бэкхенд, атлетичная элегантность.',
            'Golden Slam 1988 — Saison-Gipfel. Tödliche Vorhand, Slice-Rückhand, athletische Eleganz.'
        ),
        life: L(
            'German prodigy who dominated the late 80s/90s. Private personality; later married Andre Agassi. Still the benchmark for single-year greatness.',
            '80’lerin sonu/90’larda baskın Alman harika çocuk. Özel kişilik; sonra Andre Agassi ile evlendi. Tek yıl büyüklüğünün ölçütü.',
            'Немецкий вундеркинд конца 80-х/90-х. Закрытый характер; позже замужем за Агасси. Эталон сезона.',
            'Deutsches Wunderkind der späten 80er/90er. Privat; später mit Agassi verheiratet. Maßstab für Saison-Größe.'
        ),
        achievements: L(
            '22 Grand Slam singles; 1988 Golden Slam; 377 weeks at No. 1; Olympic gold 1988.',
            '22 Grand Slam tekler; 1988 Golden Slam; 377 hafta 1 numara; 1988 Olimpiyat altını.',
            '22 Grand Slam; Golden Slam 1988; 377 недель №1; золото ОИ-1988.',
            '22 Grand-Slam-Einzel; Golden Slam 1988; 377 Wochen Nr. 1; Olympia-Gold 1988.'
        ),
        advice: L(
            'Run around the backhand to unleash the forehand when you can — her signature pattern.',
            'Mümkün olduğunda backhand’in etrafından dolanıp forehand’i sal — imza kalıbı.',
            'Оббегайте бэкхенд, чтобы открыть форхенд — её фирменный рисунок.',
            'Um die Rückhand herumlaufen und Vorhand freisetzen — ihr Markenzeichen.'
        ),
        style: L(
            'Inside-out FH domination; slice BH to change rhythm; supreme athleticism.',
            'Inside-out FH baskını; ritim için slice BH; üstün atletizm.',
            'Доминирование inside-out ФХ; слайс БХ для ритма; атлетизм.',
            'Inside-out-VH-Dominanz; Slice-RH für Rhythmus; Athletik.'
        ),
        links: [
            { label: L('Archive interviews', 'Arşiv röportajlar', 'Архивные интервью', 'Archiv-Interviews'), url: 'https://www.youtube.com/results?search_query=Steffi+Graf+interview' },
        ],
    }),
];

export const PADEL_ATHLETES = [
    A({
        id: 'bela', name: 'Fernando Belasteguín', years: '1979–', country: '🇦🇷', status: 'legend', peakRank: 1,
        bio: L('Argentine “Bela” — record weeks at #1, precision at net, first golden-era face of pro padel.', 'Arjantinli “Bela” — rekor 1 numara haftası, file isabeti, pro padelin ilk altın çağ yüzü.', 'Аргентинец «Bela» — рекорд №1, точность у сетки.', 'Argentinier „Bela“ — Rekord-Nr. 1, Netzpräzision.'),
        life: L('Long partnership eras defined early World Padel Tour history; longevity rarely matched.', 'Erken WPT tarihini uzun partner dönemleri tanımladı; uzun ömür nadir.', 'Долгие пары определили ранний WPT.', 'Lange Partner-Äras prägten die frühe WPT.'),
        achievements: L('Record #1 weeks; dozens of WPT titles.', 'Rekor 1 numara haftası; onlarca WPT unvanı.', 'Рекорд недель №1; десятки титулов WPT.', 'Rekordwochen Nr. 1; Dutzende WPT-Titel.'),
        advice: L('Win the net first; bandeja to reset, vibora to finish.', 'Önce fileyi kazan; reset için bandeja, bitirmek için vibora.', 'Сначала сетка; бандеха — сброс, вибора — финиш.', 'Erst Netz; Bandeja zum Reset, Vibora zum Finish.'),
        style: L('Right-side builder turned finisher; glass IQ.', 'Sağ taraf kurucu→bitirici; cam IQ.', 'Правый конструктор/финишёр; IQ стекла.', 'Rechte Seite Aufbau/Finish; Glas-IQ.'),
        links: [{ label: L('Talks', 'Konuşmalar', 'Интервью', 'Talks'), url: 'https://www.youtube.com/results?search_query=Fernando+Belasteguin+interview' }],
    }),
    A({
        id: 'salazar', name: 'Alejandra Salazar', years: '1985–', country: '🇪🇸', status: 'legend', peakRank: 1,
        bio: L('Spanish pioneer of women’s padel; tactical left-side reference.', 'Kadın padelin İspanyol öncüsü; sol taraf taktik referansı.', 'Пионерка женского падела.', 'Pionierin des Damen-Padels.'),
        life: L('Multiple #1 seasons; defined modern women’s pair dynamics.', 'Birden fazla 1 numara sezonu; modern kadın çift dinamiğini tanımladı.', 'Несколько сезонов №1.', 'Mehrere Nr.-1-Saisons.'),
        achievements: L('Multiple world/WPT #1 seasons; major titles.', 'Çoklu dünya/WPT 1 numara; büyük unvanlar.', 'Несколько сезонов №1; крупные титулы.', 'Mehrere Nr.-1-Saisons; Major-Titel.'),
        advice: L('Left finishes; communicate every glass rebound.', 'Sol bitirir; her cam sekmesini konuşun.', 'Левый завершает; говорите о каждом отскоке.', 'Links schließt ab; jeden Glas-Absprung ansagen.'),
        style: L('Left-side attack; soft hands at net.', 'Sol taraf hücumu; filede yumuşak el.', 'Атака слева; мягкие руки у сетки.', 'Linke Attacke; weiche Hände am Netz.'),
        links: [{ label: L('Interviews', 'Röportajlar', 'Интервью', 'Interviews'), url: 'https://www.youtube.com/results?search_query=Alejandra+Salazar+padel' }],
    }),
];

export const BADMINTON_ATHLETES = [
    A({
        id: 'lindan', name: 'Lin Dan', years: '1983–', country: '🇨🇳', status: 'legend', peakRank: 1,
        bio: L('“Super Dan” — two Olympic golds, flair and clutch reputation.', '“Super Dan” — iki Olimpiyat altını, flair ve kritik an efsanesi.', '«Super Dan» — два олимпийских золота.', '„Super Dan“ — zwei Olympia-Gold.'),
        life: L('Chinese icon of the 2000s–2010s; rivalries with Lee Chong Wei defined the era.', '2000–2010 Çin ikonu; Lee Chong Wei rekabeti dönemi tanımladı.', 'Икона 2000–2010; соперничество с Ли Чонг Веем.', 'Ikone 2000–2010; Rivalität mit Lee Chong Wei.'),
        achievements: L('Olympic gold 2008 & 2012; multiple Worlds & All-England.', 'Olimpiyat 2008 & 2012; çoklu Dünya ve All-England.', 'Золото ОИ 2008 и 2012; ЧМ и All-England.', 'Olympia 2008 & 2012; WM & All-England.'),
        advice: L('Same prep for drop and clear — disguise late.', 'Drop ve clear aynı hazırlık — geç gizle.', 'Одинаковый замах для дропа и клира.', 'Gleicher Aushol für Drop und Clear.'),
        style: L('Deceptive attack; net craft; lefty angles.', 'Aldatıcı hücum; file işçiliği; solak açılar.', 'Обманная атака; игра у сетки.', 'Täuschende Attacke; Netzspiel.'),
        links: [{ label: L('Interviews', 'Röportajlar', 'Интервью', 'Interviews'), url: 'https://www.youtube.com/results?search_query=Lin+Dan+interview' }],
    }),
    A({
        id: 'marin', name: 'Carolina Marín', years: '1993–', country: '🇪🇸', status: 'legend', peakRank: 1,
        bio: L('Spanish lefty Olympic champion; trailblazer for European women’s singles.', 'İspanyol solak Olimpiyat şampiyonu; Avrupa kadın teklerinde öncü.', 'Испанская левша, олимпийская чемпионка.', 'Spanische Linkshänderin, Olympiasiegerin.'),
        life: L('Multiple injury comebacks; intensity and roar became her trademark.', 'Birden fazla sakatlık dönüşü; yoğunluk ve haykırış imzası oldu.', 'Возвращения после травм; интенсивность — визитка.', 'Comebacks nach Verletzungen; Intensität als Markenzeichen.'),
        achievements: L('Olympic gold 2016; multiple World & European titles.', '2016 Olimpiyat altını; çoklu Dünya ve Avrupa.', 'Золото ОИ-2016; титулы ЧМ и ЧЕ.', 'Olympia-Gold 2016; WM- und EM-Titel.'),
        advice: L('Push four corners; attack only when they are stretched.', 'Dört köşeye it; sadece gerildiğinde saldır.', 'Гоняйте по углам; атакуйте на растяжке.', 'Vier Ecken; nur bei Dehnung angreifen.'),
        style: L('Lefty smash; steep attack; fierce defense.', 'Solak smaç; dik hücum; sert savunma.', 'Левый смэш; крутая атака; жёсткая защита.', 'Linker Smash; steile Attacke; harte Defence.'),
        links: [{ label: L('Talks', 'Konuşmalar', 'Интервью', 'Talks'), url: 'https://www.youtube.com/results?search_query=Carolina+Marin+interview' }],
    }),
];

export const TABLE_TENNIS_ATHLETES = [
    A({
        id: 'malong', name: 'Ma Long', years: '1988–', country: '🇨🇳', status: 'legend', peakRank: 1,
        bio: L('“Dictator” of the table — complete technique and legendary consistency.', 'Masadaki “Diktatör” — tam teknik ve efsane istikrar.', '«Диктатор» стола — техника и стабильность.', '„Diktator“ am Tisch — Technik und Konstanz.'),
        life: L('Chinese national team cornerstone across Olympic cycles; leadership by example.', 'Olimpiyat döngülerinde Çin millisinin omurgası; örnekle liderlik.', 'Опора сборной Китая; лидерство примером.', 'Rückgrat der chinesischen Auswahl; Führung durch Vorbild.'),
        achievements: L('Multiple Olympic golds; Worlds; long #1 reign.', 'Çoklu Olimpiyat altını; Dünya; uzun 1 numara.', 'Несколько олимпийских золота; ЧМ; долго №1.', 'Mehrere Olympia-Gold; WM; lange Nr. 1.'),
        advice: L('Attack half-long serves before the second bounce.', 'Yarı uzun servisi ikinci sektirmeden saldır.', 'Атакуйте полудлинные до второго отскока.', 'Halblange vor dem 2. Absprung angreifen.'),
        style: L('Forehand loop dominance; elite footwork; calm presence.', 'Forehand loop baskını; elit ayak; sakin varlık.', 'Доминирование лупа ФХ; элитная работа ног.', 'VH-Loop-Dominanz; Elite-Fußarbeit.'),
        links: [{ label: L('Interviews', 'Röportajlar', 'Интервью', 'Interviews'), url: 'https://www.youtube.com/results?search_query=Ma+Long+interview' }],
    }),
    A({
        id: 'dingning', name: 'Ding Ning', years: '1990–', country: '🇨🇳', status: 'legend', peakRank: 1,
        bio: L('Chinese lefty great; Olympic and World champion with a fierce FH loop.', 'Çinli solak efsane; Olimpiyat ve Dünya, güçlü FH loop.', 'Китайская левша; ОИ и ЧМ, мощный луп.', 'Chinesische Linkshänderin; Olympia & WM, starker Loop.'),
        life: L('Clutch performer in team and singles events for China.', 'Çin için takım ve teklerde kritik an oyuncusu.', 'Ключевой игрок Китая в команде и одиночке.', 'Schlüsselspielerin Chinas in Team und Einzel.'),
        achievements: L('Olympic golds; multiple World titles.', 'Olimpiyat altınları; çoklu Dünya.', 'Олимпийские золота; титулы ЧМ.', 'Olympia-Gold; mehrere WM.'),
        advice: L('Hide serve with shoulder; vary toss.', 'Servisi omuzla gizle; toss’u çeşitlendir.', 'Маскируйте подачу плечом; меняйте подброс.', 'Aufschlag mit Schulter tarne; Wurf variieren.'),
        style: L('Lefty angles; aggressive third ball.', 'Solak açılar; agresif üçüncü top.', 'Левые углы; агрессивный третий мяч.', 'Linke Winkel; aggressiver dritter Ball.'),
        links: [{ label: L('Talks', 'Konuşmalar', 'Интервью', 'Talks'), url: 'https://www.youtube.com/results?search_query=Ding+Ning+table+tennis' }],
    }),
];

export const PICKLEBALL_ATHLETES = [
    A({
        id: 'johns', name: 'Ben Johns', years: '1999–', country: '🇺🇸', status: 'active', peakRank: 1, fallbackRank: 1,
        bio: L('Face of modern pro pickleball; soft hands and transition speed.', 'Modern pro pickleball yüzü; soft el ve geçiş hızı.', 'Лицо про-пиклбола; мягкие руки и скорость перехода.', 'Gesicht des Pro-Pickleballs; weiche Hände, Transition.'),
        life: L('Dominant across men’s and mixed; redefined third-shot and dink IQ.', 'Erkek ve mixed’te baskın; üçüncü vuruş ve dink IQ’sunu yeniden tanımladı.', 'Доминирует в мужском и миксте; IQ третьего удара и динка.', 'Dominant in Herren/Mixed; Third-Shot- und Dink-IQ.'),
        achievements: L('Multiple majors; long #1 stretches in doubles formats.', 'Çoklu major; çift formatlarında uzun 1 numara.', 'Много мейджоров; долго №1 в парах.', 'Viele Majors; lange Nr. 1 im Doppel.'),
        advice: L('Third-shot drop resets you to the kitchen line.', 'Üçüncü vuruş drop seni kitchen’a getirir.', 'Третий дроп возвращает к kitchen.', 'Third-Shot-Drop bringt euch an die Kitchen.'),
        style: L('Soft game + selective speed-ups; elite anticipation.', 'Soft oyun + seçici hızlanma; elit öngörü.', 'Мягкая игра + точечные ускорения.', 'Softgame + selektive Tempo-Ups.'),
        links: [{ label: L('Interviews', 'Röportajlar', 'Интервью', 'Interviews'), url: 'https://www.youtube.com/results?search_query=Ben+Johns+pickleball' }],
    }),
    A({
        id: 'waters', name: 'Anna Leigh Waters', years: '2007–', country: '🇺🇸', status: 'active', peakRank: 1, fallbackRank: 1,
        bio: L('Prodigy of women’s/mixed; power + kitchen control very young.', 'Kadın/mixed harikası; genç yaşta güç + kitchen kontrolü.', 'Вундеркинд женского/микста.', 'Wunderkind Damen/Mixed.'),
        life: L('Youngest to reach #1 conversations; stack of pro golds.', '1 numara tartışmalarına en genç girenlerden; pro altın yığını.', 'Одна из самых молодых у №1; куча золота.', 'Eine der jüngsten Nr. 1; viele Tour-Gold.'),
        achievements: L('Major titles; #1 stretches; face of next-gen women’s game.', 'Major unvanlar; 1 numara dönemleri; yeni nesil kadın oyununun yüzü.', 'Мейджоры; отрезки №1; лицо нового поколения.', 'Major-Titel; Nr.-1-Phasen; Gesicht der Next-Gen.'),
        advice: L('Keep dinks low so they cannot speed up cleanly.', 'Dink’leri alçak tut ki temiz hızlanamasınlar.', 'Держите динки низко.', 'Dinks flach halten.'),
        style: L('Power from both sides; fearless speed-ups.', 'Her iki taraftan güç; korkusuz hızlanma.', 'Мощь с обеих сторон; смелые ускорения.', 'Power beidseitig; mutige Tempo-Ups.'),
        links: [{ label: L('Talks', 'Konuşmalar', 'Интервью', 'Talks'), url: 'https://www.youtube.com/results?search_query=Anna+Leigh+Waters+interview' }],
    }),
];

export const VOLLEYBALL_ATHLETES = [
    A({
        id: 'kiraly', name: 'Karch Kiraly', years: '1960–', country: '🇺🇸', status: 'legend', peakRank: 1,
        bio: L('Only player with Olympic gold indoor and beach; later transformative USA coach.', 'Salon ve plajda Olimpiyat altını olan tek oyuncu; sonra ABD koçu.', 'Единственный с золотом ОИ в зале и на пляже; позже тренер США.', 'Einziger mit Olympia-Gold Halle & Beach; später US-Trainer.'),
        life: L('Defined USA volleyball excellence across decades as player and coach.', 'Oyuncu ve koç olarak onyıllarca ABD voleybol mükemmelliğini tanımladı.', 'Десятилетия доминирования США как игрок и тренер.', 'Jahrzehnte US-Exzellenz als Spieler und Trainer.'),
        achievements: L('Olympic golds indoor & beach; Worlds; Hall of Fame.', 'Salon ve plaj Olimpiyat altınları; Dünya; Hall of Fame.', 'Золото ОИ зал и пляж; ЧМ; Зал славы.', 'Olympia Halle & Beach; WM; Hall of Fame.'),
        advice: L('Pass first: every great offense starts with a clean platform.', 'Önce pas: her büyük hücum temiz platformla başlar.', 'Сначала приём: атака начинается с чистой платформы.', 'Zuerst Annahme: jeder Angriff startet mit sauberer Plattform.'),
        style: L('All-around excellence; leadership; beach IQ later career.', 'Çok yönlü mükemmellik; liderlik; kariyer sonunda plaj IQ.', 'Универсальность; лидерство; IQ пляжа.', 'Allround; Führung; später Beach-IQ.'),
        links: [{ label: L('Coaching / interviews', 'Koçluk / röportaj', 'Тренерство / интервью', 'Coaching / Interviews'), url: 'https://www.youtube.com/results?search_query=Karch+Kiraly+interview' }],
    }),
    A({
        id: 'giba', name: 'Giba', years: '1976–', country: '🇧🇷', status: 'legend', peakRank: 1,
        bio: L('Brazilian outside icon of the 2000s — charisma and clutch Olympics.', '2000’ler Brezilya smaçör ikonu — karizma ve kritik Olimpiyatlar.', 'Икона Бразилии 2000-х — харизма и Олимпиады.', 'Brasilien-Ikone der 2000er — Charisma und Olympia.'),
        life: L('Face of Brazil’s golden generation; leadership by energy.', 'Brezilya altın neslinin yüzü; enerjiyle liderlik.', 'Лицо золотого поколения Бразилии.', 'Gesicht der goldenen Generation Brasiliens.'),
        achievements: L('Olympic gold 2004; World titles; global ambassador.', '2004 Olimpiyat altını; Dünya unvanları; küresel elçi.', 'Золото ОИ-2004; титулы ЧМ.', 'Olympia-Gold 2004; WM-Titel.'),
        advice: L('Read the block seam; tip when the double is late.', 'Blok boşluğunu oku; çift geç kalırsa tip.', 'Читайте шов блока; скидка при позднем блоке.', 'Block-Naht lesen; Tip bei spätendem Doppelblock.'),
        style: L('Power wing; celebration energy; high ball IQ.', 'Güç kanat; kutlama enerjisi; yüksek top IQ.', 'Мощный крайний; энергия; IQ мяча.', 'Power-Außen; Energie; Ball-IQ.'),
        links: [{ label: L('Talks', 'Konuşmalar', 'Интервью', 'Talks'), url: 'https://www.youtube.com/results?search_query=Giba+volleyball+interview' }],
    }),
    A({
        id: 'kerri', name: 'Kerri Walsh Jennings', years: '1978–', country: '🇺🇸', status: 'legend', peakRank: 1,
        bio: L('Beach GOAT conversation; three straight Olympic golds with Misty May-Treanor.', 'Plaj GOAT tartışması; Misty ile üç ardışık Olimpiyat altını.', 'Легенда пляжа; три золота подряд с Misty.', 'Beach-Legende; drei Olympia-Gold in Folge mit Misty.'),
        life: L('Partnership chemistry became the blueprint for beach dominance.', 'Partner kimyası plaj baskınının planı oldu.', 'Химия пары — чертёж доминирования на пляже.', 'Partner-Chemie als Blueprint der Beach-Dominanz.'),
        achievements: L('3× Olympic gold (2004–2012) + later bronze; long #1 era.', '3× Olimpiyat altın (2004–2012) + bronz; uzun 1 numara.', '3 золота ОИ (2004–2012) + бронза; долгое №1.', '3× Olympia-Gold (2004–2012) + Bronze; lange Nr. 1.'),
        advice: L('Talk every ball; trust the middle blocker read on digs.', 'Her topu konuş; dig’de orta blok okumasına güven.', 'Говорите о каждом мяче; доверяйте чтению блока.', 'Jeden Ball ansagen; Block-Lesen beim Dig vertrauen.'),
        style: L('Block + defense IQ; sideout efficiency; leadership.', 'Blok + savunma IQ; sideout verimi; liderlik.', 'IQ блока и защиты; эффективность sideout.', 'Block-/Abwehr-IQ; Sideout-Effizienz.'),
        links: [{ label: L('Interviews', 'Röportajlar', 'Интервью', 'Interviews'), url: 'https://www.youtube.com/results?search_query=Kerri+Walsh+Jennings+interview' }],
    }),
];

export const ATHLETES_BY_SUB = {
    tennis: TENNIS_ATHLETES,
    padel: PADEL_ATHLETES,
    badminton: BADMINTON_ATHLETES,
    table_tennis: TABLE_TENNIS_ATHLETES,
    pickleball: PICKLEBALL_ATHLETES,
    volleyball: VOLLEYBALL_ATHLETES,
};
