import { Module } from "@nestjs/common";
import { AdminAuthModule } from "../admin-auth/admin-auth.module";
import { WalletHoldsAdminController } from "./wallet-holds-admin.controller";
import { WalletHoldsAdminService } from "./wallet-holds-admin.service";

@Module({
  imports: [AdminAuthModule],
  controllers: [WalletHoldsAdminController],
  providers: [WalletHoldsAdminService],
})
export class WalletHoldsAdminModule {}
