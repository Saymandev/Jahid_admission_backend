import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Query,
} from '@nestjs/common';
import { ResidentialService } from './residential.service';
import { CreateRoomDto } from './dto/create-room.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { UseSecurityDepositDto } from './dto/use-security-deposit.dto';
import { ReturnSecurityDepositDto } from './dto/return-security-deposit.dto';
import { ReactivateStudentDto } from './dto/reactivate-student.dto';
import { PaginationDto } from './dto/pagination.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '../users/schemas/user.schema';
import { StudentStatus } from './schemas/student.schema';

@Controller('residential')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ResidentialController {
  constructor(private readonly residentialService: ResidentialService) { }

  // ========== ROOM ENDPOINTS ==========
  @Post('rooms')
  @Roles(UserRole.ADMIN)
  createRoom(@Body() createRoomDto: CreateRoomDto, @CurrentUser() user: any) {
    return this.residentialService.createRoom(createRoomDto, user.sub);
  }

  @Get('rooms')
  findAllRooms(
    @Query('includeDeleted') includeDeleted?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
  ) {
    const pagination: PaginationDto = {
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      search: search,
    };
    return this.residentialService.findAllRooms(includeDeleted === 'true', pagination);
  }

  @Get('rooms/archived')
  @Roles(UserRole.ADMIN)
  findAllArchivedRooms() {
    return this.residentialService.findAllArchivedRooms();
  }

  @Post('rooms/:id/restore')
  @Roles(UserRole.ADMIN)
  restoreRoom(@Param('id') id: string, @CurrentUser() user: any) {
    return this.residentialService.restoreRoom(id, user.sub);
  }

  @Get('rooms/:id')
  findRoomById(@Param('id') id: string) {
    return this.residentialService.findRoomById(id);
  }

  @Patch('rooms/:id')
  @Roles(UserRole.ADMIN)
  updateRoom(@Param('id') id: string, @Body() updateRoomDto: UpdateRoomDto, @CurrentUser() user: any) {
    return this.residentialService.updateRoom(id, updateRoomDto, user.sub);
  }

  @Delete('rooms/:id')
  @Roles(UserRole.ADMIN)
  deleteRoom(@Param('id') id: string, @CurrentUser() user: any) {
    return this.residentialService.deleteRoom(id, user.sub);
  }

  // ========== STUDENT ENDPOINTS ==========
  @Post('students')
  @Roles(UserRole.ADMIN)
  createStudent(@Body() createStudentDto: CreateStudentDto, @CurrentUser() user: any) {
    return this.residentialService.createStudent(createStudentDto, user.sub);
  }

  @Get('students')
  findAllStudents(
    @Query('status') status?: StudentStatus,
    @Query('includeDeleted') includeDeleted?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
  ) {
    const pagination: PaginationDto = {
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      search: search,
    };
    return this.residentialService.findAllStudents(status, includeDeleted === 'true', pagination);
  }

  @Get('students/archived')
  @Roles(UserRole.ADMIN)
  findAllArchivedStudents() {
    return this.residentialService.findAllArchivedStudents();
  }

  @Post('students/:id/restore')
  @Roles(UserRole.ADMIN)
  restoreStudent(@Param('id') id: string, @CurrentUser() user: any) {
    return this.residentialService.restoreStudent(id, user.sub);
  }

  @Get('students/search')
  findStudentByPhoneOrName(@Query('phone') phone?: string, @Query('name') name?: string) {
    return this.residentialService.findStudentByPhoneOrName(phone, name);
  }

  @Get('students/:id')
  findStudentById(@Param('id') id: string) {
    return this.residentialService.findStudentById(id);
  }

  @Get('students/:id/payments')
  getStudentPayments(@Param('id') id: string) {
    return this.residentialService.getStudentPayments(id);
  }

  @Get('students/:id/due-status')
  getStudentDueStatus(@Param('id') id: string) {
    return this.residentialService.getStudentDueStatus(id);
  }

  @Get('students/:id/advance-applications')
  @Roles('admin')
  getAdvanceApplications(@Param('id') id: string) {
    return this.residentialService.getAdvanceApplications(id);
  }

  @Patch('students/:id')
  @Roles(UserRole.ADMIN)
  updateStudent(@Param('id') id: string, @Body() updateStudentDto: UpdateStudentDto, @CurrentUser() user: any) {
    return this.residentialService.updateStudent(id, updateStudentDto, user.sub);
  }

  @Post('students/:id/checkout')
  @Roles(UserRole.ADMIN)
  checkoutStudent(
    @Param('id') id: string,
    @Body() body: { useSecurityDeposit?: boolean; refundAmount?: number },
    @CurrentUser() user: any,
  ) {
    return this.residentialService.checkoutStudent(id, user.sub, body.useSecurityDeposit || false, body.refundAmount);
  }


  @Post('students/:id/reactivate')
  @Roles(UserRole.ADMIN)
  reactivateStudent(
    @Param('id') id: string,
    @Body() reactivateDto: ReactivateStudentDto,
    @CurrentUser() user: any,
  ) {
    return this.residentialService.reactivateStudent(id, reactivateDto, user.sub);
  }

  // ========== SECURITY DEPOSIT ENDPOINTS ==========
  @Post('students/:id/security-deposit/use')
  @Roles(UserRole.ADMIN)
  useSecurityDepositForDues(
    @Param('id') id: string,
    @Body() useSecurityDepositDto: UseSecurityDepositDto,
    @CurrentUser() user: any,
  ) {
    return this.residentialService.useSecurityDepositForDues(id, useSecurityDepositDto, user.sub);
  }

  @Post('students/:id/security-deposit/return')
  @Roles(UserRole.ADMIN)
  returnSecurityDeposit(
    @Param('id') id: string,
    @Body() returnSecurityDepositDto: ReturnSecurityDepositDto,
    @CurrentUser() user: any,
  ) {
    return this.residentialService.returnSecurityDeposit(id, returnSecurityDepositDto, user.sub);
  }

  @Get('students/:id/security-deposit/transactions')
  getSecurityDepositTransactions(@Param('id') id: string) {
    return this.residentialService.getSecurityDepositTransactions(id);
  }

  // ========== PAYMENT ENDPOINTS ==========
  @Get('payments')
  getAllPayments(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @CurrentUser() user?: any,
  ) {
    const pagination: PaginationDto = {
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      search: search,
    };
    // Staff users can only see their own transactions
    const userId = user?.role === 'staff' ? user.sub : undefined;
    return this.residentialService.getAllPayments(pagination, userId);
  }

  @Post('payments')
  createPayment(@Body() createPaymentDto: CreatePaymentDto, @CurrentUser() user: any) {
    return this.residentialService.createPayment(createPaymentDto, user.sub);
  }

  @Delete('students/:id/advance-payment')
  @Roles(UserRole.ADMIN)
  deleteAdvancePayment(@Param('id') id: string, @CurrentUser() user: any) {
    return this.residentialService.deleteAdvancePayment(id, user.sub);
  }

  // ========== DASHBOARD ENDPOINTS ==========
  @Get('dashboard/stats')
  getDashboardStats() {
    return this.residentialService.getDashboardStats();
  }

  @Get('dashboard/monthly-chart')
  getMonthlyChartData() {
    return this.residentialService.getMonthlyChartData();
  }
}
