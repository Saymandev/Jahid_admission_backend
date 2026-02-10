import { NestFactory } from '@nestjs/core';
import * as argon2 from 'argon2';
import { AppModule } from '../app.module';
import { CoachingService } from '../coaching/coaching.service';
import { ResidentialService } from '../residential/residential.service';
import { UsersService } from '../users/users.service';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const residentialService = app.get(ResidentialService);
  const coachingService = app.get(CoachingService);
  const usersService = app.get(UsersService);

  try {
    // Get or create a test user for recording
    let testUser = await usersService.findByEmail('staff@example.com');
    if (!testUser) {
      const hashedPassword = await argon2.hash('staff123');
      testUser = await usersService.create({
        email: 'staff@example.com',
        password: hashedPassword,
        name: 'Staff User',
        role: 'staff' as any,
      });
    }
    const userId = testUser._id.toString();

    console.log('🌱 Starting sample data generation...\n');

    // Get existing rooms or create new ones
    console.log('Setting up rooms...');
    const allRoomsResult = await residentialService.findAllRooms(false, { limit: 1000 });
    const existingRoomMap = new Map(allRoomsResult.data.map(r => [r.name, r]));

    let room1 = existingRoomMap.get('Room 101');
    if (!room1) {
      room1 = await residentialService.createRoom({
        name: 'Room 101',
        floor: '1st Floor',
        beds: [
          { name: 'Bed 1', price: 5000 },
          { name: 'Bed 2', price: 5000 },
          { name: 'Bed 3', price: 5000 },
          { name: 'Bed 4', price: 5000 },
        ],
        totalBeds: 4,
        monthlyRentPerBed: 5000,
      }, userId);
      console.log('  ✓ Created Room 101');
    } else {
      console.log('  ✓ Room 101 already exists');
    }

    let room2 = existingRoomMap.get('Room 102');
    if (!room2) {
      room2 = await residentialService.createRoom({
        name: 'Room 102',
        floor: '1st Floor',
        beds: [
          { name: 'Bed 1', price: 5500 },
          { name: 'Bed 2', price: 5500 },
          { name: 'Bed 3', price: 5500 },
        ],
        totalBeds: 3,
        monthlyRentPerBed: 5500,
      }, userId);
      console.log('  ✓ Created Room 102');
    } else {
      console.log('  ✓ Room 102 already exists');
    }

    let room3 = existingRoomMap.get('Room 201');
    if (!room3) {
      room3 = await residentialService.createRoom({
        name: 'Room 201',
        floor: '2nd Floor',
        beds: [
          { name: 'Bed 1', price: 6000 },
          { name: 'Bed 2', price: 6000 },
        ],
        totalBeds: 2,
        monthlyRentPerBed: 6000,
      }, userId);
      console.log('  ✓ Created Room 201');
    } else {
      console.log('  ✓ Room 201 already exists');
    }

    console.log('✓ Rooms ready\n');

    // Create Students (skip if exists)
    console.log('Setting up students...');
    let student1, student2, student3, student4;

    try {
      student1 = await residentialService.createStudent({
        name: 'Ahmed Rahman',
        phone: '01712345678',
        guardianName: 'Abdul Rahman',
        guardianPhone: '01787654321',
        roomId: room1._id.toString(),
        bedNumber: 1,
        joiningDate: new Date('2024-01-15').toISOString(),
        monthlyRent: 5000,
        securityDeposit: 10000,
      }, userId);
      console.log('  ✓ Created student: Ahmed Rahman');
    } catch (error: any) {
      console.log('  ⚠ Student Ahmed Rahman may already exist, skipping...');
      const allStudentsResult = await residentialService.findAllStudents(undefined, false, { limit: 1000 });
      student1 = allStudentsResult.data.find((s: any) => s.name === 'Ahmed Rahman') || null;
    }

    try {
      student2 = await residentialService.createStudent({
        name: 'Fatima Khan',
        phone: '01812345678',
        guardianName: 'Mohammad Khan',
        guardianPhone: '01887654321',
        roomId: room1._id.toString(),
        bedNumber: 2,
        joiningDate: new Date('2024-02-01').toISOString(),
        monthlyRent: 5000,
        securityDeposit: 10000,
      }, userId);
      console.log('  ✓ Created student: Fatima Khan');
    } catch (error: any) {
      console.log('  ⚠ Student Fatima Khan may already exist, skipping...');
      const allStudentsResult = await residentialService.findAllStudents(undefined, false, { limit: 1000 });
      student2 = allStudentsResult.data.find((s: any) => s.name === 'Fatima Khan') || null;
    }

    try {
      student3 = await residentialService.createStudent({
        name: 'Hasan Ali',
        phone: '01912345678',
        guardianName: 'Ali Ahmed',
        guardianPhone: '01987654321',
        roomId: room2._id.toString(),
        bedNumber: 1,
        joiningDate: new Date('2024-03-10').toISOString(),
        monthlyRent: 5500,
        securityDeposit: 11000,
      }, userId);
      console.log('  ✓ Created student: Hasan Ali');
    } catch (error: any) {
      console.log('  ⚠ Student Hasan Ali may already exist, skipping...');
      const allStudentsResult = await residentialService.findAllStudents(undefined, false, { limit: 1000 });
      student3 = allStudentsResult.data.find((s: any) => s.name === 'Hasan Ali') || null;
    }

    try {
      student4 = await residentialService.createStudent({
        name: 'Sara Islam',
        phone: '01612345678',
        guardianName: 'Islam Uddin',
        guardianPhone: '01687654321',
        roomId: room3._id.toString(),
        bedNumber: 1,
        joiningDate: new Date('2024-04-05').toISOString(),
        monthlyRent: 6000,
        securityDeposit: 12000,
      }, userId);
      console.log('  ✓ Created student: Sara Islam');
    } catch (error: any) {
      console.log('  ⚠ Student Sara Islam may already exist, skipping...');
      const allStudentsResult = await residentialService.findAllStudents(undefined, false, { limit: 1000 });
      student4 = allStudentsResult.data.find((s: any) => s.name === 'Sara Islam') || null;
    }

    if (!student1 || !student2 || !student3 || !student4) {
      console.log('⚠ Some students could not be created or found. Continuing with available students...');
    }

    console.log('✓ Students ready\n');

    // Create Payments (various scenarios)
    console.log('Creating payments...');
    const currentDate = new Date();
    const currentMonth = currentDate.toISOString().slice(0, 7);
    const lastMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1).toISOString().slice(0, 7);
    const twoMonthsAgo = new Date(currentDate.getFullYear(), currentDate.getMonth() - 2, 1).toISOString().slice(0, 7);

    // Student 1: Fully paid for all months
    if (student1) {
      try {
        await residentialService.createPayment({
          studentId: student1._id.toString(),
          billingMonth: twoMonthsAgo,
          paidAmount: 5000,
          paymentMethod: 'cash',
          notes: 'Full payment',
        }, userId);

        await residentialService.createPayment({
          studentId: student1._id.toString(),
          billingMonth: lastMonth,
          paidAmount: 5000,
          paymentMethod: 'bkash',
          transactionId: 'BK001234',
          notes: 'Full payment via Bkash',
        }, userId);

        await residentialService.createPayment({
          studentId: student1._id.toString(),
          billingMonth: currentMonth,
          paidAmount: 5000,
          paymentMethod: 'cash',
          notes: 'Full payment',
        }, userId);
      } catch (error: any) {
        console.log('  ⚠ Some payments for Student 1 may already exist');
      }
    }

    // Student 2: Partial payment (1 month due)
    if (student2) {
      try {
        await residentialService.createPayment({
          studentId: student2._id.toString(),
          billingMonth: twoMonthsAgo,
          paidAmount: 5000,
          paymentMethod: 'cash',
        }, userId);

        await residentialService.createPayment({
          studentId: student2._id.toString(),
          billingMonth: lastMonth,
          paidAmount: 3000,
          paymentMethod: 'cash',
          notes: 'Partial payment - 2000 due',
        }, userId);
      } catch (error: any) {
        console.log('  ⚠ Some payments for Student 2 may already exist');
      }
    }

    // Student 3: 2+ months due (unpaid)
    if (student3) {
      try {
        await residentialService.createPayment({
          studentId: student3._id.toString(),
          billingMonth: twoMonthsAgo,
          paidAmount: 5500,
          paymentMethod: 'bank',
          transactionId: 'BANK001',
        }, userId);
        // Last month and current month unpaid (2+ months due)
      } catch (error: any) {
        console.log('  ⚠ Some payments for Student 3 may already exist');
      }
    }

    // Student 4: Fully paid with advance
    if (student4) {
      try {
        await residentialService.createPayment({
          studentId: student4._id.toString(),
          billingMonth: twoMonthsAgo,
          paidAmount: 6000,
          paymentMethod: 'cash',
        }, userId);

        await residentialService.createPayment({
          studentId: student4._id.toString(),
          billingMonth: lastMonth,
          paidAmount: 7000,
          paymentMethod: 'bkash',
          transactionId: 'BK005678',
          notes: 'Paid with 1000 advance',
        }, userId);

        await residentialService.createPayment({
          studentId: student4._id.toString(),
          billingMonth: currentMonth,
          paidAmount: 5000,
          paymentMethod: 'cash',
          notes: 'Used 1000 advance',
        }, userId);
      } catch (error: any) {
        console.log('  ⚠ Some payments for Student 4 may already exist');
      }
    }

    console.log('✓ Created payment records\n');

    // Create Coaching Admissions
    console.log('Creating coaching admissions...');
    try {
      const admission1 = await coachingService.createAdmission({
        studentName: 'Rahim Uddin',
        phone: '01512345678',
        guardianName: 'Uddin Ahmed',
        guardianPhone: '01587654321',
        course: 'HSC Physics',
        batch: 'Batch-2024-A',
        totalFee: 15000,
        admissionDate: new Date('2024-01-20').toISOString(),
      }, userId);

      const admission2 = await coachingService.createAdmission({
        studentName: 'Karim Hossain',
        phone: '01412345678',
        guardianName: 'Hossain Ali',
        guardianPhone: '01487654321',
        course: 'HSC Chemistry',
        batch: 'Batch-2024-A',
        totalFee: 12000,
        admissionDate: new Date('2024-02-15').toISOString(),
      }, userId);

      const admission3 = await coachingService.createAdmission({
        studentName: 'Tasnim Begum',
        phone: '01312345678',
        guardianName: 'Begum Khan',
        guardianPhone: '01387654321',
        course: 'SSC Mathematics',
        batch: 'Batch-2024-B',
        totalFee: 10000,
        admissionDate: new Date('2024-03-01').toISOString(),
      }, userId);

      console.log('✓ Created 3 coaching admissions\n');

      // Create Coaching Payments
      console.log('Creating coaching payments...');
      try {
        await coachingService.createPayment({
          admissionId: admission1._id.toString(),
          paidAmount: 15000,
          paymentMethod: 'cash',
          notes: 'Full payment',
        }, userId);

        await coachingService.createPayment({
          admissionId: admission2._id.toString(),
          paidAmount: 6000,
          paymentMethod: 'bkash',
          transactionId: 'BK009876',
          notes: 'Partial payment - 6000 due',
        }, userId);

        await coachingService.createPayment({
          admissionId: admission3._id.toString(),
          paidAmount: 5000,
          paymentMethod: 'bank',
          transactionId: 'BANK002',
          notes: 'Partial payment - 5000 due',
        }, userId);

        console.log('✓ Created coaching payments\n');
      } catch (error: any) {
        console.log('  ⚠ Some coaching payments may already exist');
      }
    } catch (error: any) {
      console.log('  ⚠ Some coaching admissions may already exist');
    }

    console.log('✅ Sample data generation completed!\n');
    console.log('📊 Summary:');
    console.log('  - 3 Rooms ready');
    console.log('  - 4 Students ready');
    console.log('  - Multiple payment records created');
    console.log('  - 3 Coaching admissions ready');
    console.log('  - Coaching payments created\n');
    console.log('🔑 Test Accounts:');
    console.log('  Admin: admin@example.com / admin123');
    console.log('  Staff: staff@example.com / staff123\n');

  } catch (error: any) {
    console.error('Error creating sample data:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    await app.close();
  }
}

bootstrap();
