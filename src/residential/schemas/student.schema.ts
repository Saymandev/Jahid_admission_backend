import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type StudentDocument = Student & Document;

export enum StudentStatus {
  ACTIVE = 'active',
  LEFT = 'left',
}

@Schema({ timestamps: true })
export class Student {
  @Prop({ required: true, unique: true })
  studentId: string;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  phone: string;

  @Prop()
  guardianName?: string;

  @Prop()
  guardianPhone?: string;

  @Prop({ type: Types.ObjectId, ref: 'Room', required: true })
  roomId: Types.ObjectId;

  @Prop({ required: true, min: 1 })
  bedNumber: number;

  @Prop({ required: true })
  joiningDate: Date;

  @Prop({ required: true, min: 0 })
  monthlyRent: number;

  @Prop({ default: 0, min: 0 })
  securityDeposit: number;

  @Prop({ default: 0, min: 0 })
  unionFee: number;

  @Prop({ enum: StudentStatus, default: StudentStatus.ACTIVE })
  status: StudentStatus;

  @Prop({ default: false })
  isDeleted: boolean;

  @Prop()
  deletedAt?: Date;
}

export const StudentSchema = SchemaFactory.createForClass(Student);
StudentSchema.index({ roomId: 1, bedNumber: 1 }, { unique: true, partialFilterExpression: { isDeleted: false } });
