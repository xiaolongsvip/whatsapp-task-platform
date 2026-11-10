from pathlib import Path
from datetime import datetime
import runpy
import sys

script = Path("fix_task_countdown.py")
namespace = runpy.run_path(str(script))

file = namespace["file"]
source = namespace["source"]

# 读取原始字节，保留原文件换行格式
original_bytes = file.read_bytes()
newline = b"\r\n" if b"\r\n" in original_bytes else b"\n"

# 备份原始文件
stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
backup = file.with_name(file.name + ".bak_expiry_fix_" + stamp)
backup.write_bytes(original_bytes)

# 恢复原始换行格式后写入
output = source.replace("\r\n", "\n").replace("\n", newline.decode("ascii"))
file.write_bytes(output.encode("utf-8"))

# 写入后检查关键代码
written = file.read_text(encoding="utf-8")

required = [
    "onCountdownExpired: () -> Unit",
    "var expiryNotified by remember(expiryMillis)",
    'var countdownExpired by remember(claim.optString("id"))',
    "onExpired()",
    "onCountdownExpired = { refresh() }",
    "!countdownExpired && phone.isNotBlank()",
]

missing = [item for item in required if item not in written]
if missing:
    file.write_bytes(original_bytes)
    raise RuntimeError("写入后检查失败，已自动恢复原文件：" + repr(missing))

print("SOURCE_WRITE_SUCCESS")
print("BACKUP_PATH=" + str(backup.resolve()))
