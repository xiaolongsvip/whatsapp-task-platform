package com.wtp.app.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val GreenPalette = lightColorScheme(
    primary = Color(0xFF32866A),
    onPrimary = Color.White,
    primaryContainer = Color(0xFFE2F4EA),
    onPrimaryContainer = Color(0xFF174B37),
    secondary = Color(0xFF648A78),
    background = Color(0xFFF3F6F4),
    surface = Color.White,
    onSurface = Color(0xFF1D2939),
    onSurfaceVariant = Color(0xFF667085)
)

@Composable
fun TaskPlatformTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = GreenPalette,
        content = content
    )
}
