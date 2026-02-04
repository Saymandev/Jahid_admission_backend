import { IsString, IsNumber, IsOptional, Min } from 'class-validator';

export class UseSecurityDepositDto {
  @IsString()
  billingMonth: string;

  @IsNumber()
  @Min(0)
  amount: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
