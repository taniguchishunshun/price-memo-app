import type { Item, PriceRecord, Store } from '../types';

export const currency = new Intl.NumberFormat('ja-JP', {
  style: 'currency',
  currency: 'JPY',
  maximumFractionDigits: 0,
});

export function todayString() {
  return new Date().toISOString().slice(0, 10);
}

export function createId(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function isSaleActive(record: PriceRecord, date = todayString()) {
  if (!record.salePrice) return false;
  // 開始日・終了日が空の場合は、片側だけ未指定のセールとして扱います。
  const starts = !record.saleStart || record.saleStart <= date;
  const ends = !record.saleEnd || record.saleEnd >= date;
  return starts && ends;
}

export function effectivePrice(record: PriceRecord) {
  return isSaleActive(record) && record.salePrice ? record.salePrice : record.normalPrice;
}

export function discountAmount(record: PriceRecord) {
  return record.salePrice ? Math.max(record.normalPrice - record.salePrice, 0) : 0;
}

export function discountRate(record: PriceRecord) {
  if (!record.salePrice || record.normalPrice <= 0) return 0;
  return Math.round((discountAmount(record) / record.normalPrice) * 100);
}

export function newestRecordByStore(records: PriceRecord[], itemId: string) {
  const byStore = new Map<string, PriceRecord>();
  records
    .filter((record) => record.itemId === itemId)
    .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))
    .forEach((record) => {
      if (!byStore.has(record.storeId)) byStore.set(record.storeId, record);
    });
  return Array.from(byStore.values());
}

export function minByPrice(records: PriceRecord[], priceSelector: (record: PriceRecord) => number | undefined) {
  return records.reduce<PriceRecord | undefined>((best, record) => {
    const price = priceSelector(record);
    if (price === undefined || Number.isNaN(price)) return best;
    if (!best) return record;
    const bestPrice = priceSelector(best);
    return bestPrice === undefined || price < bestPrice ? record : best;
  }, undefined);
}

export function averageNormalPrice(records: PriceRecord[]) {
  if (records.length === 0) return 0;
  return Math.round(records.reduce((total, record) => total + record.normalPrice, 0) / records.length);
}

export function getItemName(items: Item[], itemId: string) {
  return items.find((item) => item.id === itemId)?.name ?? '未登録の商品';
}

export function getStoreName(stores: Store[], storeId: string) {
  return stores.find((store) => store.id === storeId)?.name ?? '未登録の店舗';
}
