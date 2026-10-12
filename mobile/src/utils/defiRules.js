// Defi ligi kuralları — backend/src/utils/defiLadder.js algoritmasıyla birebir; ayarlar
// (teklif aralığı, süreler, ret hakkı) organizatörün seçtiği değerlerle metne girer.
// Tesis adı spora göre: tenis/padel kort, futbol saha, voleybol/basketbol salon
// (bkz. .cursor/rules/spor-ozel-etiket.mdc).
import { DEFI_DEFAULTS } from './tournamentFormats';

const VENUE = {
    tennis: { en: 'court', tr: 'kort', ru: 'корт', de: 'Platz' },
    padel: { en: 'court', tr: 'kort', ru: 'корт', de: 'Court' },
    football: { en: 'pitch', tr: 'saha', ru: 'поле', de: 'Spielfeld' },
    volleyball: { en: 'hall', tr: 'salon', ru: 'зал', de: 'Halle' },
    basketball: { en: 'hall', tr: 'salon', ru: 'зал', de: 'Halle' },
};

export function defiVenueWord(sub, lang) {
    return (VENUE[sub] || VENUE.tennis)[lang] || (VENUE[sub] || VENUE.tennis).en;
}

function scoringRule(sub, L) {
    if (sub === 'football') return {
        en: 'Result = goals. A draw is allowed and changes nothing in the ladder.',
        tr: 'Sonuç gol sayısıyla belirlenir. Beraberlik olabilir; beraberlikte sıralama değişmez.',
        ru: 'Результат — по голам. Ничья возможна и не меняет порядок в лестнице.',
        de: 'Ergebnis = Tore. Ein Unentschieden ist möglich und ändert die Rangliste nicht.',
    }[L];
    if (sub === 'basketball') return {
        en: 'Result = points. There must be a winner (play overtime if tied).',
        tr: 'Sonuç sayıyla belirlenir. Kazanan çıkmalı (eşitlikte uzatma oynanır).',
        ru: 'Результат — по очкам. Победитель обязателен (при равенстве — овертайм).',
        de: 'Ergebnis = Punkte. Es muss einen Sieger geben (bei Gleichstand Verlängerung).',
    }[L];
    return {
        en: 'Result = sets won. There must be a winner.',
        tr: 'Sonuç kazanılan set sayısıyla belirlenir. Kazanan çıkmalı.',
        ru: 'Результат — по выигранным сетам. Победитель обязателен.',
        de: 'Ergebnis = gewonnene Sätze. Es muss einen Sieger geben.',
    }[L];
}

/** Kural listesi (dizi). settings: formatConfig.defi (eksikse varsayılanlar). */
export function defiRules(lang, sub, settings) {
    const L = ['en', 'tr', 'ru', 'de'].includes(lang) ? lang : 'en';
    const s = { ...DEFI_DEFAULTS, ...(settings || {}) };
    const v = defiVenueWord(sub, L);
    const unit = {
        TEAM: { en: 'team', tr: 'takım', ru: 'команда', de: 'Team' },
        PAIR: { en: 'pair', tr: 'çift', ru: 'пара', de: 'Paar' },
        SINGLES: { en: 'player', tr: 'oyuncu', ru: 'игрок', de: 'Spieler' },
    }[s.entry || 'SINGLES'][L];
    const trDat = { TEAM: 'takıma', PAIR: 'çifte', SINGLES: 'oyuncuya' }[s.entry || 'SINGLES'];
    const trGen = { TEAM: 'takımın', PAIR: 'çiftin', SINGLES: 'oyuncunun' }[s.entry || 'SINGLES'];
    const reach = s.maxUp
        ? { en: `up to ${s.maxUp} places above`, tr: `en fazla ${s.maxUp} basamak yukarıdakine`, ru: `не более чем на ${s.maxUp} позиций выше`, de: `höchstens ${s.maxUp} Plätze nach oben` }[L]
        : { en: 'ranks 1–10 up to 4 places above, 11–20 up to 5, +1 for every further 10 ranks (max 14)', tr: '1–10. sıradakiler en fazla 4, 11–20. sıradakiler 5 basamak yukarıdakine; sonraki her 10 sırada +1 (en fazla 14)', ru: 'места 1–10 — до 4 позиций выше, 11–20 — до 5, далее +1 за каждые 10 мест (максимум 14)', de: 'Plätze 1–10 bis zu 4 Plätze nach oben, 11–20 bis zu 5, je weitere 10 Plätze +1 (max. 14)' }[L];
    const order = s.initialOrder === 'RANDOM'
        ? { en: 'by random draw', tr: 'kura ile', ru: 'жеребьёвкой', de: 'per Los' }[L]
        : { en: 'by rating (ELO)', tr: 'puana (ELO) göre', ru: 'по рейтингу (ELO)', de: 'nach Wertung (ELO)' }[L];

    const R = {
        en: [
            `The league is a single ranking list (ladder). The starting order is set ${order}; anyone who joins later starts at the bottom.`,
            `Each ${unit} may challenge a ${unit} above them: ${reach}. Nobody may challenge downwards.`,
            'If the challenger wins, they take the defender\'s place; the defender and everyone in between move down one place. If the challenger loses, the ladder does not change.',
            `The challenged side must answer within ${s.responseHours} hours. No answer = walkover (W.O.) loss and the challenger takes the place.`,
            s.declinesPerSeason > 0
                ? `Each ${unit} has ${s.declinesPerSeason} free decline(s) per season. Once used up, a decline counts as a W.O. loss.`
                : 'There are no free declines: declining a challenge counts as a W.O. loss.',
            `An accepted match must be played within ${s.playDays} days of the challenge. Date, time and ${v} are agreed between the two sides. If it is not played in time, the challenge lapses and the ladder does not change.`,
            `After a match both sides are protected for ${s.protectionDays} day(s) (they can neither challenge nor be challenged). The same two sides cannot challenge each other again for ${s.rematchDays} days.`,
            `Each ${unit} can have only one active challenge at a time (sent or received).`,
            s.inactivityDays > 0
                ? `A ${unit} that plays no ladder match for ${s.inactivityDays} days drops one place; this repeats each time the period passes again.`
                : 'There is no inactivity penalty in this league.',
            `${scoringRule(sub, L)} One side enters the score, the other confirms it; unconfirmed scores are confirmed automatically after 12 hours.`,
            ...(sub === 'tennis' || sub === 'padel' ? ['Played matches update your rating (singles or doubles). W.O. results do not change ratings.'] : []),
            'The season ends on the tournament end date (or when the organizer closes it). The final ladder order is the final standing — rank 1 is the champion.',
        ],
        tr: [
            `Lig tek bir sıralama listesidir (merdiven). Başlangıç sırası ${order} belirlenir; sonradan katılan en alttan başlar.`,
            `Her ${unit} kendinden yukarıdaki bir ${trDat} defi (meydan okuma) teklif edebilir: ${reach}. Aşağıya teklif edilmez.`,
            'Teklif eden kazanırsa rakibin sırasını alır; rakip ve aradakiler birer basamak aşağı iner. Teklif eden kaybederse sıralama değişmez.',
            `Teklif alan taraf ${s.responseHours} saat içinde cevap vermelidir. Cevap verilmezse hükmen (W.O.) yenilmiş sayılır ve teklif eden yerini alır.`,
            s.declinesPerSeason > 0
                ? `Her ${trGen} sezonda ${s.declinesPerSeason} mazeretsiz ret hakkı vardır. Hak bitince ret = hükmen yenilgi.`
                : 'Ret hakkı yoktur: teklifi reddetmek hükmen (W.O.) yenilgi sayılır.',
            `Kabul edilen maç, teklif tarihinden itibaren ${s.playDays} gün içinde oynanmalıdır. Gün, saat ve ${v} iki taraf arasında kararlaştırılır. Süresinde oynanmazsa teklif düşer, sıralama değişmez.`,
            `Maçtan sonra iki taraf ${s.protectionDays} gün korunmadadır (teklif edemez, teklif alamaz). Aynı iki taraf ${s.rematchDays} gün boyunca birbirine tekrar teklif edemez.`,
            `Her ${trGen} aynı anda yalnızca bir aktif defisi olabilir (gönderilen ya da alınan).`,
            s.inactivityDays > 0
                ? `${s.inactivityDays} gün boyunca defi maçı yapmayan bir basamak geriler; süre her dolduğunda tekrar uygulanır.`
                : 'Bu ligde hareketsizlik cezası yoktur.',
            `${scoringRule(sub, L)} Bir taraf skoru girer, diğer taraf onaylar; onaylanmayan skor 12 saat sonra otomatik onaylanır.`,
            ...(sub === 'tennis' || sub === 'padel' ? ['Oynanan maçlar puanını (tekler ya da çiftler) günceller. Hükmen sonuçlar puanı değiştirmez.'] : []),
            'Sezon, turnuvanın bitiş tarihinde (ya da organizatör kapatınca) sona erer. Merdivendeki son sıra nihai sıralamadır — 1. sıra şampiyondur.',
        ],
        ru: [
            `Лига — это единый рейтинговый список (лестница). Стартовый порядок определяется ${order}; кто присоединяется позже, начинает снизу.`,
            `Можно бросить вызов только тем, кто выше: ${reach}. Вызов вниз невозможен.`,
            'Если бросивший вызов побеждает, он занимает место соперника; соперник и все между ними опускаются на одну позицию. Если проигрывает — порядок не меняется.',
            `Получивший вызов должен ответить в течение ${s.responseHours} ч. Нет ответа = техническое поражение (W.O.), и бросивший вызов занимает его место.`,
            s.declinesPerSeason > 0
                ? `За сезон доступно ${s.declinesPerSeason} отказ(а) без последствий. После этого отказ = техническое поражение.`
                : 'Отказов без последствий нет: отказ от вызова = техническое поражение.',
            `Принятый матч должен быть сыгран в течение ${s.playDays} дней с момента вызова. День, время и ${v} согласуют стороны. Если матч не сыгран вовремя, вызов аннулируется, порядок не меняется.`,
            `После матча обе стороны защищены ${s.protectionDays} дн. (не могут бросать и принимать вызовы). Те же соперники не могут снова вызвать друг друга ${s.rematchDays} дн.`,
            'Одновременно может быть только один активный вызов (отправленный или полученный).',
            s.inactivityDays > 0
                ? `Кто не играет матчей лестницы ${s.inactivityDays} дней, опускается на одну позицию; повторяется каждый раз по истечении срока.`
                : 'Штрафа за неактивность в этой лиге нет.',
            `${scoringRule(sub, L)} Одна сторона вводит счёт, другая подтверждает; неподтверждённый счёт подтверждается автоматически через 12 часов.`,
            ...(sub === 'tennis' || sub === 'padel' ? ['Сыгранные матчи обновляют рейтинг (одиночный или парный). Технические результаты рейтинг не меняют.'] : []),
            'Сезон заканчивается в дату окончания турнира (или когда организатор его закрывает). Итоговый порядок лестницы — финальная таблица, 1-е место — чемпион.',
        ],
        de: [
            `Die Liga ist eine einzige Rangliste (Leiter). Die Startreihenfolge wird ${order} festgelegt; wer später beitritt, startet ganz unten.`,
            `Man darf nur Gegner weiter oben fordern: ${reach}. Nach unten fordern ist nicht erlaubt.`,
            'Gewinnt der Herausforderer, übernimmt er den Platz des Geforderten; dieser und alle dazwischen rutschen einen Platz nach unten. Verliert er, bleibt die Rangliste unverändert.',
            `Die geforderte Seite muss innerhalb von ${s.responseHours} Stunden antworten. Keine Antwort = Niederlage am grünen Tisch (W.O.), der Herausforderer übernimmt den Platz.`,
            s.declinesPerSeason > 0
                ? `Pro Saison gibt es ${s.declinesPerSeason} folgenlose Ablehnung(en). Danach zählt eine Ablehnung als W.O.-Niederlage.`
                : 'Es gibt keine folgenlosen Ablehnungen: Ablehnen zählt als W.O.-Niederlage.',
            `Ein angenommenes Spiel muss innerhalb von ${s.playDays} Tagen ab der Forderung gespielt werden. Tag, Uhrzeit und ${v} vereinbaren beide Seiten. Wird es nicht rechtzeitig gespielt, verfällt die Forderung ohne Änderung.`,
            `Nach einem Spiel sind beide Seiten ${s.protectionDays} Tag(e) geschützt (weder fordern noch gefordert werden). Dieselben Gegner dürfen sich ${s.rematchDays} Tage lang nicht erneut fordern.`,
            'Jeder darf gleichzeitig nur eine aktive Forderung haben (gesendet oder erhalten).',
            s.inactivityDays > 0
                ? `Wer ${s.inactivityDays} Tage kein Ranglistenspiel bestreitet, fällt einen Platz zurück; das wiederholt sich nach jedem weiteren Zeitraum.`
                : 'In dieser Liga gibt es keine Inaktivitätsstrafe.',
            `${scoringRule(sub, L)} Eine Seite trägt das Ergebnis ein, die andere bestätigt; unbestätigte Ergebnisse werden nach 12 Stunden automatisch bestätigt.`,
            ...(sub === 'tennis' || sub === 'padel' ? ['Gespielte Matches aktualisieren deine Wertung (Einzel oder Doppel). W.O.-Ergebnisse ändern die Wertung nicht.'] : []),
            'Die Saison endet am Turnier-Enddatum (oder wenn der Veranstalter sie schließt). Die letzte Reihenfolge ist der Endstand — Platz 1 ist Meister.',
        ],
    };
    return R[L];
}
