import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { UsersController } from "./users.controller";
import { DashboardService } from "./dashboard.service";
import { PayoutAccountsService } from "./payout-accounts.service";
import { WithdrawalsService } from "./withdrawals.service";

@Module({
  imports: [AuthModule],
  controllers: [UsersController],
  providers: [DashboardService, PayoutAccountsService, WithdrawalsService],
})
export class UsersModule {}
