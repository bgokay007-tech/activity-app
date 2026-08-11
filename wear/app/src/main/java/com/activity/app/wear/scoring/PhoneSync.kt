package com.activity.app.wear.scoring

import android.content.Context
import com.google.android.gms.wearable.Wearable
import org.json.JSONObject

// Telefondaki WearBridge native modülünün dinlediği aynı path (bkz.
// mobile/modules/wear-bridge/android/.../WearBridgeModule.kt). Her sayı
// değişiminde tüm bağlı node'lara (telefon) gönderiyoruz — mesaj küçük
// (birkaç yüz byte), ağır bir senkron mekanizmasına gerek yok.
private const val MATCH_UPDATE_PATH = "/activity/match-update"

object PhoneSync {
    fun sendUpdate(context: Context, state: MatchState) {
        val payload = JSONObject().apply {
            put("sport", state.config.sport.name)
            put("pointLabelA", state.gamePointLabel(Team.A))
            put("pointLabelB", state.gamePointLabel(Team.B))
            // Ham sayı da gönderiliyor — voleybolde gamePointLabel tenis usulü (0/15/30/40)
            // etiket üretiyor, oysa voleybol sayısı 25'e kadar çıkıyor; telefon tarafı
            // voleybolde bu ham değeri, tenis/padelde ise pointLabel'i gösteriyor.
            put("pointsA", state.pointsA)
            put("pointsB", state.pointsB)
            put("gamesA", state.gamesA)
            put("gamesB", state.gamesB)
            put("setsA", state.setsWonA)
            put("setsB", state.setsWonB)
            put("matchWinner", state.matchWinner?.name)
        }.toString().toByteArray(Charsets.UTF_8)

        val messageClient = Wearable.getMessageClient(context)
        Wearable.getNodeClient(context).connectedNodes.addOnSuccessListener { nodes ->
            nodes.forEach { node ->
                messageClient.sendMessage(node.id, MATCH_UPDATE_PATH, payload)
            }
        }
    }
}
