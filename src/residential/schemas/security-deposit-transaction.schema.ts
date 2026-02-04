import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type SecurityDepositTransactionDocument = SecurityDepositTransaction & Document;

export enum SecurityDepositTransactionType {
  USE_FOR_DUES = 'use_for_dues', // Used to pay monthly dues
  RETURN = 'return', // Returned to student
  ADJUSTMENT = 'adjustment', // Manual adjustment
}

@Schema({ timestamps: true })
export class SecurityDepositTransaction {
  @Prop({ type: Types.ObjectId, ref: 'Student', required: true })
  studentId: Types.ObjectId;

  @Prop({ enum: SecurityDepositTransactionType, required: true })
  type: SecurityDepositTransactionType;

  @Prop({ required: true, min: 0 })
  amount: number;

  @Prop()
  billingMonth?: string; // If used for dues, which month

  @Prop()
  paymentId?: Types.ObjectId; // Reference to payment if used for dues

  @Prop()
  notes?: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  processedBy: Types.ObjectId;

  @Prop({ default: false })
  isDeleted: boolean;

  @Prop()
  deletedAt?: Date;
}

export const SecurityDepositTransactionSchema = SchemaFactory.createForClass(SecurityDepositTransaction);
SecurityDepositTransactionSchema.index({ studentId: 1, createdAt: -1 });
