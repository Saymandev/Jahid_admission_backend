import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Pusher from 'pusher';

@Injectable()
export class PusherService {
  private pusher: Pusher;
  private readonly logger = new Logger(PusherService.name);

  constructor(private configService: ConfigService) {
    const appId = this.configService.get<string>('PUSHER_APP_ID');
    const key = this.configService.get<string>('PUSHER_KEY');
    const secret = this.configService.get<string>('PUSHER_SECRET');
    const cluster = this.configService.get<string>('PUSHER_CLUSTER');

    if (appId && key && secret && cluster) {
      this.pusher = new Pusher({
        appId,
        key,
        secret,
        cluster,
        useTLS: true,
      });
    } else {
      this.logger.warn('Pusher configuration missing. Real-time updates will be disabled.');
    }
  }

  async trigger(channel: string, event: string, data: any) {
    if (!this.pusher) {
      this.logger.warn('Pusher not initialized, skipping event trigger');
      return;
    }
    try {
      await this.pusher.trigger(channel, event, data);
    } catch (error) {
      this.logger.error(`Error triggering Pusher event: ${error.message}`);
    }
  }

  // Helper methods to match the old SocketGateway interface
  async emitPaymentUpdate(data: any) {
    await this.trigger('main-channel', 'payment-update', data);
  }

  async emitDashboardUpdate(data: any) {
    await this.trigger('main-channel', 'dashboard-update', data);
  }

  async emitDueStatusUpdate(studentId: string, data: any) {
    await this.trigger(`student-${studentId}`, 'due-status-update', data);
  }

  async emitNotification(notification: any) {
    await this.trigger('main-channel', 'notification', notification);
  }
}
