import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { Bed } from './bed.schema';

export type RoomDocument = Room & Document;

export enum RoomStatus {
  AVAILABLE = 'available',
  FULL = 'full',
}

@Schema({ timestamps: true })
export class Room {
  @Prop({ required: true, unique: true })
  name: string;

  @Prop()
  floor?: string;

  @Prop({ type: [Bed], default: [] })
  beds: Bed[];

  @Prop({ required: true, min: 1 })
  totalBeds: number;

  @Prop({ min: 0 })
  monthlyRentPerBed: number;

  @Prop({ enum: RoomStatus, default: RoomStatus.AVAILABLE })
  status: RoomStatus;

  @Prop({ default: 0 })
  occupiedBeds: number;

  @Prop({ default: false })
  isDeleted: boolean;

  @Prop()
  deletedAt?: Date;
}

export const RoomSchema = SchemaFactory.createForClass(Room);
