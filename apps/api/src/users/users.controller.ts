import { Body, Controller, Delete, Get, Param, Patch, Post, Req } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { ChangePasswordDto } from "./change-password.dto";
import type { Request } from "express";
import { AuthService } from "../auth/auth.service";
import { UpdateProfileDto } from "./update-profile.dto";
import { DashboardService } from "./dashboard.service";
import { PayoutAccountsService } from "./payout-accounts.service";
import { CreatePayoutAccountDto } from "./create-payout-account.dto";
import { CreateWithdrawalDto } from "./create-withdrawal.dto";
import { WithdrawalsService } from "./withdrawals.service";

function sessionToken(request: Request): string | undefined {
  const header = request.headers.cookie;
  if (!header) return undefined;
  const item = header.split(";").map((part) => part.trim()).find((part) => part.startsWith("wtp_session="));
  return item ? decodeURIComponent(item.slice("wtp_session=".length)) : undefined;
}

@Controller("users")
export class UsersController {
  constructor(private readonly auth: AuthService, private readonly dashboard: DashboardService, private readonly payoutAccounts: PayoutAccountsService, private readonly withdrawals: WithdrawalsService) {}

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

  @Post("withdrawals")
  async createWithdrawal(@Req() request: Request, @Body() body: CreateWithdrawalDto) {
    const user = await this.auth.getCurrentUser(sessionToken(request));
    return this.withdrawals.create(user.id, body.payoutAccountId, body.amountMinor);
  }

  @Get("payout-accounts")
  async getPayoutAccounts(@Req() request: Request) {
    const user = await this.auth.getCurrentUser(sessionToken(request));
    return this.payoutAccounts.list(user.id);
  }

  @Post("payout-accounts")
  async createPayoutAccount(@Req() request: Request, @Body() body: CreatePayoutAccountDto) {
    const user = await this.auth.getCurrentUser(sessionToken(request));
    return this.payoutAccounts.create(user.id, body);
  }

  @Delete("payout-accounts/:id")
  async deletePayoutAccount(@Req() request: Request, @Param("id") id: string) {
    const user = await this.auth.getCurrentUser(sessionToken(request));
    return this.payoutAccounts.remove(user.id, id);
  }

  @Get("promotion")
  async getPromotion(@Req() request: Request) {
    const user = await this.auth.getCurrentUser(sessionToken(request));
    return this.dashboard.getPromotionSummary(user.id, user.profile?.timezone ?? "UTC");
  }

  @Get("commission-records")
  async getCommissionRecords(@Req() request: Request) {
    const user = await this.auth.getCurrentUser(sessionToken(request));
    return this.dashboard.getCommissionRecords(user.id);
  }

  @Get("team")
  async getTeam(@Req() request: Request) {
    const user = await this.auth.getCurrentUser(sessionToken(request));
    return this.dashboard.getTeamMembers(user.id);
  }

  @Get("me")
  getMe(@Req() request: Request) {
    return this.auth.getCurrentUser(sessionToken(request));
  }

  @Patch("me")
  updateMe(@Req() request: Request, @Body() body: UpdateProfileDto) {
    return this.auth.updateProfile(sessionToken(request), body);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Patch("me/password")
  changePassword(@Req() request: Request, @Body() body: ChangePasswordDto) {
    return this.auth.changePassword(sessionToken(request), body.currentPassword, body.newPassword);
  }
}
