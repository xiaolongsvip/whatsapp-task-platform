import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import { AdminAuthService } from "../admin-auth/admin-auth.service";
import { NotificationsService } from "./notifications.service";

const COOKIE = "wtp_admin_session";
function adminToken(request: Request): string | undefined {
  const item = request.headers.cookie?.split(";").map((part) => part.trim()).find((part) => part.startsWith(COOKIE + "="));
  return item ? decodeURIComponent(item.slice(COOKIE.length + 1)) : undefined;
}

@Controller("admin/notifications")
export class NotificationsAdminController {
  constructor(private readonly auth: AdminAuthService, private readonly notifications: NotificationsService) {}

  private async admin(request: Request) {
    return this.auth.getCurrentAdmin(adminToken(request));
  }

  @Get()
  async list(@Req() request: Request, @Query("page") page?: string, @Query("pageSize") pageSize?: string, @Query("keyword") keyword?: string, @Query("status") status?: string) {
    await this.admin(request);
    return this.notifications.list({ page: page ? Number(page) : 1, pageSize: pageSize ? Number(pageSize) : 20, keyword, status });
  }

  @Get("records")
  async records(@Req() request: Request, @Query("page") page?: string, @Query("pageSize") pageSize?: string, @Query("keyword") keyword?: string) {
    await this.admin(request);
    return this.notifications.listRecords({ page: page ? Number(page) : 1, pageSize: pageSize ? Number(pageSize) : 20, keyword });
  }

  @Post()
  async create(@Req() request: Request, @Body() body: { title?: unknown; content?: unknown; target?: unknown }) {
    const admin = await this.admin(request);
    return this.notifications.create(body, admin.id);
  }

  @Patch(":id")
  async update(@Req() request: Request, @Param("id") id: string, @Body() body: { title?: unknown; content?: unknown; target?: unknown }) {
    const admin = await this.admin(request);
    return this.notifications.update(id, body, admin.id);
  }

  @Post(":id/publish")
  async publish(@Req() request: Request, @Param("id") id: string) {
    const admin = await this.admin(request);
    return this.notifications.publish(id, admin.id);
  }

  @Post(":id/disable")
  async disable(@Req() request: Request, @Param("id") id: string) {
    const admin = await this.admin(request);
    return this.notifications.disable(id, admin.id);
  }

  @Get("templates")
  async listTemplates(@Req() request: Request, @Query("keyword") keyword?: string, @Query("enabled") enabled?: string) {
    await this.admin(request);
    return this.notifications.listTemplates({ keyword, enabled });
  }

  @Post("templates")
  async createTemplate(@Req() request: Request, @Body() body: { name?: unknown; title?: unknown; content?: unknown }) {
    const admin = await this.admin(request);
    return this.notifications.createTemplate(body, admin.id);
  }

  @Patch("templates/:id")
  async updateTemplate(@Req() request: Request, @Param("id") id: string, @Body() body: { name?: unknown; title?: unknown; content?: unknown }) {
    const admin = await this.admin(request);
    return this.notifications.updateTemplate(id, body, admin.id);
  }

  @Post("templates/:id/toggle")
  async toggleTemplate(@Req() request: Request, @Param("id") id: string, @Body() body: { enabled?: unknown }) {
    const admin = await this.admin(request);
    if (typeof body.enabled !== "boolean") throw new BadRequestException("enabled 必须为布尔值。");
    return this.notifications.toggleTemplate(id, body.enabled, admin.id);
  }
}
