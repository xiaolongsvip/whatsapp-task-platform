import { Controller, Get } from "@nestjs/common";
import { SystemSettingsService } from "./system-settings.service";

@Controller("app")
export class PublicAppUpdateController {
  constructor(private readonly settings: SystemSettingsService) {}
  @Get("update")
  getUpdateInfo() { return this.settings.getPublicUpdateInfo(); }

  @Get("support")
  async getSupportInfo() { return { supportUrl: await this.settings.getPublicSupportUrl() }; }
}
