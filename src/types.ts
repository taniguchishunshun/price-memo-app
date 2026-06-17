export type Item = {
  id: string;
  name: string;
  category: string;
  amount: string;
};

export type Store = {
  id: string;
  name: string;
  type: string;
};

export type PriceRecord = {
  id: string;
  itemId: string;
  storeId: string;
  normalPrice: number;
  salePrice?: number;
  saleStart?: string;
  saleEnd?: string;
  recordedAt: string;
  memo: string;
};

export type ActiveTab =
  | 'dashboard'
  | 'items'
  | 'stores'
  | 'records'
  | 'compare'
  | 'history';
