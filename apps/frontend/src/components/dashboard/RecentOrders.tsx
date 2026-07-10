import React from "react";
import { Order } from "@/types";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useTranslation } from "react-i18next";

interface RecentOrdersProps {
  orders: Order[];
}

export const RecentOrders: React.FC<RecentOrdersProps> = ({ orders }) => {
  const { t } = useTranslation();
  return (
    <div>
      <h3 className="text-lg font-medium">
        {t("auto.recentOrders", "Recent Orders")}
      </h3>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("auto.customer", "Customer")}</TableHead>
            <TableHead>{t("auto.status", "Status")}</TableHead>
            <TableHead>{t("auto.total", "Total")}</TableHead>
            <TableHead>{t("auto.date", "Date")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.map((order) => (
            <TableRow key={order.id}>
              <TableCell>{order.customerName}</TableCell>
              <TableCell>{order.status}</TableCell>
              <TableCell>{order.totalPrice.toFixed(2)}</TableCell>
              <TableCell>
                {new Date(order.createdAt).toLocaleDateString()}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};
