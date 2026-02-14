import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Pusher from 'pusher';

@Injectable()
export class PusherService {
  private pusher: Pusher;
  private readonly logger = new Logger(PusherService.name);

  constructor(private configService: ConfigService) {
    this.pusher = new Pusher({
      appId: this.configService.get<string>('PUSHER_APP_ID'),
      key: this.configService.get<string>('PUSHER_KEY'),
      secret: this.configService.get<string>('PUSHER_SECRET'),
      cluster: this.configService.get<string>('PUSHER_CLUSTER'),
      useTLS: true,
    });
  }

  async trigger(channel: string, event: string, data: any) {
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
