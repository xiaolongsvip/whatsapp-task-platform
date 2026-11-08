import { Module } from "@nestjs/common";
import { AdminAuthModule } from "../admin-auth/admin-auth.module";
import { StorageConfigModule } from "../storage-config/storage-config.module";
import { SystemSettingsController } from "./system-settings.controller";
import { SystemSettingsService } from "./system-settings.service";
@Module({ imports: [AdminAuthModule, StorageConfigModule], controllers: [SystemSettingsController], providers: [SystemSettingsService] })
export class SystemSettingsModule {}
