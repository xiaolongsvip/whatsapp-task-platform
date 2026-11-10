import { Module } from "@nestjs/common";
import { AdminAuthModule } from "../admin-auth/admin-auth.module";
import { AdminReferralsController } from "./admin-referrals.controller";
import { AdminReferralsService } from "./admin-referrals.service";

@Module({ imports: [AdminAuthModule], controllers: [AdminReferralsController], providers: [AdminReferralsService] })
export class AdminReferralsModule {}
