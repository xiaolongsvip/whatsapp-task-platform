import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  Query,
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


  @Get("records")
  async listRecords(
    @Req() request: Request,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Query("keyword") keyword?: string,
    @Query("status") status?: string,
  ) {
    await this.adminAuth.getCurrentAdmin(adminToken(request));
    return this.tasks.listRecords({ page: page ? Number(page) : 1, pageSize: pageSize ? Number(pageSize) : 20, keyword, status });
  }

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



  @Post("records/:id/void")
  async voidRecord(@Req() request: Request, @Param("id") id: string) {
    await this.adminAuth.getCurrentAdmin(adminToken(request));
    return this.tasks.voidTaskRecord(id);
  }

  @Delete("records/:id")
  async deleteRecord(@Req() request: Request, @Param("id") id: string) {
    await this.adminAuth.getCurrentAdmin(adminToken(request));
    return this.tasks.deleteTaskRecord(id);
  }


  @Post("records/bulk-void")
  async bulkVoidRecords(@Req() request: Request, @Body() body: { ids?: unknown }) {
    const admin = await this.adminAuth.getCurrentAdmin(adminToken(request));
    return this.tasks.bulkVoidTaskRecords(body.ids, admin.id);
  }

  @Post("records/bulk-delete")
  async bulkDeleteRecords(@Req() request: Request, @Body() body: { ids?: unknown }) {
    const admin = await this.adminAuth.getCurrentAdmin(adminToken(request));
    return this.tasks.bulkDeleteTaskRecords(body.ids, admin.id);
  }

  @Patch("records/bulk-group")
  async bulkUpdateGroups(@Req() request: Request, @Body() body: { ids?: unknown; groupName?: string }) {
    const admin = await this.adminAuth.getCurrentAdmin(adminToken(request));
    return this.tasks.bulkUpdateTaskGroups(body.ids, typeof body.groupName === "string" ? body.groupName : "", admin.id);
  }

  @Patch(":id/group")
  async updateGroup(
    @Req() request: Request,
    @Param("id") id: string,
    @Body() body: { groupName?: string },
  ) {
    await this.adminAuth.getCurrentAdmin(adminToken(request));
    return this.tasks.updateTaskGroup(id, typeof body.groupName === "string" ? body.groupName : "");
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
