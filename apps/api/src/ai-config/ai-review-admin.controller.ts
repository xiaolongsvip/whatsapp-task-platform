import { Body, Controller, Get, Param, Post, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import { AdminAuthService } from "../admin-auth/admin-auth.service";
import { AiReviewAdminService } from "./ai-review-admin.service";
import { ReviewAiSubmissionDto } from "./review-ai-submission.dto";

const COOKIE = "wtp_admin_session";

function token(request: Request): string | undefined {
  const value = request.headers.cookie;
  if (!value) return undefined;
  const entry = value.split(";").map((part) => part.trim()).find((part) => part.startsWith(COOKIE + "="));
  return entry ? decodeURIComponent(entry.slice(COOKIE.length + 1)) : undefined;
}

@Controller("admin/ai-reviews")
export class AiReviewAdminController {
  constructor(
    private readonly auth: AdminAuthService,
    private readonly reviews: AiReviewAdminService,
  ) {}

  @Get()
  async list(
    @Req() request: Request,
    @Query("status") status?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    await this.auth.getCurrentAdmin(token(request));
    return this.reviews.list(
      status,
      Math.max(1, Number.parseInt(page || "1", 10) || 1),
      Math.min(100, Math.max(1, Number.parseInt(pageSize || "20", 10) || 20)),
    );
  }
  @Get("center")
  async center(
    @Req() request: Request,
    @Query("status") status?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    await this.auth.getCurrentAdmin(token(request));
    return this.reviews.listCenter(
      status,
      Math.max(1, Number.parseInt(page || "1", 10) || 1),
      Math.min(100, Math.max(1, Number.parseInt(pageSize || "20", 10) || 20)),
    );
  }


  @Get("evidence")
  async evidence(
    @Req() request: Request,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Query("keyword") keyword?: string,
    @Query("taskType") taskType?: string,
  ) {
    await this.auth.getCurrentAdmin(token(request));
    return this.reviews.listEvidenceRecords({
      page: Math.max(1, Number.parseInt(page || "1", 10) || 1),
      pageSize: Math.min(100, Math.max(1, Number.parseInt(pageSize || "20", 10) || 20)),
      keyword, taskType,
    });
  }

  @Get("evidence/:id/detail")
  async evidenceDetail(@Req() request: Request, @Param("id") id: string) {
    await this.auth.getCurrentAdmin(token(request));
    return this.reviews.getEvidenceDetail(id);
  }

  @Post(":id/review")
  async review(
    @Req() request: Request,
    @Param("id") id: string,
    @Body() body: ReviewAiSubmissionDto,
  ) {
    const admin = await this.auth.getCurrentAdmin(token(request));
    return this.reviews.review(id, admin.id, body.decision, body.reason);
  }


  @Get("risk/events")
  async riskEvents(@Req() request: Request, @Query("page") page?: string, @Query("pageSize") pageSize?: string, @Query("keyword") keyword?: string, @Query("level") level?: string, @Query("status") status?: string) {
    await this.auth.getCurrentAdmin(token(request));
    return this.reviews.listRiskEvents({ page: Number(page || 1), pageSize: Number(pageSize || 20), keyword, level, status });
  }

  @Get("risk/users")
  async riskUsers(@Req() request: Request, @Query("keyword") keyword?: string, @Query("page") page?: string, @Query("pageSize") pageSize?: string) {
    await this.auth.getCurrentAdmin(token(request));
    return this.reviews.listRiskUsers({ keyword, page: Number(page || 1), pageSize: Number(pageSize || 20) });
  }

  @Get("risk/rules")
  async riskRules(@Req() request: Request) {
    await this.auth.getCurrentAdmin(token(request));
    return this.reviews.listRiskRules();
  }

  @Post("risk/rules")
  async createRiskRule(@Req() request: Request, @Body() body: { name: string; category: string; impactScore: number; executionOrder: number; startsAt?: string; endsAt?: string; status: string; description?: string }) {
    const admin = await this.auth.getCurrentAdmin(token(request));
    return this.reviews.createRiskRule(body, admin.id);
  }

  @Post("risk/rules/:id")
  async updateRiskRule(@Req() request: Request, @Param("id") id: string, @Body() body: { name?: string; category?: string; impactScore?: number; executionOrder?: number; startsAt?: string | null; endsAt?: string | null; status?: string; description?: string }) {
    const admin = await this.auth.getCurrentAdmin(token(request));
    return this.reviews.updateRiskRule(id, body, admin.id);
  }

}
