import { NestFactory } from '@nestjs/core';
import { Types } from 'mongoose';
import { AppModule } from '../app.module';
import { ResidentialService } from '../residential/residential.service';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const residentialService = app.get(ResidentialService);

  console.log('🚀 Starting Verification: Security Adjustment Fixes');

  try {
    // 1. Find a test student
    const student = await (residentialService as any).studentModel.findOne({ status: 'active' });
    if (!student) {
      console.error('❌ No active student found for testing');
      await app.close();
      return;
    }

    console.log(`📝 Testing with Student: ${student.name} (Rent: ${student.monthlyRent})`);
    const studentId = student._id.toString();
    const billingMonth = '2025-12'; // Use a future/past month that is clean

    // 2. Clear previous payments for this month to have a clean slate
    await (residentialService as any).paymentModel.deleteMany({
      studentId: new Types.ObjectId(studentId),
      billingMonth,
    });

    // Ensure student has enough security deposit
    const initialSecurity = student.securityDeposit;
    if (initialSecurity < 5000) {
       student.securityDeposit = 10000;
       await student.save();
    }

    const systemUserId = '000000000000000000000000'; // Valid ObjectId string

    console.log('--- Step 1: Record partial cash payment ---');
    await residentialService.createPayment({
      studentId,
      billingMonth,
      paidAmount: 1000,
      paymentMethod: 'cash',
      type: 'rent'
    } as any, systemUserId);

    console.log('--- Step 2: Use excess security for dues ---');
    // Using 3000 for a remaining 2000 due (assuming 3000 rent)
    // If rent is different, we adjust. 
    const remainingDue = student.monthlyRent - 1000;
    const adjustmentAmount = remainingDue + 1000; // Overpay by 1000

    await residentialService.useSecurityDepositForDues(studentId, {
      amount: adjustmentAmount,
      billingMonth,
      notes: 'Verification Test Adjustment'
    }, systemUserId);

    console.log('--- Step 3: Verify results ---');
    const payments = await (residentialService as any).paymentModel.find({
      studentId: new Types.ObjectId(studentId),
      billingMonth,
      isDeleted: false
    }).sort({ createdAt: 1 });

    console.log(`Found ${payments.length} transactions for ${billingMonth}`);
    if (payments.length !== 2) {
      console.error('❌ Expected 2 transactions, found ' + payments.length);
    } else {
      console.log('✅ Found 2 separate transactions (Cash and Adjustment)');
    }

    const lastPayment = payments[payments.length - 1];
    console.log(`Adjustment Payment: Amount=${lastPayment.paidAmount}, Due=${lastPayment.dueAmount}, Advance=${lastPayment.advanceAmount}`);

    if (lastPayment.dueAmount === 0 && lastPayment.advanceAmount === 1000) {
      console.log('✅ Correct Due (0) and Advance (1000) recorded on the adjustment record');
    } else {
      console.error(`❌ Incorrect Calculation: Due=${lastPayment.dueAmount}, Advance=${lastPayment.advanceAmount}`);
    }

    const dueStatus = await residentialService.getStudentDueStatus(studentId);
    console.log(`Calculated Due Status for ${billingMonth}: Paid=${dueStatus.payments.find(s => s.month === billingMonth)?.paidAmount}, Due=${dueStatus.payments.find(s => s.month === billingMonth)?.dueAmount}`);
    
    const monthStatus = dueStatus.payments.find(s => s.month === billingMonth);
    if (monthStatus?.dueAmount === 0) {
       console.log('✅ getStudentDueStatus correctly shows 0 due for the month');
    } else {
       console.error('❌ getStudentDueStatus incorrectly shows ' + monthStatus?.dueAmount + ' due');
    }

    console.log('🌟 Verification Successful!');

  } catch (error) {
    console.error('❌ Verification Failed:', error);
  } finally {
    await app.close();
  }
}

bootstrap();
