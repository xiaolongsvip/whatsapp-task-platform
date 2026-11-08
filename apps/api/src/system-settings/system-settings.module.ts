import { Module } from "@nestjs/common";
import { AdminAuthModule } from "../admin-auth/admin-auth.module";
import { StorageConfigModule } from "../storage-config/storage-config.module";
import { SystemSettingsController } from "./system-settings.controller";
import { SystemSettingsService } from "./system-settings.service";
import { PublicAppUpdateController } from "./public-app-update.controller";
@Module({ imports: [AdminAuthModule, StorageConfigModule], controllers: [SystemSettingsController, PublicAppUpdateController], providers: [SystemSettingsService] })
export class SystemSettingsModule {}
