import React, { useState, useMemo, useContext } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getTableStatuses, getTableOrders } from '../../lib/api';
import { useTranslation } from 'react-i18next';
import RestaurantContext from '../../context/RestaurantContext';
import { useSocket } from '../../context/SocketContext';
import TableCard from '../../components/tables/TableCard';
import TableDetailModal from '../../components/tables/TableDetailModal';
import { Filter, Grid3X3 } from 'lucide-react';

type FilterMode = 'active' | 'occupied' | 'paid' | 'all';

const LiveTablesView: React.FC = () => {
  const { activeRestaurant: restaurant } = useContext(RestaurantContext) as any;
  const restaurantId = restaurant?.id;
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { socket } = useSocket();
  const [filter, setFilter] = useState<FilterMode>('active');
  const [selectedTable, setSelectedTable] = useState<any>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [tableOrders, setTableOrders] = useState<any[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);

  const { data: tables, isLoading, error } = useQuery({
    queryKey: ['tableStatuses', restaurantId],
    queryFn: () => getTableStatuses(restaurantId),
    enabled: !!restaurantId,
  });

  // Subscribe to real-time table status changes
  React.useEffect(() => {
    if (!socket || !restaurantId) return;

    const handleTableStatusChanged = () => {
      queryClient.invalidateQueries({ queryKey: ['tableStatuses', restaurantId] });
    };

    socket.on('table:status-changed', handleTableStatusChanged);
    return () => {
      socket.off('table:status-changed', handleTableStatusChanged);
    };
  }, [socket, restaurantId, queryClient]);

  const filteredTables = useMemo(() => {
    if (!tables) return [];
    switch (filter) {
      case 'active':
        return tables.filter((t: any) => t.status !== 'empty');
      case 'occupied':
        return tables.filter((t: any) => t.status === 'occupied' || t.status === 'waiting');
      case 'paid':
        return tables.filter((t: any) => t.status === 'paid');
      case 'all':
        return tables;
    }
  }, [tables, filter]);

  const handleTableClick = async (table: any) => {
    setSelectedTable(table);
    setModalOpen(true);
    setTableOrders([]);
    if (table.orderCount > 0 && restaurantId) {
      setOrdersLoading(true);
      try {
        const orders = await getTableOrders(table.id, restaurantId);
        setTableOrders(orders);
      } catch {
        setTableOrders([]);
      } finally {
        setOrdersLoading(false);
      }
    }
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="aspect-square rounded-2xl bg-muted/20 animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground mb-4">Failed to load tables</p>
        <button
          onClick={() => queryClient.invalidateQueries({ queryKey: ['tableStatuses', restaurantId] })}
          className="text-accent text-sm font-bold underline"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!tables || tables.length === 0) {
    return (
      <div className="text-center py-16">
        <Grid3X3 className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
        <p className="text-muted-foreground">{t('tables.noTablesCreated')}</p>
      </div>
    );
  }

  const activeCount = tables.filter((t: any) => t.status !== 'empty').length;

  return (
    <div>
      {/* Filter bar */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as FilterMode)}
            className="text-sm font-medium bg-transparent border border-border/40 rounded-xl px-3 py-1.5 text-foreground focus:outline-none focus:border-accent"
          >
            <option value="active">{t('tables.active')} ({activeCount})</option>
            <option value="occupied">{t('tables.occupied')}</option>
            <option value="paid">{t('tables.paid')}</option>
            <option value="all">{t('tables.allTables')} ({tables.length})</option>
          </select>
        </div>
      </div>

      {/* Table grid */}
      {filteredTables.length === 0 ? (
        <div className="text-center py-16">
          <Grid3X3 className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
          <p className="text-muted-foreground">{t('tables.allFree')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {filteredTables.map((table: any) => (
            <TableCard
              key={table.id}
              name={table.name}
              status={table.status}
              orderCount={table.orderCount}
              customerCount={table.customerNames.length}
              onClick={() => handleTableClick(table)}
            />
          ))}
        </div>
      )}

      {/* Detail modal — shows real order data from API */}
      <TableDetailModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        table={selectedTable}
        orders={tableOrders}
        ordersLoading={ordersLoading}
        paymentInfo={
          selectedTable?.status === 'paid'
            ? { amount: selectedTable.totalAmount }
            : null
        }
      />
    </div>
  );
};

export default LiveTablesView;
