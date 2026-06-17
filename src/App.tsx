import { ChangeEvent, FormEvent, useMemo, useRef, useState } from 'react';
import { useLocalStorage } from './hooks/useLocalStorage';
import type { ActiveTab, AppBackup, Item, PriceRecord, Store } from './types';
import {
  averageNormalPrice,
  createId,
  currency,
  discountAmount,
  discountRate,
  effectivePrice,
  getItemName,
  getStoreName,
  isSaleActive,
  minByPrice,
  newestRecordByStore,
  todayString,
} from './utils/pricing';

const initialItems: Item[] = [
  { id: 'item_milk', name: '牛乳', category: '食品', amount: '1000ml' },
  { id: 'item_eggs', name: '卵', category: '食品', amount: '10個' },
  { id: 'item_rice', name: '米', category: '主食', amount: '5kg' },
  { id: 'item_detergent', name: '洗剤', category: '日用品', amount: '800ml' },
];

const initialStores: Store[] = [
  { id: 'store_super', name: '駅前スーパー', type: 'スーパー' },
  { id: 'store_drug', name: 'みどり薬局', type: 'ドラッグストア' },
];

const initialRecords: PriceRecord[] = [
  {
    id: 'record_milk_super',
    itemId: 'item_milk',
    storeId: 'store_super',
    normalPrice: 238,
    salePrice: 218,
    saleStart: todayString(),
    saleEnd: '',
    recordedAt: todayString(),
    memo: '週末セール',
  },
  {
    id: 'record_milk_drug',
    itemId: 'item_milk',
    storeId: 'store_drug',
    normalPrice: 248,
    recordedAt: todayString(),
    memo: '',
  },
];

const tabs: { id: ActiveTab; label: string }[] = [
  { id: 'dashboard', label: 'ホーム' },
  { id: 'records', label: '価格登録' },
  { id: 'compare', label: '比較' },
  { id: 'history', label: '履歴' },
  { id: 'items', label: '商品' },
  { id: 'stores', label: '店舗' },
  { id: 'backup', label: '保存' },
];

function App() {
  const [items, setItems] = useLocalStorage<Item[]>('price-tracker-items', initialItems);
  const [stores, setStores] = useLocalStorage<Store[]>('price-tracker-stores', initialStores);
  const [records, setRecords] = useLocalStorage<PriceRecord[]>('price-tracker-records', initialRecords);
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [search, setSearch] = useState('');
  const [selectedItemId, setSelectedItemId] = useState(initialItems[0]?.id ?? '');
  const [backupMessage, setBackupMessage] = useState('未作成');

  const filteredItems = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return items;
    return items.filter((item) =>
      `${item.name} ${item.category} ${item.amount}`.toLowerCase().includes(keyword),
    );
  }, [items, search]);

  const selectedItem = items.find((item) => item.id === selectedItemId) ?? items[0];

  function addItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const nextItem: Item = {
      id: createId('item'),
      name: String(form.get('name') ?? '').trim(),
      category: String(form.get('category') ?? '').trim(),
      amount: String(form.get('amount') ?? '').trim(),
    };
    if (!nextItem.name) return;
    setItems((current) => [...current, nextItem]);
    setSelectedItemId(nextItem.id);
    event.currentTarget.reset();
  }

  function addStore(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const nextStore: Store = {
      id: createId('store'),
      name: String(form.get('name') ?? '').trim(),
      type: String(form.get('type') ?? '').trim() || 'その他',
    };
    if (!nextStore.name) return;
    setStores((current) => [...current, nextStore]);
    event.currentTarget.reset();
  }

  function addRecord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const normalPrice = Number(form.get('normalPrice'));
    const salePriceValue = Number(form.get('salePrice'));
    // セール価格は未入力でも保存できるよう、正の数値だけを採用します。
    const nextRecord: PriceRecord = {
      id: createId('record'),
      itemId: String(form.get('itemId')),
      storeId: String(form.get('storeId')),
      normalPrice,
      salePrice: salePriceValue > 0 ? salePriceValue : undefined,
      saleStart: String(form.get('saleStart') ?? ''),
      saleEnd: String(form.get('saleEnd') ?? ''),
      recordedAt: String(form.get('recordedAt') ?? todayString()),
      memo: String(form.get('memo') ?? '').trim(),
    };
    if (!nextRecord.itemId || !nextRecord.storeId || !nextRecord.normalPrice) return;
    setRecords((current) => [nextRecord, ...current]);
    setSelectedItemId(nextRecord.itemId);
    setActiveTab('compare');
    event.currentTarget.reset();
  }

  function removeRecord(recordId: string) {
    setRecords((current) => current.filter((record) => record.id !== recordId));
  }

  function exportBackup() {
    const backup: AppBackup = {
      app: 'price-memo-app',
      version: 1,
      exportedAt: new Date().toISOString(),
      items,
      stores,
      records,
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `price-memo-backup-${todayString()}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setBackupMessage(`${todayString()} に作成`);
  }

  function importBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const backup = JSON.parse(String(reader.result)) as AppBackup;
        if (!isValidBackup(backup)) throw new Error('invalid backup');
        if (!window.confirm('現在のデータをバックアップの内容で置き換えます。実行しますか？')) return;

        setItems(backup.items);
        setStores(backup.stores);
        setRecords(backup.records);
        setSelectedItemId(backup.items[0]?.id ?? '');
        setBackupMessage(`${backup.exportedAt.slice(0, 10)} のバックアップを復元`);
      } catch {
        setBackupMessage('復元できませんでした');
      } finally {
        event.target.value = '';
      }
    };
    reader.readAsText(file);
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">localStorageで保存</p>
          <h1>近所価格メモ</h1>
        </div>
        <div className="total-pill">{records.length}件</div>
      </header>

      <section className="search-band">
        <label htmlFor="search">商品検索</label>
        <input
          id="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="牛乳、米、洗剤など"
        />
      </section>

      <main>
        {activeTab === 'dashboard' && (
          <Dashboard items={filteredItems} stores={stores} records={records} selectItem={setSelectedItemId} />
        )}
        {activeTab === 'items' && <ItemManager items={filteredItems} addItem={addItem} />}
        {activeTab === 'stores' && <StoreManager stores={stores} addStore={addStore} />}
        {activeTab === 'records' && (
          <RecordForm items={items} stores={stores} addRecord={addRecord} selectedItemId={selectedItem?.id ?? ''} />
        )}
        {activeTab === 'compare' && (
          <Comparison
            items={items}
            stores={stores}
      records={records}
            selectedItemId={selectedItem?.id ?? ''}
            setSelectedItemId={setSelectedItemId}
          />
        )}
        {activeTab === 'history' && (
          <History
            items={items}
            stores={stores}
            records={records}
            selectedItemId={selectedItem?.id ?? ''}
            setSelectedItemId={setSelectedItemId}
            removeRecord={removeRecord}
          />
        )}
        {activeTab === 'backup' && (
          <BackupPanel
            itemCount={items.length}
            storeCount={stores.length}
            recordCount={records.length}
            backupMessage={backupMessage}
            exportBackup={exportBackup}
            importBackup={importBackup}
          />
        )}
      </main>

      <nav className="bottom-nav" aria-label="メインメニュー">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={activeTab === tab.id ? 'active' : ''}
            type="button"
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>
    </div>
  );
}

function isValidBackup(backup: AppBackup) {
  return (
    backup?.app === 'price-memo-app' &&
    backup.version === 1 &&
    Array.isArray(backup.items) &&
    Array.isArray(backup.stores) &&
    Array.isArray(backup.records)
  );
}

function ItemPicker({
  items,
  selectedItemId,
  onChange,
}: {
  items: Item[];
  selectedItemId: string;
  onChange: (id: string) => void;
}) {
  return (
    <label>
      商品
      <select value={selectedItemId} onChange={(event) => onChange(event.target.value)}>
        {items.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}（{item.amount}）
          </option>
        ))}
      </select>
    </label>
  );
}

function Dashboard({
  items,
  stores,
  records,
  selectItem,
}: {
  items: Item[];
  stores: Store[];
  records: PriceRecord[];
  selectItem: (id: string) => void;
}) {
  if (items.length === 0) return <EmptyState title="商品を登録しましょう" text="よく買う商品を追加すると集計できます。" />;

  return (
    <section className="stack">
      {items.map((item) => {
        const itemRecords = records.filter((record) => record.itemId === item.id);
        // 店舗ごとの最新価格だけで「現在の最安値」を計算します。
        const latestByStore = newestRecordByStore(records, item.id);
        const currentCheapest = minByPrice(latestByStore, effectivePrice);
        const pastCheapest = minByPrice(itemRecords, (record) => Math.min(record.normalPrice, record.salePrice ?? record.normalPrice));
        const average = averageNormalPrice(itemRecords);
        const latest = itemRecords.sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))[0];
        const diff = latest ? latest.normalPrice - average : 0;

        return (
          <article className="summary-card" key={item.id} onClick={() => selectItem(item.id)}>
            <div className="card-topline">
              <div>
                <h2>{item.name}</h2>
                <p>{item.category} / {item.amount}</p>
              </div>
              {currentCheapest && <strong>{currency.format(effectivePrice(currentCheapest))}</strong>}
            </div>
            <div className="metric-grid">
              <Metric label="最安値店舗" value={currentCheapest ? getStoreName(stores, currentCheapest.storeId) : '未記録'} />
              <Metric label="過去最安値" value={pastCheapest ? currency.format(Math.min(pastCheapest.normalPrice, pastCheapest.salePrice ?? pastCheapest.normalPrice)) : '-'} />
              <Metric label="平均との差" value={latest ? `${diff >= 0 ? '+' : ''}${currency.format(diff)}` : '-'} />
              <Metric label="最近の推移" value={trendLabel(itemRecords)} />
            </div>
          </article>
        );
      })}
    </section>
  );
}

function ItemManager({ items, addItem }: { items: Item[]; addItem: (event: FormEvent<HTMLFormElement>) => void }) {
  return (
    <section className="panel">
      <h2>商品登録</h2>
      <form className="form-grid" onSubmit={addItem}>
        <label>商品名<input name="name" placeholder="牛乳" required /></label>
        <label>カテゴリ<input name="category" placeholder="食品" /></label>
        <label>内容量・容量<input name="amount" placeholder="1000ml" /></label>
        <button type="submit">商品を追加</button>
      </form>
      <div className="list">
        {items.map((item) => (
          <div className="list-row" key={item.id}>
            <div><strong>{item.name}</strong><span>{item.category}</span></div>
            <span>{item.amount}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function StoreManager({ stores, addStore }: { stores: Store[]; addStore: (event: FormEvent<HTMLFormElement>) => void }) {
  return (
    <section className="panel">
      <h2>店舗登録</h2>
      <form className="form-grid" onSubmit={addStore}>
        <label>店舗名<input name="name" placeholder="駅前スーパー" required /></label>
        <label>区分<input name="type" placeholder="スーパー" /></label>
        <button type="submit">店舗を追加</button>
      </form>
      <div className="list">
        {stores.map((store) => (
          <div className="list-row" key={store.id}>
            <strong>{store.name}</strong>
            <span>{store.type}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function BackupPanel({
  itemCount,
  storeCount,
  recordCount,
  backupMessage,
  exportBackup,
  importBackup,
}: {
  itemCount: number;
  storeCount: number;
  recordCount: number;
  backupMessage: string;
  exportBackup: () => void;
  importBackup: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <section className="panel">
      <h2>データ保管</h2>
      <div className="metric-grid highlight">
        <Metric label="商品" value={`${itemCount}件`} />
        <Metric label="店舗" value={`${storeCount}件`} />
        <Metric label="価格記録" value={`${recordCount}件`} />
      </div>
      <div className="backup-actions">
        <button type="button" onClick={exportBackup}>バックアップをダウンロード</button>
        <button className="secondary-button" type="button" onClick={() => fileInputRef.current?.click()}>
          バックアップから復元
        </button>
        <input ref={fileInputRef} className="file-input" type="file" accept="application/json,.json" onChange={importBackup} />
      </div>
      <div className="status-line">状態: {backupMessage}</div>
    </section>
  );
}

function RecordForm({
  items,
  stores,
  addRecord,
  selectedItemId,
}: {
  items: Item[];
  stores: Store[];
  addRecord: (event: FormEvent<HTMLFormElement>) => void;
  selectedItemId: string;
}) {
  if (items.length === 0 || stores.length === 0) {
    return <EmptyState title="商品と店舗が必要です" text="先に商品と店舗を1件以上登録してください。" />;
  }

  return (
    <section className="panel">
      <h2>価格登録</h2>
      <form className="form-grid" onSubmit={addRecord}>
        <label>
          商品
          <select name="itemId" defaultValue={selectedItemId}>
            {items.map((item) => <option key={item.id} value={item.id}>{item.name}（{item.amount}）</option>)}
          </select>
        </label>
        <label>
          店舗
          <select name="storeId">
            {stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
          </select>
        </label>
        <label>通常価格<input name="normalPrice" type="number" inputMode="numeric" min="1" placeholder="238" required /></label>
        <label>セール価格<input name="salePrice" type="number" inputMode="numeric" min="1" placeholder="任意" /></label>
        <label>セール開始日<input name="saleStart" type="date" /></label>
        <label>セール終了日<input name="saleEnd" type="date" /></label>
        <label>記録日<input name="recordedAt" type="date" defaultValue={todayString()} required /></label>
        <label className="wide">メモ<textarea name="memo" rows={3} placeholder="チラシ、ポイント還元など" /></label>
        <button type="submit">価格を保存</button>
      </form>
    </section>
  );
}

function Comparison({
  items,
  stores,
  records,
  selectedItemId,
  setSelectedItemId,
}: {
  items: Item[];
  stores: Store[];
  records: PriceRecord[];
  selectedItemId: string;
  setSelectedItemId: (id: string) => void;
}) {
  const latestByStore = newestRecordByStore(records, selectedItemId).sort((a, b) => effectivePrice(a) - effectivePrice(b));
  const currentMin = minByPrice(latestByStore, effectivePrice);
  const normalMin = minByPrice(latestByStore, (record) => record.normalPrice);
  const saleMin = minByPrice(latestByStore.filter((record) => record.salePrice), (record) => record.salePrice);

  return (
    <section className="panel">
      <h2>価格比較</h2>
      <ItemPicker items={items} selectedItemId={selectedItemId} onChange={setSelectedItemId} />
      <div className="metric-grid highlight">
        <Metric label="現在の最安値" value={currentMin ? `${getStoreName(stores, currentMin.storeId)} ${currency.format(effectivePrice(currentMin))}` : '-'} />
        <Metric label="通常価格の最安値" value={normalMin ? `${getStoreName(stores, normalMin.storeId)} ${currency.format(normalMin.normalPrice)}` : '-'} />
        <Metric label="セール価格の最安値" value={saleMin?.salePrice ? `${getStoreName(stores, saleMin.storeId)} ${currency.format(saleMin.salePrice)}` : '-'} />
      </div>
      <div className="price-table">
        {latestByStore.map((record) => (
          <PriceRow key={record.id} record={record} storeName={getStoreName(stores, record.storeId)} />
        ))}
      </div>
    </section>
  );
}

function History({
  items,
  stores,
  records,
  selectedItemId,
  setSelectedItemId,
  removeRecord,
}: {
  items: Item[];
  stores: Store[];
  records: PriceRecord[];
  selectedItemId: string;
  setSelectedItemId: (id: string) => void;
  removeRecord: (id: string) => void;
}) {
  const history = records
    .filter((record) => record.itemId === selectedItemId)
    .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));

  return (
    <section className="panel">
      <h2>価格履歴</h2>
      <ItemPicker items={items} selectedItemId={selectedItemId} onChange={setSelectedItemId} />
      <div className="timeline">
        {history.map((record) => (
          <article className="history-row" key={record.id}>
            <div>
              <div className="row-title">{record.recordedAt} / {getStoreName(stores, record.storeId)}</div>
              <div className="row-prices">
                <span>通常 {currency.format(record.normalPrice)}</span>
                {record.salePrice && <span className="sale-chip">セール {currency.format(record.salePrice)}</span>}
              </div>
              {record.salePrice && <p>差額 {currency.format(discountAmount(record))} / {discountRate(record)}%引き</p>}
              {record.memo && <p>{record.memo}</p>}
            </div>
            <button className="ghost-button" type="button" onClick={() => removeRecord(record.id)}>削除</button>
          </article>
        ))}
      </div>
      {history.length === 0 && <EmptyState title="履歴がありません" text={`${getItemName(items, selectedItemId)}の価格を登録してください。`} />}
    </section>
  );
}

function PriceRow({ record, storeName }: { record: PriceRecord; storeName: string }) {
  return (
    <article className="price-row">
      <div>
        <h3>{storeName}</h3>
        <p>記録日 {record.recordedAt}</p>
      </div>
      <div className="price-stack">
        <strong>{currency.format(effectivePrice(record))}</strong>
        <span>通常 {currency.format(record.normalPrice)}</span>
        {record.salePrice && (
          <span className="sale-chip">
            {isSaleActive(record) ? 'セール中' : 'セール'} {currency.format(record.salePrice)} / {discountRate(record)}%引き
          </span>
        )}
      </div>
    </article>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <section className="empty-state">
      <h2>{title}</h2>
      <p>{text}</p>
    </section>
  );
}

function trendLabel(records: PriceRecord[]) {
  const sorted = [...records].sort((a, b) => b.recordedAt.localeCompare(a.recordedAt)).slice(0, 2);
  if (sorted.length < 2) return '記録待ち';
  const diff = effectivePrice(sorted[0]) - effectivePrice(sorted[1]);
  if (diff > 0) return `上昇 ${currency.format(diff)}`;
  if (diff < 0) return `下落 ${currency.format(Math.abs(diff))}`;
  return '横ばい';
}

export default App;
