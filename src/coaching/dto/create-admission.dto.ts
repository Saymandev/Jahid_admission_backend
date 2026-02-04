import { IsString, IsNumber, IsDateString, IsOptional, Min } from 'class-validator';

export class CreateAdmissionDto {
  @IsString()
  studentName: string;

  @IsString()
  phone: string;

  @IsString()
  @IsOptional()
  guardianName?: string;

  @IsString()
  @IsOptional()
  guardianPhone?: string;

  @IsString()
  course: string;

  @IsString()
  batch: string;

  @IsNumber()
  @Min(0)
  totalFee: number;

  @IsDateString()
  admissionDate: string;
}
