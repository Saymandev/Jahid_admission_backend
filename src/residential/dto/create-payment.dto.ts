import { IsBoolean, IsEnum, IsMongoId, IsNumber, IsOptional, IsString, Matches, Min } from 'class-validator';

export class CreatePaymentDto {
  @IsMongoId()
  studentId: string;

  @IsString()
  @IsOptional()
  @Matches(/^\d{4}-\d{2}$|^ADVANCE$/, { message: 'billingMonth must be in YYYY-MM format or "ADVANCE" for advance payments' })
  billingMonth?: string;

  @IsNumber()
  @Min(0)
  paidAmount: number;

  @IsEnum(['cash', 'bkash', 'bank'])
  paymentMethod: string;

  @IsString()
  @IsOptional()
  transactionId?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsBoolean()
  @IsOptional()
  isAdvance?: boolean; // If true, this is an advance payment for future months

  @IsOptional()
  type?: string; 
}
