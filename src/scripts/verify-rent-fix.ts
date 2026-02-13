import { NestFactory } from '@nestjs/core';
import { Types } from 'mongoose';
import { AppModule } from '../app.module';
import { ResidentialService } from '../residential/residential.service';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const service = app.get(ResidentialService);

  console.log('--- Verification: Rent Double-Charging Fix ---');

  const userId = new Types.ObjectId().toString();
  
  // 1. Find a student
  const studentsResp = await service.findAllStudents();
  const students = (studentsResp as any).data || studentsResp;
  const student = students[0];

  if (!student) {
    console.error('No students found for testing');
    await app.close();
    return;
  }

  const billingMonth = '2026-02';
  const rent = student.monthlyRent;

  console.log(`Testing with Student: ${student.name}, Monthly Rent: ${rent}`);

  // 2. Clear existing payments for this month to have a clean start (using a dummy month if needed)
  // Let's use a month far in the future to avoid messing up real data
  const testMonth = '2029-12';

  // 3. Record first payment (Full Rent)
  console.log(`Recording first payment of ${rent} for ${testMonth}...`);
  const p1 = await service.createPayment({
    studentId: student._id.toString(),
    billingMonth: testMonth,
    paidAmount: rent,
    paymentMethod: 'cash',
    type: 'rent',
  } as any, userId);

  console.log(`Record 1: paidAmount=${p1.paidAmount}, dueAmount=${p1.dueAmount}, advanceAmount=${p1.advanceAmount}`);

  // 4. Record second payment (10000)
  console.log(`Recording second payment of 10000 for ${testMonth} (Month already paid)...`);
  const p2 = await service.createPayment({
    studentId: student._id.toString(),
    billingMonth: testMonth,
    paidAmount: 10000,
    paymentMethod: 'cash',
    type: 'rent',
  } as any, userId);

  console.log(`Record 2: paidAmount=${p2.paidAmount}, dueAmount=${p2.dueAmount}, advanceAmount=${p2.advanceAmount}`);

  // VERIFY: p2.advanceAmount should be 10000, NOT 10000 - rent
  if (p2.advanceAmount === 10000) {
    console.log('✅ SUCCESS: Second payment correctly recorded as FULL advance (10000).');
  } else {
    console.error(`❌ FAILURE: Second payment advance is ${p2.advanceAmount}, expected 10000.`);
  }

  // 5. Check due status aggregation
  const dueStatus = await service.getStudentDueStatus(student._id.toString());
  console.log(`Current Total Advance in DueStatus: ${dueStatus.totalAdvance}`);

  console.log('--- Verification Complete ---');
  await app.close();
}

bootstrap();
