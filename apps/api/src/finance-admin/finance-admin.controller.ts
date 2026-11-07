import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import { AdminAuthService } from "../admin-auth/admin-auth.service";
import { FinanceAdminService } from "./finance-admin.service";

const COOKIE = "wtp_admin_session";
function token(req: Request): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  const item = header.split(";").map(v => v.trim()).find(v => v.startsWith(COOKIE + "="));
  return item ? decodeURIComponent(item.slice(COOKIE.length + 1)) : undefined;
}

@Controller("admin/finance")
export class FinanceAdminController {
  constructor(private readonly auth: AdminAuthService, private readonly finance: FinanceAdminService) {}
  private async authorize(req: Request) { return this.auth.getCurrentAdmin(token(req)); }

  @Get("summary")
  async summary(@Req() req: Request) { await this.authorize(req); return this.finance.summary(); }
  @Get("withdrawals")
  async withdrawals(@Req() req: Request, @Query() query: Record<string,string>) { await this.authorize(req); return this.finance.withdrawals(query); }
  @Get("withdrawals/:id")
  async withdrawalDetail(@Req() req: Request, @Param("id") id: string) { await this.authorize(req); return this.finance.withdrawalDetail(id); }
  @Post("withdrawals/:id/review")
  async reviewWithdrawal(@Req() req: Request, @Param("id") id: string, @Body() body: { action?: string; note?: string }) { const admin = await this.authorize(req); return this.finance.reviewWithdrawal(id, body.action || "", admin.id, body.note); }
  @Post("withdrawals/:id/payout-result")
  async payoutResult(@Req() req: Request, @Param("id") id: string, @Body() body: { outcome?: "PAID" | "FAILED"; providerCode?: string; reference?: string; note?: string }) { const admin = await this.authorize(req); if (body.outcome !== "PAID" && body.outcome !== "FAILED") throw new BadRequestException("outcome 必须是 PAID 或 FAILED"); return this.finance.recordManualPayout(id, body.outcome, admin.id, body); }
  @Get("wallets")
  async wallets(@Req() req: Request, @Query() query: Record<string,string>) { await this.authorize(req); return this.finance.wallets(query); }
  @Get("wallets/:id/ledger")
  async ledger(@Req() req: Request, @Param("id") id: string, @Query("page") page?: string, @Query("pageSize") pageSize?: string) { await this.authorize(req); return this.finance.ledger(id,page,pageSize); }
  @Get("payout-accounts/summary")
  async payoutAccountSummary(@Req() req: Request) { await this.authorize(req); return this.finance.payoutAccountSummary(); }
  @Get("payout-accounts/:id/history")
  async payoutAccountHistory(@Req() req: Request, @Param("id") id: string, @Query() query: Record<string,string>) { await this.authorize(req); return this.finance.payoutAccountHistory(id, query); }
  @Get("payout-accounts/:id")
  async payoutAccountDetail(@Req() req: Request, @Param("id") id: string) { await this.authorize(req); return this.finance.payoutAccountDetail(id); }
  @Get("payout-accounts")
  async payoutAccounts(@Req() req: Request, @Query() query: Record<string,string>) { await this.authorize(req); return this.finance.payoutAccounts(query); }
  @Get("providers")
  async providers(@Req() req: Request) { await this.authorize(req); return this.finance.providers(); }
  @Post("providers")
  async createProvider(@Req() req: Request, @Body() body: Record<string, unknown>) { await this.authorize(req); return this.finance.createProvider(body); }
  @Patch("providers/:providerCode")
  async updateProvider(@Req() req: Request, @Param("providerCode") providerCode: string, @Body() body: Record<string, unknown>) { await this.authorize(req); return this.finance.updateProvider(providerCode, body); }
  @Patch("providers/:providerCode/enabled")
  async setProviderEnabled(@Req() req: Request, @Param("providerCode") providerCode: string, @Body("enabled") enabled: boolean) { await this.authorize(req); return this.finance.setProviderEnabled(providerCode, enabled); }
  @Get("transactions")
  async transactions(@Req() req: Request, @Query() query: Record<string,string>) { await this.authorize(req); return this.finance.transactions(query); }
}
