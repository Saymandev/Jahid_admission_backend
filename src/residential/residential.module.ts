import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ResidentialService } from './residential.service';
import { ResidentialController } from './residential.controller';
import { Room, RoomSchema } from './schemas/room.schema';
import { Student, StudentSchema } from './schemas/student.schema';
import { Payment, PaymentSchema } from './schemas/payment.schema';
import { AuditLog, AuditLogSchema } from './schemas/audit-log.schema';
import { SecurityDepositTransaction, SecurityDepositTransactionSchema } from './schemas/security-deposit-transaction.schema';
import { AdvanceApplication, AdvanceApplicationSchema } from './schemas/advance-application.schema';
import { SocketModule } from '../socket/socket.module';

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
    forwardRef(() => SocketModule),
  ],
  providers: [ResidentialService],
  controllers: [ResidentialController],
  exports: [ResidentialService],
})
export class ResidentialModule {}
