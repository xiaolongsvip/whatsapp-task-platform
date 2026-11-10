import { Module } from "@nestjs/common";
import { AdminAuthModule } from "../admin-auth/admin-auth.module";
import { FinanceAdminController } from "./finance-admin.controller";
import { FinanceAdminService } from "./finance-admin.service";

@Module({ imports: [AdminAuthModule], controllers: [FinanceAdminController], providers: [FinanceAdminService] })
export class FinanceAdminModule {}
