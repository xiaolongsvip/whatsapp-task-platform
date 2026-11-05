import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AdminAuthModule } from "../admin-auth/admin-auth.module";
import { StorageConfigModule } from "../storage-config/storage-config.module";
import { TaskAdminController } from "../task-admin/task-admin.controller";
import { TaskAdminService } from "../task-admin/task-admin.service";
import { S3ObjectStorageService } from "./s3-object-storage.service";
import { TasksController } from "./tasks.controller";
import { TasksService } from "./tasks.service";

@Module({
  imports: [AuthModule, AdminAuthModule, StorageConfigModule],
  controllers: [TasksController, TaskAdminController],
  providers: [TasksService, TaskAdminService, S3ObjectStorageService],
})
export class TasksModule {}
