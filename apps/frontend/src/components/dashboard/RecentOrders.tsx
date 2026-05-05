import React from 'react';
import { Order } from '@/types';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface RecentOrdersProps {
  orders: Order[];
}

export const RecentOrders: React.FC<RecentOrdersProps> = ({ orders }) => {
  return (
    <div>
      <h3 className="text-lg font-medium">Recent Orders</h3>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Customer</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Total</TableHead>
            <TableHead>Date</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.map((order) => (
            <TableRow key={order.id}>
              <TableCell>{order.customerName}</TableCell>
              <TableCell>{order.status}</TableCell>
              <TableCell>{order.totalPrice.toFixed(2)}</TableCell>
              <TableCell>{new Date(order.createdAt).toLocaleDateString()}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};
