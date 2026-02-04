import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type AdmissionDocument = Admission & Document;

export enum AdmissionStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

@Schema({ timestamps: true })
export class Admission {
  @Prop({ required: true, unique: true })
  admissionId: string;

  @Prop({ required: true })
  studentName: string;

  @Prop({ required: true })
  phone: string;

  @Prop()
  guardianName?: string;

  @Prop()
  guardianPhone?: string;

  @Prop({ required: true })
  course: string;

  @Prop({ required: true })
  batch: string;

  @Prop({ required: true, min: 0 })
  totalFee: number;

  @Prop({ default: 0, min: 0 })
  paidAmount: number;

  @Prop({ default: 0, min: 0 })
  dueAmount: number;

  @Prop({ required: true })
  admissionDate: Date;

  @Prop({ enum: AdmissionStatus, default: AdmissionStatus.PENDING })
  status: AdmissionStatus;

  @Prop({ default: false })
  isDeleted: boolean;

  @Prop()
  deletedAt?: Date;
}

export const AdmissionSchema = SchemaFactory.createForClass(Admission);
