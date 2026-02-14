import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CoachingService } from '../coaching/coaching.service';
import { AdmissionPayment, AdmissionPaymentDocument } from '../coaching/schemas/admission-payment.schema';
import { Admission, AdmissionDocument } from '../coaching/schemas/admission.schema';
import { PusherService } from '../common/pusher/pusher.service';
import { CreateBulkPaymentDto } from './dto/create-bulk-payment.dto';
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
    @InjectModel(Admission.name) private admissionModel: Model<AdmissionDocument>,
    @InjectModel(AdmissionPayment.name) private coachingPaymentModel: Model<AdmissionPaymentDocument>,
    private pusherService: PusherService,
    private coachingService: CoachingService,
  ) { }

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
      securityDeposit: 0, // Initialize to 0; createPayment will handle the initial deposit if provided
      unionFee: 0, // Initialize to 0; createPayment will handle the initial fee if provided
      studentId,
      roomId: new Types.ObjectId(createStudentDto.roomId),
      bedNumber: bedNumber!,
      monthlyRent: createStudentDto.monthlyRent || bedPrice,
      joiningDate: new Date(createStudentDto.joiningDate),
    });
    await student.save();

    // Update room occupied beds
    room.occupiedBeds += 1;
    if (room.occupiedBeds >= room.totalBeds) {
      room.status = RoomStatus.FULL;
    }
    await room.save();

    // Record Initial Rent Payment if provided
    if (createStudentDto.initialRentPaid && createStudentDto.initialRentPaid > 0) {
      console.log('Creating Initial Rent payment:', createStudentDto.initialRentPaid);
      try {
        await this.createPayment({
          studentId: student._id.toString(),
          billingMonth: new Date().toISOString().slice(0, 7),
          rentAmount: student.monthlyRent,
          paidAmount: createStudentDto.initialRentPaid,
          paymentMethod: 'cash',
          notes: 'Initial Rent Payment during Admission',
          transactionId: '',
          type: 'rent',
        } as any, userId);
        console.log('Initial Rent payment created successfully');
      } catch (error) {
        console.error('Error creating Initial Rent payment:', error);
        throw error;
      }
    }

    // Record Union Fee if provided

    if (createStudentDto.unionFee && createStudentDto.unionFee > 0) {
      console.log('Creating Union Fee payment:', createStudentDto.unionFee);
      try {
        await this.createPayment({
          studentId: student._id.toString(),
          billingMonth: new Date().toISOString().slice(0, 7),
          rentAmount: 0,
          paidAmount: createStudentDto.unionFee,
          paymentMethod: 'cash', // Default or need DTO update
          notes: 'Union Fee (Non-refundable)',
          transactionId: '',
          type: 'union_fee', // Pass as string literal
        } as any, userId);
        console.log('Union Fee payment created successfully');
      } catch (error) {
        console.error('Error creating Union Fee payment:', error);
        throw error; // Re-throw to see the 500
      }
    }

    // Record Security Deposit if provided
    if (createStudentDto.securityDeposit && createStudentDto.securityDeposit > 0) {
      console.log('Creating Security Deposit payment:', createStudentDto.securityDeposit);
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
        type: 'security',
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
    this.pusherService.emitDashboardUpdate(await this.getDashboardStats());

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

  async getUnifiedTransactions(
    queryDto: {
      page?: number;
      limit?: number;
      search?: string;
      typeFilter?: string;
      userFilter?: string;
      startDate?: string;
      endDate?: string;
    },
    currentUserId?: string,
  ): Promise<any> {
    const page = Number(queryDto.page) || 1;
    const limit = Number(queryDto.limit) || 10;
    const skip = (page - 1) * limit;

    // Filters for Residential
    const resQuery: any = { isDeleted: false };
    if (currentUserId) resQuery.recordedBy = new Types.ObjectId(currentUserId);
    if (queryDto.userFilter) resQuery.recordedBy = new Types.ObjectId(queryDto.userFilter);
    
    // Filters for Coaching
    const coachQuery: any = { isDeleted: false };
    if (currentUserId) coachQuery.recordedBy = new Types.ObjectId(currentUserId);
    if (queryDto.userFilter) coachQuery.recordedBy = new Types.ObjectId(queryDto.userFilter);

    // Apply Date Range
    if (queryDto.startDate || queryDto.endDate) {
      const dateRange: any = {};
      if (queryDto.startDate) dateRange.$gte = new Date(queryDto.startDate);
      if (queryDto.endDate) {
        const end = new Date(queryDto.endDate);
        end.setHours(23, 59, 59, 999);
        dateRange.$lte = end;
      }
      resQuery.createdAt = dateRange;
      coachQuery.createdAt = dateRange;
    }

    let resPayments = [];
    let coachPayments = [];

    const effectiveTypeFilter = queryDto.typeFilter || 'all';

    if (effectiveTypeFilter === 'all' || effectiveTypeFilter === 'residential') {
        resPayments = await this.paymentModel
            .find(resQuery)
            .populate('studentId', 'name studentId phone')
            .populate('recordedBy', 'name email')
            .lean()
            .exec();
    }

    if (effectiveTypeFilter === 'all' || effectiveTypeFilter === 'coaching') {
        coachPayments = await this.coachingPaymentModel
            .find(coachQuery)
            .populate('admissionId', 'studentName course batch phone')
            .populate('recordedBy', 'name email')
            .lean()
            .exec();
    }

    // Merge and Tag
    const all = [
        ...resPayments.map(p => ({ 
            ...p, 
            source: 'residential', 
            studentName: p.studentId?.name,
            paymentType: (p.paymentMethod === 'adjustment' || p.type === 'adjustment') ? 'adjustment' : (p.type || 'rent')
        })),
        ...coachPayments.map(p => ({ 
            ...p, 
            source: 'coaching', 
            studentName: p.admissionId?.studentName, 
            amount: p.paidAmount,
            paymentType: 'coaching'
        }))
    ];

    // Filter by search
    let filtered = all;
    if (queryDto.search) {
        const searchRegex = new RegExp(queryDto.search, 'i');
        filtered = all.filter(p => 
            (p.studentName && searchRegex.test(p.studentName)) ||
            (p.transactionId && searchRegex.test(p.transactionId)) ||
            (p.notes && searchRegex.test(p.notes)) ||
            (p.paymentMethod && searchRegex.test(p.paymentMethod))
        );
    }

    // Sort
    filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // Calculate Totals for the results (all filtered results)
    const totalAmount = filtered.reduce((sum, p) => {
        const amt = p.paidAmount || p.amount || 0;
        if (p.paymentType === 'refund') return sum - amt;
        if (p.paymentType === 'adjustment') return sum; // Exclude non-cash adjustments from total
        return sum + amt;
    }, 0);

    // Paginate
    const paginated = filtered.slice(skip, skip + limit);

    return {
        data: paginated,
        total: filtered.length,
        totalAmount,
        page,
        limit,
        totalPages: Math.ceil(filtered.length / limit),
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

    const paymentMap = new Map<string, { totalPaid: number, records: any[] }>();
    const extraPayments = [];
    // Group all payments by billingMonth to handle multiple transactions per month
    payments.forEach(p => {
      if (!p.type || p.type === 'rent' || p.type === 'advance' || p.type === 'adjustment' || p.billingMonth === 'ADVANCE') {
        const existing = paymentMap.get(p.billingMonth) || { totalPaid: 0, records: [] };
        existing.totalPaid += p.paidAmount;
        existing.records.push(p);
        paymentMap.set(p.billingMonth, existing);
      } else {
        // Collect other types of payments (security, union fees, etc.)
        extraPayments.push(p);
      }
    });

    // Automatically create payment records for past months without payment
    // This ensures dues are automatically tracked when months pass
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonthIndex = today.getMonth(); // 0-indexed (0 = January)
    const currentMonthDate = new Date(currentYear, currentMonthIndex, 1);

    for (const month of months) {
      const monthDate = new Date(month + '-01');
      // Fix: Also include the current month if it is the joining month and no payment has been made
      // This ensures that a student joining today immediately shows a due for the current month.
      if ((monthDate < currentMonthDate || month === currentMonthString) && !paymentMap.has(month)) {
        // Create a payment record with 0 paid amount to mark it as due
        const autoPayment = new this.paymentModel({
          studentId: new Types.ObjectId(studentId),
          billingMonth: month,
          rentAmount: student.monthlyRent,
          paidAmount: 0,
          dueAmount: student.monthlyRent,
          advanceAmount: 0,
          paymentMethod: PaymentMethod.CASH,
        });
        await autoPayment.save();
        paymentMap.set(month, { totalPaid: 0, records: [autoPayment] });


        // Emit notification for auto-created due
        this.pusherService.emitNotification({
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
    const advanceMapData = paymentMap.get('ADVANCE');
    let totalAdvance = advanceMapData?.totalPaid || 0;
    const advancePaymentId = advanceMapData?.records?.[0]?._id;

    for (const month of months) {
      const monthData = paymentMap.get(month);
      const rentAmount = student.monthlyRent;
      let paidAmount = monthData?.totalPaid || 0;
      let dueAmount = Math.max(0, rentAmount - paidAmount);
      let monthAdvance = 0; // Will be calculated below

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

      const generatedAdvance = Math.max(0, paidAmount - rentAmount);
      totalAdvance += generatedAdvance;

      status.push({
        month,
        rentAmount,
        paidAmount,
        dueAmount,
        advanceAmount: monthAdvance + generatedAdvance,
        advanceApplied: monthAdvance || (advanceApplication ? advanceApplication.advanceAmountApplied : 0),
        advanceGenerated: generatedAdvance,
        // Return individual transaction records for this month
        records: monthData?.records || [],
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
      extraPayments: extraPayments, // Return security deposits, union fees, etc.
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
  }

  // ========== PAYMENT METHODS ==========
  async createPayment(createPaymentDto: CreatePaymentDto, userId: string): Promise<PaymentDocument> {
    console.log('createPayment called with:', JSON.stringify(createPaymentDto));
    const student = await this.findStudentById(createPaymentDto.studentId);
    let payment: PaymentDocument;

    // Handle advance payments (standalone advance for future months)
    if (createPaymentDto.isAdvance) {
      console.log('Processing as ADVANCE payment');
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
          type: 'advance' as any,
        });
        await payment.save();
      }
    } else if (createPaymentDto.type === 'union_fee' || createPaymentDto.type === 'security' || createPaymentDto.type === 'other') {
      console.log(`Processing as SPECIAL payment: ${createPaymentDto.type}`);
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

      // IF SECURITY DEPOSIT or UNION FEE, update the student's balance
      if (createPaymentDto.type === 'security' || createPaymentDto.type === 'union_fee') {
        const student = await this.studentModel.findById(createPaymentDto.studentId);
        if (student) {
          if (createPaymentDto.type === 'security') {
            student.securityDeposit += createPaymentDto.paidAmount;

            const trans = new this.securityDepositTransactionModel({
              studentId: new Types.ObjectId(createPaymentDto.studentId),
              type: SecurityDepositTransactionType.ADJUSTMENT,
              amount: createPaymentDto.paidAmount,
              notes: createPaymentDto.notes || 'Additional Security Deposit',
              processedBy: new Types.ObjectId(userId),
            });
            await trans.save();
          } else if (createPaymentDto.type === 'union_fee') {
            student.unionFee += createPaymentDto.paidAmount;
          }
          await student.save();
        }
      }
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


      // Calculate how much has already been paid for this month to avoid double-charging rent
      const existingPayments = await this.paymentModel.find({
        studentId: new Types.ObjectId(createPaymentDto.studentId),
        billingMonth: billingMonth,
        isDeleted: false,
        type: 'rent'
      });
      const totalPaidSoFar = existingPayments.reduce((sum, p) => sum + p.paidAmount, 0);
      const remainingRentDue = Math.max(0, student.monthlyRent - totalPaidSoFar);

      const rentAmount = student.monthlyRent;

      // We always create a new payment record now to preserve transaction history
      const dueAmount = Math.max(0, remainingRentDue - createPaymentDto.paidAmount);
      const advanceAmount = Math.max(0, createPaymentDto.paidAmount - remainingRentDue);

      payment = new this.paymentModel({
        ...createPaymentDto,
        studentId: new Types.ObjectId(createPaymentDto.studentId),
        billingMonth: billingMonth,
        rentAmount,
        paidAmount: createPaymentDto.paidAmount,
        dueAmount,
        advanceAmount,
        recordedBy: new Types.ObjectId(userId),
        type: 'rent',
      });
      await payment.save();

    }

    await this.createAuditLog('payment', 'Payment', payment._id.toString(), userId, null, payment.toObject());

    // Emit real-time updates
    this.pusherService.emitPaymentUpdate({
      studentId: createPaymentDto.studentId,
      payment: payment.toObject(),
    });

    const dashboardStats = await this.getDashboardStats();
    this.pusherService.emitDashboardUpdate(dashboardStats);

    const dueStatus = await this.getStudentDueStatus(createPaymentDto.studentId);
    this.pusherService.emitDueStatusUpdate(createPaymentDto.studentId, dueStatus);

    // Emit notification
    const paymentMessage = createPaymentDto.isAdvance
      ? `Advance payment of ${createPaymentDto.paidAmount.toLocaleString()} BDT received from ${student.name}`
      : `Payment of ${createPaymentDto.paidAmount.toLocaleString()} BDT received from ${student.name} for ${createPaymentDto.billingMonth}`;

    this.pusherService.emitNotification({
      id: payment._id.toString(),
      type: 'payment',
      title: createPaymentDto.isAdvance ? 'Advance Payment Recorded' : 'Payment Recorded',
      message: paymentMessage,
      link: `/dashboard/transactions/${payment._id}`,
      timestamp: new Date(),
    });

    return payment;
  }

  async createBulkPayment(bulkDto: CreateBulkPaymentDto, userId: string): Promise<any> {
    const results = [];
    const student = await this.findStudentById(bulkDto.studentId);

    // 1. Process Rent Payment
    if (bulkDto.rentAmount && bulkDto.rentAmount > 0) {
      const rentPayment = await this.createPayment({
        studentId: bulkDto.studentId,
        billingMonth: bulkDto.billingMonth,
        paidAmount: bulkDto.rentAmount,
        paymentMethod: bulkDto.paymentMethod,
        transactionId: bulkDto.transactionId,
        notes: bulkDto.notes,
        isAdvance: bulkDto.isAdvance,
        type: 'rent',
      } as any, userId);
      results.push(rentPayment);
    }

    // 2. Process Security Deposit
    if (bulkDto.securityAmount && bulkDto.securityAmount > 0) {
      const securityPayment = await this.createPayment({
        studentId: bulkDto.studentId,
        paidAmount: bulkDto.securityAmount,
        paymentMethod: bulkDto.paymentMethod,
        transactionId: bulkDto.transactionId,
        notes: bulkDto.notes || 'Bulk Security Deposit',
        type: 'security',
      } as any, userId);
      results.push(securityPayment);
    }

    // 3. Process Union Fee
    if (bulkDto.unionFeeAmount && bulkDto.unionFeeAmount > 0) {
      const unionPayment = await this.createPayment({
        studentId: bulkDto.studentId,
        paidAmount: bulkDto.unionFeeAmount,
        paymentMethod: bulkDto.paymentMethod,
        transactionId: bulkDto.transactionId,
        notes: bulkDto.notes || 'Bulk Union Fee',
        type: 'union_fee',
      } as any, userId);
      results.push(unionPayment);
    }

    // 4. Process Other Fee
    if (bulkDto.otherAmount && bulkDto.otherAmount > 0) {
      const otherPayment = await this.createPayment({
        studentId: bulkDto.studentId,
        paidAmount: bulkDto.otherAmount,
        paymentMethod: bulkDto.paymentMethod,
        transactionId: bulkDto.transactionId,
        notes: bulkDto.notes || 'Bulk Other Fee',
        type: 'other',
      } as any, userId);
      results.push(otherPayment);
    }

    return {
      success: true,
      count: results.length,
      payments: results,
    };
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

    // Get all existing payments for the billing month to calculate remaining due
    const existingPayments = await this.paymentModel.find({
      studentId: new Types.ObjectId(studentId),
      billingMonth: useSecurityDepositDto.billingMonth,
      isDeleted: false,
      type: { $in: ['rent', 'adjustment'] }
    });

    const totalPaidSoFar = existingPayments.reduce((sum, p) => sum + p.paidAmount, 0);
    const rentAmount = student.monthlyRent;
    const remainingRentDue = Math.max(0, rentAmount - totalPaidSoFar);

    const dueAmount = Math.max(0, remainingRentDue - useSecurityDepositDto.amount);
    const advanceAmount = Math.max(0, useSecurityDepositDto.amount - remainingRentDue);

    // Always create a NEW payment record to preserve transaction history
    const payment = new this.paymentModel({
      studentId: new Types.ObjectId(studentId),
      billingMonth: useSecurityDepositDto.billingMonth,
      rentAmount,
      paidAmount: useSecurityDepositDto.amount,
      dueAmount,
      advanceAmount,
      paymentMethod: PaymentMethod.ADJUSTMENT,
      notes: `[Security Deposit Used: ${useSecurityDepositDto.amount} BDT] ${useSecurityDepositDto.notes || ''}`,
      recordedBy: new Types.ObjectId(userId),
      type: 'adjustment',
    });
    await payment.save();

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
    this.pusherService.emitDueStatusUpdate(studentId, dueStatus);
    this.pusherService.emitPaymentUpdate({ studentId, payment: payment.toObject() });

    // Emit notification
    this.pusherService.emitNotification({
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

    // ALSO Record as a Refund Payment for the main ledger/transaction history
    const refundPayment = new this.paymentModel({
      studentId: new Types.ObjectId(studentId),
      billingMonth: new Date().toISOString().slice(0, 7),
      rentAmount: 0,
      paidAmount: returnSecurityDepositDto.amount,
      dueAmount: 0,
      advanceAmount: 0,
      paymentMethod: PaymentMethod.CASH, // Assuming cash return
      notes: returnSecurityDepositDto.notes || 'Security Deposit Returned',
      recordedBy: new Types.ObjectId(userId),
      type: 'refund',
    });
    await refundPayment.save();

    await this.createAuditLog('return_security_deposit', 'SecurityDeposit', transaction._id.toString(), userId, null, transaction.toObject());

    // Emit notification
    this.pusherService.emitNotification({
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

  async checkoutStudent(studentId: string, userId: string, useSecurityDeposit: boolean = false, refundAmount?: number): Promise<any> {

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

    const availableBalance = remainingSecurity + unusedAdvance;
    let totalRefundable = refundAmount !== undefined ? refundAmount : availableBalance;

    // Security guard: Ensure we don't refund more than what is available
    if (refundAmount !== undefined && refundAmount > availableBalance) {
      throw new BadRequestException(`Refund amount (${refundAmount} BDT) exceeds available balance (${availableBalance} BDT)`);
    }

    if (totalRefundable > 0) {
      // Create a Refund Transaction
      // We'll mark it as a 'refund' payment type
      const refundPayment = new this.paymentModel({
        studentId: new Types.ObjectId(studentId),
        billingMonth: new Date().toISOString().slice(0, 7),
        rentAmount: 0,
        paidAmount: totalRefundable,
        // System seems to track 'paidAmount' as money IN. 
        // Use negative amount to indicate money OUT? Or just rely on 'type'.
        // Let's use negative for clarity in summation if we sum 'paidAmount'.
        // BUT check schemas constraints: min: 0. 
        // Constraint: paidAmount min 0. So we must use positive value and 'type' = 'refund'.
        dueAmount: 0,
        advanceAmount: 0,
        paymentMethod: PaymentMethod.ADJUSTMENT,
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
      totalPaid: dueStatus.payments.reduce((sum, p) => sum + (p.paidAmount || 0), 0),
      securityDepositUsed,
      securityDeposit: securityDepositReturned,
      advanceReturned,
      totalRefunded: securityDepositReturned + advanceReturned,
      checkoutDate: new Date(),
    };


    await this.createAuditLog('checkout', 'Student', student._id.toString(), userId, null, statement);

    // Emit notification
    this.pusherService.emitNotification({
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
        if (payment.paymentMethod === PaymentMethod.ADJUSTMENT) {
          return sum;
        }
        if (payment.type === 'refund') {
          return sum - (payment.paidAmount || 0);
        }
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

  async deletePayment(paymentId: string, userId: string): Promise<void> {
    const payment = await this.paymentModel.findById(paymentId);
    if (!payment || payment.isDeleted) {
      throw new NotFoundException('Payment not found');
    }

    const student = await this.studentModel.findById(payment.studentId);
    if (!student) {
      throw new NotFoundException('Student not found');
    }

    // 1. Automatic Advance Reversal: If this payment generated an advance, reverse its applications
    if (payment.advanceAmount > 0) {
      const applications = await this.advanceApplicationModel.find({
        studentId: payment.studentId,
        advancePaymentId: payment._id,
        isDeleted: false,
      });

      if (applications.length > 0) {
        // Automatically soft-delete all applications generated by this payment
        await this.advanceApplicationModel.updateMany(
          {
            studentId: payment.studentId,
            advancePaymentId: payment._id,
            isDeleted: false,
          },
          {
            isDeleted: true,
            deletedAt: new Date(),
            notes: `Auto-reversed due to deletion of source payment: ${paymentId}`,
          }
        );
      }
    }

    // 2. Balance Reversal
    const oldData = payment.toObject();
    
    if (payment.type === 'security') {
      student.securityDeposit -= payment.paidAmount;
      // Also soft-delete the security transaction if it exists
      await this.securityDepositTransactionModel.findOneAndUpdate(
        { paymentId: payment._id },
        { isDeleted: true, notes: `VOIDED: ${payment.notes || ''}` }
      );
    } else if (payment.type === 'union_fee') {
      student.unionFee -= payment.paidAmount;
    }

    await student.save();

    // 3. Soft Delete
    payment.isDeleted = true;
    payment.deletedAt = new Date();
    await payment.save();

    await this.createAuditLog('delete_payment', 'Payment', paymentId, userId, oldData, payment.toObject());

    // 4. Emit Updates
    const dueStatus = await this.getStudentDueStatus(student._id.toString());
    this.pusherService.emitDueStatusUpdate(student._id.toString(), dueStatus);
    this.pusherService.emitDashboardUpdate({}); // Refresh dashboard stats
  }

  async lookupStudent(phone: string): Promise<any> {
    const phoneTrimmed = phone?.trim();
    if (!phoneTrimmed || phoneTrimmed.length < 5) return null;

    // Search in Residential Students (most recent first)
    const resStudent = await this.studentModel.findOne({ phone: phoneTrimmed }).sort({ createdAt: -1 }).exec();
    
    // Search in Coaching Admissions
    // Note: We need to access coaching admission model. ResidentialService shouldn't ideally reach into coaching models 
    // BUT for a quick cross-module lookup, we might need to inject it or use coachingService.
    // However, residential.service doesn't have admissionModel injected. 
    // I will use coachingService if it has a suitable method. 
    // Let's check coaching.service for findByPhone. (I need to add it there too).
    
    const coachingStudent = await this.coachingService.findAdmissionByPhone(phoneTrimmed);

    if (resStudent) {
      return {
        name: resStudent.name,
        guardianName: resStudent.guardianName,
        guardianPhone: resStudent.guardianPhone,
        source: 'residential',
      };
    }

    if (coachingStudent) {
      return {
        name: coachingStudent.studentName,
        guardianName: coachingStudent.guardianName,
        guardianPhone: coachingStudent.guardianPhone,
        source: 'coaching',
      };
    }

    return null;
  }
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
