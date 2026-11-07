import { Body, Controller, Get, Patch, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import { AdminAuthService } from "../admin-auth/admin-auth.service";
import { AdminReferralsService } from "./admin-referrals.service";

const COOKIE = "wtp_admin_session";
function sessionToken(request: Request): string | undefined {
  const header = request.headers.cookie;
  if (!header) return undefined;
  const item = header.split(";").map((part) => part.trim()).find((part) => part.startsWith(COOKIE + "="));
  return item ? decodeURIComponent(item.slice(COOKIE.length + 1)) : undefined;
}

@Controller("admin/referrals")
export class AdminReferralsController {
  constructor(private readonly auth: AdminAuthService, private readonly referrals: AdminReferralsService) {}
  @Get("invites")
  async invites(@Req() req: Request, @Query("search") search?: string, @Query("status") status?: string, @Query("page") page?: string, @Query("pageSize") pageSize?: string) {
    await this.auth.getCurrentAdmin(sessionToken(req));
    return this.referrals.listInvites(search, status, page, pageSize);
  }
  @Get("relations")
  async relations(@Req() req: Request, @Query("userId") userId?: string) {
    await this.auth.getCurrentAdmin(sessionToken(req));
    if (!userId) return { items: [] };
    return this.referrals.relation(userId);
  }
  @Get("commissions")
  async commissions(@Req() req: Request, @Query("search") search?: string, @Query("status") status?: string, @Query("depth") depth?: string, @Query("from") from?: string, @Query("to") to?: string, @Query("page") page?: string, @Query("pageSize") pageSize?: string) {
    await this.auth.getCurrentAdmin(sessionToken(req));
    return this.referrals.listCommissions(search, status, depth, from, to, page, pageSize);
  }
  @Get("settings")
  async settings(@Req() req: Request) {
    await this.auth.getCurrentAdmin(sessionToken(req));
    return this.referrals.getSettings();
  }
  @Patch("settings")
  async updateSettings(@Req() req: Request, @Body() body: { enabled?: boolean; level1?: number; level2?: number; level3?: number }) {
    const admin = await this.auth.getCurrentAdmin(sessionToken(req));
    return this.referrals.updateSettings(body, admin.id);
  }
}
