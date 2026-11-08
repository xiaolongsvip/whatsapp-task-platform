import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import type { Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { from, throwError } from "rxjs";
import { catchError, mergeMap } from "rxjs/operators";
import { prisma } from "@wtp/database";
import { AdminAuthService } from "../admin-auth/admin-auth.service";

const COOKIE = "wtp_admin_session";
function readToken(req: Request): string | undefined {
  const part = req.headers.cookie?.split(";").map(x => x.trim()).find(x => x.startsWith(COOKIE + "="));
  return part ? decodeURIComponent(part.slice(COOKIE.length + 1)) : undefined;
}
function safeJson(value: unknown, depth = 0): any {
  if (depth > 4) return "[深度限制]";
  if (value === null || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") return value.length > 2000 ? value.slice(0, 2000) + "…" : value;
  if (Array.isArray(value)) return value.slice(0, 30).map(x => safeJson(x, depth + 1));
  if (typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>).slice(0, 60)) {
      output[key] = /password|token|secret|api.?key|authorization|credential/i.test(key) ? "[已脱敏]" : safeJson(item, depth + 1);
    }
    return output;
  }
  return String(value);
}

@Injectable()
export class AdminHttpAuditInterceptor implements NestInterceptor {
  constructor(private readonly auth: AdminAuthService) {}

  intercept(context: ExecutionContext, next: CallHandler) {
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    const path = req.path.replace(/^\/api\/v\d+/, "");
    if (!path.startsWith("/admin/")) return next.handle();

    const startedAt = Date.now();
    const requestIdHeader = req.headers["x-request-id"];
    const requestId = typeof requestIdHeader === "string" && requestIdHeader.trim() ? requestIdHeader.slice(0, 100) : randomUUID();
    const segments = path.split("/").filter(Boolean);
    const moduleName = "ADMIN_HTTP_REQUEST";
    const last = segments[segments.length - 1] ?? "";
    const targetId = segments.length > 3 && !["detail","review","publish","revoke","toggle","duplicate","restore","pin","test"].includes(last) ? last.slice(0, 200) : null;
    const body = safeJson(req.body);
    const ipAddress = (req.headers["x-forwarded-for"]?.toString().split(",")[0]?.trim() || req.ip || "").slice(0, 100) || null;
    const userAgent = String(req.headers["user-agent"] ?? "").slice(0, 1000) || null;
    const method = req.method.toUpperCase();
    const action = method + " " + path;

    const write = async (error?: any, payload?: unknown) => {
      try {
        const admin = await this.auth.getCurrentAdmin(readToken(req)).catch(() => null);
        const statusCode = Number(res.statusCode || (error?.status ?? 500));
        const result = statusCode >= 400 || error ? "FAILED" : "SUCCESS";
        const responseData = error ? { message: String(error?.message ?? "请求失败").slice(0, 1000), statusCode } : safeJson(payload ?? { statusCode });
        await prisma.adminHttpRequestLog.create({ data: {
          requestId, adminUserId: admin?.id ?? null, method, path, module: moduleName,
          action, targetId, ipAddress, userAgent, statusCode, result,
          errorCode: typeof error?.code === "string" ? error.code.slice(0, 160) : typeof error?.name === "string" && error.name !== "Error" ? error.name.slice(0, 160) : null,
          requestData: body as any, responseData: responseData as any, durationMs: Math.max(0, Date.now() - startedAt),
        }});
      } catch { /* audit logging must never change the business response */ }
    };

    return next.handle().pipe(
      mergeMap(async value => { await write(undefined, value); return value; }),
      catchError(error => from(write(error)).pipe(mergeMap(() => throwError(() => error)))),
    );
  }
}
