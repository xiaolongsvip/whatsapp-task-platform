import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AdminAuthModule } from "../admin-auth/admin-auth.module";
import { NotificationsAdminController } from "./notifications.controller";
import { NotificationsService } from "./notifications.service";
import { MemberNotificationsController } from "./member-notifications.controller";

@Module({
  imports: [AdminAuthModule, AuthModule],
  controllers: [NotificationsAdminController, MemberNotificationsController],
  providers: [NotificationsService],
})
export class NotificationsModule {}
