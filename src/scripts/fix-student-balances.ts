import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { AppModule } from '../app.module';
import { Payment } from '../residential/schemas/payment.schema';
import { Student } from '../residential/schemas/student.schema';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const studentModel = app.get(getModelToken(Student.name));
  const paymentModel = app.get(getModelToken(Payment.name));

  console.log('--- Data Fix: Synchronizing Student Balances ---');

  const students = await studentModel.find({ isDeleted: false });
  console.log(`Found ${students.length} students to check.`);

  for (const student of students) {
    console.log(`\nChecking student: ${student.name} (${student.studentId})`);
    
    // 1. Calculate actual Union Fee paid
    const unionFeePayments = await paymentModel.find({
      studentId: student._id,
      type: 'union_fee',
      isDeleted: false
    });
    const actualUnionFee = unionFeePayments.reduce((sum, p) => sum + p.paidAmount, 0);

    // 2. Calculate actual Security Deposit paid (including adjustments and returns)
    const securityPayments = await paymentModel.find({
      studentId: student._id,
      type: 'security',
      isDeleted: false
    });
    const securityIn = securityPayments.reduce((sum, p) => sum + p.paidAmount, 0);
    
    const adjustmentPayments = await paymentModel.find({
      studentId: student._id,
      type: 'adjustment',
      isDeleted: false
    });
    const adjustmentsOut = adjustmentPayments.reduce((sum, p) => sum + p.paidAmount, 0);
    
    const refundPayments = await paymentModel.find({
      studentId: student._id,
      type: 'refund',
      isDeleted: false
    });
    const refundsOut = refundPayments.reduce((sum, p) => sum + p.paidAmount, 0);

    const actualSecurity = Math.max(0, securityIn - adjustmentsOut - refundsOut);
    if (securityIn - adjustmentsOut - refundsOut < 0) {
      console.warn(`  ⚠️ WARNING: Calculated security for ${student.name} is negative (${securityIn - adjustmentsOut - refundsOut}). Setting to 0.`);
    }

    // 3. Update if mismatched
    let updated = false;
    if (student.unionFee !== actualUnionFee) {
      console.log(`  [Union Fee] Mismatch: Record=${student.unionFee}, Actual=${actualUnionFee}. Updating...`);
      student.unionFee = actualUnionFee;
      updated = true;
    } else {
      console.log(`  [Union Fee] OK: ${actualUnionFee}`);
    }

    if (student.securityDeposit !== actualSecurity) {
      console.log(`  [Security] Mismatch: Record=${student.securityDeposit}, Actual=${actualSecurity}. Updating...`);
      student.securityDeposit = actualSecurity;
      updated = true;
    } else {
      console.log(`  [Security] OK: ${actualSecurity}`);
    }

    if (updated) {
      await student.save();
      console.log('  ✅ Student record updated successfully.');
    }
  }

  console.log('\n--- Data Fix Complete ---');
  await app.close();
}

bootstrap();
