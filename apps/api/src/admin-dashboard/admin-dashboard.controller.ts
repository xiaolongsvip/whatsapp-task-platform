import { Controller, Get, Req } from "@nestjs/common";
import type { Request } from "express";
import { AdminAuthService } from "../admin-auth/admin-auth.service";
import { AdminDashboardService } from "./admin-dashboard.service";
const COOKIE = "wtp_admin_session";
function adminToken(request: Request): string | undefined {
  const header = request.headers.cookie;
  if (!header) return undefined;
  const item = header.split(";").map((part) => part.trim()).find((part) => part.startsWith(COOKIE + "="));
  return item ? decodeURIComponent(item.slice(COOKIE.length + 1)) : undefined;
}
@Controller("admin/dashboard")
export class AdminDashboardController {
  constructor(private readonly auth: AdminAuthService, private readonly dashboard: AdminDashboardService) {}
  @Get("summary")
  async summary(@Req() request: Request) {
    await this.auth.getCurrentAdmin(adminToken(request));
    return this.dashboard.summary();
  }
}