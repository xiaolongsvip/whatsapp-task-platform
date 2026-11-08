import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import type { Request } from "express";
import { prisma } from "@wtp/database";
import { AdminAuthService } from "../admin-auth/admin-auth.service";

const COOKIE = "wtp_admin_session";

function readAdminToken(request: Request): string | undefined {
  const header = request.headers.cookie ?? "";
  const entry = header.split(";").map((part) => part.trim()).find((part) => part.startsWith(COOKIE + "="));
  return entry ? decodeURIComponent(entry.slice(COOKIE.length + 1)) : undefined;
}

/**
 * Enforces the fine-grained permission catalog on every /admin/* business API.
 * The permissions administration endpoints keep their own service-level checks
 * so the first catalog request can seed the initial system roles safely.
 */
@Injectable()
export class AdminPermissionGuard implements CanActivate {
  constructor(private readonly auth: AdminAuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const path = request.path.replace(/^\/api\/v\d+/, "").replace(/\/$/, "");
    if (!path.startsWith("/admin/")) return true;
    if (path.startsWith("/admin/permissions/")) return true;

    const admin = await this.auth.getCurrentAdmin(readAdminToken(request));

    // Initial bootstrap: the first administrator receives the system role when
    // the permissions catalog is opened for the first time.
    if ((await prisma.adminUserRole.count()) === 0) return true;

    const permission = this.permissionFor(request.method.toUpperCase(), path);
    if (!permission) {
      throw new ForbiddenException("该后台接口尚未配置权限映射，已按默认拒绝策略阻止访问。");
    }

    const granted = await prisma.adminUserRole.count({
      where: {
        adminUserId: admin.id,
        role: {
          status: "ACTIVE",
          permissions: { some: { permission: { key: permission } } },
        },
      },
    });
    if (!granted) throw new ForbiddenException("当前管理员没有执行此操作的权限。");
    return true;
  }

  private permissionFor(method: string, path: string): string | null {
    const is = (pattern: RegExp) => pattern.test(path);

    if (is(/^\/admin\/dashboard\/summary$/)) return "reports.dashboard.read";
    if (is(/^\/admin\/reports\/summary$/)) return "reports.read";

    if (is(/^\/admin\/users(?:\/[^/]+)?\/detail$/) || is(/^\/admin\/users\/[^/]+\/devices\/[^/]+\/history$/)) return "users.read";
    if (is(/^\/admin\/users\/[^/]+\/devices\/[^/]+$/)) return "users.devices.manage";
    if (is(/^\/admin\/users\/[^/]+\/policy$/)) return "users.manage";
    if (is(/^\/admin\/users\/[^/]+\/reputation$/)) return "users.reputation.adjust";
    if (is(/^\/admin\/users\/[^/]+\/profile$/)) return "users.profile.manage";
    if (is(/^\/admin\/users\/[^/]+\/status$/)) return "users.freeze";
    if (is(/^\/admin\/users\/[^/]+\/reset-password$/)) return "users.manage";
    if (is(/^\/admin\/users(?:\/summary)?$/)) return method === "GET" ? "users.read" : "users.manage";

    if (is(/^\/admin\/finance\/withdrawals(?:\/[^/]+(?:\/(?:review|payout-result))?)?$/)) {
      if (method === "GET") return "finance.withdrawals.read";
      if (path.endsWith("/review")) return "finance.withdrawals.review";
      if (path.endsWith("/payout-result")) return "finance.withdrawals.pay";
    }
    if (is(/^\/admin\/finance\/wallets(?:\/[^/]+\/ledger)?$/)) return "finance.wallets.read";
    if (is(/^\/admin\/finance\/payout-accounts(?:\/summary|\/[^/]+(?:\/history)?)?$/)) return "finance.payout_accounts.read";
    if (is(/^\/admin\/finance\/providers(?:\/[^/]+(?:\/enabled)?)?$/)) return method === "GET" ? "finance.payout_channels.read" : "finance.providers.manage";
    if (is(/^\/admin\/finance\/settlements(?:\/overview|\/tasks|\/payouts)$/)) return "finance.tasks.read";
    if (is(/^\/admin\/finance\/adjustments$/)) return method === "GET" ? "finance.tasks.read" : "finance.tasks.manage";
    if (is(/^\/admin\/finance\/reconciliations(?:\/run|\/[^/]+)?$/)) return method === "GET" ? "finance.reconciliation.read" : "finance.reconciliation.manage";
    if (is(/^\/admin\/finance\/transactions$/)) return "finance.transactions.read";
    if (is(/^\/admin\/finance\/summary$/)) return "finance.reconciliation.read";

    if (is(/^\/admin\/wallet-holds(?:\/[^/]+\/(?:release|capture))?$/)) return method === "GET" ? "finance.wallets.read" : "finance.wallets.adjust";

    if (is(/^\/admin\/referrals\/settings$/)) return method === "GET" ? "referrals.read" : "referrals.rules.manage";
    if (is(/^\/admin\/referrals\/(?:invites|relations|relations\/audit)$/)) return "referrals.read";
    if (is(/^\/admin\/referrals\/commissions$/)) return "referrals.commissions.read";

    if (is(/^\/admin\/tasks\/records\/dev-test-data$/)) return "tasks.manage";
    if (is(/^\/admin\/tasks\/records\/bulk-message$/)) return "tasks.messages.manage";
    if (is(/^\/admin\/tasks\/records(?:\/[^/]+\/detail)?$/) && method === "GET") return "tasks.executions.read";
    if (is(/^\/admin\/tasks\/records\/[^/]+$/) && method === "DELETE") return "tasks.manage";
    if (is(/^\/admin\/tasks\/records\/(?:bulk-void|bulk-delete|bulk-group|[^/]+\/(?:void))$/)) return "tasks.manage";
    if (is(/^\/admin\/tasks\/message-templates(?:\/[^/]+)?$/)) return method === "GET" ? "tasks.messages.read" : "tasks.messages.manage";
    if (is(/^\/admin\/tasks\/groups(?:\/[^/]+)?$/)) return method === "GET" ? "tasks.groups.read" : "tasks.groups.manage";
    if (is(/^\/admin\/tasks\/configuration\/platforms(?:\/[^/]+(?:\/actions(?:\/[^/]+)?)?)?$/)) return method === "GET" ? "tasks.config.read" : "tasks.config.manage";
    if (is(/^\/admin\/tasks\/configuration\/[^/]+$/)) return method === "GET" ? "tasks.config.read" : "tasks.config.manage";
    if (is(/^\/admin\/tasks(?:\/[^/]+(?:\/group)?)?$/)) return method === "GET" ? "tasks.read" : "tasks.manage";

    if (is(/^\/admin\/contact-numbers(?:\/summary|\/sampling-numbers(?:\/all|\/[^/]+)?|\/import-history)?$/)) return "tasks.import_numbers";
    if (is(/^\/admin\/contact-numbers\/sampling-results$/)) return method === "GET" ? "reviews.read" : "reviews.random.manage";
    if (is(/^\/admin\/contact-numbers\/import$/) || is(/^\/admin\/contact-numbers\/single$/) || is(/^\/admin\/contact-numbers\/[^/]+\/block$/)) return "tasks.import_numbers";
    if (is(/^\/admin\/contact-numbers$/)) return method === "GET" ? "tasks.import_numbers" : "tasks.import_numbers";

    if (is(/^\/admin\/ai-reviews\/(?:risk\/events|risk\/users|risk\/rules(?:\/[^/]+)?)$/)) return method === "GET" ? "reviews.risk.read" : "reviews.risk.manage";
    if (is(/^\/admin\/ai-reviews\/evidence(?:\/[^/]+\/detail)?$/)) return "reviews.evidence.read";
    if (is(/^\/admin\/ai-reviews(?:|\/center|\/[^/]+\/review)$/)) return method === "GET" ? "reviews.ai.read" : "reviews.manage";
    if (is(/^\/admin\/task-submissions$/)) return "reviews.read";
    if (is(/^\/admin\/task-submissions\/[^/]+\/evidence$/)) return "reviews.evidence.read";
    if (is(/^\/admin\/task-submissions\/[^/]+\/retry-ai$/)) return "reviews.ai.retry";
    if (is(/^\/admin\/task-submissions\/[^/]+\/review$/)) return "reviews.manage";

    if (is(/^\/admin\/ai-config(?:\/test)?$/)) return method === "GET" ? "reviews.settings.manage" : "reviews.settings.manage";
    if (is(/^\/admin\/storage-config(?:\/test)?$/)) return method === "GET" ? "system.settings.read" : "system.settings.manage";

    return null;
  }
}
