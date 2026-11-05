import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Req,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Throttle } from "@nestjs/throttler";
import type { Request } from "express";
import { AuthService } from "../auth/auth.service";
import { CreateTaskClaimDto } from "./tasks.dto";
import { TasksService } from "./tasks.service";

type UploadedEvidence = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

function sessionToken(request: Request): string | undefined {
  const header = request.headers.cookie;
  if (!header) return undefined;
  const item = header.split(";").map((part) => part.trim()).find((part) => part.startsWith("wtp_session="));
  return item ? decodeURIComponent(item.slice("wtp_session=".length)) : undefined;
}

@Controller("tasks")
export class TasksController {
  constructor(
    private readonly auth: AuthService,
    private readonly tasks: TasksService,
  ) {}

  @Get()
  async list(@Req() request: Request) {
    const user = await this.auth.getCurrentUser(sessionToken(request));
    return this.tasks.listPublished(user.id);
  }

  @Get("my/claims")
  async myClaims(@Req() request: Request) {
    const user = await this.auth.getCurrentUser(sessionToken(request));
    return this.tasks.myClaims(user.id);
  }

  @Post(":taskId/claims")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async claim(
    @Req() request: Request,
    @Param("taskId") taskId: string,
    @Body() body: CreateTaskClaimDto,
  ) {
    const user = await this.auth.getCurrentUser(sessionToken(request));
    return this.tasks.claimTask(user.id, user.profile?.timezone ?? "UTC", taskId, body.idempotencyKey);
  }

  @Post("claims/:claimId/submissions")
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  @UseInterceptors(FileInterceptor("file", {
    limits: { fileSize: 8 * 1024 * 1024, files: 1 },
    fileFilter: (_request, file, callback) => {
      const allowed = ["image/jpeg", "image/png", "image/webp"];
      if (!allowed.includes(file.mimetype)) {
        callback(new BadRequestException("只允许上传 JPEG、PNG 或 WebP 图片。"), false);
        return;
      }
      callback(null, true);
    },
  }))
  async submitEvidence(
    @Req() request: Request,
    @Param("claimId") claimId: string,
    @UploadedFile() file: UploadedEvidence | undefined,
    @Body("note") note: string | undefined,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
  ) {
    const user = await this.auth.getCurrentUser(sessionToken(request));
    if (!file) throw new BadRequestException("请附加一张任务截图。");
    if (!idempotencyKey) throw new BadRequestException("缺少 Idempotency-Key 请求头。");
    return this.tasks.submitEvidence(user.id, claimId, file, note, idempotencyKey);
  }
}
