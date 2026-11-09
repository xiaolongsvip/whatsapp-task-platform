import { IsString, IsUUID, Matches } from "class-validator";

export class CreateWithdrawalDto {
  @IsUUID()
  payoutAccountId!: string;

  // Amount in the currency's smallest unit (e.g. cents/paisa), sent as a string
  // to avoid JavaScript floating-point precision loss.
  @IsString()
  @Matches(/^[0-9]{1,19}$/)
  amountMinor!: string;

  // The client quote is only an optimistic-concurrency check. The server
  // always recalculates and persists its own authoritative FX snapshot.
  @IsString()
  @Matches(/^[0-9]+(?:\.[0-9]{1,12})?$/)
  expectedRate!: string;

  @IsString()
  @Matches(/^[A-Za-z_][A-Za-z0-9_.-]{0,63}$/)
  expectedRateSource!: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}T/)
  expectedRateFetchedAt!: string;
}
