import { Module } from "@nestjs/common";
import { AdminAuthModule } from "../admin-auth/admin-auth.module";
import { AiConfigController } from "./ai-config.controller";
import { AiConfigService } from "./ai-config.service";
import { AiReviewWorker } from "./ai-review.worker";
import { S3ObjectStorageService } from "../tasks/s3-object-storage.service";
import { AiReviewAdminController } from "./ai-review-admin.controller";
import { AiReviewAdminService } from "./ai-review-admin.service";

@Module({
  imports: [AdminAuthModule],
  controllers: [AiConfigController, AiReviewAdminController],
  providers: [AiConfigService, AiReviewWorker, AiReviewAdminService, S3ObjectStorageService],
})
export class AiConfigModule {}
