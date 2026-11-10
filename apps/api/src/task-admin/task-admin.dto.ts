import {
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from "class-validator";

export class CreateAdminTaskDto {
  @IsString()
  @Length(2, 120)
  title!: string;

  @IsString()
  @Length(2, 5000)
  description!: string;

  @IsString()
  @Length(2, 80)
  category!: string;

  @IsOptional()
  @IsUUID()
  groupId?: string | null;

  @IsString()
  @Matches(/^\d{1,8}(?:\.\d{1,2})?$/, {
    message: "奖励金额最多支持两位小数，且必须大于 0。",
  })
  rewardAmount!: string;

  @IsString()
  @Matches(/^[A-Za-z]{3}$/)
  currency!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000000)
  capacity?: number | null;

  @IsOptional()
  @IsISO8601()
  startsAt?: string | null;

  @IsOptional()
  @IsISO8601()
  endsAt?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  messageTemplate?: string | null;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(2000)
  linkUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  previewTitle?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  previewDescription?: string | null;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(2000)
  previewImageUrl?: string | null;
}

export class UpdateAdminTaskDto {
  @IsOptional()
  @IsString()
  @Length(2, 120)
  title?: string;

  @IsOptional()
  @IsString()
  @Length(2, 5000)
  description?: string;

  @IsOptional()
  @IsString()
  @Length(2, 80)
  category?: string;

  @IsOptional()
  @IsUUID()
  groupId?: string | null;

  @IsOptional()
  @IsString()
  @Matches(/^\d{1,8}(?:\.\d{1,2})?$/)
  rewardAmount?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z]{3}$/)
  currency?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000000)
  capacity?: number | null;

  @IsOptional()
  @IsISO8601()
  startsAt?: string | null;

  @IsOptional()
  @IsISO8601()
  endsAt?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  messageTemplate?: string | null;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(2000)
  linkUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  previewTitle?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  previewDescription?: string | null;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(2000)
  previewImageUrl?: string | null;
}
