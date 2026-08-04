package com.activity.app.wear

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.wear.compose.material.MaterialTheme
import com.activity.app.wear.scoring.LiveScoreScreen
import com.activity.app.wear.scoring.MatchSetupScreen
import com.activity.app.wear.scoring.ScoreViewModel

class MainActivity : ComponentActivity() {
    private val scoreViewModel: ScoreViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            AppRoot(scoreViewModel)
        }
    }
}

@Composable
fun AppRoot(viewModel: ScoreViewModel) {
    var matchStarted by remember { mutableStateOf(false) }

    MaterialTheme {
        if (!matchStarted) {
            MatchSetupScreen(onStart = { config ->
                viewModel.startMatch(config)
                matchStarted = true
            })
        } else {
            LiveScoreScreen(viewModel = viewModel, onFinish = {
                viewModel.resetMatch()
                matchStarted = false
            })
        }
    }
}
