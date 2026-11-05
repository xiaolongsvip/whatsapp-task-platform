import { Body, Controller, Get, Put, Req } from "@nestjs/common";
import type { Request } from "express";
import { AdminAuthService } from "../admin-auth/admin-auth.service";
import { StorageConfigService } from "./storage-config.service";
import { UpdateStorageConfigDto } from "./storage-config.dto";

const COOKIE = "wtp_admin_session";
function token(request: Request): string | undefined {
  const item = request.headers.cookie?.split(";").map((part) => part.trim()).find((part) => part.startsWith(COOKIE + "="));
  return item ? decodeURIComponent(item.slice(COOKIE.length + 1)) : undefined;
}

@Controller("admin/storage-config")
export class StorageConfigController {
  constructor(private readonly auth: AdminAuthService, private readonly storage: StorageConfigService) {}
  @Get()
  async get(@Req() request: Request) {
    await this.auth.getCurrentAdmin(token(request));
    return this.storage.getPublicConfig();
  }
  @Put()
  async update(@Req() request: Request, @Body() body: UpdateStorageConfigDto) {
    const admin = await this.auth.getCurrentAdmin(token(request));
    return this.storage.update(body, admin.id);
  }
}
