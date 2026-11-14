import { BadRequestException, Body, Controller, Delete, Get, Headers, Param, Patch, Post, Query, Req } from "@nestjs/common";
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
import { UserDeviceService } from "./device.service";

function sessionToken(request: Request): string | undefined {
  const header = request.headers.cookie;
  if (!header) return undefined;
  const item = header.split(";").map((part) => part.trim()).find((part) => part.startsWith("wtp_session="));
  return item ? decodeURIComponent(item.slice("wtp_session=".length)) : undefined;
}

@Controller("users")
export class UsersController {
  constructor(private readonly auth: AuthService, private readonly dashboard: DashboardService, private readonly payoutAccounts: PayoutAccountsService, private readonly withdrawals: WithdrawalsService, private readonly devices: UserDeviceService) {}

  @Post("device")
  async reportDevice(@Req() request: Request, @Body() body: { deviceIdentifier: string; manufacturer?: string; model: string; androidVersion?: string; sdkInt?: number; appVersion: string }) {
    const user = await this.auth.getCurrentUser(sessionToken(request));
    return this.devices.report(user.id, body);
  }

  @Get("dashboard")
  async getDashboard(@Req() request: Request) {
    const user = await this.auth.getCurrentUser(sessionToken(request));
    return this.dashboard.getSummary(user.id, user.profile?.timezone ?? "UTC");
  }

  @Get("withdrawal-quote")
  async getWithdrawalQuote(@Req() request: Request, @Query("payoutAccountId") payoutAccountId: string, @Query("amountMinor") amountMinor?: string) {
    const user = await this.auth.getCurrentUser(sessionToken(request));
    if (!payoutAccountId) throw new BadRequestException("payoutAccountId is required.");
    return this.withdrawals.quote(user.id, payoutAccountId, amountMinor);
  }

  @Get("withdrawals")
  async getWithdrawals(@Req() request: Request, @Query("limit") limit?: string, @Query("beforeCreatedAt") beforeCreatedAt?: string, @Query("beforeId") beforeId?: string) {
    const user = await this.auth.getCurrentUser(sessionToken(request));
    const parsedLimit = limit === undefined ? 50 : Number(limit);
    return this.dashboard.getWithdrawalHistory(user.id, Number.isFinite(parsedLimit) ? parsedLimit : 50, beforeCreatedAt, beforeId);
  }

  @Post("withdrawals")
  async createWithdrawal(
    @Req() request: Request,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: CreateWithdrawalDto,
  ) {
    const user = await this.auth.getCurrentUser(sessionToken(request));
    return this.withdrawals.create(user.id, body.payoutAccountId, body.amountMinor, user.profile?.timezone ?? "UTC", {
      rate: body.expectedRate,
      source: body.expectedRateSource,
      fetchedAt: body.expectedRateFetchedAt,
      amountMinor: body.expectedQuoteAmountMinor,
      walletCurrency: body.expectedWalletCurrency,
      payoutCurrency: body.expectedPayoutCurrency,
      payoutAmountMinor: body.expectedPayoutAmountMinor,
    }, idempotencyKey);
  }

  @Get("payout-options")
  async getPayoutOptions(@Req() request: Request) {
    await this.auth.getCurrentUser(sessionToken(request));
    return this.payoutAccounts.options();
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

  @Get("wallet-overview")
  async getWalletOverview(@Req() request: Request) {
    const user = await this.auth.getCurrentUser(sessionToken(request));
    return this.dashboard.getWalletOverview(user.id);
  }

  @Get("wallet-transactions")
  async getWalletTransactions(
    @Req() request: Request,
    @Query("limit") limit?: string,
    @Query("beforeCreatedAt") beforeCreatedAt?: string,
    @Query("beforeId") beforeId?: string,
  ) {
    const user = await this.auth.getCurrentUser(sessionToken(request));
    return this.dashboard.getWalletTransactions(user.id, limit ? Number(limit) : 100, beforeCreatedAt, beforeId);
  }

  @Get("commission-records")
  async getCommissionRecords(
    @Req() request: Request,
    @Query("limit") limit?: string,
    @Query("beforeCreatedAt") beforeCreatedAt?: string,
    @Query("beforeId") beforeId?: string,
  ) {
    const user = await this.auth.getCurrentUser(sessionToken(request));
    return this.dashboard.getCommissionRecords(user.id, limit ? Number(limit) : 100, beforeCreatedAt, beforeId);
  }

  @Get("team")
  async getTeam(
    @Req() request: Request,
    @Query("limit") limit?: string,
    @Query("beforeCreatedAt") beforeCreatedAt?: string,
    @Query("beforeUserId") beforeUserId?: string,
    @Query("beforeDepth") beforeDepth?: string,
  ) {
    const user = await this.auth.getCurrentUser(sessionToken(request));
    return this.dashboard.getTeamMembers(user.id, limit ? Number(limit) : 300, beforeCreatedAt, beforeUserId, beforeDepth ? Number(beforeDepth) : undefined);
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
