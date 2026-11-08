import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { AuthModule } from "./auth/auth.module";
import { HealthModule } from "./health/health.module";
import { UsersModule } from "./users/users.module";
import { TasksModule } from "./tasks/tasks.module";
import { AdminAuthModule } from "./admin-auth/admin-auth.module";
import { ContactNumbersModule } from "./contact-numbers/contact-numbers.module";
import { AiConfigModule } from "./ai-config/ai-config.module";
import { StorageConfigModule } from "./storage-config/storage-config.module";
import { WalletHoldsAdminModule } from "./wallet-holds-admin/wallet-holds-admin.module";
import { AdminDashboardModule } from "./admin-dashboard/admin-dashboard.module";
import { AdminUsersModule } from "./admin-users/admin-users.module";
import { AdminReferralsModule } from "./admin-referrals/admin-referrals.module";
import { FinanceAdminModule } from "./finance-admin/finance-admin.module";
import { ReportsModule } from "./reports/reports.module";
import { PermissionsAdminModule } from "./permissions-admin/permissions-admin.module";
import { AdminPermissionGuard } from "./permissions-admin/admin-permission.guard";

@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 30 }]),
    HealthModule,
    AuthModule,
    UsersModule,
    TasksModule,
    AdminAuthModule,
    ContactNumbersModule,
    AiConfigModule,
    StorageConfigModule,
    WalletHoldsAdminModule,
    AdminDashboardModule,
    AdminUsersModule,
    AdminReferralsModule,
    FinanceAdminModule,
    ReportsModule,
    PermissionsAdminModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AdminPermissionGuard },
  ],
})
export class AppModule {}
