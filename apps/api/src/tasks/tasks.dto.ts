import { IsString, Length } from "class-validator";

export class CreateTaskClaimDto {
  @IsString()
  @Length(8, 128)
  idempotencyKey!: string;
}
