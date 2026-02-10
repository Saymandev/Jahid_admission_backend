import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { UserRole } from '../users/schemas/user.schema';
import { CoachingService } from './coaching.service';
import { CreateAdmissionPaymentDto } from './dto/create-admission-payment.dto';
import { CreateAdmissionDto } from './dto/create-admission.dto';
import { AdmissionStatus } from './schemas/admission.schema';

@Controller('coaching')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CoachingController {
  constructor(private readonly coachingService: CoachingService) {}

  @Post('admissions')
  @Roles(UserRole.ADMIN)
  createAdmission(@Body() createAdmissionDto: CreateAdmissionDto, @CurrentUser() user: any) {
    return this.coachingService.createAdmission(createAdmissionDto, user.sub);
  }

  @Get('admissions')
  findAllAdmissions(
    @Query('status') status?: AdmissionStatus,
    @Query('includeDeleted') includeDeleted?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('batch') batch?: string,
    @Query('course') course?: string,
  ) {
    const pagination = {
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      search: search,
      batch,
      course,
    };
    return this.coachingService.findAllAdmissions(status, includeDeleted === 'true', pagination);
  }

  @Get('admissions/archived')
  @Roles(UserRole.ADMIN)
  findAllArchivedAdmissions() {
    return this.coachingService.findAllArchivedAdmissions();
  }

  @Post('admissions/:id/restore')
  @Roles(UserRole.ADMIN)
  restoreAdmission(@Param('id') id: string) {
    return this.coachingService.restoreAdmission(id);
  }

  @Get('admissions/:id')
  findAdmissionById(@Param('id') id: string) {
    return this.coachingService.findAdmissionById(id);
  }

  @Get('payments')
  getAllPayments() {
    return this.coachingService.getAllPayments();
  }

  @Get('admissions/:id/payments')
  getAdmissionPayments(@Param('id') id: string) {
    return this.coachingService.getAdmissionPayments(id);
  }

  @Post('admissions/payments')
  createPayment(@Body() createPaymentDto: CreateAdmissionPaymentDto, @CurrentUser() user: any) {
    return this.coachingService.createPayment(createPaymentDto, user.sub);
  }

  @Get('stats')
  getAdmissionStats() {
    return this.coachingService.getAdmissionStats();
  }
}
