import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CoachingModule } from '../coaching/coaching.module';
import { ResidentialController } from './residential.controller';
import { ResidentialService } from './residential.service';
import { AdvanceApplication, AdvanceApplicationSchema } from './schemas/advance-application.schema';
import { AuditLog, AuditLogSchema } from './schemas/audit-log.schema';
import { Payment, PaymentSchema } from './schemas/payment.schema';
import { Room, RoomSchema } from './schemas/room.schema';
import { SecurityDepositTransaction, SecurityDepositTransactionSchema } from './schemas/security-deposit-transaction.schema';
import { Student, StudentSchema } from './schemas/student.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Room.name, schema: RoomSchema },
      { name: Student.name, schema: StudentSchema },
      { name: Payment.name, schema: PaymentSchema },
      { name: AuditLog.name, schema: AuditLogSchema },
      { name: SecurityDepositTransaction.name, schema: SecurityDepositTransactionSchema },
      { name: AdvanceApplication.name, schema: AdvanceApplicationSchema },
    ]),
    CoachingModule,
  ],
  providers: [ResidentialService],
  controllers: [ResidentialController],
  exports: [ResidentialService],
})
export class ResidentialModule {}
