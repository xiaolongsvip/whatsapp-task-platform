package com.wtp.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import com.wtp.app.data.AuthRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@Composable
fun AuthScreen(onAuthenticated: (String) -> Unit) {
    val scope = rememberCoroutineScope()
    var isRegister by remember { mutableStateOf(false) }
    var callingCode by remember { mutableStateOf("+1") }
    var localPhone by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var confirmPassword by remember { mutableStateOf("") }
    var inviteCode by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf("") }

    Column(
        modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 24.dp, vertical = 28.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        Text("TASK PLATFORM", color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        Text(if (isRegister) "创建账户" else "欢迎回来", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
        Text(
            if (isRegister) "使用手机号注册，注册后可与网页版共用同一账户。"
            else "使用已注册的手机号和密码登录。",
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )

        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
            OutlinedButton(onClick = { isRegister = false; error = "" }, modifier = Modifier.weight(1f), enabled = !busy) { Text("登录") }
            OutlinedButton(onClick = { isRegister = true; error = "" }, modifier = Modifier.weight(1f), enabled = !busy) { Text("注册") }
        }

        OutlinedTextField(
            value = callingCode,
            onValueChange = { value -> callingCode = "+" + value.filter(Char::isDigit).take(4) },
            label = { Text("国家区号") },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
            singleLine = true,
            modifier = Modifier.fillMaxWidth()
        )
        OutlinedTextField(
            value = localPhone,
            onValueChange = { localPhone = it.filter(Char::isDigit).take(15) },
            label = { Text("手机号码") },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
            singleLine = true,
            modifier = Modifier.fillMaxWidth()
        )
        OutlinedTextField(
            value = password,
            onValueChange = { password = it },
            label = { Text("密码（至少 6 位）") },
            visualTransformation = PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
            singleLine = true,
            modifier = Modifier.fillMaxWidth()
        )

        if (isRegister) {
            OutlinedTextField(
                value = confirmPassword,
                onValueChange = { confirmPassword = it },
                label = { Text("确认密码") },
                visualTransformation = PasswordVisualTransformation(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                singleLine = true,
                modifier = Modifier.fillMaxWidth()
            )
            OutlinedTextField(
                value = inviteCode,
                onValueChange = { inviteCode = it.take(32) },
                label = { Text("邀请码（选填）") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth()
            )
        }

        if (error.isNotBlank()) {
            Text(error, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium)
        }

        Button(
            onClick = {
                error = ""
                val fullPhone = (callingCode + localPhone).filter(Char::isDigit)
                when {
                    callingCode == "+" -> error = "请输入国家区号。"
                    fullPhone.length !in 8..15 -> error = "请输入有效的国际手机号码（含国家区号）。"
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
                        } finally {
                            busy = false
                        }
                    }
                }
            },
            enabled = !busy,
            modifier = Modifier.fillMaxWidth()
        ) {
            if (busy) CircularProgressIndicator()
            else Text(if (isRegister) "创建账户" else "登录")
        }

        TextButton(onClick = { isRegister = !isRegister; error = "" }, enabled = !busy, modifier = Modifier.fillMaxWidth()) {
            Text(if (isRegister) "已有账户？返回登录" else "还没有账户？立即注册")
        }
        Spacer(Modifier.height(12.dp))
        Text("账户由平台统一管理。请勿向他人透露密码。", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
    }
}
