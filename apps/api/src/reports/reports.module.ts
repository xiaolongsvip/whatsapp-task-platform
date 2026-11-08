import { Module } from "@nestjs/common";
import { AdminAuthModule } from "../admin-auth/admin-auth.module";
import { ReportsController } from "./reports.controller";
import { ReportsService } from "./reports.service";
@Module({ imports: [AdminAuthModule], controllers: [ReportsController], providers: [ReportsService] })
export class ReportsModule {}
