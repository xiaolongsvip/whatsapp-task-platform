package com.wtp.app.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.wtp.app.data.AuthRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlin.math.cos
import kotlin.math.sin

private val Night = Color(0xFF061633)
private val DeepBlue = Color(0xFF081B42)
private val Cyan = Color(0xFF55D4FF)
private val Pale = Color(0xFFEAF3FF)
private val Muted = Color(0xFF9DB1D1)
private val FieldFill = Color(0x24FFFFFF)
private val FieldBorder = Color(0x789FC6F4)

@Composable
fun AuthScreen(onAuthenticated: (String) -> Unit) {
    val scope = rememberCoroutineScope()
    var isRegister by remember { mutableStateOf(false) }
    var callingCode by remember { mutableStateOf("+1") }
    var localPhone by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var confirmPassword by remember { mutableStateOf("") }
    var inviteCode by remember { mutableStateOf("") }
    var showPassword by remember { mutableStateOf(false) }
    var showConfirmPassword by remember { mutableStateOf(false) }
    var rememberAccount by remember { mutableStateOf(true) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf("") }

    BoxWithConstraints(
        modifier = Modifier.fillMaxSize().background(
            Brush.linearGradient(listOf(Color(0xFF06142F), Color(0xFF092451), Color(0xFF070F2D)))
        )
    ) {
        val compact = maxHeight < 760.dp
        TechBackground()
        Column(
            modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = if (compact) 12.dp else 22.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .width(430.dp)
                    .shadow(28.dp, RoundedCornerShape(30.dp), ambientColor = Color(0x553B9CFF))
                    .clip(RoundedCornerShape(30.dp))
                    .background(Brush.linearGradient(listOf(Color(0xE8122E60), Color(0xF006173A), Color(0xF0081534))))
                    .border(1.dp, Color(0xFF6EA9E9), RoundedCornerShape(30.dp))
                    .padding(horizontal = if (compact) 20.dp else 26.dp, vertical = if (compact) 20.dp else 25.dp),
                verticalArrangement = Arrangement.spacedBy(if (compact) 12.dp else 15.dp)
            ) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Box(
                        modifier = Modifier.size(36.dp).shadow(10.dp, RoundedCornerShape(11.dp))
                            .clip(RoundedCornerShape(11.dp))
                            .background(Brush.linearGradient(listOf(Color(0xFF35A5FF), Color(0xFF0756ED)))),
                        contentAlignment = Alignment.Center
                    ) { Text("W", color = Color.White, fontSize = 21.sp, fontWeight = FontWeight.Black) }
                    Text("WHATSAPP TASK PLATFORM", color = Pale, fontSize = 11.sp, fontWeight = FontWeight.ExtraBold, letterSpacing = .65.sp)
                }

                Column(modifier = Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(if (isRegister) "CREATE YOUR ACCOUNT" else "WELCOME BACK", color = Color(0xFF8AB8FF), fontSize = 10.sp, fontWeight = FontWeight.ExtraBold, letterSpacing = 2.2.sp)
                    Spacer(Modifier.height(8.dp))
                    Text(if (isRegister) "创建你的账户" else "欢迎回来", color = Color.White, fontSize = 27.sp, fontWeight = FontWeight.ExtraBold)
                    if (!isRegister) {
                        Text("登录账户", color = Cyan, fontSize = 34.sp, fontWeight = FontWeight.Black)
                        Box(Modifier.padding(top = 3.dp).width(112.dp).height(3.dp).clip(CircleShape).background(Brush.horizontalGradient(listOf(Color.Transparent, Cyan, Color(0xFF3578FF), Color.Transparent))))
                    }
                    Spacer(Modifier.height(10.dp))
                    Text(
                        if (isRegister) "填写以下信息，开启你的平台体验。" else "使用手机号码和密码登录，继续你的任务体验。",
                        color = Color(0xFFC1D2EC), fontSize = 11.sp
                    )
                }

                AuthFieldLabel("电话号码", Icons.Default.Phone)
                Row(
                    modifier = Modifier.fillMaxWidth().height(43.dp).clip(RoundedCornerShape(12.dp))
                        .background(FieldFill).border(1.dp, FieldBorder, RoundedCornerShape(12.dp)),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    BasicTextField(
                        value = callingCode,
                        onValueChange = { callingCode = "+" + it.filter(Char::isDigit).take(5) },
                        modifier = Modifier.width(82.dp).padding(horizontal = 10.dp),
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                        textStyle = androidx.compose.ui.text.TextStyle(color = Pale, fontSize = 13.sp, fontWeight = FontWeight.Bold),
                        decorationBox = { inner -> Box { if (callingCode.isEmpty()) Text("+1", color = Muted); inner() } }
                    )
                    Box(Modifier.width(1.dp).height(43.dp).background(Color(0x557FA9DC)))
                    BasicTextField(
                        value = localPhone,
                        onValueChange = { localPhone = it.filter(Char::isDigit).take(15) },
                        modifier = Modifier.weight(1f).padding(horizontal = 11.dp),
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                        textStyle = androidx.compose.ui.text.TextStyle(color = Color.White, fontSize = 13.sp),
                        decorationBox = { inner -> Box { if (localPhone.isEmpty()) Text("输入手机号码", color = Color(0xFF9FB1D0), fontSize = 13.sp); inner() } }
                    )
                }
                if (isRegister) Text("左侧填写国家区号，右侧填写手机号码。", color = Muted, fontSize = 10.sp)

                AuthFieldLabel("登录密码", Icons.Default.Lock)
                PasswordInput(password, { password = it }, showPassword, { showPassword = !showPassword }, if (isRegister) "请输入密码（至少 6 位）" else "请输入登录密码")

                if (isRegister) {
                    AuthFieldLabel("确认密码", Icons.Default.Lock)
                    PasswordInput(confirmPassword, { confirmPassword = it }, showConfirmPassword, { showConfirmPassword = !showConfirmPassword }, "请再次输入密码")
                    Text("邀请码（选填）", color = Pale, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    AuthTextInput(inviteCode, { inviteCode = it.take(32) }, "请输入邀请码")
                } else {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.clickable { rememberAccount = !rememberAccount }) {
                            Box(Modifier.size(18.dp).clip(RoundedCornerShape(5.dp)).background(if (rememberAccount) Brush.linearGradient(listOf(Color(0xFF20BCFF), Color(0xFF155BFF))) else Brush.linearGradient(listOf(FieldFill, FieldFill))).border(1.dp, Color(0xFF63BFFF), RoundedCornerShape(5.dp)), contentAlignment = Alignment.Center) {
                                if (rememberAccount) Text("✓", color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                            }
                            Text("记住账号", color = Pale, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                        }
                        Text("使用设备密码管理器保存密码", color = Muted, fontSize = 8.sp)
                    }
                }

                if (error.isNotBlank()) Text(error, color = Color(0xFFFFB9C0), fontSize = 11.sp, modifier = Modifier.fillMaxWidth().background(Color(0x33A32640), RoundedCornerShape(8.dp)).padding(10.dp))

                Box(
                    modifier = Modifier.fillMaxWidth().height(45.dp).shadow(12.dp, RoundedCornerShape(12.dp))
                        .clip(RoundedCornerShape(12.dp))
                        .background(Brush.horizontalGradient(listOf(Color(0xFF18B9F5), Color(0xFF0875FF), Color(0xFF354BFF))))
                        .border(1.dp, Color(0xFF72DFFF), RoundedCornerShape(12.dp))
                        .clickable(enabled = !busy) {
                            error = ""
                            val fullPhone = (callingCode + localPhone).filter(Char::isDigit)
                            when {
                                callingCode == "+" -> error = "请输入国家区号。"
                                fullPhone.length !in 8..15 -> error = "请输入有效的国际手机号码。"
                                password.length !in 6..128 -> error = "密码长度需要为 6 至 128 位。"
                                isRegister && password != confirmPassword -> error = "两次输入的密码不一致。"
                                else -> scope.launch {
                                    busy = true
                                    try {
                                        withContext(Dispatchers.IO) {
                                            if (isRegister) AuthRepository.register(fullPhone, password, inviteCode)
                                            else AuthRepository.login(fullPhone, password)
                                        }
                                        onAuthenticated(fullPhone)
                                    } catch (exception: Exception) {
                                        error = exception.message ?: "请求失败，请检查网络和 API 服务。"
                                    } finally { busy = false }
                                }
                            }
                        },
                    contentAlignment = Alignment.Center
                ) {
                    if (busy) CircularProgressIndicator(color = Color.White, modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
                    else {
                        Text(if (isRegister) "创建账户" else "登录平台", color = Color.White, fontSize = 15.sp, fontWeight = FontWeight.ExtraBold)
                        Text("→", color = Color.White, fontSize = 25.sp, modifier = Modifier.align(Alignment.CenterEnd).padding(end = 15.dp))
                    }
                }

                Row(
                    modifier = Modifier.fillMaxWidth().height(39.dp).clip(RoundedCornerShape(10.dp))
                        .background(Color(0x22136CCB)).border(1.dp, Color(0xFF42C8FF), RoundedCornerShape(10.dp))
                        .clickable(enabled = !busy) { isRegister = !isRegister; error = "" },
                    horizontalArrangement = Arrangement.Center,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(if (isRegister) "♙  已经拥有账户？立即登录  ↗" else "♙  还没有账户？创建新账户  ↗", color = Pale, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                }

                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.Shield, contentDescription = null, tint = Color(0xFF55E2B3), modifier = Modifier.size(14.dp))
                    Spacer(Modifier.width(6.dp))
                    Text("安全加密连接，保护你的账户信息。", color = Muted, fontSize = 9.sp)
                }
            }
        }
    }
}

@Composable
private fun AuthFieldLabel(label: String, icon: androidx.compose.ui.graphics.vector.ImageVector) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
        Icon(icon, contentDescription = null, tint = Color(0xFF9BCBFF), modifier = Modifier.size(15.dp))
        Text(label, color = Pale, fontSize = 12.sp, fontWeight = FontWeight.Bold)
    }
}

@Composable
private fun AuthTextInput(value: String, onValueChange: (String) -> Unit, hint: String) {
    Box(Modifier.fillMaxWidth().height(42.dp).clip(RoundedCornerShape(11.dp)).background(FieldFill).border(1.dp, FieldBorder, RoundedCornerShape(11.dp)).padding(horizontal = 12.dp), contentAlignment = Alignment.CenterStart) {
        BasicTextField(value, onValueChange, singleLine = true, textStyle = androidx.compose.ui.text.TextStyle(color = Color.White, fontSize = 12.sp), decorationBox = { inner -> Box { if (value.isEmpty()) Text(hint, color = Muted, fontSize = 12.sp); inner() } })
    }
}

@Composable
private fun PasswordInput(value: String, onValueChange: (String) -> Unit, visible: Boolean, onToggle: () -> Unit, hint: String) {
    Row(Modifier.fillMaxWidth().height(42.dp).clip(RoundedCornerShape(11.dp)).background(FieldFill).border(1.dp, FieldBorder, RoundedCornerShape(11.dp)).padding(start = 12.dp, end = 5.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.weight(1f), contentAlignment = Alignment.CenterStart) {
            BasicTextField(value, onValueChange, singleLine = true, visualTransformation = if (visible) VisualTransformation.None else PasswordVisualTransformation(), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password), textStyle = androidx.compose.ui.text.TextStyle(color = Color.White, fontSize = 12.sp), decorationBox = { inner -> Box { if (value.isEmpty()) Text(hint, color = Muted, fontSize = 12.sp); inner() } })
        }
        Icon(if (visible) Icons.Default.VisibilityOff else Icons.Default.Visibility, contentDescription = "切换密码显示", tint = Color(0xFFC4DCFF), modifier = Modifier.size(34.dp).clickable(onClick = onToggle).padding(8.dp))
    }
}

@Composable
private fun TechBackground() {
    Canvas(Modifier.fillMaxSize()) {
        val w = size.width
        val h = size.height
        drawLine(Brush.linearGradient(listOf(Color.Transparent, Color(0x884A8DFF), Color.Transparent)), Offset(-w * .2f, h * .03f), Offset(w * .5f, -h * .08f), strokeWidth = 38f, cap = StrokeCap.Round)
        drawLine(Brush.linearGradient(listOf(Color.Transparent, Color(0x554D8DFF), Color.Transparent)), Offset(w * .65f, h * 1.05f), Offset(w * 1.15f, h * .88f), strokeWidth = 42f, cap = StrokeCap.Round)
        val cx = w * .87f
        val cy = h * .13f
        val radius = w * .22f
        drawCircle(Color(0x3322A9FF), radius, Offset(cx, cy))
        drawCircle(Color(0x7730AFFF), radius, Offset(cx, cy), style = Stroke(1f))
        drawOval(Color(0x5540BFFF), topLeft = Offset(cx - radius, cy - radius * .42f), size = androidx.compose.ui.geometry.Size(radius * 2, radius * .84f), style = Stroke(1f))
        drawOval(Color(0x4440BFFF), topLeft = Offset(cx - radius * .55f, cy - radius), size = androidx.compose.ui.geometry.Size(radius * 1.1f, radius * 2), style = Stroke(1f))
        for (row in -12..12) {
            for (col in -12..12) {
                val x = cx + col * radius / 12f
                val y = cy + row * radius / 12f
                val dx = (x - cx) / radius
                val dy = (y - cy) / radius
                if (dx * dx + dy * dy < .9f) drawCircle(Color(0x8842CFFF), 1.15f, Offset(x, y))
            }
        }
        for (i in 0..20) {
            val x = w * i / 20f
            drawCircle(Color(0x332D91FF), 1.1f, Offset(x, h * .96f))
        }
    }
}
