import { Module } from "@nestjs/common";
import { AdminAuthModule } from "../admin-auth/admin-auth.module";
import { ContactNumbersController } from "./contact-numbers.controller";
import { ContactNumbersService } from "./contact-numbers.service";

@Module({
  imports: [AdminAuthModule],
  controllers: [ContactNumbersController],
  providers: [ContactNumbersService],
})
export class ContactNumbersModule {}
