import { IsString, IsNumber, IsEnum, IsOptional, Min, IsMongoId } from 'class-validator';

export class CreateAdmissionPaymentDto {
  @IsMongoId()
  admissionId: string;

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
}
