import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SocketModule } from '../socket/socket.module';
import { CoachingController } from './coaching.controller';
import { CoachingService } from './coaching.service';
import { AdmissionPayment, AdmissionPaymentSchema } from './schemas/admission-payment.schema';
import { Admission, AdmissionSchema } from './schemas/admission.schema';

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
  exports: [CoachingService, MongooseModule],
})
export class CoachingModule {}
