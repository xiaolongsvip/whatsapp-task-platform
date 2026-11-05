import { IsIn, IsString, MaxLength, MinLength } from "class-validator";

export class ReviewAiSubmissionDto {
  @IsIn(["APPROVE", "REJECT"])
  decision!: "APPROVE" | "REJECT";

  @IsString()
  @MinLength(2)
  @MaxLength(4000)
  reason!: string;
}
