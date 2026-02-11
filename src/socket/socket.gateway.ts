import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';

@WebSocketGateway({
  path: '/api/socket.io',
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  },
})

export class SocketGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
    private usersService: UsersService,
  ) { }

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth?.token || client.handshake.headers?.authorization?.split(' ')[1];
      if (!token) {
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token, {
        secret: this.configService.get<string>('JWT_SECRET'),
      });
      const user = await this.usersService.findOne(payload.sub);
      if (!user || !user.isActive) {
        client.disconnect();
        return;
      }

      client.data.user = { id: user._id, email: user.email, role: user.role };
      console.log(`Client connected: ${client.data.user.email}`);
    } catch (error) {
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    console.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('join-room')
  handleJoinRoom(client: Socket, room: string) {
    client.join(room);
    console.log(`Client ${client.data.user?.email} joined room: ${room}`);
  }

  @SubscribeMessage('leave-room')
  handleLeaveRoom(client: Socket, room: string) {
    client.leave(room);
    console.log(`Client ${client.data.user?.email} left room: ${room}`);
  }

  // Emit payment update
  emitPaymentUpdate(data: any) {
    if (this.server) {
      this.server.emit('payment-update', data);
    }
  }

  // Emit dashboard update
  emitDashboardUpdate(data: any) {
    if (this.server) {
      this.server.emit('dashboard-update', data);
    }
  }

  // Emit due status update
  emitDueStatusUpdate(studentId: string, data: any) {
    if (this.server) {
      this.server.to(`student-${studentId}`).emit('due-status-update', data);
    }
  }

  // Emit notification to all connected clients
  emitNotification(notification: {
    id: string;
    type: 'payment' | 'due' | 'student' | 'room' | 'coaching' | 'system';
    title: string;
    message: string;
    link?: string;
    timestamp: Date;
  }) {
    if (this.server) {
      this.server.emit('notification', notification);
    }
  }
}
