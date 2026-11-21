import { inflateRawSync } from "node:zlib";

export type ApkVersion = { versionName: string; versionCode: number };

function readLength8(buffer: Buffer, offset: number): { value: number; bytes: number } {
  const first = buffer[offset];
  if (first & 0x80) return { value: ((first & 0x7f) << 8) | buffer[offset + 1], bytes: 2 };
  return { value: first, bytes: 1 };
}
function readLength16(buffer: Buffer, offset: number): { value: number; bytes: number } {
  const first = buffer.readUInt16LE(offset);
  if (first & 0x8000) return { value: ((first & 0x7fff) << 16) | buffer.readUInt16LE(offset + 2), bytes: 4 };
  return { value: first, bytes: 2 };
}
function parseStringPool(chunk: Buffer): string[] {
  const count = chunk.readUInt32LE(8);
  const flags = chunk.readUInt32LE(16);
  const stringsStart = chunk.readUInt32LE(20);
  if (count > 100_000 || stringsStart >= chunk.length) throw new Error("APK manifest 字符串池无效");
  const utf8 = (flags & 0x100) !== 0;
  const result: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const relative = chunk.readUInt32LE(28 + i * 4);
    let offset = stringsStart + relative;
    if (offset >= chunk.length) throw new Error("APK manifest 字符串偏移无效");
    if (utf8) {
      const charLength = readLength8(chunk, offset); offset += charLength.bytes;
      const byteLength = readLength8(chunk, offset); offset += byteLength.bytes;
      if (offset + byteLength.value > chunk.length) throw new Error("APK manifest UTF-8 字符串越界");
      result.push(chunk.toString("utf8", offset, offset + byteLength.value));
    } else {
      const length = readLength16(chunk, offset); offset += length.bytes;
      const byteLength = length.value * 2;
      if (offset + byteLength > chunk.length) throw new Error("APK manifest UTF-16 字符串越界");
      result.push(chunk.toString("utf16le", offset, offset + byteLength));
    }
  }
  return result;
}
function parseManifestXml(xml: Buffer): ApkVersion {
  if (xml.length < 8 || xml.readUInt16LE(0) !== 0x0003) throw new Error("APK AndroidManifest.xml 格式无效");
  const totalSize = xml.readUInt32LE(4);
  if (totalSize > xml.length || totalSize < 8) throw new Error("APK AndroidManifest.xml 长度无效");
  let strings: string[] = [];
  let versionName = "";
  let versionCode = 0;
  for (let offset = 8; offset + 8 <= totalSize;) {
    const type = xml.readUInt16LE(offset);
    const headerSize = xml.readUInt16LE(offset + 2);
    const size = xml.readUInt32LE(offset + 4);
    if (size < headerSize || offset + size > totalSize) throw new Error("APK manifest chunk 无效");
    const chunk = xml.subarray(offset, offset + size);
    if (type === 0x0001) {
      strings = parseStringPool(chunk);
    } else if (type === 0x0102 && strings.length > 0 && headerSize >= 16 && size >= 36) {
      const attributeStart = chunk.readUInt16LE(24);
      const attributeSize = chunk.readUInt16LE(26);
      const attributeCount = chunk.readUInt16LE(28);
      if (attributeSize < 20 || attributeCount > 256) throw new Error("APK manifest 属性结构无效");
      const start = 16 + attributeStart;
      for (let i = 0; i < attributeCount; i += 1) {
        const pos = start + i * attributeSize;
        if (pos + 20 > chunk.length) throw new Error("APK manifest 属性越界");
        const nameIndex = chunk.readUInt32LE(pos + 4);
        const rawIndex = chunk.readUInt32LE(pos + 8);
        const valueType = chunk[pos + 15];
        const data = chunk.readUInt32LE(pos + 16);
        const name = strings[nameIndex];
        if (name === "versionName") {
          versionName = rawIndex !== 0xffffffff ? (strings[rawIndex] ?? "") : (valueType === 0x03 ? (strings[data] ?? "") : "");
        } else if (name === "versionCode") {
          versionCode = valueType === 0x03 ? Number(strings[data]) : data;
        }
      }
      if (versionName && versionCode > 0) break;
    }
    offset += size;
  }
  if (!/^\d+\.\d+\.\d+$/.test(versionName) || !Number.isSafeInteger(versionCode) || versionCode < 1) {
    throw new Error("无法从 APK 的 AndroidManifest.xml 读取有效的 versionName/versionCode");
  }
  return { versionName, versionCode };
}

export function readApkVersion(buffer: Buffer): ApkVersion {
  if (buffer.length < 22) throw new Error("APK 文件不完整");
  const minOffset = Math.max(0, buffer.length - 22 - 0xffff);
  let eocd = -1;
  for (let offset = buffer.length - 22; offset >= minOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50 &&
        offset + 22 + buffer.readUInt16LE(offset + 20) === buffer.length) { eocd = offset; break; }
  }
  if (eocd < 0) throw new Error("APK ZIP 目录不存在");
  const entries = buffer.readUInt16LE(eocd + 10);
  const directorySize = buffer.readUInt32LE(eocd + 12);
  const directoryOffset = buffer.readUInt32LE(eocd + 16);
  if (entries > 0xffff || directoryOffset + directorySize > eocd) throw new Error("APK ZIP 目录无效");
  let cursor = directoryOffset;
  for (let i = 0; i < entries; i += 1) {
    if (cursor + 46 > eocd || buffer.readUInt32LE(cursor) !== 0x02014b50) throw new Error("APK ZIP 条目无效");
    const method = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const uncompressedSize = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const name = buffer.toString("utf8", cursor + 46, cursor + 46 + nameLength);
    if (name === "AndroidManifest.xml") {
      if (localOffset + 30 > directoryOffset || buffer.readUInt32LE(localOffset) !== 0x04034b50) throw new Error("APK manifest ZIP 条目无效");
      const localNameLength = buffer.readUInt16LE(localOffset + 26);
      const localExtraLength = buffer.readUInt16LE(localOffset + 28);
      const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
      if (dataOffset + compressedSize > directoryOffset) throw new Error("APK manifest 数据越界");
      const compressed = buffer.subarray(dataOffset, dataOffset + compressedSize);
      let manifest: Buffer;
      if (method === 0) manifest = Buffer.from(compressed);
      else if (method === 8) manifest = inflateRawSync(compressed, { maxOutputLength: 8 * 1024 * 1024 });
      else throw new Error("APK manifest 使用不支持的 ZIP 压缩方式");
      if (manifest.length !== uncompressedSize) throw new Error("APK manifest 解压长度不匹配");
      return parseManifestXml(manifest);
    }
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  throw new Error("APK 中缺少 AndroidManifest.xml");
}
