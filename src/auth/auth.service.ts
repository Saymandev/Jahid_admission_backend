import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuditService } from '../common/audit/audit.service';
import { AuditAction } from '../common/audit/schemas/audit-log.schema';
import { PusherService } from '../common/pusher/pusher.service';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private auditService: AuditService,
    private pusherService: PusherService,
  ) {}

  async validateUser(email: string, password: string): Promise<any> {
    const user = await this.usersService.findByEmail(email);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await this.usersService.validatePassword(user, password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const { password: _, ...result } = user.toObject();
    return result;
  }

  async login(loginDto: LoginDto) {
    const user = await this.validateUser(loginDto.email, loginDto.password);
    const payload = { email: user.email, sub: user._id, role: user.role };

    const accessToken = this.jwtService.sign(payload);
    const refreshToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      expiresIn: this.configService.get<string>('JWT_REFRESH_EXPIRES_IN') || '7d',
    });

    const loginResponse = {
      accessToken,
      refreshToken,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    };

    // Log login
    await this.auditService.createAuditLog(
      AuditAction.LOGIN,
      'User',
      user._id,
      user._id,
      null,
      null,
      `User ${user.name} logged in`,
    );

    // Emit notification
    await this.pusherService.emitNotification({
      id: `login-${user._id}-${Date.now()}`,
      type: 'login',
      title: 'Member Logged In',
      message: `${user.name} has logged into the system`,
      timestamp: new Date(),
    }, user._id.toString());

    return loginResponse;
  }

  async logout(userId: string) {
    await this.auditService.createAuditLog(
      AuditAction.LOGOUT,
      'User',
      null,
      userId,
      null,
      null,
      `User logged out`,
    );

    // Emit notification
    await this.pusherService.emitNotification({
      id: `logout-${userId}-${Date.now()}`,
      type: 'logout',
      title: 'Member Logged Out',
      message: `A user has logged out of the system`,
      timestamp: new Date(),
    }, userId);
  }

  async getUserProfile(userId: string) {
    return this.usersService.findOne(userId);
  }

  async refreshToken(refreshToken: string) {
    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      });

      const user = await this.usersService.findOne(payload.sub);
      if (!user || !user.isActive) {
        throw new UnauthorizedException('User not found or inactive');
      }

      const newPayload = { email: user.email, sub: user._id, role: user.role };
      const accessToken = this.jwtService.sign(newPayload);
      const newRefreshToken = this.jwtService.sign(newPayload, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
        expiresIn: this.configService.get<string>('JWT_REFRESH_EXPIRES_IN') || '7d',
      });

      return {
        accessToken,
        refreshToken: newRefreshToken,
        user: {
          id: user._id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
      };
    } catch (error) {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }
}
