import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { UsersController } from "./users.controller";
import { DashboardService } from "./dashboard.service";

@Module({
  imports: [AuthModule],
  controllers: [UsersController],
  providers: [DashboardService],
})
export class UsersModule {}
