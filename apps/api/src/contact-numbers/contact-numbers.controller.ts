import {
  Controller,
  Get,
  Post,
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

  @Post(":id/block")
  async block(@Req() request: Request, @Param("id") id: string) {
    const admin = await this.adminAuth.getCurrentAdmin(adminToken(request));
    return this.contacts.block(id, admin.id);
  }
}
