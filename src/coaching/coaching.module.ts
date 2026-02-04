import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CoachingService } from './coaching.service';
import { CoachingController } from './coaching.controller';
import { Admission, AdmissionSchema } from './schemas/admission.schema';
import { AdmissionPayment, AdmissionPaymentSchema } from './schemas/admission-payment.schema';
import { SocketModule } from '../socket/socket.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Admission.name, schema: AdmissionSchema },
      { name: AdmissionPayment.name, schema: AdmissionPaymentSchema },
    ]),
    forwardRef(() => SocketModule),
  ],
  providers: [CoachingService],
  controllers: [CoachingController],
  exports: [CoachingService],
})
export class CoachingModule {}
