import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  Req,
} from "@nestjs/common";
import type { Request } from "express";
import { Throttle } from "@nestjs/throttler";
import { AdminAuthService } from "../admin-auth/admin-auth.service";
import { ContactNumbersService } from "./contact-numbers.service";
import { ImportContactNumbersDto } from "./contact-numbers.dto";

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

@Controller("admin/contact-numbers")
export class ContactNumbersController {
  constructor(
    private readonly adminAuth: AdminAuthService,
    private readonly contacts: ContactNumbersService,
  ) {}

  @Get("summary")
  async summary(@Req() request: Request) {
    await this.adminAuth.getCurrentAdmin(adminToken(request));
    return this.contacts.summary();
  }

  @Get()
  async list(@Req() request: Request, @Query("limit") limit?: string, @Query("search") search?: string) {
    await this.adminAuth.getCurrentAdmin(adminToken(request));
    return this.contacts.list(limit, search);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post("import")
  async import(
    @Req() request: Request,
    @Body() body: ImportContactNumbersDto,
  ) {
    const admin = await this.adminAuth.getCurrentAdmin(adminToken(request));
    return this.contacts.importNumbers(admin.id, body);
  }


  @Post("single")
  async addSingle(@Req() request: Request, @Body() body: { phone: string; countryCode: string; countryName: string; consentConfirmed: boolean }) {
    const admin = await this.adminAuth.getCurrentAdmin(adminToken(request));
    return this.contacts.addSingle(admin.id, body);
  }


  @Get("sampling-numbers")
  async samplingNumbers(@Req() request: Request, @Query("limit") limit?: string, @Query("search") search?: string) {
    await this.adminAuth.getCurrentAdmin(adminToken(request));
    return this.contacts.samplingNumbers(limit, search);
  }

  @Get("sampling-results")
  async samplingResults(@Req() request: Request, @Query("page") page?: string, @Query("pageSize") pageSize?: string, @Query("status") status?: string) {
    await this.adminAuth.getCurrentAdmin(adminToken(request));
    return this.contacts.samplingResults(page, pageSize, status);
  }

  @Post("sampling-results")
  async saveSamplingResult(@Req() request: Request, @Body() body: { claimId: string; actualResult: string; handlingStatus: string }) {
    const admin = await this.adminAuth.getCurrentAdmin(adminToken(request));
    return this.contacts.saveSamplingResult(admin.id, body);
  }

  @Get("import-history")
  async importHistory(@Req() request: Request, @Query("page") page?: string, @Query("pageSize") pageSize?: string, @Query("status") status?: string) {
    await this.adminAuth.getCurrentAdmin(adminToken(request));
    return this.contacts.importHistory(page, pageSize, status);
  }

  @Delete("sampling-numbers/all")
  async clearSamplingNumbers(@Req() request: Request) {
    const admin = await this.adminAuth.getCurrentAdmin(adminToken(request));
    return this.contacts.deleteSamplingNumbers(admin.id, undefined, true);
  }

  @Delete("sampling-numbers")
  async deleteSamplingNumbers(@Req() request: Request, @Body() body: { ids: string[] }) {
    const admin = await this.adminAuth.getCurrentAdmin(adminToken(request));
    return this.contacts.deleteSamplingNumbers(admin.id, body.ids, false);
  }

  @Delete("sampling-numbers/:id")
  async deleteSamplingNumber(@Req() request: Request, @Param("id") id: string) {
    const admin = await this.adminAuth.getCurrentAdmin(adminToken(request));
    return this.contacts.deleteSamplingNumbers(admin.id, [id], false);
  }

  @Post(":id/block")
  async block(@Req() request: Request, @Param("id") id: string) {
    const admin = await this.adminAuth.getCurrentAdmin(adminToken(request));
    return this.contacts.block(id, admin.id);
  }
}
