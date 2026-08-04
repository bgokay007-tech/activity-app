package com.activity.app.wear.scoring

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.wear.compose.material.Button
import androidx.wear.compose.material.ButtonDefaults
import androidx.wear.compose.material.MaterialTheme
import androidx.wear.compose.material.Text

/**
 * Tek ekran: üst yarı Takım A, alt yarı Takım B — dokununca o takıma sayı
 * yazılır. Yanlış basışlar için ortadaki "↩" son sayıyı geri alır (kim
 * aldıysa onu, sırayla — bkz. ScoreViewModel).
 */
@Composable
fun LiveScoreScreen(viewModel: ScoreViewModel, onFinish: () -> Unit) {
    val state = viewModel.state ?: return
    val config = viewModel.config ?: return

    if (state.matchWinner != null) {
        MatchFinishedScreen(winner = state.matchWinner, onDone = onFinish)
        return
    }

    Column(modifier = Modifier.fillMaxSize()) {
        TeamHalf(
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f)
                .background(Color(0xFF1E3A5F))
                .clickable { viewModel.addPoint(Team.A) },
            label = "A",
            pointLabel = state.gamePointLabel(Team.A),
            games = state.gamesA,
            sets = state.setsWonA,
            showGames = config.sport != Sport.VOLLEYBALL,
        )

        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(28.dp)
                .background(Color.Black),
            contentAlignment = Alignment.Center,
        ) {
            Button(
                onClick = { viewModel.undoLastPoint() },
                colors = ButtonDefaults.secondaryButtonColors(),
                modifier = Modifier.height(24.dp),
            ) {
                Text(text = "↩", style = MaterialTheme.typography.caption2)
            }
        }

        TeamHalf(
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f)
                .background(Color(0xFF5F1E2E))
                .clickable { viewModel.addPoint(Team.B) },
            label = "B",
            pointLabel = state.gamePointLabel(Team.B),
            games = state.gamesB,
            sets = state.setsWonB,
            showGames = config.sport != Sport.VOLLEYBALL,
        )
    }
}

@Composable
private fun TeamHalf(
    modifier: Modifier,
    label: String,
    pointLabel: String,
    games: Int,
    sets: Int,
    showGames: Boolean,
) {
    Box(modifier = modifier, contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(text = "$label · Set $sets", style = MaterialTheme.typography.caption2)
            Text(text = pointLabel, style = MaterialTheme.typography.display1)
            if (showGames) {
                Text(text = "Oyun $games", style = MaterialTheme.typography.caption3)
            }
        }
    }
}

@Composable
private fun MatchFinishedScreen(winner: Team, onDone: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(text = "🏆", style = MaterialTheme.typography.display2)
        Text(text = "Takım $winner kazandı", style = MaterialTheme.typography.body1)
        Button(onClick = onDone, modifier = Modifier.padding(top = 8.dp)) {
            Text(text = "Bitti")
        }
    }
}
