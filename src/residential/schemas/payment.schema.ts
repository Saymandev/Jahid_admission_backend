import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type PaymentDocument = Payment & Document;

export enum PaymentMethod {
  CASH = 'cash',
  BKASH = 'bkash',
  BANK = 'bank',
  ADJUSTMENT = 'adjustment',
}

export enum PaymentType {
  RENT = 'rent',
  ADVANCE = 'advance',
  SECURITY = 'security',
  UNION_FEE = 'union_fee',
  REFUND = 'refund',
  ADJUSTMENT = 'adjustment',
  OTHER = 'other',
}

@Schema({ timestamps: true })
export class Payment {
  @Prop({ type: Types.ObjectId, ref: 'Student', required: true })
  studentId: Types.ObjectId;

  @Prop({ required: true })
  billingMonth: string; // Format: YYYY-MM

  @Prop({ required: true, min: 0 })
  rentAmount: number;

  @Prop({ enum: PaymentType, default: PaymentType.RENT })
  type: PaymentType;

  @Prop({ required: true, min: 0 })
  paidAmount: number;

  @Prop({ default: 0, min: 0 })
  dueAmount: number;

  @Prop({ default: 0, min: 0 })
  advanceAmount: number;

  @Prop({ enum: PaymentMethod, required: true })
  paymentMethod: PaymentMethod;

  @Prop()
  transactionId?: string;

  @Prop()
  notes?: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  recordedBy: Types.ObjectId;

  @Prop({ default: false })
  isDeleted: boolean;

  @Prop()
  deletedAt?: Date;
}

export const PaymentSchema = SchemaFactory.createForClass(Payment);
// Allow multiple advance payments (billingMonth = 'ADVANCE') but unique for regular months
PaymentSchema.index(
  { studentId: 1, billingMonth: 1 },
  {
    partialFilterExpression: {
      isDeleted: false,
      billingMonth: { $ne: 'ADVANCE' },
      type: PaymentType.RENT
    }
  }
);

