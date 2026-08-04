package com.activity.app.wear.scoring

/**
 * Saf Kotlin skor motoru (Android bağımlılığı yok — hem watch hem ileride
 * telefon tarafında test edilebilir/tekrar kullanılabilir).
 *
 * Tasarım: her sayı bir "olay" olarak (hangi takım aldı) sırayla saklanır;
 * o anki skor bu olay listesinin baştan simüle edilmesiyle hesaplanır.
 * "Yanlışlıkla bastım" durumunda son olayı silip yeniden simüle etmek,
 * deuce/avantaj/tiebreak gibi durumlarda elle "tersini al" mantığı yazmaktan
 * çok daha az hataya açık.
 */

enum class Sport { TENNIS, PADEL, VOLLEYBALL }

/** Padel'e özel: standart 15/30/40 mı, yoksa basit ardışık 1-2-3-4 sayım mı. */
enum class PadelPointMode { TRADITIONAL, SIMPLE }

enum class Team { A, B }

data class MatchConfig(
    val sport: Sport,
    val padelPointMode: PadelPointMode = PadelPointMode.TRADITIONAL,
    /** Maçı kazanmak için gereken set sayısı — best-of-3 için 2, best-of-5 için 3. */
    val setsToWin: Int = if (sport == Sport.VOLLEYBALL) 3 else 2,
    /** Tenis/padel: bir seti kazanmak için gereken oyun sayısı (2 fark şartıyla). */
    val gamesToWinSet: Int = 6,
    /** Bu oyun-oyun eşitliğinde tie-break oynanır (örn. 6-6). */
    val tiebreakAtGames: Int = 6,
    /** Voleybol: normal setlerde kazanma sayısı. */
    val volleyballSetPoints: Int = 25,
    /** Voleybol: belirleyici (son) setteki kazanma sayısı. */
    val volleyballDecidingSetPoints: Int = 15,
)

data class SetResult(val gamesOrPointsA: Int, val gamesOrPointsB: Int, val tiebreakA: Int? = null, val tiebreakB: Int? = null)

data class MatchState(
    val config: MatchConfig,
    /** Şu anki (bitmemiş) setteki oyun sayıları — tenis/padel. */
    val gamesA: Int = 0,
    val gamesB: Int = 0,
    /** Şu anki oyundaki (veya voleybol setindeki) ham sayı — tenis/padel deuce/avantaj bundan türetilir. */
    val pointsA: Int = 0,
    val pointsB: Int = 0,
    val inTiebreak: Boolean = false,
    val tiebreakA: Int = 0,
    val tiebreakB: Int = 0,
    val completedSets: List<SetResult> = emptyList(),
    val setsWonA: Int = 0,
    val setsWonB: Int = 0,
    val matchWinner: Team? = null,
) {
    /** Tenis/padel oyun içi skor etiketi (0/15/30/40/Deuce/Adv veya 1/2/3/4 basit mod). */
    fun gamePointLabel(team: Team): String {
        val (mine, theirs) = if (team == Team.A) pointsA to pointsB else pointsB to pointsA
        if (config.sport == Sport.PADEL && config.padelPointMode == PadelPointMode.SIMPLE) {
            return mine.toString()
        }
        // Traditional tennis/padel: 0,15,30,40 + deuce/advantage
        if (mine >= 3 && theirs >= 3) {
            return when {
                mine == theirs -> "40" // deuce'ta iki taraf da "40" gösterilir, UI "Deuce" etiketini ayrıca basar
                mine == theirs + 1 -> "Adv"
                else -> "40"
            }
        }
        val labels = listOf("0", "15", "30", "40")
        return labels.getOrElse(mine) { "40" }
    }

    fun isDeuce(): Boolean =
        config.sport != Sport.VOLLEYBALL &&
            !(config.sport == Sport.PADEL && config.padelPointMode == PadelPointMode.SIMPLE) &&
            pointsA >= 3 && pointsB >= 3 && pointsA == pointsB
}

private const val SIMPLE_GAME_POINTS_TO_WIN = 4

object MatchEngine {

    /** Olay listesini baştan oynatarak güncel maç durumunu üretir. */
    fun computeState(config: MatchConfig, events: List<Team>): MatchState {
        var state = MatchState(config = config)
        for (team in events) {
            if (state.matchWinner != null) break
            state = applyPoint(state, team)
        }
        return state
    }

    private fun applyPoint(state: MatchState, team: Team): MatchState {
        return when (state.config.sport) {
            Sport.VOLLEYBALL -> applyVolleyballPoint(state, team)
            Sport.TENNIS, Sport.PADEL -> applyTennisStylePoint(state, team)
        }
    }

    // ── TENNIS / PADEL ──────────────────────────────────────────────────
    private fun applyTennisStylePoint(state: MatchState, team: Team): MatchState {
        if (state.inTiebreak) {
            var tbA = state.tiebreakA
            var tbB = state.tiebreakB
            if (team == Team.A) tbA++ else tbB++

            val tbWinTarget = 7
            val setWonByTiebreak = (tbA >= tbWinTarget || tbB >= tbWinTarget) && kotlin.math.abs(tbA - tbB) >= 2
            if (setWonByTiebreak) {
                val winner = if (tbA > tbB) Team.A else Team.B
                return finishSet(state.copy(tiebreakA = tbA, tiebreakB = tbB), winner, tiebreakA = tbA, tiebreakB = tbB)
            }
            return state.copy(tiebreakA = tbA, tiebreakB = tbB)
        }

        var pA = state.pointsA
        var pB = state.pointsB
        val simple = state.config.sport == Sport.PADEL && state.config.padelPointMode == PadelPointMode.SIMPLE
        val winTarget = if (simple) SIMPLE_GAME_POINTS_TO_WIN else 4 // 4 "birim" = 0,15,30,40 sonrası Game
        if (team == Team.A) pA++ else pB++

        val gameWon = (pA >= winTarget || pB >= winTarget) && kotlin.math.abs(pA - pB) >= 2
        if (!gameWon) return state.copy(pointsA = pA, pointsB = pB)

        val gameWinner = if (pA > pB) Team.A else Team.B
        var gA = state.gamesA
        var gB = state.gamesB
        if (gameWinner == Team.A) gA++ else gB++

        val afterGame = state.copy(pointsA = 0, pointsB = 0, gamesA = gA, gamesB = gB)

        // Set bitti mi?
        val target = state.config.gamesToWinSet
        val setWonOutright = (gA >= target || gB >= target) && kotlin.math.abs(gA - gB) >= 2
        if (setWonOutright) {
            return finishSet(afterGame, if (gA > gB) Team.A else Team.B)
        }
        // Tie-break eşiği (örn. 6-6)?
        if (gA == state.config.tiebreakAtGames && gB == state.config.tiebreakAtGames) {
            return afterGame.copy(inTiebreak = true, tiebreakA = 0, tiebreakB = 0)
        }
        return afterGame
    }

    private fun finishSet(state: MatchState, winner: Team, tiebreakA: Int? = null, tiebreakB: Int? = null): MatchState {
        val result = SetResult(state.gamesA, state.gamesB, tiebreakA, tiebreakB)
        val sets = state.completedSets + result
        var setsA = state.setsWonA
        var setsB = state.setsWonB
        if (winner == Team.A) setsA++ else setsB++

        val matchWinner = if (setsA >= state.config.setsToWin) Team.A
            else if (setsB >= state.config.setsToWin) Team.B
            else null

        return state.copy(
            gamesA = 0, gamesB = 0, pointsA = 0, pointsB = 0,
            inTiebreak = false, tiebreakA = 0, tiebreakB = 0,
            completedSets = sets, setsWonA = setsA, setsWonB = setsB,
            matchWinner = matchWinner,
        )
    }

    // ── VOLLEYBALL ───────────────────────────────────────────────────────
    private fun applyVolleyballPoint(state: MatchState, team: Team): MatchState {
        var pA = state.pointsA
        var pB = state.pointsB
        if (team == Team.A) pA++ else pB++

        val isDecidingSet = state.setsWonA == state.config.setsToWin - 1 &&
            state.setsWonB == state.config.setsToWin - 1
        val target = if (isDecidingSet) state.config.volleyballDecidingSetPoints else state.config.volleyballSetPoints

        val setWon = (pA >= target || pB >= target) && kotlin.math.abs(pA - pB) >= 2
        val afterPoints = state.copy(pointsA = pA, pointsB = pB)
        if (!setWon) return afterPoints

        val winner = if (pA > pB) Team.A else Team.B
        return finishSet(afterPoints, winner)
    }
}
