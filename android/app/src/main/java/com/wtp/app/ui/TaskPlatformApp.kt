package com.wtp.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountCircle
import androidx.compose.material.icons.filled.Assignment
import androidx.compose.material.icons.filled.Group
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Wallet
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.wtp.app.data.AuthRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

private data class NavItem(val label: String, val icon: androidx.compose.ui.graphics.vector.ImageVector)

private val navItems = listOf(
    NavItem("首页", Icons.Default.Home),
    NavItem("任务", Icons.Default.Assignment),
    NavItem("推广", Icons.Default.Group),
    NavItem("钱包", Icons.Default.Wallet),
    NavItem("我的", Icons.Default.AccountCircle)
)

@Composable
fun TaskPlatformApp() {
    var checkingSession by remember { mutableStateOf(true) }
    var authenticated by rememberSaveable { mutableStateOf(false) }
    var accountPhone by rememberSaveable { mutableStateOf("") }

    LaunchedEffect(Unit) {
        try {
            val user = withContext(Dispatchers.IO) { AuthRepository.currentUser() }
            accountPhone = user.optString("phone")
            authenticated = true
        } catch (_: Exception) {
            authenticated = false
        } finally {
            checkingSession = false
        }
    }

    when {
        checkingSession -> Column(
            modifier = Modifier.fillMaxSize(),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            CircularProgressIndicator()
            Text("正在检查登录状态…", modifier = Modifier.padding(top = 12.dp))
        }
        !authenticated -> AuthScreen { phone ->
            accountPhone = phone
            authenticated = true
        }
        else -> MemberShell(
            phone = accountPhone,
            onLogout = {
                authenticated = false
                accountPhone = ""
            }
        )
    }
}

@Composable
private fun MemberShell(phone: String, onLogout: () -> Unit) {
    val scope = rememberCoroutineScope()
    var selectedTab by rememberSaveable { mutableIntStateOf(0) }

    Scaffold(
        bottomBar = {
            NavigationBar {
                navItems.forEachIndexed { index, item ->
                    NavigationBarItem(
                        selected = selectedTab == index,
                        onClick = { selectedTab = index },
                        icon = { Icon(item.icon, contentDescription = item.label) },
                        label = { Text(item.label) }
                    )
                }
            }
        }
    ) { innerPadding ->
        Column(
            modifier = Modifier.fillMaxSize().padding(innerPadding).padding(horizontal = 18.dp, vertical = 14.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("TASK PLATFORM", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                Text(navItems[selectedTab].label, color = MaterialTheme.colorScheme.primary)
            }

            when (selectedTab) {
                0 -> HomeScreen()
                1 -> PlaceholderScreen("任务大厅", "任务数据将在后续模块接入现有平台 API。")
                2 -> PlaceholderScreen("推广中心", "推广关系和奖励数据将在后续模块接入现有平台 API。")
                3 -> PlaceholderScreen("钱包", "余额和账单将在后续模块读取服务端真实账本。")
                else -> AccountScreen(phone) {
                    scope.launch {
                        withContext(Dispatchers.IO) { runCatching { AuthRepository.logout() } }
                        onLogout()
                    }
                }
            }
        }
    }
}

@Composable
private fun HomeScreen() {
    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Text("欢迎使用任务平台", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
        Text("你已通过平台账户登录。网页端与 Android APP 使用同一账户体系。", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Card(
            shape = RoundedCornerShape(18.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)
        ) {
            Column(Modifier.padding(18.dp)) {
                Text("设备权限", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                Spacer(Modifier.height(6.dp))
                Text("悬浮窗和屏幕捕获权限尚未申请。后续将由你主动点击并确认 Android 系统授权。", style = MaterialTheme.typography.bodyMedium)
            }
        }
        Card(shape = RoundedCornerShape(18.dp)) {
            Column(Modifier.padding(18.dp)) {
                Text("账户连接", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                Spacer(Modifier.height(6.dp))
                Text("登录与注册使用平台现有 API，不会创建独立的 APP 账户。")
            }
        }
    }
}

@Composable
private fun AccountScreen(phone: String, onLogout: () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("我的账户", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
        Text("登录手机号：$phone")
        Button(onClick = onLogout, modifier = Modifier.fillMaxWidth()) { Text("退出登录") }
    }
}

@Composable
private fun PlaceholderScreen(title: String, description: String) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(title, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
        Text(description, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}
