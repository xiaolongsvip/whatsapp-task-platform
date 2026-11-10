import { Module } from "@nestjs/common";
import { AdminAuthModule } from "../admin-auth/admin-auth.module";
import { AdminDashboardController } from "./admin-dashboard.controller";
import { AdminDashboardService } from "./admin-dashboard.service";
@Module({ imports: [AdminAuthModule], controllers: [AdminDashboardController], providers: [AdminDashboardService] })
export class AdminDashboardModule {}