import { Body, Controller, Get, Param, Patch, Post, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import { AdminAuthService } from "../admin-auth/admin-auth.service";
import { AdminUsersService } from "./admin-users.service";

const COOKIE = "wtp_admin_session";
function adminToken(request: Request): string | undefined {
  const header = request.headers.cookie;
  if (!header) return undefined;
  const item = header.split(";").map((part) => part.trim()).find((part) => part.startsWith(COOKIE + "="));
  return item ? decodeURIComponent(item.slice(COOKIE.length + 1)) : undefined;
}

@Controller("admin/users")
export class AdminUsersController {
  constructor(private readonly auth: AdminAuthService, private readonly users: AdminUsersService) {}
  @Get("summary")
  async summary(@Req() request: Request) {
    await this.auth.getCurrentAdmin(adminToken(request));
    return this.users.summary();
  }
  @Get()
  async list(@Req() request: Request, @Query("search") search?: string, @Query("status") status?: string, @Query("page") page?: string, @Query("pageSize") pageSize?: string) {
    await this.auth.getCurrentAdmin(adminToken(request));
    return this.users.list(search, status, page, pageSize);
  }
  @Get(":id/detail")
  async detail(@Req() request: Request, @Param("id") id: string) {
    await this.auth.getCurrentAdmin(adminToken(request));
    return this.users.detail(id);
  }
  @Patch(":id/policy")
  async updatePolicy(@Req() request: Request, @Param("id") id: string, @Body() body: { dailyTaskLimit?: number | null; minClaimIntervalSeconds?: number | null }) {
    await this.auth.getCurrentAdmin(adminToken(request));
    return this.users.updatePolicy(id, body);
  }
  @Post(":id/reputation")
  async adjustReputation(@Req() request: Request, @Param("id") id: string, @Body() body: { amount: number; reason: string }) {
    const admin = await this.auth.getCurrentAdmin(adminToken(request));
    return this.users.adjustReputation(id, admin.id, body);
  }
  @Patch(":id/profile")
  async updateProfile(@Req() request: Request, @Param("id") id: string, @Body() body: { displayName?: string | null }) {
    const admin = await this.auth.getCurrentAdmin(adminToken(request));
    return this.users.updateProfile(id, body.displayName ?? null);
  }
  @Patch(":id/status")
  async setStatus(@Req() request: Request, @Param("id") id: string, @Body() body: { status: string }) {
    await this.auth.getCurrentAdmin(adminToken(request));
    return this.users.setStatus(id, body.status);
  }
  @Post(":id/reset-password")
  async resetPassword(@Req() request: Request, @Param("id") id: string) {
    await this.auth.getCurrentAdmin(adminToken(request));
    return this.users.resetPassword(id);
  }
}
