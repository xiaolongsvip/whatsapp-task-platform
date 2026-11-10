import { IsOptional, IsString, Length, Matches, MaxLength } from "class-validator";

export class CreatePayoutAccountDto {
  @IsString()
  @Matches(/^[A-Za-z]{2}$/)
  countryCode!: string;

  @IsString()
  @Matches(/^[A-Za-z]{3}$/)
  currency!: string;

  @IsString()
  @Length(2, 40)
  providerCode!: string;

  @IsString()
  @Length(2, 40)
  methodCode!: string;

  @IsString()
  @Length(1, 120)
  accountHolder!: string;

  @IsString()
  @Length(5, 80)
  accountNumber!: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phoneNumber?: string;
}
