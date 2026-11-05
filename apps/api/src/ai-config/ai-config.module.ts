import { Module } from "@nestjs/common";
import { AdminAuthModule } from "../admin-auth/admin-auth.module";
import { AiConfigController } from "./ai-config.controller";
import { AiConfigService } from "./ai-config.service";
import { AiReviewWorker } from "./ai-review.worker";
import { StorageConfigModule } from "../storage-config/storage-config.module";
import { AiReviewAdminController } from "./ai-review-admin.controller";
import { AiReviewAdminService } from "./ai-review-admin.service";

@Module({
  imports: [AdminAuthModule, StorageConfigModule],
  controllers: [AiConfigController, AiReviewAdminController],
  providers: [AiConfigService, AiReviewWorker, AiReviewAdminService],
})
export class AiConfigModule {}
