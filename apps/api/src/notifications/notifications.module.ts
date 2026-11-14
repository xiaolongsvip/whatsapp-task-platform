import { Module } from "@nestjs/common";
import { AdminAuthModule } from "../admin-auth/admin-auth.module";
import { NotificationsAdminController } from "./notifications.controller";
import { NotificationsService } from "./notifications.service";

@Module({
  imports: [AdminAuthModule],
  controllers: [NotificationsAdminController],
  providers: [NotificationsService],
})
export class NotificationsModule {}
