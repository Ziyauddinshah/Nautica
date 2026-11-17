package com.nautica.ui.theme
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
val Navy = Color(0xFF0A192F)
val Teal = Color(0xFF008080)
val Gold = Color(0xFFF59E0B)
val Seafoam = Color(0xFFF4F7F9)
@Composable fun NauticaTheme(content: @Composable () -> Unit) { MaterialTheme(colorScheme = lightColorScheme(primary = Teal, secondary = Navy, tertiary = Gold, background = Seafoam, surface = Color.White, onSurface = Navy, onBackground = Navy), content = content) }
