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


  @Post("records/dev-test-data")
  async createExecutionTestData(@Req() request: Request) {
    const admin = await this.adminAuth.getCurrentAdmin(adminToken(request));
    return this.tasks.createExecutionTestData(admin.id);
  }

  @Delete("records/dev-test-data")
  async deleteExecutionTestData(@Req() request: Request) {
    await this.adminAuth.getCurrentAdmin(adminToken(request));
    return this.tasks.deleteExecutionTestData();
  }

  @Get("records")
  async listRecords(
    @Req() request: Request,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Query("keyword") keyword?: string,
    @Query("status") status?: string,
    @Query("groupName") groupName?: string,
    @Query("createdFrom") createdFrom?: string,
    @Query("createdTo") createdTo?: string,
    @Query("countryRegion") countryRegion?: string,
  ) {
    await this.adminAuth.getCurrentAdmin(adminToken(request));
    return this.tasks.listRecords({ page: page ? Number(page) : 1, pageSize: pageSize ? Number(pageSize) : 20, keyword, status, groupName, createdFrom, createdTo, countryRegion });
  }

  @Post("records/bulk-message")
  async bulkUpdateMessages(
    @Req() request: Request,
    @Body() body: { messageTemplate?: string; keyword?: string; groupName?: string; countryRegion?: string; createdFrom?: string; createdTo?: string },
  ) {
    await this.adminAuth.getCurrentAdmin(adminToken(request));
    return this.tasks.bulkUpdateMessageTemplate(body);
  }

  @Get("message-templates")
  async listMessageTemplates(
    @Req() request: Request,
    @Query("enabled") enabled?: string,
    @Query("platform") platform?: string,
    @Query("action") action?: string,
  ) {
    await this.adminAuth.getCurrentAdmin(adminToken(request));
    return this.tasks.listMessageTemplates({
      ...(enabled === "true" ? { enabled: true } : enabled === "false" ? { enabled: false } : {}),
      ...(platform ? { platform } : {}),
      ...(action ? { action } : {}),
    });
  }

  @Post("message-templates")
  async createMessageTemplate(
    @Req() request: Request,
    @Body() body: { name?: string; platform?: string; platformCode?: string; action?: string; content?: string; language?: string; keywords?: string; enabled?: boolean },
  ) {
    await this.adminAuth.getCurrentAdmin(adminToken(request));
    return this.tasks.createMessageTemplate(body);
  }

  @Patch("message-templates/:id")
  async updateMessageTemplate(
    @Req() request: Request,
    @Param("id") id: string,
    @Body() body: { name?: string; platform?: string; action?: string; content?: string; enabled?: boolean },
  ) {
    await this.adminAuth.getCurrentAdmin(adminToken(request));
    return this.tasks.updateMessageTemplate(id, body);
  }

  @Delete("message-templates/:id")
  async disableMessageTemplate(@Req() request: Request, @Param("id") id: string) {
    await this.adminAuth.getCurrentAdmin(adminToken(request));
    return this.tasks.disableMessageTemplate(id);
  }

  @Get("groups")
  async listTaskGroups(@Req() request: Request) {
    await this.adminAuth.getCurrentAdmin(adminToken(request));
    return this.tasks.listTaskGroups();
  }

  @Post("groups")
  async createTaskGroup(@Req() request: Request, @Body() body: { name?: string; description?: string }) {
    await this.adminAuth.getCurrentAdmin(adminToken(request));
    return this.tasks.createTaskGroup(body);
  }

  @Delete("groups/:id")
  async deleteTaskGroup(@Req() request: Request, @Param("id") id: string) {
    await this.adminAuth.getCurrentAdmin(adminToken(request));
    return this.tasks.deleteTaskGroup(id);
  }

  @Get("configuration/platforms")
  async listPlatforms(@Req() request: Request) {
    await this.adminAuth.getCurrentAdmin(adminToken(request));
    return this.tasks.listPlatforms();
  }

  @Post("configuration/platforms")
  async createPlatform(@Req() request: Request, @Body() body: { name?: string; code?: string; targetApp?: string; description?: string; capabilities?: Record<string, unknown> }) {
    await this.adminAuth.getCurrentAdmin(adminToken(request));
    return this.tasks.createPlatform(body);
  }

  @Patch("configuration/platforms/:id")
  async updatePlatform(@Req() request: Request, @Param("id") id: string, @Body() body: { name?: string; targetApp?: string; description?: string; capabilities?: Record<string, unknown>; enabled?: boolean }) {
    await this.adminAuth.getCurrentAdmin(adminToken(request));
    return this.tasks.updatePlatform(id, body);
  }

  @Post("configuration/platforms/:id/actions")
  async createPlatformAction(@Req() request: Request, @Param("id") id: string, @Body() body: { name?: string; code?: string; evidenceType?: string; requiresTargetPhone?: boolean; requiresDeliveryStatus?: boolean; requiresMessageTemplate?: boolean }) {
    await this.adminAuth.getCurrentAdmin(adminToken(request));
    return this.tasks.createPlatformAction(id, body);
  }

  @Patch("configuration/platforms/:id/actions/:actionId")
  async updatePlatformAction(@Req() request: Request, @Param("id") id: string, @Param("actionId") actionId: string, @Body() body: { name?: string; evidenceType?: string; requiresTargetPhone?: boolean; requiresDeliveryStatus?: boolean; requiresMessageTemplate?: boolean; enabled?: boolean }) {
    await this.adminAuth.getCurrentAdmin(adminToken(request));
    return this.tasks.updatePlatformAction(id, actionId, body);
  }

  @Get("configuration/:key")
  async getConfiguration(@Req() request: Request, @Param("key") key: string) {
    await this.adminAuth.getCurrentAdmin(adminToken(request));
    return this.tasks.getConfiguration(key);
  }

  @Patch("configuration/:key")
  async saveConfiguration(@Req() request: Request, @Param("key") key: string, @Body() body: { value?: unknown }) {
    await this.adminAuth.getCurrentAdmin(adminToken(request));
    return this.tasks.saveConfiguration(key, body.value);
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



  @Get("records/:id/detail")
  async getRecordDetail(@Req() request: Request, @Param("id") id: string) {
    await this.adminAuth.getCurrentAdmin(adminToken(request));
    return this.tasks.getTaskRecordDetail(id);
  }

  @Post("records/:id/void")
  async voidRecord(@Req() request: Request, @Param("id") id: string) {
    const admin = await this.adminAuth.getCurrentAdmin(adminToken(request));
    return this.tasks.voidTaskRecord(id, admin.id);
  }

  @Delete("records/:id")
  async deleteRecord(@Req() request: Request, @Param("id") id: string) {
    const admin = await this.adminAuth.getCurrentAdmin(adminToken(request));
    return this.tasks.deleteTaskRecord(id, admin.id);
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
    const admin = await this.adminAuth.getCurrentAdmin(adminToken(request));
    return this.tasks.updateTaskGroup(id, typeof body.groupName === "string" ? body.groupName : "", admin.id);
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
