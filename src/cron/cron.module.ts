import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CronService } from './cron.service';
import { Student, StudentSchema } from '../residential/schemas/student.schema';
import { Payment, PaymentSchema } from '../residential/schemas/payment.schema';
import { ResidentialModule } from '../residential/residential.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Student.name, schema: StudentSchema },
      { name: Payment.name, schema: PaymentSchema },
    ]),
    ResidentialModule,
  ],
  providers: [CronService],
})
export class CronModule {}
