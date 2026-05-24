import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

const wsOrigin = (
  origin: string | undefined,
  callback: (err: Error | null, allow?: boolean) => void,
) => {
  const allowed = [
    process.env.FRONTEND_URL || 'http://localhost:3001',
    'http://localhost:3001',
    'http://127.0.0.1:3001',
    'http://localhost:3002',
    'http://127.0.0.1:3002',
  ];
  if (
    !origin ||
    allowed.includes(origin) ||
    (typeof origin === 'string' && origin.endsWith('.vercel.app'))
  ) {
    callback(null, true);
  } else {
    callback(new Error(`Socket.IO CORS: ${origin} not allowed`));
  }
};

@WebSocketGateway({
  cors: { origin: wsOrigin, credentials: true },
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private logger = new Logger('EventsGateway');

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  /**
   * Listen for clients specifying which restaurant they want to listen to.
   * This allows the admin of "Restaurant A" to ONLY receive events for "Restaurant A".
   */
  @SubscribeMessage('joinRestaurantRoom')
  handleJoinRoom(
    @MessageBody() restaurantId: string,
    @ConnectedSocket() client: Socket,
  ) {
    client.join(`restaurant_${restaurantId}`);
    this.logger.log(
      `Client ${client.id} joined room: restaurant_${restaurantId}`,
    );
    return { event: 'joinedRoom', data: restaurantId };
  }

  /**
   * Listen for clients leaving a restaurant room.
   */
  @SubscribeMessage('leaveRestaurantRoom')
  handleLeaveRoom(
    @MessageBody() restaurantId: string,
    @ConnectedSocket() client: Socket,
  ) {
    client.leave(`restaurant_${restaurantId}`);
    this.logger.log(
      `Client ${client.id} left room: restaurant_${restaurantId}`,
    );
    return { event: 'leftRoom', data: restaurantId };
  }

  /**
   * Listen for a specific order room (e.g. for customer real-time tracking)
   */
  @SubscribeMessage('joinOrderRoom')
  handleJoinOrderRoom(
    @MessageBody() orderId: string,
    @ConnectedSocket() client: Socket,
  ) {
    client.join(`order_${orderId}`);
    this.logger.log(`Client ${client.id} joined order room: order_${orderId}`);
    return { event: 'joinedOrderRoom', data: orderId };
  }

  /**
   * Dispatch a generic event to a specific restaurant's room.
   */
  emitToRestaurant(restaurantId: string, eventName: string, payload: any) {
    this.server.to(`restaurant_${restaurantId}`).emit(eventName, payload);
  }

  emitTableStatusChanged(
    restaurantId: string,
    tableId: string,
    sessionId: string,
  ) {
    this.emitToRestaurant(restaurantId, 'table:status-changed', {
      tableId,
      sessionId,
    });
  }

  emitZoneChanged(restaurantId: string) {
    this.emitToRestaurant(restaurantId, 'zone:changed', {});
  }

  /**
   * Dispatch an event to a specific order's room (e.g. status change).
   */
  emitToOrder(orderId: string, eventName: string, payload: any) {
    this.server.to(`order_${orderId}`).emit(eventName, payload);
  }
}
