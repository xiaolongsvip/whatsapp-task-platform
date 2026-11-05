import { Module } from "@nestjs/common";
import { AdminAuthModule } from "../admin-auth/admin-auth.module";
import { StorageConfigController } from "./storage-config.controller";
import { StorageConfigService } from "./storage-config.service";
import { S3ObjectStorageService } from "../tasks/s3-object-storage.service";

@Module({
  imports: [AdminAuthModule],
  controllers: [StorageConfigController],
  providers: [StorageConfigService, S3ObjectStorageService],
  exports: [StorageConfigService, S3ObjectStorageService],
})
export class StorageConfigModule {}
