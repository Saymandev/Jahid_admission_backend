import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AdvanceApplicationDocument = AdvanceApplication & Document;

@Schema({ timestamps: true })
export class AdvanceApplication {
  @Prop({ type: Types.ObjectId, ref: 'Student', required: true })
  studentId: Types.ObjectId;

  @Prop({ required: true })
  billingMonth: string; // Format: YYYY-MM - the month the advance was applied to

  @Prop({ required: true, min: 0 })
  advanceAmountApplied: number; // How much advance was applied to this month

  @Prop({ required: true, min: 0 })
  dueAmountBefore: number; // Due amount before applying advance

  @Prop({ required: true, min: 0 })
  dueAmountAfter: number; // Due amount after applying advance

  @Prop({ required: true, min: 0 })
  remainingAdvance: number; // Remaining advance after this application

  @Prop({ type: Types.ObjectId, ref: 'Payment' })
  advancePaymentId?: Types.ObjectId; // Reference to the advance payment record

  @Prop()
  notes?: string; // Optional notes about the application

  @Prop({ default: false })
  isDeleted: boolean;

  @Prop()
  deletedAt?: Date;
}

export const AdvanceApplicationSchema = SchemaFactory.createForClass(AdvanceApplication);
AdvanceApplicationSchema.index({ studentId: 1, billingMonth: 1 });
AdvanceApplicationSchema.index({ studentId: 1, createdAt: -1 });
