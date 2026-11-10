import { Controller, Get, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import { AdminAuthService } from "../admin-auth/admin-auth.service";
import { ReportsService } from "./reports.service";
const COOKIE = "wtp_admin_session";
function adminToken(request: Request): string | undefined {
  const header = request.headers.cookie;
  if (!header) return undefined;
  const item = header.split(";").map(part => part.trim()).find(part => part.startsWith(COOKIE + "="));
  return item ? decodeURIComponent(item.slice(COOKIE.length + 1)) : undefined;
}
@Controller("admin/reports")
export class ReportsController {
  constructor(private readonly auth: AdminAuthService, private readonly reports: ReportsService) {}
  @Get("summary")
  async summary(@Req() request: Request, @Query() query: Record<string, string>) {
    await this.auth.getCurrentAdmin(adminToken(request));
    return this.reports.summary(query);
  }
}
