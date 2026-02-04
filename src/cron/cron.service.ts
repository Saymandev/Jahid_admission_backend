import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Student, StudentDocument } from '../residential/schemas/student.schema';
import { Payment, PaymentDocument } from '../residential/schemas/payment.schema';
import { StudentStatus } from '../residential/schemas/student.schema';
import { ResidentialService } from '../residential/residential.service';

@Injectable()
export class CronService {
  constructor(
    @InjectModel(Student.name) private studentModel: Model<StudentDocument>,
    @InjectModel(Payment.name) private paymentModel: Model<PaymentDocument>,
    private residentialService: ResidentialService,
  ) {}

  // Run on the 1st day of every month at 00:00
  @Cron('0 0 1 * *')
  async handleMonthlyBilling() {
    console.log('Running monthly billing job...');
    const currentMonth = new Date().toISOString().slice(0, 7);
    const activeStudents = await this.studentModel.find({
      status: StudentStatus.ACTIVE,
      isDeleted: false,
    });

    for (const student of activeStudents) {
      // Check if payment already exists for this month
      const existingPayment = await this.paymentModel.findOne({
        studentId: student._id,
        billingMonth: currentMonth,
        isDeleted: false,
      });

      if (!existingPayment) {
        // Create initial payment record with 0 paid amount
        const payment = new this.paymentModel({
          studentId: student._id,
          billingMonth: currentMonth,
          rentAmount: student.monthlyRent,
          paidAmount: 0,
          dueAmount: student.monthlyRent,
          advanceAmount: 0,
          paymentMethod: 'cash',
        });
        await payment.save();
        console.log(`Created billing for student ${student.studentId} for ${currentMonth}`);
      }
    }
    console.log('Monthly billing job completed');
  }

  // Run daily at 00:00 to check due statuses
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleDueStatusCheck() {
    console.log('Running due status check job...');
    // This can trigger notifications or alerts for overdue students
    // Implementation can be extended based on requirements
    console.log('Due status check completed');
  }
}
