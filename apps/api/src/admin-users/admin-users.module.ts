import { Module } from "@nestjs/common";
import { AdminAuthModule } from "../admin-auth/admin-auth.module";
import { AdminUsersController } from "./admin-users.controller";
import { AdminUsersService } from "./admin-users.service";

@Module({ imports: [AdminAuthModule], controllers: [AdminUsersController], providers: [AdminUsersService] })
export class AdminUsersModule {}
