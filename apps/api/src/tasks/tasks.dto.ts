import { IsString, IsUUID, Length } from "class-validator";

export class CreateTaskClaimDto {
  @IsString()
  @Length(8, 128)
  idempotencyKey!: string;

  @IsUUID()
  slotId!: string;
}
