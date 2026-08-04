package com.activity.app.wear.scoring

import android.app.Application
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel

/**
 * Watch tarafındaki tek maçın state'i. Olay listesi (kim sayı aldı, sırayla)
 * tek kaynak — güncel skor her zaman bu listeden türetilir (bkz. MatchEngine).
 * Bu sayede "geri al" == son olayı silip yeniden hesaplamak, tenis/padel'in
 * deuce/avantaj/tie-break gibi köşe durumlarında bile her zaman doğru sonucu verir.
 *
 * Her durum değişiminde (AndroidViewModel'in Application context'i üzerinden)
 * telefondaki WearBridge modülüne Data Layer API ile anlık güncelleme yollanır.
 */
class ScoreViewModel(application: Application) : AndroidViewModel(application) {
    var config: MatchConfig? = null
        private set

    private val events = mutableListOf<Team>()

    var state by mutableStateOf<MatchState?>(null)
        private set

    fun startMatch(config: MatchConfig) {
        this.config = config
        events.clear()
        state = MatchEngine.computeState(config, events)
        state?.let { PhoneSync.sendUpdate(getApplication(), it) }
    }

    fun addPoint(team: Team) {
        val cfg = config ?: return
        if (state?.matchWinner != null) return
        events.add(team)
        state = MatchEngine.computeState(cfg, events)
        state?.let { PhoneSync.sendUpdate(getApplication(), it) }
    }

    /** Son sayıyı (hangi takıma yazıldıysa) geri alır — "yanlışlıkla bastım" için. */
    fun undoLastPoint() {
        val cfg = config ?: return
        if (events.isEmpty()) return
        events.removeAt(events.lastIndex)
        state = MatchEngine.computeState(cfg, events)
        state?.let { PhoneSync.sendUpdate(getApplication(), it) }
    }

    fun canUndo(): Boolean = events.isNotEmpty()

    fun resetMatch() {
        config = null
        events.clear()
        state = null
    }
}
