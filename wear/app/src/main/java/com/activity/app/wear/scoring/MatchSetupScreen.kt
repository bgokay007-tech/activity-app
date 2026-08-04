package com.activity.app.wear.scoring

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.wear.compose.material.Button
import androidx.wear.compose.material.Chip
import androidx.wear.compose.material.ChipDefaults
import androidx.wear.compose.material.MaterialTheme
import androidx.wear.compose.material.Text

@Composable
fun MatchSetupScreen(onStart: (MatchConfig) -> Unit) {
    var sport by remember { mutableStateOf(Sport.TENNIS) }
    var padelMode by remember { mutableStateOf(PadelPointMode.TRADITIONAL) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 12.dp, vertical = 20.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(text = "Spor", style = MaterialTheme.typography.caption2)

        SportChip("🎾 Tenis", sport == Sport.TENNIS) { sport = Sport.TENNIS }
        SportChip("🏓 Padel", sport == Sport.PADEL) { sport = Sport.PADEL }
        SportChip("🏐 Voleybol", sport == Sport.VOLLEYBALL) { sport = Sport.VOLLEYBALL }

        if (sport == Sport.PADEL) {
            Text(text = "Sayım", style = MaterialTheme.typography.caption2)
            SportChip("15-30-40", padelMode == PadelPointMode.TRADITIONAL) {
                padelMode = PadelPointMode.TRADITIONAL
            }
            SportChip("1-2-3...", padelMode == PadelPointMode.SIMPLE) {
                padelMode = PadelPointMode.SIMPLE
            }
        }

        Button(onClick = {
            onStart(
                MatchConfig(
                    sport = sport,
                    padelPointMode = padelMode,
                )
            )
        }) {
            Text(text = "▶")
        }
    }
}

@Composable
private fun SportChip(label: String, selected: Boolean, onClick: () -> Unit) {
    Chip(
        onClick = onClick,
        label = { Text(text = label) },
        colors = if (selected) ChipDefaults.primaryChipColors() else ChipDefaults.secondaryChipColors(),
        modifier = Modifier.padding(vertical = 2.dp),
    )
}
