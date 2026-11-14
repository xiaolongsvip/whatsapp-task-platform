package com.wtp.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.DoneAll
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.wtp.app.data.AuthRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject

@Composable
fun MemberNotificationsScreen(
    modifier: Modifier = Modifier,
    language: String,
    onBack: () -> Unit,
) {
    val en = language == "en"
    val scope = rememberCoroutineScope()
    var items by remember { mutableStateOf(emptyList<JSONObject>()) }
    var unreadCount by remember { mutableStateOf(0) }
    var cursor by remember { mutableStateOf<Pair<String, String>?>(null) }
    var hasMore by remember { mutableStateOf(false) }
    var loading by remember { mutableStateOf(true) }
    var loadingMore by remember { mutableStateOf(false) }
    var markingAll by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var message by remember { mutableStateOf<String?>(null) }

    fun load(reset: Boolean) {
        if (loadingMore || (loading && !reset)) return
        scope.launch {
            if (reset) {
                loading = true
                error = null
                message = null
            } else {
                loadingMore = true
                message = null
            }
            val before = if (reset) null else cursor
            runCatching {
                withContext(Dispatchers.IO) {
                    AuthRepository.notifications(30, before?.first, before?.second)
                }
            }.onSuccess { result ->
                val incoming = result.optJSONArray("items").asNotificationList()
                val known = if (reset) mutableSetOf() else items.map { it.optString("id") }.toMutableSet()
                items = if (reset) incoming else items + incoming.filter { known.add(it.optString("id")) }
                unreadCount = result.optInt("unreadCount", unreadCount)
                hasMore = result.optBoolean("hasMore", false)
                val next = result.optJSONObject("nextCursor")
                val publishedAt = next?.optString("publishedAt").orEmpty()
                val id = next?.optString("id").orEmpty()
                cursor = if (publishedAt.isNotBlank() && id.isNotBlank()) publishedAt to id else null
            }.onFailure {
                error = it.message ?: if (en) "Could not load notifications." else "通知加载失败。"
            }
            loading = false
            loadingMore = false
        }
    }

    fun markRead(id: String) {
        if (id.isBlank()) return
        scope.launch {
            message = null
            runCatching { withContext(Dispatchers.IO) { AuthRepository.markNotificationRead(id) } }
                .onSuccess { result ->
                    val readAt = result.optString("readAt")
                    var changed = false
                    items = items.map { item ->
                        if (item.optString("id") == id && !item.optBoolean("isRead")) {
                            changed = true
                            JSONObject(item.toString())
                                .put("isRead", true)
                                .put("readAt", readAt)
                        } else item
                    }
                    if (changed) unreadCount = (unreadCount - 1).coerceAtLeast(0)
                }
                .onFailure { message = it.message ?: if (en) "Could not mark this notification as read." else "标记已读失败。" }
        }
    }

    fun markAllRead() {
        if (unreadCount == 0 || markingAll) return
        scope.launch {
            markingAll = true
            message = null
            runCatching { withContext(Dispatchers.IO) { AuthRepository.markAllNotificationsRead() } }
                .onSuccess {
                    items = items.map { item ->
                        if (item.optBoolean("isRead")) item
                        else JSONObject(item.toString()).put("isRead", true)
                    }
                    unreadCount = 0
                    message = if (en) "All notifications marked as read." else "所有通知已标记为已读。"
                }
                .onFailure { message = it.message ?: if (en) "Could not mark all as read." else "全部标记已读失败。" }
            markingAll = false
        }
    }

    LaunchedEffect(Unit) { load(reset = true) }

    Column(modifier.fillMaxSize().background(Color(0xFFF2F5F8))) {
        Row(
            Modifier.fillMaxWidth().background(Color.White).padding(horizontal = 12.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = onBack) {
                Icon(Icons.Default.ArrowBack, contentDescription = if (en) "Back" else "返回", tint = Color(0xFF123E56))
            }
            Icon(Icons.Default.Notifications, contentDescription = null, tint = Color(0xFF258BB8))
            Spacer(Modifier.width(9.dp))
            Column(Modifier.weight(1f)) {
                Text(if (en) "Notifications" else "通知中心", color = Color(0xFF17243A), fontWeight = FontWeight.Bold)
                Text(
                    if (en) "$unreadCount unread" else "$unreadCount 条未读",
                    color = Color(0xFF718096),
                    style = androidx.compose.material3.MaterialTheme.typography.labelSmall,
                )
            }
            if (unreadCount > 0) {
                TextButton(onClick = { markAllRead() }, enabled = !markingAll) {
                    if (markingAll) CircularProgressIndicator(Modifier.width(16.dp).height(16.dp), strokeWidth = 2.dp)
                    else {
                        Icon(Icons.Default.DoneAll, contentDescription = null)
                        Spacer(Modifier.width(4.dp))
                        Text(if (en) "Read all" else "全部已读")
                    }
                }
            }
        }

        if (message != null) {
            Text(message.orEmpty(), color = Color(0xFF25845A), modifier = Modifier.padding(horizontal = 14.dp, vertical = 8.dp))
        }
        if (loading) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Color(0xFF319CCB)) }
        } else if (error != null && items.isEmpty()) {
            Column(Modifier.fillMaxWidth().padding(18.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Text(error.orEmpty(), color = Color(0xFFB42318))
                TextButton(onClick = { load(reset = true) }) { Text(if (en) "Retry" else "重试") }
            }
        } else if (items.isEmpty()) {
            Box(Modifier.fillMaxSize().padding(24.dp), contentAlignment = Alignment.Center) {
                Text(if (en) "No notifications yet." else "暂时没有通知。", color = Color(0xFF718096))
            }
        } else {
            Column(
                Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 12.dp, vertical = 10.dp),
                verticalArrangement = Arrangement.spacedBy(9.dp),
            ) {
                items.forEach { item ->
                    val id = item.optString("id")
                    val isRead = item.optBoolean("isRead")
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        colors = CardDefaults.cardColors(containerColor = Color.White),
                        shape = RoundedCornerShape(14.dp),
                    ) {
                        Column(Modifier.fillMaxWidth().padding(14.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(
                                    item.optString("title"),
                                    modifier = Modifier.weight(1f),
                                    color = Color(0xFF17243A),
                                    fontWeight = FontWeight.Bold,
                                )
                                Text(
                                    if (isRead) { if (en) "Read" else "已读" } else { if (en) "Unread" else "未读" },
                                    color = if (isRead) Color(0xFF718096) else Color(0xFF1C8AC0),
                                    style = androidx.compose.material3.MaterialTheme.typography.labelSmall,
                                )
                            }
                            Spacer(Modifier.height(7.dp))
                            Text(item.optString("content"), color = Color(0xFF53647C), style = androidx.compose.material3.MaterialTheme.typography.bodyMedium)
                            Spacer(Modifier.height(8.dp))
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(
                                    item.optString("publishedAt").replace("T", " ").take(16),
                                    modifier = Modifier.weight(1f),
                                    color = Color(0xFF8492A6),
                                    style = androidx.compose.material3.MaterialTheme.typography.labelSmall,
                                )
                                if (!isRead) {
                                    OutlinedButton(
                                        onClick = { markRead(id) },
                                        shape = RoundedCornerShape(8.dp),
                                    ) { Text(if (en) "Mark read" else "标记已读") }
                                }
                            }
                        }
                    }
                }
                if (error != null) Text(error.orEmpty(), color = Color(0xFFB42318))
                if (hasMore) {
                    Button(
                        onClick = { load(reset = false) },
                        enabled = !loadingMore,
                        modifier = Modifier.fillMaxWidth(),
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF258BB8)),
                    ) {
                        if (loadingMore) CircularProgressIndicator(Modifier.width(18.dp).height(18.dp), color = Color.White, strokeWidth = 2.dp)
                        else Text(if (en) "Load more" else "加载更多")
                    }
                }
            }
        }
    }
}

private fun JSONArray?.asNotificationList(): List<JSONObject> {
    if (this == null) return emptyList()
    return (0 until length()).mapNotNull { optJSONObject(it) }
}
