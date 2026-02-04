import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AdmissionPaymentDocument = AdmissionPayment & Document;

export enum PaymentMethod {
  CASH = 'cash',
  BKASH = 'bkash',
  BANK = 'bank',
}

@Schema({ timestamps: true })
export class AdmissionPayment {
  @Prop({ type: Types.ObjectId, ref: 'Admission', required: true })
  admissionId: Types.ObjectId;

  @Prop({ required: true, min: 0 })
  paidAmount: number;

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

export const AdmissionPaymentSchema = SchemaFactory.createForClass(AdmissionPayment);
