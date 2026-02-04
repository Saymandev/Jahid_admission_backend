import { IsDateString, IsMongoId, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateStudentDto {
  @IsString()
  name: string;

  @IsString()
  phone: string;

  @IsString()
  @IsOptional()
  guardianName?: string;

  @IsString()
  @IsOptional()
  guardianPhone?: string;

  @IsMongoId()
  roomId: string;

  @IsNumber()
  @Min(1)
  @IsOptional()
  bedNumber?: number;

  @IsString()
  @IsOptional()
  bedName?: string;

  @IsDateString()
  joiningDate: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  monthlyRent?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  securityDeposit?: number;
}
