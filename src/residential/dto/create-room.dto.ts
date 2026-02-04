import { Type } from 'class-transformer';
import { IsArray, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';

class BedDto {
  @IsString()
  name: string;

  @IsNumber()
  @Min(0)
  price: number;
}

export class CreateRoomDto {
  @IsString()
  name: string;

  @IsString()
  @IsOptional()
  floor?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BedDto)
  beds: BedDto[];

  @IsNumber()
  @Min(1)
  totalBeds: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  monthlyRentPerBed?: number;
}
