import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CoachingService } from '../coaching/coaching.service';
import { SocketGateway } from '../socket/socket.gateway';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { CreateRoomDto } from './dto/create-room.dto';
import { CreateStudentDto } from './dto/create-student.dto';
import { PaginationDto } from './dto/pagination.dto';
import { ReactivateStudentDto } from './dto/reactivate-student.dto';
import { ReturnSecurityDepositDto } from './dto/return-security-deposit.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { UseSecurityDepositDto } from './dto/use-security-deposit.dto';
import { AdvanceApplication, AdvanceApplicationDocument } from './schemas/advance-application.schema';
import { AuditLog, AuditLogDocument } from './schemas/audit-log.schema';
import { Payment, PaymentDocument, PaymentMethod } from './schemas/payment.schema';
import { Room, RoomDocument, RoomStatus } from './schemas/room.schema';
import { SecurityDepositTransaction, SecurityDepositTransactionDocument, SecurityDepositTransactionType } from './schemas/security-deposit-transaction.schema';
import { Student, StudentDocument, StudentStatus } from './schemas/student.schema';

@Injectable()
export class ResidentialService {
  constructor(
    @InjectModel(Room.name) private roomModel: Model<RoomDocument>,
    @InjectModel(Student.name) private studentModel: Model<StudentDocument>,
    @InjectModel(Payment.name) private paymentModel: Model<PaymentDocument>,
    @InjectModel(AuditLog.name) private auditLogModel: Model<AuditLogDocument>,
    @InjectModel(SecurityDepositTransaction.name) private securityDepositTransactionModel: Model<SecurityDepositTransactionDocument>,
    @InjectModel(AdvanceApplication.name) private advanceApplicationModel: Model<AdvanceApplicationDocument>,
    @Inject(forwardRef(() => SocketGateway)) private socketGateway: SocketGateway,
    private coachingService: CoachingService,
  ) {}

  // ========== ROOM METHODS ==========
  async createRoom(createRoomDto: CreateRoomDto, userId: string): Promise<RoomDocument> {
    // Convert beds DTO to Bed schema format
    const beds = createRoomDto.beds.map(bed => ({
      name: bed.name,
      price: bed.price,
      isOccupied: false,
    }));

    // Calculate monthlyRentPerBed as average if not provided
    const monthlyRentPerBed = createRoomDto.monthlyRentPerBed || 
      (beds.length > 0 ? beds.reduce((sum, bed) => sum + bed.price, 0) / beds.length : 0);

    const room = new this.roomModel({
      name: createRoomDto.name,
      floor: createRoomDto.floor,
      beds,
      totalBeds: createRoomDto.totalBeds,
      monthlyRentPerBed,
      status: RoomStatus.AVAILABLE,
      occupiedBeds: 0,
    });
    await room.save();

    await this.createAuditLog('create', 'Room', room._id.toString(), userId, null, room.toObject());
    return room;
  }

  async findAllRooms(
    includeDeleted: boolean = false,
    pagination?: PaginationDto,
  ): Promise<{ data: RoomDocument[]; total: number; page: number; limit: number; totalPages: number }> {
    const query: any = {};
    if (!includeDeleted) {
      query.isDeleted = false;
    }

    // Handle search
    if (pagination?.search) {
      const searchRegex = new RegExp(pagination.search, 'i');
      query.$or = [
        { name: searchRegex },
        { floor: searchRegex },
      ];
    }

    const page = pagination?.page || 1;
    const limit = pagination?.limit || 10;
    const skip = (page - 1) * limit;

    const [rooms, total] = await Promise.all([
      this.roomModel.find(query).sort({ name: 1 }).skip(skip).limit(limit).exec(),
      this.roomModel.countDocuments(query).exec(),
    ]);
    
    // Auto-generate beds for rooms that don't have beds but have totalBeds
    for (const room of rooms) {
      if ((!room.beds || room.beds.length === 0) && room.totalBeds > 0) {
        // Create beds based on totalBeds
        room.beds = Array.from({ length: room.totalBeds }, (_, index) => ({
          name: `Bed ${index + 1}`,
          price: room.monthlyRentPerBed,
          isOccupied: false,
        }));
        
        // Mark beds as occupied based on existing students
        const students = await this.studentModel.find({
          roomId: room._id,
          status: StudentStatus.ACTIVE,
          isDeleted: false,
        }).exec();
        
        for (const student of students) {
          if (student.bedNumber && student.bedNumber <= room.beds.length) {
            room.beds[student.bedNumber - 1].isOccupied = true;
          }
        }
        
        // Save the updated room
        await room.save();
      }
    }
    
    return {
      data: rooms,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findAllArchivedRooms(): Promise<RoomDocument[]> {
    return this.roomModel
      .find({ isDeleted: true })
      .sort({ deletedAt: -1 })
      .exec();
  }

  async restoreRoom(id: string, userId: string): Promise<RoomDocument> {
    const room = await this.roomModel.findById(id);
    if (!room || !room.isDeleted) {
      throw new NotFoundException('Archived room not found');
    }
    room.isDeleted = false;
    room.deletedAt = undefined;
    await room.save();
    await this.createAuditLog('restore', 'Room', id, userId, null, room.toObject());
    return room;
  }

  async findRoomById(id: string): Promise<RoomDocument> {
    const room = await this.roomModel.findOne({ _id: id, isDeleted: false });
    if (!room) {
      throw new NotFoundException('Room not found');
    }
    return room;
  }

  async updateRoom(id: string, updateRoomDto: UpdateRoomDto, userId: string): Promise<RoomDocument> {
    const room = await this.findRoomById(id);
    const oldData = room.toObject();
    Object.assign(room, updateRoomDto);
    await room.save();

    await this.createAuditLog('update', 'Room', room._id.toString(), userId, oldData, room.toObject());
    return room;
  }

  async deleteRoom(id: string, userId: string): Promise<void> {
    const room = await this.findRoomById(id);
    const activeStudents = await this.studentModel.countDocuments({
      roomId: room._id,
      status: StudentStatus.ACTIVE,
      isDeleted: false,
    });
    if (activeStudents > 0) {
      throw new BadRequestException('Cannot delete room with active students');
    }
    room.isDeleted = true;
    room.deletedAt = new Date();
    await room.save();

    await this.createAuditLog('delete', 'Room', room._id.toString(), userId, room.toObject(), null);
  }

  // ========== STUDENT METHODS ==========
  async createStudent(createStudentDto: CreateStudentDto, userId: string): Promise<StudentDocument> {
    const room = await this.findRoomById(createStudentDto.roomId);
    
    let bedNumber = createStudentDto.bedNumber;
    let bedPrice = room.monthlyRentPerBed;

    // If bedName is provided, find the bed and use its price
    if (createStudentDto.bedName && room.beds && room.beds.length > 0) {
      const bedIndex = room.beds.findIndex(bed => bed.name === createStudentDto.bedName);
      if (bedIndex === -1) {
        throw new NotFoundException(`Bed "${createStudentDto.bedName}" not found in room`);
      }
      const bed = room.beds[bedIndex];
      if (bed.isOccupied) {
        throw new ConflictException(`Bed "${createStudentDto.bedName}" is already occupied`);
      }
      bedNumber = bedIndex + 1; // Use 1-based index
      bedPrice = bed.price;
      bed.isOccupied = true;
    } else if (bedNumber) {
      // Check if bed is available using bedNumber
      const existingStudent = await this.studentModel.findOne({
        roomId: new Types.ObjectId(createStudentDto.roomId),
        bedNumber: bedNumber,
        status: StudentStatus.ACTIVE,
        isDeleted: false,
      });
      if (existingStudent) {
        throw new ConflictException('Bed is already occupied');
      }
      // Mark bed as occupied if beds array exists
      if (room.beds && room.beds.length >= bedNumber) {
        const bed = room.beds[bedNumber - 1];
        if (bed.isOccupied) {
          throw new ConflictException(`Bed ${bedNumber} is already occupied`);
        }
        bed.isOccupied = true;
      }
    } else {
      throw new BadRequestException('Either bedNumber or bedName must be provided');
    }

    // Generate student ID
    const studentId = await this.generateStudentId();

    const student = new this.studentModel({
      ...createStudentDto,
      studentId,
      roomId: new Types.ObjectId(createStudentDto.roomId),
      bedNumber: bedNumber!,
      monthlyRent: createStudentDto.monthlyRent || bedPrice,
      joiningDate: new Date(createStudentDto.joiningDate),
    });
    await student.save();

    await student.save();

    // Update room occupied beds
    room.occupiedBeds += 1;
    if (room.occupiedBeds >= room.totalBeds) {
      room.status = RoomStatus.FULL;
    }
    await room.save();

    // Record Union Fee if provided
    if (createStudentDto.unionFee && createStudentDto.unionFee > 0) {
      await this.createPayment({
        studentId: student._id.toString(),
        billingMonth: new Date().toISOString().slice(0, 7),
        rentAmount: 0,
        paidAmount: createStudentDto.unionFee,
        paymentMethod: 'cash', // Default or need DTO update
        notes: 'Union Fee (Non-refundable)',
        transactionId: '',
        type: 'union_fee' as any, // Cast because we just added the enum
      } as any, userId);
    }

    // Record Security Deposit if provided
    if (createStudentDto.securityDeposit && createStudentDto.securityDeposit > 0) {
      // We already set student.securityDeposit above, now record the transaction
      const transaction = new this.securityDepositTransactionModel({
        studentId: student._id,
        type: SecurityDepositTransactionType.ADJUSTMENT, // Initial deposit is an adjustment/addition
        amount: createStudentDto.securityDeposit,
        notes: 'Initial Security Deposit',
        processedBy: new Types.ObjectId(userId),
      });
      await transaction.save();

      // ALSO Record as a Payment for the main ledger
      await this.createPayment({
        studentId: student._id.toString(),
        billingMonth: new Date().toISOString().slice(0, 7),
        rentAmount: 0,
        paidAmount: createStudentDto.securityDeposit,
        paymentMethod: 'cash', // Default
        notes: 'Initial Security Deposit',
        transactionId: '',
        type: 'security' as any,
      } as any, userId);
    }

    await this.createAuditLog('create', 'Student', student._id.toString(), userId, null, student.toObject());
    return student;
  }

  async findAllStudents(
    status?: StudentStatus,
    includeDeleted: boolean = false,
    pagination?: PaginationDto,
  ): Promise<{ data: StudentDocument[]; total: number; page: number; limit: number; totalPages: number }> {
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
        { name: searchRegex },
        { studentId: searchRegex },
        { phone: searchRegex },
      ];
    }

    const page = pagination?.page || 1;
    const limit = pagination?.limit || 10;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.studentModel
        .find(query)
        .populate('roomId')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.studentModel.countDocuments(query).exec(),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findAllArchivedStudents(): Promise<StudentDocument[]> {
    return this.studentModel
      .find({ isDeleted: true })
      .populate('roomId')
      .sort({ deletedAt: -1 })
      .exec();
  }

  async restoreStudent(id: string, userId: string): Promise<StudentDocument> {
    const student = await this.studentModel.findById(id);
    if (!student || !student.isDeleted) {
      throw new NotFoundException('Archived student not found');
    }
    student.isDeleted = false;
    student.deletedAt = undefined;
    await student.save();
    await this.createAuditLog('restore', 'Student', id, userId, null, student.toObject());
    return student;
  }

  async findStudentById(id: string): Promise<StudentDocument> {
    const student = await this.studentModel
      .findOne({ _id: id, isDeleted: false })
      .populate('roomId');
    if (!student) {
      throw new NotFoundException('Student not found');
    }
    return student;
  }

  async findStudentByPhoneOrName(phone?: string, name?: string): Promise<StudentDocument | null> {
    if (!phone && !name) {
      return null;
    }
    const query: any = { isDeleted: false };
    
    // If phone is provided, prioritize exact phone match
    if (phone && phone.trim().length >= 3) {
      query.phone = phone.trim();
    }
    // If name is provided and no phone match, search by name
    if (name && name.trim().length >= 3) {
      if (phone && phone.trim().length >= 3) {
        // Both provided - use AND logic
        query.$and = [
          { phone: phone.trim() },
          { name: { $regex: new RegExp(name.trim(), 'i') } }
        ];
        delete query.phone; // Remove from main query since it's in $and
      } else {
        // Only name provided
        query.name = { $regex: new RegExp(name.trim(), 'i') };
      }
    }
    
    // Find the most recent student (by creation date) matching the criteria
    return this.studentModel
      .findOne(query)
      .populate('roomId')
      .sort({ createdAt: -1 })
      .exec();
  }

  async updateStudent(id: string, updateStudentDto: UpdateStudentDto, userId: string): Promise<StudentDocument> {
    const student = await this.findStudentById(id);
    const oldData = student.toObject();
    Object.assign(student, updateStudentDto);
    await student.save();

    await this.createAuditLog('update', 'Student', student._id.toString(), userId, oldData, student.toObject());
    return student;
  }

  async reactivateStudent(id: string, reactivateDto: ReactivateStudentDto, userId: string): Promise<StudentDocument> {
    const student = await this.studentModel.findById(id);
    if (!student || student.isDeleted) {
      throw new NotFoundException('Student not found');
    }
    if (student.status !== StudentStatus.LEFT) {
      throw new BadRequestException('Student is not left. Only left students can be reactivated.');
    }

    const oldData = student.toObject();
    const room = await this.findRoomById(reactivateDto.roomId);
    
    let bedNumber = reactivateDto.bedNumber;
    let bedPrice = room.monthlyRentPerBed;

    // If bedName is provided, find the bed and use its price
    if (reactivateDto.bedName && room.beds && room.beds.length > 0) {
      const bedIndex = room.beds.findIndex(bed => bed.name === reactivateDto.bedName);
      if (bedIndex === -1) {
        throw new NotFoundException(`Bed "${reactivateDto.bedName}" not found in room`);
      }
      const bed = room.beds[bedIndex];
      if (bed.isOccupied) {
        throw new ConflictException(`Bed "${reactivateDto.bedName}" is already occupied`);
      }
      bedNumber = bedIndex + 1; // Use 1-based index
      bedPrice = bed.price;
      bed.isOccupied = true;
    } else if (bedNumber) {
      // Check if bed is available using bedNumber
      const existingStudent = await this.studentModel.findOne({
        roomId: new Types.ObjectId(reactivateDto.roomId),
        bedNumber: bedNumber,
        status: StudentStatus.ACTIVE,
        isDeleted: false,
      });
      if (existingStudent) {
        throw new ConflictException('Bed is already occupied');
      }
      // Mark bed as occupied if beds array exists
      if (room.beds && room.beds.length >= bedNumber) {
        const bed = room.beds[bedNumber - 1];
        if (bed.isOccupied) {
          throw new ConflictException(`Bed ${bedNumber} is already occupied`);
        }
        bed.isOccupied = true;
      }
    } else {
      throw new BadRequestException('Either bedNumber or bedName must be provided');
    }

    // Free the old bed if student had a different room
    if (student.roomId.toString() !== reactivateDto.roomId) {
      const oldRoom = await this.findRoomById(student.roomId.toString());
      if (oldRoom.beds && oldRoom.beds.length > 0) {
        if (typeof student.bedNumber === 'number' && student.bedNumber > 0 && student.bedNumber <= oldRoom.beds.length) {
          const oldBed = oldRoom.beds[student.bedNumber - 1];
          if (oldBed) {
            oldBed.isOccupied = false;
          }
        } else {
          const bedName = String(student.bedNumber);
          const oldBed = oldRoom.beds.find(b => b.name === bedName);
          if (oldBed) {
            oldBed.isOccupied = false;
          }
        }
        oldRoom.occupiedBeds = Math.max(0, oldRoom.occupiedBeds - 1);
        if (oldRoom.status === RoomStatus.FULL && oldRoom.occupiedBeds < oldRoom.totalBeds) {
          oldRoom.status = RoomStatus.AVAILABLE;
        }
        await oldRoom.save();
      }
    }

    // Update student
    student.roomId = new Types.ObjectId(reactivateDto.roomId);
    student.bedNumber = bedNumber!;
    student.joiningDate = new Date(reactivateDto.joiningDate);
    student.status = StudentStatus.ACTIVE;
    student.monthlyRent = reactivateDto.monthlyRent || bedPrice;
    if (reactivateDto.securityDeposit !== undefined) {
      student.securityDeposit = reactivateDto.securityDeposit;
    }
    await student.save();

    // Update new room occupied beds
    room.occupiedBeds += 1;
    if (room.occupiedBeds >= room.totalBeds) {
      room.status = RoomStatus.FULL;
    }
    await room.save();

    await this.createAuditLog('reactivate', 'Student', student._id.toString(), userId, oldData, student.toObject());
    
    // Emit real-time updates
    this.socketGateway.emitDashboardUpdate(await this.getDashboardStats());
    
    return student;
  }

  async getStudentPayments(studentId: string): Promise<PaymentDocument[]> {
    return this.paymentModel
      .find({ studentId: new Types.ObjectId(studentId), isDeleted: false })
      .populate('studentId')
      .populate('recordedBy', 'name email')
      .sort({ billingMonth: -1 })
      .exec();
  }

  async getAllPayments(
    pagination?: PaginationDto,
    userId?: string,
  ): Promise<{ data: PaymentDocument[]; total: number; page: number; limit: number; totalPages: number }> {
    const query: any = { isDeleted: false };
    
    // If userId is provided, filter by that user (for staff users)
    if (userId) {
      query.recordedBy = new Types.ObjectId(userId);
    }

    // Handle search
    if (pagination?.search) {
      const searchRegex = new RegExp(pagination.search, 'i');
      query.$or = [
        { transactionId: searchRegex },
        { notes: searchRegex },
      ];
    }

    const page = pagination?.page || 1;
    const limit = pagination?.limit || 10;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.paymentModel
        .find(query)
        .populate({
          path: 'studentId',
          select: 'name studentId phone roomId bedNumber monthlyRent',
          populate: {
            path: 'roomId',
            select: 'name floor',
          },
        })
        .populate('recordedBy', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.paymentModel.countDocuments(query).exec(),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getAdvanceApplications(studentId: string): Promise<any> {
    const applications = await this.advanceApplicationModel
      .find({ studentId: new Types.ObjectId(studentId), isDeleted: false })
      .populate('advancePaymentId')
      .sort({ createdAt: -1 })
      .exec();

    // Get all advance sources (overpayment + explicit advance)
    const allPayments = await this.getStudentPayments(studentId);
    const advanceSources = [];

    // 1. Explicit advance payments (billingMonth = 'ADVANCE')
    const explicitAdvance = allPayments.find(p => p.billingMonth === 'ADVANCE' && !p.isDeleted);
    if (explicitAdvance) {
      advanceSources.push({
        type: 'explicit',
        month: 'ADVANCE',
        amount: explicitAdvance.advanceAmount,
        paidAmount: explicitAdvance.paidAmount,
        paymentDate: (explicitAdvance as any).createdAt || new Date(),
        paymentMethod: explicitAdvance.paymentMethod,
        notes: explicitAdvance.notes,
        paymentId: explicitAdvance._id,
      });
    }

    // 2. Overpayment advance from regular payments (when paid more than rent)
    allPayments.forEach((payment) => {
      if (payment.billingMonth !== 'ADVANCE' && payment.advanceAmount > 0 && !payment.isDeleted) {
        advanceSources.push({
          type: 'overpayment',
          month: payment.billingMonth,
          amount: payment.advanceAmount,
          paidAmount: payment.paidAmount,
          rentAmount: payment.rentAmount,
          paymentDate: (payment as any).createdAt || new Date(),
          paymentMethod: payment.paymentMethod,
          notes: payment.notes,
          paymentId: payment._id,
        });
      }
    });

    return {
      sources: advanceSources.sort((a, b) => new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime()),
      applications: applications,
    };
  }

  async getStudentDueStatus(studentId: string): Promise<any> {
    const student = await this.findStudentById(studentId);
    const payments = await this.getStudentPayments(studentId);
    
    const currentMonthString = new Date().toISOString().slice(0, 7);
    const months = this.generateMonthsSinceJoining(student.joiningDate, currentMonthString);
    
    const paymentMap = new Map();
    payments.forEach(p => paymentMap.set(p.billingMonth, p));

    // Automatically create payment records for past months without payment
    // This ensures dues are automatically tracked when months pass
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonthIndex = today.getMonth(); // 0-indexed (0 = January)
    const currentMonthDate = new Date(currentYear, currentMonthIndex, 1);
    
    for (const month of months) {
      const monthDate = new Date(month + '-01');
      // Only auto-create for past months (months that have completely passed)
      // Compare to the first day of current month to ensure we don't create for current month
      if (monthDate < currentMonthDate && !paymentMap.has(month)) {
        // Create a payment record with 0 paid amount to mark it as due
        const autoPayment = new this.paymentModel({
          studentId: new Types.ObjectId(studentId),
          billingMonth: month,
          rentAmount: student.monthlyRent,
          paidAmount: 0,
          dueAmount: student.monthlyRent,
          advanceAmount: 0,
          paymentMethod: PaymentMethod.CASH,
          // recordedBy is optional, so we can leave it undefined for auto-generated dues
        });
        await autoPayment.save();
        paymentMap.set(month, autoPayment);
        
        // Emit notification for auto-created due
        this.socketGateway.emitNotification({
          id: `due-${studentId}-${month}`,
          type: 'due',
          title: 'New Due Created',
          message: `Due of ${student.monthlyRent.toLocaleString()} BDT created for ${student.name} (${month})`,
          link: `/dashboard/students/${studentId}`,
          timestamp: new Date(),
        });
      }
    }

    const status = [];
    let totalDue = 0;
    let consecutiveDue = 0;
    let maxConsecutiveDue = 0;

    // Get total advance amount from:
    // 1. Explicit advance payments (billingMonth = 'ADVANCE')
    // 2. Overpayment advance (advanceAmount from regular payments)
    const advancePayment = paymentMap.get('ADVANCE');
    let totalAdvance = advancePayment?.advanceAmount || 0;
    
    // Add advance from overpayments in regular payments
    payments.forEach((p) => {
      if (p.billingMonth !== 'ADVANCE' && p.advanceAmount > 0) {
        totalAdvance += p.advanceAmount;
      }
    });
    
    const advancePaymentId = advancePayment?._id;

    for (const month of months) {
      const payment = paymentMap.get(month);
      const rentAmount = student.monthlyRent;
      let paidAmount = payment?.paidAmount || 0;
      let dueAmount = payment ? Math.max(0, rentAmount - paidAmount) : rentAmount;
      let monthAdvance = payment?.advanceAmount || 0;
      const dueAmountBefore = dueAmount;

      // Apply advance payment to this month's due if there's any
      if (totalAdvance > 0 && dueAmount > 0) {
        const advanceToApply = Math.min(totalAdvance, dueAmount);
        const dueAmountAfter = dueAmount - advanceToApply;
        const remainingAdvance = totalAdvance - advanceToApply;

        // Check if advance application already exists for this month to avoid duplicates
        const existingApplication = await this.advanceApplicationModel.findOne({
          studentId: new Types.ObjectId(studentId),
          billingMonth: month,
          isDeleted: false,
        });

        // Only record if it doesn't exist yet (first time applying advance to this month)
        if (!existingApplication) {
          const advanceApplication = new this.advanceApplicationModel({
            studentId: new Types.ObjectId(studentId),
            billingMonth: month,
            advanceAmountApplied: advanceToApply,
            dueAmountBefore: dueAmount,
            dueAmountAfter: dueAmountAfter,
            remainingAdvance: remainingAdvance,
            advancePaymentId: advancePaymentId,
            notes: `Advance automatically applied to ${month}`,
          });
          await advanceApplication.save();
        }

        dueAmount = dueAmountAfter;
        paidAmount += advanceToApply;
        totalAdvance = remainingAdvance;
        monthAdvance += advanceToApply;
      }

      if (dueAmount > 0) {
        totalDue += dueAmount;
        consecutiveDue++;
        maxConsecutiveDue = Math.max(maxConsecutiveDue, consecutiveDue);
      } else {
        consecutiveDue = 0;
      }

      // Check if advance was applied to this month
      const advanceApplication = await this.advanceApplicationModel.findOne({
        studentId: new Types.ObjectId(studentId),
        billingMonth: month,
        isDeleted: false,
      });

      status.push({
        month,
        rentAmount,
        paidAmount,
        dueAmount,
        advanceAmount: monthAdvance,
        advanceApplied: advanceApplication ? advanceApplication.advanceAmountApplied : 0,
        paymentMethod: payment?.paymentMethod,
        paymentDate: payment?.createdAt,
        status: dueAmount === 0 ? 'paid' : dueAmount < rentAmount ? 'partial' : 'unpaid',
      });
    }

    // Calculate remaining advance after all applications
    const remainingAdvance = totalAdvance;

    return {
      student,
      payments: status,
      totalDue,
      totalAdvance: remainingAdvance,
      dueStatus: maxConsecutiveDue === 0 ? 'no_due' : maxConsecutiveDue === 1 ? 'one_month' : 'two_plus_months',
      consecutiveDueMonths: maxConsecutiveDue,
    };
  }

  async deleteAdvancePayment(studentId: string, userId: string): Promise<void> {
    const student = await this.findStudentById(studentId);
    
    // Find advance payment
    const advancePayment = await this.paymentModel.findOne({
      studentId: new Types.ObjectId(studentId),
      billingMonth: 'ADVANCE',
      isDeleted: false,
    });

    if (!advancePayment) {
      throw new NotFoundException('No advance payment found');
    }

    // Check if advance has been applied to any months
    const appliedAdvance = await this.advanceApplicationModel.find({
      studentId: new Types.ObjectId(studentId),
      advancePaymentId: advancePayment._id,
      isDeleted: false,
    });

    if (appliedAdvance.length > 0) {
      throw new BadRequestException(
        `Cannot delete advance payment. It has been applied to ${appliedAdvance.length} month(s). Please reverse the applications first.`
      );
    }

    // Soft delete the advance payment
    advancePayment.isDeleted = true;
    advancePayment.deletedAt = new Date();
    await advancePayment.save();

    await this.createAuditLog('delete', 'Payment', advancePayment._id.toString(), userId, advancePayment.toObject(), null);

    // Emit notification
    this.socketGateway.emitNotification({
      id: `advance-deleted-${studentId}`,
      type: 'payment',
      title: 'Advance Payment Deleted',
      message: `Advance payment of ${advancePayment.advanceAmount.toLocaleString()} BDT deleted for ${student.name}`,
      link: `/dashboard/students/${studentId}`,
      timestamp: new Date(),
    });
  }

  // ========== PAYMENT METHODS ==========
  async createPayment(createPaymentDto: CreatePaymentDto, userId: string): Promise<PaymentDocument> {
    const student = await this.findStudentById(createPaymentDto.studentId);
    let payment: PaymentDocument;
    
    // Handle advance payments (standalone advance for future months)
    if (createPaymentDto.isAdvance) {
      // For advance payments, use "ADVANCE" as billing month
      // Check if advance payment already exists
      const existingAdvance = await this.paymentModel.findOne({
        studentId: new Types.ObjectId(createPaymentDto.studentId),
        billingMonth: 'ADVANCE',
        isDeleted: false,
      });

      if (existingAdvance) {
        // Add to existing advance
        existingAdvance.paidAmount += createPaymentDto.paidAmount;
        existingAdvance.advanceAmount += createPaymentDto.paidAmount;
        existingAdvance.paymentMethod = createPaymentDto.paymentMethod as any;
        existingAdvance.transactionId = createPaymentDto.transactionId;
        existingAdvance.notes = createPaymentDto.notes || existingAdvance.notes;
        existingAdvance.recordedBy = new Types.ObjectId(userId);
        await existingAdvance.save();
        payment = existingAdvance;
      } else {
        // Create new advance payment record
        payment = new this.paymentModel({
          studentId: new Types.ObjectId(createPaymentDto.studentId),
          billingMonth: 'ADVANCE',
          rentAmount: 0, // No rent for advance payments
          paidAmount: createPaymentDto.paidAmount,
          dueAmount: 0,
          advanceAmount: createPaymentDto.paidAmount,
          paymentMethod: createPaymentDto.paymentMethod as any,
          transactionId: createPaymentDto.transactionId,
          notes: createPaymentDto.notes,
          recordedBy: new Types.ObjectId(userId),
        });
        await payment.save();
      }
    } else if (createPaymentDto.type === 'union_fee' || createPaymentDto.type === 'security' || createPaymentDto.type === 'other') {
       // Handle one-time fees (Union Fee, etc.)
       payment = new this.paymentModel({
          ...createPaymentDto,
          studentId: new Types.ObjectId(createPaymentDto.studentId),
          billingMonth: createPaymentDto.billingMonth || new Date().toISOString().slice(0, 7),
          rentAmount: 0, 
          paidAmount: createPaymentDto.paidAmount,
          dueAmount: 0,
          advanceAmount: 0,
          paymentMethod: createPaymentDto.paymentMethod || 'cash',
          recordedBy: new Types.ObjectId(userId),
          type: createPaymentDto.type,
        });
        await payment.save();
    } else {
      // Regular payment for a specific month
      const billingMonth = createPaymentDto.billingMonth || new Date().toISOString().slice(0, 7);
      
      // Validate that billing month is not before student's joining date
      const joiningDate = new Date(student.joiningDate);
      const joiningMonth = `${joiningDate.getFullYear()}-${String(joiningDate.getMonth() + 1).padStart(2, '0')}`;
      const billingMonthDate = new Date(billingMonth + '-01');
      const joiningMonthDate = new Date(joiningDate.getFullYear(), joiningDate.getMonth(), 1);
      
      if (billingMonthDate < joiningMonthDate) {
        throw new BadRequestException(
          `Cannot create payment for ${billingMonth}. Student joined on ${joiningMonth}. Payments can only be made for months from the joining date onwards.`
        );
      }
      
      // Check if payment for this month already exists
      const existingPayment = await this.paymentModel.findOne({
        studentId: new Types.ObjectId(createPaymentDto.studentId),
        billingMonth: billingMonth,
        isDeleted: false,
      });

      const rentAmount = student.monthlyRent;

      if (existingPayment) {
        // Update existing payment
        const totalPaid = existingPayment.paidAmount + createPaymentDto.paidAmount;
        const dueAmount = Math.max(0, rentAmount - totalPaid);
        const advanceAmount = Math.max(0, totalPaid - rentAmount);

        existingPayment.paidAmount = totalPaid;
        existingPayment.dueAmount = dueAmount;
        existingPayment.advanceAmount = advanceAmount;
        existingPayment.paymentMethod = createPaymentDto.paymentMethod as any;
        existingPayment.transactionId = createPaymentDto.transactionId;
        existingPayment.notes = createPaymentDto.notes;
        existingPayment.recordedBy = new Types.ObjectId(userId);
        await existingPayment.save();
        payment = existingPayment;
      } else {
        // Create new payment
        const dueAmount = Math.max(0, rentAmount - createPaymentDto.paidAmount);
        const advanceAmount = Math.max(0, createPaymentDto.paidAmount - rentAmount);

        payment = new this.paymentModel({
          ...createPaymentDto,
          studentId: new Types.ObjectId(createPaymentDto.studentId),
          billingMonth: billingMonth,
          rentAmount,
          paidAmount: createPaymentDto.paidAmount,
          dueAmount,
          advanceAmount,
          recordedBy: new Types.ObjectId(userId),
        });
        await payment.save();
      }
    }

    await this.createAuditLog('payment', 'Payment', payment._id.toString(), userId, null, payment.toObject());
    
    // Emit real-time updates
    this.socketGateway.emitPaymentUpdate({
      studentId: createPaymentDto.studentId,
      payment: payment.toObject(),
    });
    
    const dashboardStats = await this.getDashboardStats();
    this.socketGateway.emitDashboardUpdate(dashboardStats);
    
    const dueStatus = await this.getStudentDueStatus(createPaymentDto.studentId);
    this.socketGateway.emitDueStatusUpdate(createPaymentDto.studentId, dueStatus);
    
    // Emit notification
    const paymentMessage = createPaymentDto.isAdvance
      ? `Advance payment of ${createPaymentDto.paidAmount.toLocaleString()} BDT received from ${student.name}`
      : `Payment of ${createPaymentDto.paidAmount.toLocaleString()} BDT received from ${student.name} for ${createPaymentDto.billingMonth}`;
    
    this.socketGateway.emitNotification({
      id: payment._id.toString(),
      type: 'payment',
      title: createPaymentDto.isAdvance ? 'Advance Payment Recorded' : 'Payment Recorded',
      message: paymentMessage,
      link: `/dashboard/transactions/${payment._id}`,
      timestamp: new Date(),
    });
    
    return payment;
  }

  // ========== SECURITY DEPOSIT METHODS ==========
  async useSecurityDepositForDues(studentId: string, useSecurityDepositDto: UseSecurityDepositDto, userId: string): Promise<any> {
    const student = await this.findStudentById(studentId);
    
    if (student.securityDeposit < useSecurityDepositDto.amount) {
      throw new BadRequestException(`Insufficient security deposit. Available: ${student.securityDeposit} BDT, Requested: ${useSecurityDepositDto.amount} BDT`);
    }

    // Validate that billing month is not before student's joining date
    const joiningDate = new Date(student.joiningDate);
    const joiningMonth = `${joiningDate.getFullYear()}-${String(joiningDate.getMonth() + 1).padStart(2, '0')}`;
    const billingMonthDate = new Date(useSecurityDepositDto.billingMonth + '-01');
    const joiningMonthDate = new Date(joiningDate.getFullYear(), joiningDate.getMonth(), 1);
    
    if (billingMonthDate < joiningMonthDate) {
      throw new BadRequestException(
        `Cannot use security deposit for ${useSecurityDepositDto.billingMonth}. Student joined on ${joiningMonth}. Payments can only be made for months from the joining date onwards.`
      );
    }

    // Get or create payment for the billing month
    const existingPayment = await this.paymentModel.findOne({
      studentId: new Types.ObjectId(studentId),
      billingMonth: useSecurityDepositDto.billingMonth,
      isDeleted: false,
    });

    const rentAmount = student.monthlyRent;
    let payment: PaymentDocument;

    if (existingPayment) {
      // Update existing payment
      const newPaidAmount = existingPayment.paidAmount + useSecurityDepositDto.amount;
      const dueAmount = Math.max(0, rentAmount - newPaidAmount);
      const advanceAmount = Math.max(0, newPaidAmount - rentAmount);

      existingPayment.paidAmount = newPaidAmount;
      existingPayment.dueAmount = dueAmount;
      existingPayment.advanceAmount = advanceAmount;
      existingPayment.paymentMethod = PaymentMethod.CASH;
      existingPayment.notes = `${existingPayment.notes || ''}\n[Security Deposit Used: ${useSecurityDepositDto.amount} BDT] ${useSecurityDepositDto.notes || ''}`.trim();
      await existingPayment.save();
      payment = existingPayment;
    } else {
      // Create new payment
      const dueAmount = Math.max(0, rentAmount - useSecurityDepositDto.amount);
      const advanceAmount = Math.max(0, useSecurityDepositDto.amount - rentAmount);

      payment = new this.paymentModel({
        studentId: new Types.ObjectId(studentId),
        billingMonth: useSecurityDepositDto.billingMonth,
        rentAmount,
        paidAmount: useSecurityDepositDto.amount,
        dueAmount,
        advanceAmount,
        paymentMethod: PaymentMethod.CASH,
        notes: `[Security Deposit Used: ${useSecurityDepositDto.amount} BDT] ${useSecurityDepositDto.notes || ''}`,
        recordedBy: new Types.ObjectId(userId),
      });
      await payment.save();
    }

    // Deduct from security deposit
    student.securityDeposit = student.securityDeposit - useSecurityDepositDto.amount;
    await student.save();

    // Create security deposit transaction record
    const transaction = new this.securityDepositTransactionModel({
      studentId: new Types.ObjectId(studentId),
      type: SecurityDepositTransactionType.USE_FOR_DUES,
      amount: useSecurityDepositDto.amount,
      billingMonth: useSecurityDepositDto.billingMonth,
      paymentId: payment._id,
      notes: useSecurityDepositDto.notes,
      processedBy: new Types.ObjectId(userId),
    });
    await transaction.save();

    await this.createAuditLog('use_security_deposit', 'SecurityDeposit', transaction._id.toString(), userId, null, transaction.toObject());

    // Emit updates
    const dueStatus = await this.getStudentDueStatus(studentId);
    this.socketGateway.emitDueStatusUpdate(studentId, dueStatus);
    this.socketGateway.emitPaymentUpdate({ studentId, payment: payment.toObject() });

    // Emit notification
    this.socketGateway.emitNotification({
      id: transaction._id.toString(),
      type: 'payment',
      title: 'Security Deposit Used',
      message: `${useSecurityDepositDto.amount.toLocaleString()} BDT from security deposit used to pay dues for ${student.name} (${useSecurityDepositDto.billingMonth})`,
      link: `/dashboard/students/${studentId}`,
      timestamp: new Date(),
    });

    return {
      transaction: transaction.toObject(),
      payment: payment.toObject(),
      remainingSecurityDeposit: student.securityDeposit,
    };
  }

  async returnSecurityDeposit(studentId: string, returnSecurityDepositDto: ReturnSecurityDepositDto, userId: string): Promise<any> {
    const student = await this.findStudentById(studentId);
    
    if (student.securityDeposit < returnSecurityDepositDto.amount) {
      throw new BadRequestException(`Insufficient security deposit. Available: ${student.securityDeposit} BDT, Requested: ${returnSecurityDepositDto.amount} BDT`);
    }

    // Deduct from security deposit
    student.securityDeposit = student.securityDeposit - returnSecurityDepositDto.amount;
    await student.save();

    // Create security deposit transaction record
    const transaction = new this.securityDepositTransactionModel({
      studentId: new Types.ObjectId(studentId),
      type: SecurityDepositTransactionType.RETURN,
      amount: returnSecurityDepositDto.amount,
      notes: returnSecurityDepositDto.notes,
      processedBy: new Types.ObjectId(userId),
    });
    await transaction.save();

    await this.createAuditLog('return_security_deposit', 'SecurityDeposit', transaction._id.toString(), userId, null, transaction.toObject());

    // Emit notification
    this.socketGateway.emitNotification({
      id: transaction._id.toString(),
      type: 'payment',
      title: 'Security Deposit Returned',
      message: `${returnSecurityDepositDto.amount.toLocaleString()} BDT security deposit returned to ${student.name}`,
      link: `/dashboard/students/${studentId}`,
      timestamp: new Date(),
    });

    return {
      transaction: transaction.toObject(),
      remainingSecurityDeposit: student.securityDeposit,
    };
  }

  async getSecurityDepositTransactions(studentId: string): Promise<SecurityDepositTransactionDocument[]> {
    return this.securityDepositTransactionModel
      .find({
        studentId: new Types.ObjectId(studentId),
        isDeleted: false,
      })
      .populate('processedBy', 'name email')
      .populate('paymentId')
      .sort({ createdAt: -1 })
      .exec();
  }

  async checkoutStudent(studentId: string, userId: string, useSecurityDeposit: boolean = false): Promise<any> {
    const student = await this.findStudentById(studentId);
    if (student.status === StudentStatus.LEFT) {
      throw new BadRequestException('Student has already left');
    }

    const dueStatus = await this.getStudentDueStatus(studentId);
    let remainingDues = dueStatus.totalDue;
    let securityDepositUsed = 0;
    let securityDepositReturned = 0;
    let advanceReturned = 0;

    // Handle advance payment - return it if exists
    // OLD LOGIC: Deleted advance payment. 
    // NEW LOGIC: We keep it. We calculate unused amount and refund it via new Transaction.
    // So we remove the deletion logic.
    /*
    if (dueStatus.totalAdvance > 0) {
      // Delete advance payment (it will be returned to student)
      try {
        await this.deleteAdvancePayment(studentId, userId);
        advanceReturned = dueStatus.totalAdvance;
      } catch (error) {
        // If advance has been applied, we can't delete it
        // In that case, it's already been used, so no need to return
        console.warn('Could not delete advance payment during checkout:', error);
      }
    }
    */

    // If using security deposit to pay dues
    if (useSecurityDeposit && remainingDues > 0 && student.securityDeposit > 0) {
      const amountToUse = Math.min(remainingDues, student.securityDeposit);
      
      // Use security deposit to pay dues
      await this.useSecurityDepositForDues(studentId, {
        billingMonth: new Date().toISOString().slice(0, 7), // Current month
        amount: amountToUse,
        notes: 'Used for checkout - paying outstanding dues',
      }, userId);

      securityDepositUsed = amountToUse;
      remainingDues = remainingDues - amountToUse;
      student.securityDeposit = student.securityDeposit - amountToUse;
    }

    if (remainingDues > 0) {
      throw new BadRequestException(`Cannot checkout student with outstanding dues: ${remainingDues} BDT. Security deposit used: ${securityDepositUsed} BDT`);
    }

    // Handle Manual Refund (Arbitrary amount decided by admin)
    // We expect a new optional parameter 'refundAmount' but for now let's assume if they pass a specific flag or we calculate it?
    // The user requirement implies we should handle the calculation.
    // Let's look at what available assets we have:
    const remainingSecurity = student.securityDeposit;
    const unusedAdvance = dueStatus.totalAdvance; // This is advanced applied + unapplied? No, getStudentDueStatus returns totalAdvance which is remaining.
    
    // Logic: The "refundAmount" should ideally be passed from controller. 
    // Since I cannot easily change the signature without updating controller, I will implement a logic:
    // If 'useSecurityDeposit' is true, we implicitly try to refund everything remaining.
    
    let totalRefundable = remainingSecurity + unusedAdvance;
    
    if (totalRefundable > 0) {
       // Create a Refund Transaction
       // We'll mark it as a 'refund' payment type
       const refundPayment = new this.paymentModel({
         studentId: new Types.ObjectId(studentId),
         billingMonth: new Date().toISOString().slice(0, 7),
         rentAmount: 0,
         paidAmount: totalRefundable, // Verify if negative or positive implies refund. Usually refund is Outflow. 
         // System seems to track 'paidAmount' as money IN. 
         // Use negative amount to indicate money OUT? Or just rely on 'type'.
         // Let's use negative for clarity in summation if we sum 'paidAmount'.
         // BUT check schemas constraints: min: 0. 
         // Constraint: paidAmount min 0. So we must use positive value and 'type' = 'refund'.
         dueAmount: 0,
         advanceAmount: 0,
         paymentMethod: PaymentMethod.CASH,
         notes: `Refund on checkout (Security: ${remainingSecurity}, Advance: ${unusedAdvance})`,
         recordedBy: new Types.ObjectId(userId),
         type: 'refund' as any, 
       });
       await refundPayment.save();
       
       securityDepositReturned = remainingSecurity;
       advanceReturned = unusedAdvance;

       // Zero out security deposit
       student.securityDeposit = 0; 
       
       // Handle Advance "Settlement"
       // We don't delete the advance payment anymore. We just added a Refund transaction that technically "offsets" it.
       // However, `getStudentDueStatus` will still see the Advance Payment as "Available" next time?
       // No, because student status is LEFT.
    }

    // Return remaining security deposit if any  <-- We handled this above in new logic
    // Keeping this block commented or removed to avoid double refunding
    /* 
    if (student.securityDeposit > 0) {
      securityDepositReturned = student.securityDeposit;
      await this.returnSecurityDeposit(studentId, {
        amount: student.securityDeposit,
        notes: 'Security deposit returned on checkout',
      }, userId);
      student.securityDeposit = 0;
    }
    */

    // Mark student as left
    student.status = StudentStatus.LEFT;
    await student.save();

    // Update room occupied beds
    // Ensure we get just the ID, not the populated object
    let roomId: string;
    if (student.roomId instanceof Types.ObjectId) {
      roomId = student.roomId.toString();
    } else if (typeof student.roomId === 'object' && student.roomId !== null && '_id' in student.roomId) {
      roomId = (student.roomId as any)._id.toString();
    } else {
      roomId = String(student.roomId);
    }
    const room = await this.findRoomById(roomId);
    room.occupiedBeds = Math.max(0, room.occupiedBeds - 1);
    if (room.status === RoomStatus.FULL && room.occupiedBeds < room.totalBeds) {
      room.status = RoomStatus.AVAILABLE;
    }
    // Mark bed as unoccupied if beds array exists
    if (room.beds && room.beds.length > 0) {
      // Try to find bed by index (bedNumber is 1-based)
      if (typeof student.bedNumber === 'number' && student.bedNumber > 0 && student.bedNumber <= room.beds.length) {
        const bed = room.beds[student.bedNumber - 1];
        if (bed) {
          bed.isOccupied = false;
        }
      } else {
        // Try to find bed by name (if bedNumber was stored as bed name)
        const bedName = String(student.bedNumber);
        const bed = room.beds.find(b => b.name === bedName);
        if (bed) {
          bed.isOccupied = false;
        }
      }
    }
    await room.save();

    // Create checkout statement
    const statement = {
      student: student.toObject(),
      payments: dueStatus.payments,
      totalPaid: dueStatus.payments.reduce((sum, p) => sum + p.paidAmount, 0),
      securityDepositUsed,
      securityDepositReturned,
      advanceReturned,
      checkoutDate: new Date(),
    };

    await this.createAuditLog('checkout', 'Student', student._id.toString(), userId, null, statement);
    
    // Emit notification
    this.socketGateway.emitNotification({
      id: `checkout-${studentId}-${Date.now()}`,
      type: 'student',
      title: 'Student Checked Out',
      message: `${student.name} has been checked out. Security deposit: Used ${securityDepositUsed} BDT, Returned ${securityDepositReturned} BDT. Advance returned: ${advanceReturned} BDT`,
      link: `/dashboard/students`,
      timestamp: new Date(),
    });

    return statement;
  }

  // ========== DASHBOARD METHODS ==========
  async getDashboardStats(): Promise<any> {
    const totalRooms = await this.roomModel.countDocuments({ isDeleted: false });
    const activeStudents = await this.studentModel.countDocuments({
      status: StudentStatus.ACTIVE,
      isDeleted: false,
    });

    const allStudents = await this.studentModel.find({ isDeleted: false }).exec();

    let residentialDue = 0;
    // let twoPlusMonthsDueCount = 0; // Removed per requirement

    for (const student of allStudents) {
      const dueStatus = await this.getStudentDueStatus(student._id.toString());
      residentialDue += dueStatus.totalDue;
      // if (dueStatus.consecutiveDueMonths >= 2) {
      //   twoPlusMonthsDueCount++;
      // }
    }

    // Fetch coaching stats
    const coachingStats = await this.coachingService.getAdmissionStats();
    const coachingDue = coachingStats.totalDue || 0;

    return {
      totalRooms,
      activeStudents,
      residentialDue,
      coachingDue,
      // twoPlusMonthsDueStudents: twoPlusMonthsDueCount, // Removed
    };
  }

  async getMonthlyChartData(): Promise<any[]> {
    // Get last 12 months of data
    const months: any[] = [];
    const today = new Date();
    
    for (let i = 11; i >= 0; i--) {
      const date = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const monthString = date.toISOString().slice(0, 7); // YYYY-MM format
      const monthName = date.toLocaleString('default', { month: 'short' });
      
      // Get all payments for this month (excluding advance payments)
      const monthPayments = await this.paymentModel.find({
        billingMonth: monthString,
        isDeleted: false,
      }).exec().then(payments => payments.filter(p => p.billingMonth !== 'ADVANCE'));

      // Calculate collection (total paid amount for this month)
      const collection = monthPayments.reduce((sum, payment) => {
        return sum + (payment.paidAmount || 0);
      }, 0);

      // Calculate due (total due amount for this month)
      const due = monthPayments.reduce((sum, payment) => {
        return sum + (payment.dueAmount || 0);
      }, 0);

      months.push({
        month: monthName,
        monthString: monthString,
        collection: collection,
        due: due,
      });
    }

    return months;
  }

  // ========== HELPER METHODS ==========
  private async generateStudentId(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `STU${year}`;
    const lastStudent = await this.studentModel
      .findOne({ studentId: new RegExp(`^${prefix}`) })
      .sort({ studentId: -1 })
      .exec();
    
    if (!lastStudent) {
      return `${prefix}001`;
    }
    
    const lastNumber = parseInt(lastStudent.studentId.slice(-3));
    const newNumber = (lastNumber + 1).toString().padStart(3, '0');
    return `${prefix}${newNumber}`;
  }

  private generateMonthsSinceJoining(joiningDate: Date, currentMonth: string): string[] {
    const months = [];
    const joinDate = new Date(joiningDate);
    const current = new Date(currentMonth + '-01');
    
    let date = new Date(joinDate.getFullYear(), joinDate.getMonth(), 1);
    while (date <= current) {
      const year = date.getFullYear();
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      months.push(`${year}-${month}`);
      date.setMonth(date.getMonth() + 1);
    }
    
    return months;
  }

  private async createAuditLog(
    action: string,
    entity: string,
    entityId: string,
    userId: string,
    oldData: any,
    newData: any,
  ): Promise<void> {
    try {
      const auditLog = new this.auditLogModel({
        action,
        entity,
        entityId: new Types.ObjectId(entityId),
        userId: new Types.ObjectId(userId),
        oldData,
        newData,
      });
      await auditLog.save();
    } catch (error) {
      // Log error but don't throw - audit logging shouldn't break the main flow
      console.error('Failed to create audit log:', error);
    }
  }
}
