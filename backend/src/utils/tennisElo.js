// Tennis/Padel-specific ELO point-transfer table (skillRating units, 0–5 scale).
// Source: user-provided spreadsheet. "Dominant" = 6-0/6-1/6-2-style sets (winner took
// the clear majority of games); "Competitive" = 6-3/6-4/7-5/7-6-style sets (close match).
// Each bucket gives 4 values per score type: what the lower-rated player gains when
// they win / lose, and what the higher-rated player gains when they win / lose.
// Winner-gain equals loser-loss (zero-sum) in every row.
const TABLE = [
    { max: 0.03, dominant: { lowWin: 0.03,  lowLose: 0.02,   highWin: 0.02,   highLose: 0.03  }, competitive: { lowWin: 0.0175, lowLose: 0.01,   highWin: 0.01,   highLose: 0.0175 } },
    { max: 0.05, dominant: { lowWin: 0.04,  lowLose: 0.0175, highWin: 0.0175, highLose: 0.04  }, competitive: { lowWin: 0.02,   lowLose: 0.0125, highWin: 0.0125, highLose: 0.02   } },
    { max: 0.10, dominant: { lowWin: 0.05,  lowLose: 0.03,   highWin: 0.03,   highLose: 0.05  }, competitive: { lowWin: 0.035,  lowLose: 0.015,  highWin: 0.015,  highLose: 0.035  } },
    { max: 0.25, dominant: { lowWin: 0.10,  lowLose: 0.05,   highWin: 0.05,   highLose: 0.10  }, competitive: { lowWin: 0.06,   lowLose: 0.03,   highWin: 0.03,   highLose: 0.06   } },
    { max: 0.50, dominant: { lowWin: 0.25,  lowLose: 0.04,   highWin: 0.04,   highLose: 0.25  }, competitive: { lowWin: 0.15,   lowLose: 0.025,  highWin: 0.025,  highLose: 0.15   } },
    { max: 1.00, dominant: { lowWin: 0.50,  lowLose: 0.03,   highWin: 0.03,   highLose: 0.50  }, competitive: { lowWin: 0.40,   lowLose: 0.02,   highWin: 0.02,   highLose: 0.40   } },
    { max: 1.50, dominant: { lowWin: 1.00,  lowLose: 0.02,   highWin: 0.02,   highLose: 1.00  }, competitive: { lowWin: 0.90,   lowLose: 0.015,  highWin: 0.015,  highLose: 0.90   } },
    { max: 2.00, dominant: { lowWin: 1.50,  lowLose: 0.01,   highWin: 0.01,   highLose: 1.50  }, competitive: { lowWin: 1.30,   lowLose: 0.01,   highWin: 0.01,   highLose: 1.30   } },
    { max: Infinity, dominant: { lowWin: 2.00, lowLose: 0.005, highWin: 0.005, highLose: 2.00 }, competitive: { lowWin: 1.80,   lowLose: 0.008,  highWin: 0.008,  highLose: 1.80   } },
];

// Kullanıcı isteği: badminton ve masa tenisi, padel'in maç/kadro/puanlama mantığının birebir
// aynısını kullanıyor — bu listeye eklenmesi ELO tablosu, turnuva puanlama ve kort rezervasyon
// iptal senkronizasyonu gibi bu listeyi okuyan TÜM yerlere otomatik olarak yansıyor.
export const TENNIS_PADEL_SUBCATEGORIES = ['tennis', 'padel', 'badminton', 'table_tennis'];

// Winner-games-ratio threshold separating "dominant" from "competitive" for tennis/padel,
// calibrated from the source table's own examples (6-3 ⇒ competitive at 66.7%, 6-2 ⇒
// dominant at 75%) — distinct from the generic 0.65 threshold used for other sports.
export const TENNIS_PADEL_DOMINANT_THRESHOLD = 0.70;

// ratingDiff: |higher - lower| skillRating (0–5 scale). lowerRatedWon: did the lower-rated
// side win? Returns the skillRating delta to apply: winner gains it, loser loses it.
export function getTennisPadelEloDelta(ratingDiff, dominant, lowerRatedWon) {
    const bucket = TABLE.find(b => ratingDiff <= b.max) || TABLE[TABLE.length - 1];
    const cell = dominant ? bucket.dominant : bucket.competitive;
    return lowerRatedWon
        ? { winnerGain: cell.lowWin, loserLoss: cell.highLose }
        : { winnerGain: cell.highWin, loserLoss: cell.lowLose };
}

// Anketten yanlış cevap verilince oluşan hatalı derecelendirmeyi yakalamak için:
// anketi tamamladıktan sonraki ilk 3 maçında, kendinden en az 1.0 puan yüksek bir
// rakibe (veya rakip takıma) karşı kazanan oyuncu varsa, bu maç ELO'ya sayılmaz
// (rakip puan kaybetmez, kazanan da puan kazanmaz) ve o oyuncu derecelendirme
// anketini tekrar doldurmaya yönlendirilir.
export const ASSESSMENT_GRACE_MATCHES = 3;
export const ASSESSMENT_GRACE_RATING_GAP = 1.0;

// Turnuvaya katılabilmek için uygulama üzerinden (Rakip Bul/turnuva) en az bu kadar
// gerçek maç oynamış olmak gerekir — sadece anket doldurmuş ama hiç maç yapmamış
// oyuncuların rekabetçi bir turnuvaya doğrudan girmesini önler.
export const MIN_MATCHES_FOR_TOURNAMENT = 3;

// winnerInterests/loserInterests: o taraftaki oyuncuların UserInterest kayıtları
// (matchesSinceAssessment alanı dahil). winnerAvg/loserAvg: taraf ortalama skillRating.
// Dönüş: anketi tekrar doldurması gereken kazanan taraf UserInterest kayıtları (boşsa flag yok).
export function getReassessmentFlags(winnerInterests, loserInterests, winnerAvg, loserAvg, subCategory) {
    if (winnerAvg >= loserAvg) return [];
    if (loserAvg - winnerAvg < ASSESSMENT_GRACE_RATING_GAP) return [];
    // Voleybol: kullanıcı isteği — kalibrasyon koruması burada BİREYSEL değil TAKIM
    // bazında uygulanır, sadece anketten sonraki ilk 3 maçıyla sınırlı değil. Örnek:
    // takım ortalaması 0.20 olan bir takım, ortalaması 1.30 olan bir takımı yenerse bu
    // fark (≥1.0) tek başına şüphelidir — ya anket yanlış cevaplanmıştır ya da kadroya
    // (kaçak/derecesi uygun olmayan) bir oyuncu eklenmiştir. Bu yüzden kazanan takımın
    // TAMAMI (matchesSinceAssessment'tan bağımsız) puan kazanmaz ve ankete yönlendirilir.
    if (subCategory === 'volleyball') return winnerInterests;
    return winnerInterests.filter(i => (i.matchesSinceAssessment ?? 0) < ASSESSMENT_GRACE_MATCHES);
}
