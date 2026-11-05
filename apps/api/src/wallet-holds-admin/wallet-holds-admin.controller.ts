import { Body, Controller, Get, Param, Post, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import { AdminAuthService } from "../admin-auth/admin-auth.service";
import { WalletHoldsAdminService } from "./wallet-holds-admin.service";

const COOKIE = "wtp_admin_session";
function sessionToken(request: Request): string | undefined {
  const header = request.headers.cookie;
  if (!header) return undefined;
  const item = header.split(";").map((v) => v.trim()).find((v) => v.startsWith(COOKIE + "="));
  return item ? decodeURIComponent(item.slice(COOKIE.length + 1)) : undefined;
}

@Controller("admin/wallet-holds")
export class WalletHoldsAdminController {
  constructor(private readonly auth: AdminAuthService, private readonly holds: WalletHoldsAdminService) {}

  @Get()
  async list(@Req() req: Request, @Query("walletId") walletId?: string, @Query("status") status?: string, @Query("page") page?: string, @Query("pageSize") pageSize?: string) {
    await this.auth.getCurrentAdmin(sessionToken(req));
    return this.holds.list(walletId, status, Number.parseInt(page || "1", 10) || 1, Number.parseInt(pageSize || "20", 10) || 20);
  }

  @Post()
  async freeze(@Req() req: Request, @Body() body: { walletId: string; amountMinor: string; reason: string; idempotencyKey: string; referenceType?: string; referenceId?: string }) {
    const admin = await this.auth.getCurrentAdmin(sessionToken(req));
    return this.holds.freeze(body, admin.id);
  }

  @Post(":id/release")
  async release(@Req() req: Request, @Param("id") id: string, @Body() body: { reason: string; idempotencyKey: string }) {
    const admin = await this.auth.getCurrentAdmin(sessionToken(req));
    return this.holds.resolve(id, "RELEASE", body.reason, body.idempotencyKey, admin.id);
  }

  @Post(":id/capture")
  async capture(@Req() req: Request, @Param("id") id: string, @Body() body: { reason: string; idempotencyKey: string }) {
    const admin = await this.auth.getCurrentAdmin(sessionToken(req));
    return this.holds.resolve(id, "CAPTURE", body.reason, body.idempotencyKey, admin.id);
  }
}
