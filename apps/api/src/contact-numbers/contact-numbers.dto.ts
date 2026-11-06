import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsISO8601,
  IsOptional,
  IsString,
  Length,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";

export class ImportContactNumberItemDto {
  @IsString()
  @Length(8, 24)
  phone!: string;
}

export class ImportContactNumbersDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5000)
  @ValidateNested({ each: true })
  @Type(() => ImportContactNumberItemDto)
  numbers!: ImportContactNumberItemDto[];

  @IsOptional()
  @IsString()
  @Length(2, 2)
  countryCode?: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  countryName?: string;

  @IsString()
  @Length(3, 500)
  consentSource!: string;

  @IsISO8601()
  consentedAt!: string;

  @IsOptional()
  @IsString()
  @Length(1, 180)
  fileName?: string;
}
