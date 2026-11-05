import { IsEmail, IsString, Length } from "class-validator";

export class AdminLoginDto {
  @IsEmail()
  @Length(3, 254)
  email!: string;

  @IsString()
  @Length(1, 128)
  password!: string;
}

export class AdminBootstrapDto extends AdminLoginDto {
  @IsString()
  @Length(16, 256)
  bootstrapToken!: string;
}
