import { IsBoolean, IsNumber, IsOptional, IsString, IsUrl, Max, MaxLength, Min, MinLength } from "class-validator";

export class UpdateAiConfigDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  apiKey?: string;

  @IsOptional()
  @IsBoolean()
  clearApiKey?: boolean;

  @IsOptional()
  @IsString()
  @IsUrl({ require_tld: false, require_protocol: true })
  @MaxLength(500)
  baseUrl?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  model?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  approveThreshold?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  rejectThreshold?: number;

  @IsOptional()
  @IsString()
  @MaxLength(12000)
  systemPrompt?: string | null;
}
