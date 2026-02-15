import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { CoachingModule } from './coaching/coaching.module';
import { AuditModule } from './common/audit/audit.module';
import { PusherModule } from './common/pusher/pusher.module';
import { CronModule } from './cron/cron.module';
import { HealthController } from './health/health.controller';
import { ResidentialModule } from './residential/residential.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    MongooseModule.forRoot(process.env.MONGODB_URI || 'mongodb://localhost:27017/accounting_management'),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([
      {
        ttl: 60000, // 1 minute
        limit: 100, // 100 requests per minute .
      },
    ]),
    AuthModule,
    AuditModule,
    UsersModule,
    ResidentialModule,
    CoachingModule,
    PusherModule,
    CronModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
