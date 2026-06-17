export type Item = {
  id: string;
  groupId?: string;
  name: string;
  category: string;
  amount: string;
};

export type Store = {
  id: string;
  groupId?: string;
  name: string;
  type: string;
};

export type PriceRecord = {
  id: string;
  groupId?: string;
  itemId: string;
  storeId: string;
  normalPrice: number;
  salePrice?: number;
  saleStart?: string;
  saleEnd?: string;
  recordedAt: string;
  memo: string;
};

export type SharedGroup = {
  id: string;
  name: string;
  area: string;
  sharedWith: string;
};

export type ActiveTab =
  | 'dashboard'
  | 'items'
  | 'stores'
  | 'records'
  | 'compare'
  | 'history'
  | 'groups'
  | 'backup';

export type AppBackup = {
  app: 'price-memo-app';
  version: 1 | 2;
  exportedAt: string;
  groups?: SharedGroup[];
  activeGroupId?: string;
  items: Item[];
  stores: Store[];
  records: PriceRecord[];
};
