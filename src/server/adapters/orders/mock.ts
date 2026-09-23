import 'server-only';
import type { OrderInfo, OrderLookup } from './types';

// Fictional orders for the demo org and evals.
const ORDERS: OrderInfo[] = [
  { orderRef: 'JC-10234', status: 'shipped', updatedAt: '2026-09-20T10:00:00+06:00', itemsSummary: '1 × jute tote (natural)', emailOnFile: 'rina.demo@example.com' },
  { orderRef: 'JC-10235', status: 'processing', updatedAt: '2026-09-22T15:30:00+06:00', itemsSummary: '2 × leather wallet (tan)', emailOnFile: 'karim.demo@example.com' },
  { orderRef: 'JC-10236', status: 'delivered', updatedAt: '2026-09-18T12:00:00+06:00', itemsSummary: '1 × shoulder bag (maroon)', emailOnFile: 'nadia.demo@example.com' },
];

export const mockOrders: OrderLookup = {
  async find(orderRef) {
    return ORDERS.find((o) => o.orderRef === orderRef.toUpperCase()) ?? null;
  },
};
