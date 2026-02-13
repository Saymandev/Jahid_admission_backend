import { NestFactory } from '@nestjs/core';
import { Types } from 'mongoose';
import { AppModule } from '../app.module';
import { ResidentialService } from '../residential/residential.service';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const service = app.get(ResidentialService);

  console.log('--- Verification: Quick Rent Feature ---');

  const userId = new Types.ObjectId().toString();
  
  // 1. Find an active student
  const studentsResp = await service.findAllStudents();
  const students = (studentsResp as any).data || studentsResp;
  const student = students.find((s: any) => s.status === 'active');

  if (!student) {
    console.error('No active students found for testing');
    await app.close();
    return;
  }

  console.log(`Testing Quick Rent for Student: ${student.name} (Rent: ${student.monthlyRent})`);

  // 2. Perform Quick Rent (Bulk Payment)
  const quickPaymentData = {
    studentId: student._id.toString(),
    rentAmount: student.monthlyRent,
    billingMonth: '2028-02',
    paymentMethod: 'cash',
    notes: 'Quick Rent Verification',
    isAdvance: false,
  };

  console.log('Processing quick rent...');
  const result = await service.createBulkPayment(quickPaymentData as any, userId);

  if (result.success && result.count >= 1) {
    console.log(`✅ SUCCESS: Quick rent record created. Count=${result.count}`);
  } else {
    console.error(`❌ FAILURE: Quick rent failed. Result=${JSON.stringify(result)}`);
  }

  // 3. Optional: Add a second quick payment with different fees
  const complexQuickData = {
    studentId: student._id.toString(),
    rentAmount: 0,
    securityAmount: 500,
    unionFeeAmount: 200,
    paymentMethod: 'bkash',
    notes: 'Complex Quick Payment Verification',
  };

  console.log('Processing complex quick payment (Security & Union Fee)...');
  const complexResult = await service.createBulkPayment(complexQuickData as any, userId);

  if (complexResult.success && complexResult.count === 2) {
    console.log('✅ SUCCESS: Complex quick payment created matching records.');
  } else {
    console.error(`❌ FAILURE: Complex quick payment failed. Count=${complexResult.count}`);
  }

  console.log('--- Verification Complete ---');
  await app.close();
}

bootstrap();
