import { IsBoolean, IsEnum, IsMongoId, IsNumber, IsOptional, IsString, Matches, Min } from 'class-validator';

export class CreateBulkPaymentDto {
  @IsMongoId()
  studentId: string;

  @IsEnum(['cash', 'bkash', 'bank'])
  paymentMethod: string;

  @IsString()
  @IsOptional()
  transactionId?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  rentAmount?: number;

  @IsString()
  @IsOptional()
  @Matches(/^\d{4}-\d{2}$|^ADVANCE$/, { message: 'billingMonth must be in YYYY-MM format or "ADVANCE"' })
  billingMonth?: string;

  @IsBoolean()
  @IsOptional()
  isAdvance?: boolean;

  @IsNumber()
  @Min(0)
  @IsOptional()
  securityAmount?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  unionFeeAmount?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  otherAmount?: number;
}
