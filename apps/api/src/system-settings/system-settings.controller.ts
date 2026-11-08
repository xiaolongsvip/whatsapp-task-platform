import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Req, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Request } from "express";
import { createHash } from "node:crypto";
import { AdminAuthService } from "../admin-auth/admin-auth.service";
import { SystemSettingsService } from "./system-settings.service";
import { S3ObjectStorageService } from "../tasks/s3-object-storage.service";

const COOKIE = "wtp_admin_session";
function token(req: Request): string | undefined {
  const item = req.headers.cookie?.split(";").map(x => x.trim()).find(x => x.startsWith(COOKIE + "="));
  return item ? decodeURIComponent(item.slice(COOKIE.length + 1)) : undefined;
}

@Controller("admin/system-settings")
export class SystemSettingsController {
  constructor(private readonly auth: AdminAuthService, private readonly settings: SystemSettingsService, private readonly objectStorage: S3ObjectStorageService) {}
  private async admin(req: Request) { return this.auth.getCurrentAdmin(token(req)); }

  @Get()
  async getAll(@Req() req: Request) { await this.admin(req); return this.settings.getAll(); }
  @Put("account-security")
  async saveAccountSecurity(@Req() req: Request, @Body() body: Record<string, unknown>) { const a = await this.admin(req); return this.settings.saveConfig("system.accountSecurity", body, a.id); }
  @Put("support")
  async saveSupport(@Req() req: Request, @Body() body: Record<string, unknown>) { const a = await this.admin(req); return this.settings.saveSupport(body, a.id); }
  @Put("version")
  async saveVersion(@Req() req: Request, @Body() body: Record<string, unknown>) { const a = await this.admin(req); return this.settings.saveVersion(body, a.id); }
  @Post("version/upload")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 100 * 1024 * 1024 } }))
  async uploadApk(@Req() req: Request, @UploadedFile() file?: { originalname: string; mimetype: string; size: number; buffer: Buffer }) {
    const a = await this.admin(req);
    if (!file || !file.originalname.toLowerCase().endsWith(".apk") || file.buffer.length < 4 || file.buffer[0] !== 0x50 || file.buffer[1] !== 0x4b) throw new BadRequestException("上传文件不是有效的 APK/ZIP 文件");
    const base = process.env.APP_DOWNLOAD_BASE_URL?.trim().replace(/\/+$/, "");
    if (!base || !base.startsWith("https://")) throw new BadRequestException("请先在 API 环境配置 HTTPS 的 APP_DOWNLOAD_BASE_URL 公共下载域名");
    const key = "app-updates/" + Date.now() + "-" + file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    await this.objectStorage.putObject(key, file.buffer, "application/vnd.android.package-archive");
    const downloadUrl = base + "/" + key;
    const sha256 = createHash("sha256").update(file.buffer).digest("hex");
    return this.settings.registerApkUpload({ fileName: file.originalname, size: file.size, downloadUrl, objectKey: key, sha256 }, a.id);
  }
  @Post("version/:versionCode/publish")
  async publishVersion(@Req() req: Request, @Param("versionCode") versionCode: string) { const a = await this.admin(req); return this.settings.versionAction(Number(versionCode), "PUBLISH", a.id); }
  @Post("version/:versionCode/revoke")
  async revokeVersion(@Req() req: Request, @Param("versionCode") versionCode: string) { const a = await this.admin(req); return this.settings.versionAction(Number(versionCode), "REVOKE", a.id); }
  @Post("help/assets/upload-url")
  async createHelpAssetUploadUrl(@Req() req: Request, @Body() body: { fileName: string; contentType: string; size: number }) {
    const admin = await this.admin(req);
    const fileName = String(body.fileName ?? "").trim();
    const contentType = String(body.contentType ?? "").toLowerCase();
    const size = Number(body.size);
    const isVideo = contentType === "video/mp4" && fileName.toLowerCase().endsWith(".mp4");
    const isImage = ["image/jpeg", "image/png", "image/webp"].includes(contentType);
    if (!fileName || (!isVideo && !isImage) || !Number.isSafeInteger(size) || size < 1 || size > (isVideo ? 1024 * 1024 * 1024 : 20 * 1024 * 1024)) {
      throw new BadRequestException("仅支持不超过 1GB 的 MP4 视频或不超过 20MB 的 JPG/PNG/WebP 图片。");
    }
    const base = process.env.HELP_ASSET_PUBLIC_BASE_URL?.trim().replace(/\/+$/, "");
    if (!base || !base.startsWith("https://")) throw new BadRequestException("请配置 HTTPS 的 HELP_ASSET_PUBLIC_BASE_URL 公共资源域名。");
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const key = "help-assets/" + Date.now() + "-" + safeName;
    const uploadUrl = await this.objectStorage.createPresignedPutUrl(key, 3600);
    await this.settings.recordHelpAssetUpload(admin.id, key, safeName, contentType, size);
    return { uploadUrl, assetUrl: base + "/" + key, key, expiresInSeconds: 3600 };
  }
  @Post("help/assets/verify")
  async verifyHelpAsset(@Req() req: Request, @Body() body: { assetUrl: string; key: string }) {
    await this.admin(req);
    const baseValue = process.env.HELP_ASSET_PUBLIC_BASE_URL?.trim().replace(/\/+$/, "");
    if (!baseValue || !baseValue.startsWith("https://")) throw new BadRequestException("帮助资源公共域名尚未配置。");
    const key = String(body.key ?? "").trim();
    const assetUrl = String(body.assetUrl ?? "").trim();
    if (!/^help-assets\/[a-zA-Z0-9._/-]+$/.test(key) || key.includes("..")) throw new BadRequestException("帮助资源对象路径无效。");
    let base: URL, target: URL;
    try { base = new URL(baseValue); target = new URL(assetUrl); }
    catch { throw new BadRequestException("帮助资源公开地址无效。"); }
    const expectedUrl = baseValue + "/" + key;
    if (target.origin !== base.origin || target.toString().replace(/\/$/, "") !== expectedUrl) {
      throw new BadRequestException("帮助资源地址与服务器配置的公共域名不匹配。");
    }
    let response: Response;
    try {
      response = await fetch(target, { method: "HEAD", redirect: "error", signal: AbortSignal.timeout(12000) });
    } catch {
      throw new BadRequestException("文件已上传到存储桶，但公共资源域名无法连接。请检查 R2 自定义域名和 DNS 配置。");
    }
    if (!response.ok) {
      throw new BadRequestException(`文件已上传，但公开资源地址返回 HTTP ${response.status}。请检查 R2 公共域名、对象路径和访问权限，避免文章出现 404。`);
    }
    return { success: true, assetUrl: expectedUrl, statusCode: response.status };
  }
  @Get("help/articles")
  async articles(@Req() req: Request, @Query() q: Record<string,string>) { await this.admin(req); return this.settings.listArticles(q); }
  @Post("help/articles")
  async createArticle(@Req() req: Request, @Body() body: Record<string, unknown>) { const a = await this.admin(req); return this.settings.saveArticle(null, body, a.id); }
  @Patch("help/articles/:id")
  async updateArticle(@Req() req: Request, @Param("id") id: string, @Body() body: Record<string, unknown>) { const a = await this.admin(req); return this.settings.saveArticle(id, body, a.id); }
  @Post("help/articles/:id/publish")
  async publishArticle(@Req() req: Request, @Param("id") id: string) { const a = await this.admin(req); return this.settings.articleAction(id, "PUBLISH", a.id); }
  @Post("help/articles/:id/pin")
  async pinArticle(@Req() req: Request, @Param("id") id: string) { const a = await this.admin(req); return this.settings.articleAction(id, "PIN", a.id); }
  @Post("help/articles/:id/restore")
  async restoreArticle(@Req() req: Request, @Param("id") id: string) { const a = await this.admin(req); return this.settings.articleAction(id, "RESTORE", a.id); }
  @Delete("help/articles/:id/permanent")
  async permanentlyDeleteArticle(@Req() req: Request, @Param("id") id: string) { const a = await this.admin(req); return this.settings.articleAction(id, "DELETE_PERMANENT", a.id); }
  @Delete("help/articles/:id")
  async deleteArticle(@Req() req: Request, @Param("id") id: string) { const a = await this.admin(req); return this.settings.articleAction(id, "TRASH", a.id); }
  @Get("withdrawal-rules")
  async withdrawalRules(@Req() req: Request, @Query() q: Record<string,string>) { await this.admin(req); return this.settings.listWithdrawalRules(q); }
  @Post("withdrawal-rules")
  async createWithdrawalRule(@Req() req: Request, @Body() body: Record<string, unknown>) { const a = await this.admin(req); return this.settings.saveWithdrawalRule(null, body, a.id); }
  @Patch("withdrawal-rules/:id")
  async updateWithdrawalRule(@Req() req: Request, @Param("id") id: string, @Body() body: Record<string, unknown>) { const a = await this.admin(req); return this.settings.saveWithdrawalRule(id, body, a.id); }
  @Post("withdrawal-rules/:id/toggle")
  async toggleWithdrawalRule(@Req() req: Request, @Param("id") id: string) { const a = await this.admin(req); return this.settings.toggleWithdrawalRule(id, a.id); }
  @Post("withdrawal-rules/:id/duplicate")
  async duplicateWithdrawalRule(@Req() req: Request, @Param("id") id: string) { const a = await this.admin(req); return this.settings.duplicateWithdrawalRule(id, a.id); }
  @Get("risk")
  async risk(@Req() req: Request) { await this.admin(req); return this.settings.getConfig("system.riskSettings"); }
  @Put("risk")
  async saveRisk(@Req() req: Request, @Body() body: Record<string, unknown>) { const a = await this.admin(req); return this.settings.saveConfig("system.riskSettings", body, a.id); }
  @Get("audit-logs")
  async auditLogs(@Req() req: Request, @Query() q: Record<string,string>) { await this.admin(req); return this.settings.auditLogs(q); }
  @Get("audit-logs/:id")
  async auditLogDetail(@Req() req: Request, @Param("id") id: string) { await this.admin(req); return this.settings.auditLogDetail(id); }
}
