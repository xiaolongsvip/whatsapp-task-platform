import { Module } from "@nestjs/common";
import { AdminAuthModule } from "../admin-auth/admin-auth.module";
import { StorageConfigController } from "./storage-config.controller";
import { StorageConfigService } from "./storage-config.service";

@Module({
  imports: [AdminAuthModule],
  controllers: [StorageConfigController],
  providers: [StorageConfigService],
  exports: [StorageConfigService],
})
export class StorageConfigModule {}
