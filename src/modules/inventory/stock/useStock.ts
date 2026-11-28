import { useLiveQuery } from '@/data';
import { listStockItems, listStockMovements, stockBalances } from '@/data/repos/stock';
import { listStaff } from '@/data/repos/staff';
import { listFeeItems } from '@/data/repos/billing';

const load = async () => {
  const [items, movements, staff, fees] = await Promise.all([
    listStockItems(),
    listStockMovements(),
    listStaff(),
    listFeeItems(),
  ]);

  const prices = new Map(fees.filter((fee) => fee.active).map((fee) => [fee.id, fee]));

  return { items: stockBalances(items, movements), movements, staff, prices };
};

export const useStock = () => useLiveQuery(load);
