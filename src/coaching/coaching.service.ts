import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Admission, AdmissionDocument } from './schemas/admission.schema';
import { AdmissionPayment, AdmissionPaymentDocument } from './schemas/admission-payment.schema';
import { CreateAdmissionDto } from './dto/create-admission.dto';
import { CreateAdmissionPaymentDto } from './dto/create-admission-payment.dto';
import { AdmissionStatus } from './schemas/admission.schema';
import { PaginationDto } from '../residential/dto/pagination.dto';
import { SocketGateway } from '../socket/socket.gateway';

@Injectable()
export class CoachingService {
  constructor(
    @InjectModel(Admission.name) private admissionModel: Model<AdmissionDocument>,
    @InjectModel(AdmissionPayment.name) private paymentModel: Model<AdmissionPaymentDocument>,
    private socketGateway: SocketGateway,
  ) {}

  async createAdmission(createAdmissionDto: CreateAdmissionDto): Promise<AdmissionDocument> {
    const admissionId = await this.generateAdmissionId();
    const admission = new this.admissionModel({
      ...createAdmissionDto,
      admissionId,
      admissionDate: new Date(createAdmissionDto.admissionDate),
      dueAmount: createAdmissionDto.totalFee,
    });
    return admission.save();
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
    this.socketGateway.emitPaymentUpdate({
      admissionId: createPaymentDto.admissionId,
      payment: payment.toObject(),
    });

    // Emit notification
    this.socketGateway.emitNotification({
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

  async getAdmissionStats(): Promise<any> {
    const totalAdmissions = await this.admissionModel.countDocuments({ isDeleted: false });
    const pendingAdmissions = await this.admissionModel.countDocuments({
      status: AdmissionStatus.PENDING,
      isDeleted: false,
    });
    
    const allAdmissions = await this.admissionModel.find({ isDeleted: false }).exec();
    const totalDue = allAdmissions.reduce((sum, a) => sum + a.dueAmount, 0);
    const totalCollected = allAdmissions.reduce((sum, a) => sum + a.paidAmount, 0);

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
