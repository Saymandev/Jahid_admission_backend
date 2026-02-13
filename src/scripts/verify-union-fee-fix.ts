import { NestFactory } from '@nestjs/core';
import { Types } from 'mongoose';
import { AppModule } from '../app.module';
import { ResidentialService } from '../residential/residential.service';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const service = app.get(ResidentialService);

  console.log('--- Verification: Union Fee Double-Counting Fix ---');

  const userId = new Types.ObjectId().toString();
  
  // 1. Find an available room
  const roomsResp = await service.findAllRooms();
  const rooms = (roomsResp as any).data || (roomsResp as any);
  const room = rooms.find((r: any) => r.status === 'available');

  if (!room) {
    console.error('No available rooms found for testing');
    await app.close();
    return;
  }

  // 2. Create a student with Union Fee during admission
  const unionFeeAmount = 250;
  const createStudentDto = {
    name: 'Union Fee Fix Test Student',
    phone: '01700000000',
    roomId: room._id.toString(),
    bedName: room.beds.find((b: any) => !b.isOccupied).name,
    joiningDate: new Date().toISOString(),
    monthlyRent: 5000,
    unionFee: unionFeeAmount,
    securityDeposit: 0,
    initialRentPaid: 0,
  };

  console.log(`Creating student with Union Fee: ${unionFeeAmount}`);
  const student = await service.createStudent(createStudentDto as any, userId);

  console.log(`Student Created: ${student.name}`);
  console.log(`Union Fee in student record: ${student.unionFee}`);

  if (student.unionFee === unionFeeAmount) {
    console.log('✅ SUCCESS: Union Fee balance is correct (not doubled).');
  } else {
    console.error(`❌ FAILURE: Union Fee balance is ${student.unionFee}, expected ${unionFeeAmount}`);
  }

  // 3. Cleanup: Ideally delete the student/payments, but for now we just verify
  console.log('--- Verification Complete ---');
  await app.close();
}

bootstrap();
