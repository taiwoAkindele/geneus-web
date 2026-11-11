import { useLiveQuery } from '@/data';
import { listStockItems, listStockMovements, stockBalances } from '@/data/repos/stock';
import { listStaff } from '@/data/repos/staff';

const load = async () => {
  const [items, movements, staff] = await Promise.all([listStockItems(), listStockMovements(), listStaff()]);
  return { items: stockBalances(items, movements), movements, staff };
};
export const useStock = () => useLiveQuery(load);
