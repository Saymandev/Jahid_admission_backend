import { IsString, IsNumber, IsOptional, IsDateString, Min, IsMongoId } from 'class-validator';

export class ReactivateStudentDto {
  @IsMongoId()
  roomId: string;

  @IsString()
  @IsOptional()
  bedName?: string;

  @IsNumber()
  @IsOptional()
  @Min(1)
  bedNumber?: number;

  @IsDateString()
  joiningDate: string; // New joining date (return date)

  @IsNumber()
  @IsOptional()
  @Min(0)
  monthlyRent?: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  securityDeposit?: number;
}
