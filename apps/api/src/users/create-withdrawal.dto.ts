import { IsString, IsUUID, Matches } from "class-validator";

export class CreateWithdrawalDto {
  @IsUUID()
  payoutAccountId!: string;

  // Amount in the currency's smallest unit (e.g. cents/paisa), sent as a string
  // to avoid JavaScript floating-point precision loss.
  @IsString()
  @Matches(/^[0-9]{1,19}$/)
  amountMinor!: string;
}
