import { Module } from "@nestjs/common";
import { AdminAuthModule } from "../admin-auth/admin-auth.module";
import { SystemSettingsController } from "./system-settings.controller";
import { SystemSettingsService } from "./system-settings.service";
@Module({ imports: [AdminAuthModule], controllers: [SystemSettingsController], providers: [SystemSettingsService] })
export class SystemSettingsModule {}
