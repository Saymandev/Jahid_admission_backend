import { PartialType } from '@nestjs/mapped-types';
import { IsNumber, IsOptional, Min, IsEnum } from 'class-validator';
import { CreateStudentDto } from './create-student.dto';
import { StudentStatus } from '../schemas/student.schema';

export class UpdateStudentDto extends PartialType(CreateStudentDto) {
  @IsNumber()
  @Min(0)
  @IsOptional()
  monthlyRent?: number;

  @IsEnum(StudentStatus)
  @IsOptional()
  status?: StudentStatus;
}
