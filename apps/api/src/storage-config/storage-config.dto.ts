import { IsBoolean, IsOptional, IsString, IsUrl, MaxLength, MinLength } from "class-validator";

export class UpdateStorageConfigDto {
  @IsUrl({ require_tld: false, require_protocol: true })
  @MaxLength(500)
  endpoint!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  bucket!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  region?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  accessKey?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  secretKey?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
