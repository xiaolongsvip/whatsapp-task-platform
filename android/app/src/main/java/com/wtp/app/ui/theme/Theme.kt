package com.wtp.app.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val SkyPalette = lightColorScheme(
    primary = Color(0xFF319CCB), onPrimary = Color.White,
    primaryContainer = Color(0xFFDDF3FF), onPrimaryContainer = Color(0xFF123E56),
    secondary = Color(0xFF5AAED0), background = Color(0xFFF2F7FA),
    surface = Color.White, onSurface = Color(0xFF1D2939),
    onSurfaceVariant = Color(0xFF667085), outline = Color(0xFFD8E5EC)
)

@Composable
fun TaskPlatformTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = SkyPalette, content = content)
}
