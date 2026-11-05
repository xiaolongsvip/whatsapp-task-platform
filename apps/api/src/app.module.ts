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
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
