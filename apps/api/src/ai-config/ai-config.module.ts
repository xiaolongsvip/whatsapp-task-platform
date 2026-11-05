import { Module } from "@nestjs/common";
import { AdminAuthModule } from "../admin-auth/admin-auth.module";
import { AiConfigController } from "./ai-config.controller";
import { AiConfigService } from "./ai-config.service";

@Module({
  imports: [AdminAuthModule],
  controllers: [AiConfigController],
  providers: [AiConfigService],
})
export class AiConfigModule {}
