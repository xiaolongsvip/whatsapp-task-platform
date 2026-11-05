import { Module } from "@nestjs/common";
import { AdminAuthModule } from "../admin-auth/admin-auth.module";
import { AiConfigController } from "./ai-config.controller";
import { AiConfigService } from "./ai-config.service";
import { AiReviewWorker } from "./ai-review.worker";
import { S3ObjectStorageService } from "../tasks/s3-object-storage.service";

@Module({
  imports: [AdminAuthModule],
  controllers: [AiConfigController],
  providers: [AiConfigService, AiReviewWorker, S3ObjectStorageService],
})
export class AiConfigModule {}
