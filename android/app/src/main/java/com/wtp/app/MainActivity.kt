package com.wtp.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import com.wtp.app.data.AuthRepository
import com.wtp.app.ui.TaskPlatformApp
import com.wtp.app.ui.theme.TaskPlatformTheme

class MainActivity : ComponentActivity() {
    @Suppress("DEPRECATION")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        AuthRepository.initialize(applicationContext)
        // Use a deep blue status-bar surface with light system icons so the
        // time, signal and battery indicators remain readable.
        window.statusBarColor = android.graphics.Color.rgb(230, 243, 250)
        window.decorView.systemUiVisibility =
            window.decorView.systemUiVisibility or android.view.View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR
        setContent {
            TaskPlatformTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = Color(0xFFF0F7FB)
                ) {
                    TaskPlatformApp()
                }
            }
        }
    }
}
