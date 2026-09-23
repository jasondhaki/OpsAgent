export type OrderInfo = {
  orderRef: string;
  status: string;
  updatedAt: string;
  itemsSummary: string;
  emailOnFile: string;
};

export interface OrderLookup {
  find(orderRef: string): Promise<OrderInfo | null>;
}
