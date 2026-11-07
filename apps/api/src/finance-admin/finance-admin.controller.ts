import { Controller, Get, Param, Query, Req } from "@nestjs/common";
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
  @Get("wallets")
  async wallets(@Req() req: Request, @Query() query: Record<string,string>) { await this.authorize(req); return this.finance.wallets(query); }
  @Get("wallets/:id/ledger")
  async ledger(@Req() req: Request, @Param("id") id: string, @Query("page") page?: string, @Query("pageSize") pageSize?: string) { await this.authorize(req); return this.finance.ledger(id,page,pageSize); }
  @Get("payout-accounts")
  async payoutAccounts(@Req() req: Request, @Query() query: Record<string,string>) { await this.authorize(req); return this.finance.payoutAccounts(query); }
  @Get("providers")
  async providers(@Req() req: Request) { await this.authorize(req); return this.finance.providers(); }
  @Get("transactions")
  async transactions(@Req() req: Request, @Query() query: Record<string,string>) { await this.authorize(req); return this.finance.transactions(query); }
}
