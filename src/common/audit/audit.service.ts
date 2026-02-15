import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuditLog, AuditLogDocument } from './schemas/audit-log.schema';

@Injectable()
export class AuditService {
  constructor(
    @InjectModel(AuditLog.name) private auditLogModel: Model<AuditLogDocument>,
  ) {}

  async createAuditLog(
    action: string,
    entity: string,
    entityId: string,
    userId: string,
    oldData: any,
    newData: any,
    description?: string,
  ): Promise<void> {
    try {
      const auditLog = new this.auditLogModel({
        action,
        entity,
        entityId: entityId ? new Types.ObjectId(entityId) : undefined,
        userId: new Types.ObjectId(userId),
        oldData,
        newData,
        description,
      });
      await auditLog.save();
    } catch (error) {
      console.error('Failed to create audit log:', error);
    }
  }

  async findAllAuditLogs(
    pagination?: { page?: number; limit?: number; search?: string },
    filters?: {
      action?: string;
      entity?: string;
      userId?: string;
      startDate?: string;
      endDate?: string;
    },
  ): Promise<{ data: AuditLogDocument[]; total: number; page: number; limit: number; totalPages: number }> {
    const query: any = {};

    if (filters?.action) {
      query.action = filters.action;
    }
    if (filters?.entity) {
      query.entity = filters.entity;
    }
    if (filters?.userId) {
      query.userId = new Types.ObjectId(filters.userId);
    }
    if (filters?.startDate || filters?.endDate) {
      const dateRange: any = {};
      if (filters.startDate) dateRange.$gte = new Date(filters.startDate);
      if (filters.endDate) {
        const end = new Date(filters.endDate);
        end.setHours(23, 59, 59, 999);
        dateRange.$lte = end;
      }
      query.createdAt = dateRange;
    }

    if (pagination?.search) {
      const searchRegex = new RegExp(pagination.search, 'i');
      query.$or = [
        { description: searchRegex },
        { entity: searchRegex },
        { action: searchRegex },
      ];
    }

    const page = pagination?.page || 1;
    const limit = pagination?.limit || 20;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.auditLogModel
        .find(query)
        .populate('userId', 'name email role')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.auditLogModel.countDocuments(query).exec(),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }
}
