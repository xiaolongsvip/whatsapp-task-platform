import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { S3ObjectStorageService } from "./s3-object-storage.service";
import { TasksController } from "./tasks.controller";
import { TasksService } from "./tasks.service";

@Module({
  imports: [AuthModule],
  controllers: [TasksController],
  providers: [TasksService, S3ObjectStorageService],
})
export class TasksModule {}
