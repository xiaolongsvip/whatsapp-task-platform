import { Body, Controller, Get, Patch, Req } from "@nestjs/common";
import type { Request } from "express";
import { AuthService } from "../auth/auth.service";
import { UpdateProfileDto } from "./update-profile.dto";
import { DashboardService } from "./dashboard.service";

function sessionToken(request: Request): string | undefined {
  const header = request.headers.cookie;
  if (!header) return undefined;
  const item = header.split(";").map((part) => part.trim()).find((part) => part.startsWith("wtp_session="));
  return item ? decodeURIComponent(item.slice("wtp_session=".length)) : undefined;
}

@Controller("users")
export class UsersController {
  constructor(private readonly auth: AuthService, private readonly dashboard: DashboardService) {}

  @Get("dashboard")
  async getDashboard(@Req() request: Request) {
    const user = await this.auth.getCurrentUser(sessionToken(request));
    return this.dashboard.getSummary(user.id, user.profile?.timezone ?? "UTC");
  }

  @Get("withdrawals")
  async getWithdrawals(@Req() request: Request) {
    const user = await this.auth.getCurrentUser(sessionToken(request));
    return this.dashboard.getWithdrawalHistory(user.id);
  }

  @Get("promotion")
  async getPromotion(@Req() request: Request) {
    const user = await this.auth.getCurrentUser(sessionToken(request));
    return this.dashboard.getPromotionSummary(user.id, user.profile?.timezone ?? "UTC");
  }

  @Get("me")
  getMe(@Req() request: Request) {
    return this.auth.getCurrentUser(sessionToken(request));
  }

  @Patch("me")
  updateMe(@Req() request: Request, @Body() body: UpdateProfileDto) {
    return this.auth.updateProfile(sessionToken(request), body);
  }
}
