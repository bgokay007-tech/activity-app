// Tennis/Padel-specific ELO point-transfer table (skillRating units, 0–5 scale).
// Source: user-provided spreadsheet. "Dominant" = 6-0/6-1/6-2-style sets (winner took
// the clear majority of games); "Competitive" = 6-3/6-4/7-5/7-6-style sets (close match).
// Each bucket gives 4 values per score type: what the lower-rated player gains when
// they win / lose, and what the higher-rated player gains when they win / lose. In
// practice winner-gain on one side always equals loser-loss on the other (zero-sum),
// except one row in the source table where a minor inconsistency was kept as given.
const TABLE = [
    { max: 0.03, dominant: { lowWin: 0.03,  lowLose: 0.02,   highWin: 0.02,   highLose: 0.03  }, competitive: { lowWin: 0.0175, lowLose: 0.01,   highWin: 0.01,   highLose: 0.0175 } },
    { max: 0.05, dominant: { lowWin: 0.04,  lowLose: 0.0175, highWin: 0.0175, highLose: 0.03  }, competitive: { lowWin: 0.02,   lowLose: 0.0125, highWin: 0.0125, highLose: 0.02   } },
    { max: 0.10, dominant: { lowWin: 0.05,  lowLose: 0.03,   highWin: 0.03,   highLose: 0.05  }, competitive: { lowWin: 0.035,  lowLose: 0.015,  highWin: 0.015,  highLose: 0.035  } },
    { max: 0.25, dominant: { lowWin: 0.10,  lowLose: 0.05,   highWin: 0.05,   highLose: 0.10  }, competitive: { lowWin: 0.06,   lowLose: 0.03,   highWin: 0.03,   highLose: 0.06   } },
    { max: 0.50, dominant: { lowWin: 0.25,  lowLose: 0.04,   highWin: 0.04,   highLose: 0.25  }, competitive: { lowWin: 0.15,   lowLose: 0.025,  highWin: 0.025,  highLose: 0.15   } },
    { max: 1.00, dominant: { lowWin: 0.50,  lowLose: 0.03,   highWin: 0.03,   highLose: 0.50  }, competitive: { lowWin: 0.40,   lowLose: 0.02,   highWin: 0.02,   highLose: 0.40   } },
    { max: 1.50, dominant: { lowWin: 1.00,  lowLose: 0.02,   highWin: 0.02,   highLose: 1.00  }, competitive: { lowWin: 0.90,   lowLose: 0.015,  highWin: 0.015,  highLose: 0.90   } },
    { max: 2.00, dominant: { lowWin: 1.50,  lowLose: 0.01,   highWin: 0.01,   highLose: 1.50  }, competitive: { lowWin: 1.30,   lowLose: 0.01,   highWin: 0.01,   highLose: 1.30   } },
    { max: Infinity, dominant: { lowWin: 2.00, lowLose: 0.005, highWin: 0.005, highLose: 2.00 }, competitive: { lowWin: 1.80,   lowLose: 0.008,  highWin: 0.008,  highLose: 1.80   } },
];

export const TENNIS_PADEL_SUBCATEGORIES = ['tennis', 'padel'];

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
