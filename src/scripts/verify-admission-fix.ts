import { NestFactory } from '@nestjs/core';
import { Types } from 'mongoose';
import { AppModule } from '../app.module';
import { CreateStudentDto } from '../residential/dto/create-student.dto';
import { ResidentialService } from '../residential/residential.service';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const service = app.get(ResidentialService);

  console.log('--- Verification: Admission and Ledger Fixes ---');

  const userId = new Types.ObjectId().toString(); // Dummy user
  
  // 1. Get a random room
  const roomsResp = await service.findAllRooms();
  const rooms = (roomsResp as any).data || roomsResp;
  const room = rooms.find(r => r.totalBeds > r.occupiedBeds);

  if (!room) {
    console.error('No available rooms found for testing');
    await app.close();
    return;
  }

  console.log(`Using room: ${room.name}`);

  // 2. Create a student with security deposit
  const studentDto: CreateStudentDto = {
    name: 'Test Verification Student',
    phone: '1234567890',
    roomId: room._id.toString(),
    bedNumber: room.beds ? room.beds.find(b => !b.isOccupied)?.name : 1,
    joiningDate: new Date().toISOString().split('T')[0],
    monthlyRent: 5000,
    securityDeposit: 2000,
    unionFee: 500,
  } as any;

  console.log('Creating student...');
  const student = await service.createStudent(studentDto, userId);
  
  console.log(`Student created. ID: ${student.studentId}, Security Deposit: ${student.securityDeposit}`);
  
  // VERIFY: Security deposit should be exactly 2000 (not 4000)
  if (student.securityDeposit === 2000) {
    console.log('✅ SUCCESS: Security deposit correctly initialized to 2000.');
  } else {
    console.error(`❌ FAILURE: Security deposit is ${student.securityDeposit}, expected 2000.`);
  }

  // 3. Verify getStudentDueStatus return data
  console.log('Checking due status and extra payments...');
  const dueStatus = await service.getStudentDueStatus(student._id.toString());
  
  console.log('Extra payments found:', dueStatus.extraPayments.length);
  dueStatus.extraPayments.forEach(p => {
    console.log(`- Type: ${p.type}, Amount: ${p.paidAmount}`);
  });

  const securityPayment = dueStatus.extraPayments.find(p => p.type === 'security');
  const unionFeePayment = dueStatus.extraPayments.find(p => p.type === 'union_fee');

  if (securityPayment && unionFeePayment) {
    console.log('✅ SUCCESS: Security deposit and Union fee found in extraPayments.');
  } else {
    console.error('❌ FAILURE: Missing security or union fee in extraPayments.');
  }

  // Cleanup: Delete the test student (optional, but good for idempotency if we had a proper test db)
  // For now we'll just leave it or manually delete if needed.
  
  console.log('--- Verification Complete ---');
  await app.close();
}

bootstrap();
