import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
} from "@nestjs/common";
import type { Request } from "express";
import { AdminAuthService } from "../admin-auth/admin-auth.service";
import { CreateAdminTaskDto, UpdateAdminTaskDto } from "./task-admin.dto";
import { TaskAdminService } from "./task-admin.service";

const ADMIN_COOKIE_NAME = "wtp_admin_session";

function adminToken(request: Request): string | undefined {
  const header = request.headers.cookie;
  if (!header) return undefined;
  const item = header
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${ADMIN_COOKIE_NAME}=`));
  return item ? decodeURIComponent(item.slice(ADMIN_COOKIE_NAME.length + 1)) : undefined;
}

@Controller("admin/tasks")
export class TaskAdminController {
  constructor(
    private readonly adminAuth: AdminAuthService,
    private readonly tasks: TaskAdminService,
  ) {}

  @Get()
  async list(@Req() request: Request) {
    await this.adminAuth.getCurrentAdmin(adminToken(request));
    return this.tasks.list();
  }

  @Post()
  async create(@Req() request: Request, @Body() body: CreateAdminTaskDto) {
    await this.adminAuth.getCurrentAdmin(adminToken(request));
    return this.tasks.create(body);
  }

  @Patch(":id")
  async update(
    @Req() request: Request,
    @Param("id") id: string,
    @Body() body: UpdateAdminTaskDto,
  ) {
    await this.adminAuth.getCurrentAdmin(adminToken(request));
    return this.tasks.update(id, body);
  }

  @Post(":id/publish")
  async publish(@Req() request: Request, @Param("id") id: string) {
    await this.adminAuth.getCurrentAdmin(adminToken(request));
    return this.tasks.publish(id);
  }

  @Post(":id/pause")
  async pause(@Req() request: Request, @Param("id") id: string) {
    await this.adminAuth.getCurrentAdmin(adminToken(request));
    return this.tasks.pause(id);
  }

  @Post(":id/close")
  async close(@Req() request: Request, @Param("id") id: string) {
    await this.adminAuth.getCurrentAdmin(adminToken(request));
    return this.tasks.close(id);
  }
}
