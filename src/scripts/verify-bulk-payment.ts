import { NestFactory } from '@nestjs/core';
import { Types } from 'mongoose';
import { AppModule } from '../app.module';
import { ResidentialService } from '../residential/residential.service';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const service = app.get(ResidentialService);

  console.log('--- Verification: Bulk Payment Feature ---');

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

  const initialSecurity = student.securityDeposit || 0;
  const initialUnion = student.unionFee || 0;

  console.log(`Testing with Student: ${student.name}`);
  console.log(`Initial Balances: Security=${initialSecurity}, UnionFee=${initialUnion}`);

  // 2. Perform Bulk Payment
  const bulkData = {
    studentId: student._id.toString(),
    rentAmount: 1800,
    securityAmount: 2000,
    unionFeeAmount: 500,
    otherAmount: 100,
    billingMonth: '2028-01',
    paymentMethod: 'cash',
    notes: 'Bulk Payment Verification',
    isAdvance: false,
  };

  console.log('Sending bulk payment request...');
  const result = await service.createBulkPayment(bulkData as any, userId);

  console.log(`Result: Success=${result.success}, Count=${result.count}`);

  // 3. Verify Payments Created
  if (result.count === 4) {
    console.log('✅ SUCCESS: 4 individual payment records created.');
  } else {
    console.error(`❌ FAILURE: Created ${result.count} records, expected 4.`);
  }

  // 4. Verify Student Balances Updated
  const updatedStudent = await service.findStudentById(student._id.toString());
  console.log(`Updated Balances: Security=${updatedStudent.securityDeposit}, UnionFee=${updatedStudent.unionFee}`);

  if (updatedStudent.securityDeposit === initialSecurity + 2000) {
    console.log('✅ SUCCESS: Security deposit balance updated correctly.');
  } else {
    console.error('❌ FAILURE: Security deposit balance mismatch.');
  }

  if (updatedStudent.unionFee === initialUnion + 500) {
    console.log('✅ SUCCESS: Union fee balance updated correctly.');
  } else {
    console.error('❌ FAILURE: Union fee balance mismatch.');
  }

  console.log('--- Verification Complete ---');
  await app.close();
}

bootstrap();
