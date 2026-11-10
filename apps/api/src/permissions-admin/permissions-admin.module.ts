import { Module } from "@nestjs/common";
import { AdminAuthModule } from "../admin-auth/admin-auth.module";
import { PermissionsAdminController } from "./permissions-admin.controller";
import { PermissionsAdminService } from "./permissions-admin.service";
@Module({ imports: [AdminAuthModule], controllers: [PermissionsAdminController], providers: [PermissionsAdminService] })
export class PermissionsAdminModule {}
