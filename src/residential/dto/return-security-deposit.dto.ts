import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class ReturnSecurityDepositDto {
  @IsNumber()
  @Min(0)
  amount: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
