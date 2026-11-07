import { Body, Controller, Get, Param, Post, Query, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
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

@Controller("admin/task-submissions")
export class TaskSubmissionAdminController {
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
    return this.reviews.listSubmissions(
      status,
      Math.max(1, Number.parseInt(page || "1", 10) || 1),
      Math.min(100, Math.max(1, Number.parseInt(pageSize || "20", 10) || 20)),
    );
  }

  @Post(":id/retry-ai")
  async retryAi(
    @Req() request: Request,
    @Param("id") id: string,
  ) {
    const admin = await this.auth.getCurrentAdmin(token(request));
    return this.reviews.rerunAiReview(id, admin.id);
  }

  @Post(":id/review")
  async review(
    @Req() request: Request,
    @Param("id") id: string,
    @Body() body: ReviewAiSubmissionDto,
  ) {
    const admin = await this.auth.getCurrentAdmin(token(request));
    return this.reviews.reviewSubmission(id, admin.id, body.decision, body.reason);
  }
  @Get(":id/evidence")
  async evidence(
    @Req() request: Request,
    @Param("id") id: string,
    @Res() response: Response,
  ) {
    await this.auth.getCurrentAdmin(token(request));
    const evidence = await this.reviews.getEvidence(id);
    response.setHeader("Content-Type", evidence.mimeType);
    response.setHeader("Content-Length", evidence.buffer.length);
    response.setHeader("Content-Disposition", "inline");
    response.setHeader("Cache-Control", "private, no-store");
    response.send(evidence.buffer);
  }

}
