import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import { AdminAuthService } from "../admin-auth/admin-auth.service";
import { SystemSettingsService } from "./system-settings.service";

const COOKIE = "wtp_admin_session";
function token(req: Request): string | undefined {
  const item = req.headers.cookie?.split(";").map(x => x.trim()).find(x => x.startsWith(COOKIE + "="));
  return item ? decodeURIComponent(item.slice(COOKIE.length + 1)) : undefined;
}

@Controller("admin/system-settings")
export class SystemSettingsController {
  constructor(private readonly auth: AdminAuthService, private readonly settings: SystemSettingsService) {}
  private async admin(req: Request) { return this.auth.getCurrentAdmin(token(req)); }

  @Get()
  async getAll(@Req() req: Request) { await this.admin(req); return this.settings.getAll(); }
  @Put("account-security")
  async saveAccountSecurity(@Req() req: Request, @Body() body: Record<string, unknown>) { const a = await this.admin(req); return this.settings.saveConfig("system.accountSecurity", body, a.id); }
  @Put("version")
  async saveVersion(@Req() req: Request, @Body() body: Record<string, unknown>) { const a = await this.admin(req); return this.settings.saveVersion(body, a.id); }
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
