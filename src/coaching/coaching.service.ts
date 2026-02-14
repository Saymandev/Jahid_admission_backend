import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { PusherService } from '../common/pusher/pusher.service';
import { PaginationDto } from '../residential/dto/pagination.dto';
import { CreateAdmissionPaymentDto } from './dto/create-admission-payment.dto';
import { CreateAdmissionDto } from './dto/create-admission.dto';
import { AdmissionPayment, AdmissionPaymentDocument } from './schemas/admission-payment.schema';
import { Admission, AdmissionDocument, AdmissionStatus } from './schemas/admission.schema';

@Injectable()
export class CoachingService {
  constructor(
    @InjectModel(Admission.name) private admissionModel: Model<AdmissionDocument>,
    @InjectModel(AdmissionPayment.name) private paymentModel: Model<AdmissionPaymentDocument>,
    private pusherService: PusherService,
  ) {}

  async createAdmission(createAdmissionDto: CreateAdmissionDto, userId: string): Promise<AdmissionDocument> {
    const admissionId = await this.generateAdmissionId();
    const admission = new this.admissionModel({
      ...createAdmissionDto,
      admissionId,
      admissionDate: new Date(createAdmissionDto.admissionDate),
      dueAmount: createAdmissionDto.totalFee,
    });
    const savedAdmission = await admission.save();

    // Handle initial payment if provided
    if (createAdmissionDto.paidAmount && createAdmissionDto.paidAmount > 0) {
      await this.createPayment({
        admissionId: savedAdmission._id.toString(),
        paidAmount: createAdmissionDto.paidAmount,
        paymentMethod: 'cash', // Default to cash for initial payment, or we could add this to DTO
        notes: 'Initial admission payment',
        transactionId: '',
      }, 'system'); // 'system' or we need to pass userId to createAdmission
    }

    return savedAdmission;
  }

  async findAllAdmissions(
    status?: AdmissionStatus,
    includeDeleted: boolean = false,
    pagination?: PaginationDto,
  ): Promise<{ data: AdmissionDocument[]; total: number; page: number; limit: number; totalPages: number }> {
    const query: any = {};
    if (!includeDeleted) {
      query.isDeleted = false;
    }
    if (status) {
      query.status = status;
    }

    // Handle search
    if (pagination?.search) {
      const searchRegex = new RegExp(pagination.search, 'i');
      query.$or = [
        { studentName: searchRegex },
        { admissionId: searchRegex },
        { phone: searchRegex },
        { course: searchRegex },
        { batch: searchRegex },
      ];
    }

    // Exact match filters for batch and course
    if (pagination) {
      if ((pagination as any).batch) {
        query.batch = (pagination as any).batch;
      }
      if ((pagination as any).course) {
        query.course = (pagination as any).course;
      }
    }

    const page = pagination?.page || 1;
    const limit = pagination?.limit || 10;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.admissionModel.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).exec(),
      this.admissionModel.countDocuments(query).exec(),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findAllArchivedAdmissions(): Promise<AdmissionDocument[]> {
    return this.admissionModel
      .find({ isDeleted: true })
      .sort({ deletedAt: -1 })
      .exec();
  }

  async restoreAdmission(id: string): Promise<AdmissionDocument> {
    const admission = await this.admissionModel.findById(id);
    if (!admission || !admission.isDeleted) {
      throw new NotFoundException('Archived admission not found');
    }
    admission.isDeleted = false;
    admission.deletedAt = undefined;
    await admission.save();
    return admission;
  }

  async findAdmissionById(id: string): Promise<AdmissionDocument> {
    const admission = await this.admissionModel.findOne({ _id: id, isDeleted: false });
    if (!admission) {
      throw new NotFoundException('Admission not found');
    }
    return admission;
  }

  async createPayment(createPaymentDto: CreateAdmissionPaymentDto, userId: string): Promise<AdmissionPaymentDocument> {
    const admission = await this.findAdmissionById(createPaymentDto.admissionId);
    
    const newPaidAmount = admission.paidAmount + createPaymentDto.paidAmount;
    const newDueAmount = Math.max(0, admission.totalFee - newPaidAmount);

    if (newPaidAmount > admission.totalFee) {
      throw new BadRequestException('Payment amount exceeds total fee');
    }

    // Update admission
    admission.paidAmount = newPaidAmount;
    admission.dueAmount = newDueAmount;
    if (newDueAmount === 0) {
      admission.status = AdmissionStatus.COMPLETED;
    }
    await admission.save();

    // Create payment record
    const payment = new this.paymentModel({
      ...createPaymentDto,
      admissionId: new Types.ObjectId(createPaymentDto.admissionId),
      recordedBy: new Types.ObjectId(userId),
    });
    await payment.save();

    // Emit real-time updates
    this.pusherService.emitPaymentUpdate({
      admissionId: createPaymentDto.admissionId,
      payment: payment.toObject(),
    });

    // Emit notification
    this.pusherService.emitNotification({
      id: payment._id.toString(),
      type: 'payment',
      title: 'Payment Recorded',
      message: `Payment of ${createPaymentDto.paidAmount.toLocaleString()} BDT received for ${admission.studentName} - ${admission.course}`,
      link: `/dashboard/transactions/${payment._id}`,
      timestamp: new Date(),
    });

    return payment;
  }

  async getAdmissionPayments(admissionId: string): Promise<AdmissionPaymentDocument[]> {
    return this.paymentModel
      .find({ admissionId: new Types.ObjectId(admissionId), isDeleted: false })
      .populate('admissionId')
      .populate('recordedBy', 'name email')
      .sort({ createdAt: -1 })
      .exec();
  }

  async getAllPayments(): Promise<AdmissionPaymentDocument[]> {
    return this.paymentModel
      .find({ isDeleted: false })
      .populate('admissionId', 'studentName course batch phone')
      .populate('recordedBy', 'name email')
      .sort({ createdAt: -1 })
      .exec();
  }

  async getAdmissionStats(filters: { status?: AdmissionStatus; batch?: string; course?: string } = {}): Promise<any> {
    const query: any = { isDeleted: false };
    
    if (filters.status) {
      query.status = filters.status;
    }
    if (filters.batch && filters.batch !== 'all') {
      query.batch = filters.batch;
    }
    if (filters.course && filters.course !== 'all') {
      query.course = filters.course;
    }

    const admissions = await this.admissionModel.find(query).exec();

    const totalAdmissions = admissions.length;
    // For pending count, if status filter is applied, it will just match total if status=pending, or 0 if status!=pending
    // But usually stats are "summary based on current view".
    // If the user filters by "Pending", the Total Admissions should be the count of Pending.
    // The "Pending" card might be redundant if filtering by Pending, but let's keep it consistent.
    // Actually, usually dashboard stats show "Total of current view", "Pending of current view" etc.
    
    const pendingAdmissions = admissions.filter(a => a.status === AdmissionStatus.PENDING).length;
    
    const totalDue = admissions.reduce((sum, a) => sum + (a.dueAmount || 0), 0);
    const totalCollected = admissions.reduce((sum, a) => sum + (a.paidAmount || 0), 0);

    return {
      totalAdmissions,
      pendingAdmissions,
      totalDue,
      totalCollected,
    };
  }

  private async generateAdmissionId(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `ADM${year}`;
    const lastAdmission = await this.admissionModel
      .findOne({ admissionId: new RegExp(`^${prefix}`) })
      .sort({ admissionId: -1 })
      .exec();
    
    if (!lastAdmission) {
      return `${prefix}001`;
    }
    
    const lastNumber = parseInt(lastAdmission.admissionId.slice(-3));
    const newNumber = (lastNumber + 1).toString().padStart(3, '0');
    return `${prefix}${newNumber}`;
  }
}
