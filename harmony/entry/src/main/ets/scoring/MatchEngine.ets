/**
 * wear/ (Wear OS/Kotlin) tarafındaki MatchEngine.kt'nin ArkTS portu — aynı
 * mantık: her sayı bir "olay" olarak sırayla saklanır, güncel skor bu olay
 * listesinin baştan simüle edilmesiyle hesaplanır. "Geri al" == son olayı
 * silip yeniden hesaplamak; deuce/avantaj/tiebreak gibi durumlarda bile
 * doğru sonucu garanti eder.
 */

export enum Sport { TENNIS, PADEL, VOLLEYBALL }

// Padel'e özel: standart 15/30/40 mı, yoksa basit ardışık 1-2-3-4 sayım mı.
export enum PadelPointMode { TRADITIONAL, SIMPLE }

export enum Team { A, B }

export interface MatchConfig {
  sport: Sport;
  padelPointMode: PadelPointMode;
  // Maçı kazanmak için gereken set sayısı — best-of-3 için 2, best-of-5 için 3.
  setsToWin: number;
  // Tenis/padel: bir seti kazanmak için gereken oyun sayısı (2 fark şartıyla).
  gamesToWinSet: number;
  // Bu oyun-oyun eşitliğinde tie-break oynanır (örn. 6-6).
  tiebreakAtGames: number;
  // Voleybol: normal setlerde kazanma sayısı.
  volleyballSetPoints: number;
  // Voleybol: belirleyici (son) setteki kazanma sayısı.
  volleyballDecidingSetPoints: number;
}

export function defaultMatchConfig(sport: Sport, padelPointMode: PadelPointMode): MatchConfig {
  return {
    sport,
    padelPointMode,
    setsToWin: sport === Sport.VOLLEYBALL ? 3 : 2,
    gamesToWinSet: 6,
    tiebreakAtGames: 6,
    volleyballSetPoints: 25,
    volleyballDecidingSetPoints: 15,
  };
}

export interface SetResult {
  gamesOrPointsA: number;
  gamesOrPointsB: number;
  tiebreakA: number | null;
  tiebreakB: number | null;
}

export interface MatchState {
  gamesA: number;
  gamesB: number;
  pointsA: number;
  pointsB: number;
  inTiebreak: boolean;
  tiebreakA: number;
  tiebreakB: number;
  completedSets: SetResult[];
  setsWonA: number;
  setsWonB: number;
  matchWinner: Team | null;
}

export function initialMatchState(): MatchState {
  return {
    gamesA: 0, gamesB: 0,
    pointsA: 0, pointsB: 0,
    inTiebreak: false, tiebreakA: 0, tiebreakB: 0,
    completedSets: [],
    setsWonA: 0, setsWonB: 0,
    matchWinner: null,
  };
}

// Tenis/padel oyun içi skor etiketi (0/15/30/40/Deuce/Adv veya 1/2/3/4 basit mod).
export function gamePointLabel(config: MatchConfig, state: MatchState, team: Team): string {
  const mine = team === Team.A ? state.pointsA : state.pointsB;
  const theirs = team === Team.A ? state.pointsB : state.pointsA;
  if (config.sport === Sport.PADEL && config.padelPointMode === PadelPointMode.SIMPLE) {
    return `${mine}`;
  }
  // Traditional tenis/padel: 0,15,30,40 + deuce/advantage
  if (mine >= 3 && theirs >= 3) {
    if (mine === theirs) return '40'; // deuce'ta iki taraf da "40" gösterilir, UI "Deuce" etiketini ayrıca basar
    if (mine === theirs + 1) return 'Adv';
    return '40';
  }
  const labels = ['0', '15', '30', '40'];
  return mine < labels.length ? labels[mine] : '40';
}

// Telefon tarafının (WearBridge JSON sözleşmesi, bkz. wear/PhoneSync.kt) beklediği
// enum adları — ArkTS'te numeric enum'ların ters çevrimi (Sport[x]) güvenilir
// olmadığı için elle eşleniyor.
export function sportName(sport: Sport): string {
  switch (sport) {
    case Sport.TENNIS: return 'TENNIS';
    case Sport.PADEL: return 'PADEL';
    case Sport.VOLLEYBALL: return 'VOLLEYBALL';
    default: return 'TENNIS';
  }
}

export function teamName(team: Team): string {
  return team === Team.A ? 'A' : 'B';
}

export function isDeuce(config: MatchConfig, state: MatchState): boolean {
  return config.sport !== Sport.VOLLEYBALL &&
    !(config.sport === Sport.PADEL && config.padelPointMode === PadelPointMode.SIMPLE) &&
    state.pointsA >= 3 && state.pointsB >= 3 && state.pointsA === state.pointsB;
}

const SIMPLE_GAME_POINTS_TO_WIN = 4;

// Olay listesini baştan oynatarak güncel maç durumunu üretir.
export function computeState(config: MatchConfig, events: Team[]): MatchState {
  let state = initialMatchState();
  for (let i = 0; i < events.length; i++) {
    if (state.matchWinner !== null) break;
    state = applyPoint(config, state, events[i]);
  }
  return state;
}

function applyPoint(config: MatchConfig, state: MatchState, team: Team): MatchState {
  if (config.sport === Sport.VOLLEYBALL) return applyVolleyballPoint(config, state, team);
  return applyTennisStylePoint(config, state, team);
}

// ── TENNIS / PADEL ──────────────────────────────────────────────────
function applyTennisStylePoint(config: MatchConfig, state: MatchState, team: Team): MatchState {
  if (state.inTiebreak) {
    let tbA = state.tiebreakA;
    let tbB = state.tiebreakB;
    if (team === Team.A) tbA++; else tbB++;

    const tbWinTarget = 7;
    const setWonByTiebreak = (tbA >= tbWinTarget || tbB >= tbWinTarget) && Math.abs(tbA - tbB) >= 2;
    if (setWonByTiebreak) {
      const winner = tbA > tbB ? Team.A : Team.B;
      return finishSet(config, { ...state, tiebreakA: tbA, tiebreakB: tbB }, winner, tbA, tbB);
    }
    return { ...state, tiebreakA: tbA, tiebreakB: tbB };
  }

  let pA = state.pointsA;
  let pB = state.pointsB;
  const simple = config.sport === Sport.PADEL && config.padelPointMode === PadelPointMode.SIMPLE;
  const winTarget = simple ? SIMPLE_GAME_POINTS_TO_WIN : 4; // 4 "birim" = 0,15,30,40 sonrası Game
  if (team === Team.A) pA++; else pB++;

  const gameWon = (pA >= winTarget || pB >= winTarget) && Math.abs(pA - pB) >= 2;
  if (!gameWon) return { ...state, pointsA: pA, pointsB: pB };

  const gameWinner = pA > pB ? Team.A : Team.B;
  let gA = state.gamesA;
  let gB = state.gamesB;
  if (gameWinner === Team.A) gA++; else gB++;

  const afterGame: MatchState = { ...state, pointsA: 0, pointsB: 0, gamesA: gA, gamesB: gB };

  // Set bitti mi?
  const target = config.gamesToWinSet;
  const setWonOutright = (gA >= target || gB >= target) && Math.abs(gA - gB) >= 2;
  if (setWonOutright) {
    return finishSet(config, afterGame, gA > gB ? Team.A : Team.B, null, null);
  }
  // Tie-break eşiği (örn. 6-6)?
  if (gA === config.tiebreakAtGames && gB === config.tiebreakAtGames) {
    return { ...afterGame, inTiebreak: true, tiebreakA: 0, tiebreakB: 0 };
  }
  return afterGame;
}

function finishSet(config: MatchConfig, state: MatchState, winner: Team, tiebreakA: number | null, tiebreakB: number | null): MatchState {
  const result: SetResult = { gamesOrPointsA: state.gamesA, gamesOrPointsB: state.gamesB, tiebreakA, tiebreakB };
  const sets = state.completedSets.concat([result]);
  let setsA = state.setsWonA;
  let setsB = state.setsWonB;
  if (winner === Team.A) setsA++; else setsB++;

  let matchWinner: Team | null = null;
  if (setsA >= config.setsToWin) matchWinner = Team.A;
  else if (setsB >= config.setsToWin) matchWinner = Team.B;

  return {
    ...state,
    gamesA: 0, gamesB: 0, pointsA: 0, pointsB: 0,
    inTiebreak: false, tiebreakA: 0, tiebreakB: 0,
    completedSets: sets, setsWonA: setsA, setsWonB: setsB,
    matchWinner,
  };
}

// ── VOLLEYBALL ───────────────────────────────────────────────────────
function applyVolleyballPoint(config: MatchConfig, state: MatchState, team: Team): MatchState {
  let pA = state.pointsA;
  let pB = state.pointsB;
  if (team === Team.A) pA++; else pB++;

  const isDecidingSet = state.setsWonA === config.setsToWin - 1 && state.setsWonB === config.setsToWin - 1;
  const target = isDecidingSet ? config.volleyballDecidingSetPoints : config.volleyballSetPoints;

  const setWon = (pA >= target || pB >= target) && Math.abs(pA - pB) >= 2;
  const afterPoints: MatchState = { ...state, pointsA: pA, pointsB: pB };
  if (!setWon) return afterPoints;

  const winner = pA > pB ? Team.A : Team.B;
  return finishSet(config, afterPoints, winner, null, null);
}
