import { Body, Controller, Get, Post, Put, Req } from "@nestjs/common";
import type { Request } from "express";
import { AdminAuthService } from "../admin-auth/admin-auth.service";
import { AiConfigService } from "./ai-config.service";
import { UpdateAiConfigDto } from "./ai-config.dto";

const ADMIN_COOKIE_NAME = "wtp_admin_session";

function adminToken(request: Request): string | undefined {
  const cookie = request.headers.cookie;
  if (!cookie) return undefined;
  const item = cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${ADMIN_COOKIE_NAME}=`));
  return item
    ? decodeURIComponent(item.slice(ADMIN_COOKIE_NAME.length + 1))
    : undefined;
}

@Controller("admin/ai-config")
export class AiConfigController {
  constructor(
    private readonly adminAuth: AdminAuthService,
    private readonly aiConfig: AiConfigService,
  ) {}

  @Get()
  async get(@Req() request: Request) {
    await this.adminAuth.getCurrentAdmin(adminToken(request));
    return this.aiConfig.getPublicConfig();
  }

  @Put()
  async update(
    @Req() request: Request,
    @Body() body: UpdateAiConfigDto,
  ) {
    const admin = await this.adminAuth.getCurrentAdmin(adminToken(request));
    return this.aiConfig.update(body, admin.id);
  }

  @Post("test")
  async test(@Req() request: Request) {
    await this.adminAuth.getCurrentAdmin(adminToken(request));
    return this.aiConfig.testConnection();
  }
}
