import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AuditLogDocument = AuditLog & Document;

export enum AuditAction {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  PAYMENT = 'payment',
  CHECKOUT = 'checkout',
  LOGIN = 'login',
  LOGOUT = 'logout',
  USE_SECURITY_DEPOSIT = 'use_security_deposit',
  RETURN_SECURITY_DEPOSIT = 'return_security_deposit',
  REACTIVATE = 'reactivate',
}

@Schema({ timestamps: true })
export class AuditLog {
  @Prop({ required: true, enum: AuditAction })
  action: AuditAction;

  @Prop({ required: true })
  entity: string; // 'Room', 'Student', 'Payment', 'Admission', etc.

  @Prop({ type: Types.ObjectId })
  entityId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop()
  description?: string;

  @Prop({ type: Object })
  oldData?: any;

  @Prop({ type: Object })
  newData?: any;

  @Prop()
  ipAddress?: string;
}

export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);
AuditLogSchema.index({ entity: 1, entityId: 1 });
AuditLogSchema.index({ userId: 1 });
AuditLogSchema.index({ createdAt: -1 });
