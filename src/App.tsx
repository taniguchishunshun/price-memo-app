import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase } from './lib/supabase';
import type {
  GroupInviteRow,
  GroupMemberRow,
  GroupRow,
  PriceRecordRow,
  ProductRow,
  ProfileRow,
  StoreRow,
} from './db/database.types';
import { currency } from './utils/pricing';

type ActiveTab = 'dashboard' | 'records' | 'compare' | 'history' | 'items' | 'stores' | 'groups' | 'backup';

const tabs: { id: ActiveTab; label: string }[] = [
  { id: 'dashboard', label: 'ホーム' },
  { id: 'records', label: '価格登録' },
  { id: 'compare', label: '比較' },
  { id: 'history', label: '履歴' },
  { id: 'items', label: '商品' },
  { id: 'stores', label: '店舗' },
  { id: 'groups', label: '共有' },
  { id: 'backup', label: '保存' },
];

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [members, setMembers] = useState<GroupMemberRow[]>([]);
  const [invites, setInvites] = useState<GroupInviteRow[]>([]);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [records, setRecords] = useState<PriceRecordRow[]>([]);
  const [activeGroupId, setActiveGroupId] = useState('');
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [search, setSearch] = useState('');
  const [selectedProductId, setSelectedProductId] = useState('');
  const [status, setStatus] = useState('準備中');
  const [toast, setToast] = useState('');
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [recentGroupCreationKey, setRecentGroupCreationKey] = useState('');
  const [deletingGroupIds, setDeletingGroupIds] = useState<string[]>([]);

  const user = session?.user ?? null;
  const activeGroup = groups.find((group) => group.id === activeGroupId) ?? groups[0] ?? null;
  const selectedGroupId = activeGroupId || groups[0]?.id || '';
  const filteredProducts = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return products;
    return products.filter((product) =>
      `${product.name} ${product.category ?? ''} ${product.amount ?? ''} ${product.barcode ?? ''}`.toLowerCase().includes(keyword),
    );
  }, [products, search]);
  const selectedProduct = products.find((product) => product.id === selectedProductId) ?? products[0] ?? null;

  useEffect(() => {
    if (!supabase) return;

    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!supabase || !user) {
      resetData();
      return;
    }

    loadAccount(user);
  }, [user?.id]);

  useEffect(() => {
    if (!toast) return;
    const timerId = window.setTimeout(() => setToast(''), 3200);
    return () => window.clearTimeout(timerId);
  }, [toast]);

  useEffect(() => {
    if (!supabase || !user || !activeGroupId) return;
    const client = supabase;

    loadGroupData(activeGroupId);
    const channel = client
      .channel(`group:${activeGroupId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products', filter: `group_id=eq.${activeGroupId}` }, () => loadGroupData(activeGroupId))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stores', filter: `group_id=eq.${activeGroupId}` }, () => loadGroupData(activeGroupId))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'price_records', filter: `group_id=eq.${activeGroupId}` }, () => loadGroupData(activeGroupId))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'group_members', filter: `group_id=eq.${activeGroupId}` }, () => loadGroupData(activeGroupId))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'group_invites', filter: `group_id=eq.${activeGroupId}` }, () => loadGroupData(activeGroupId))
      .subscribe();

    return () => {
      client.removeChannel(channel);
    };
  }, [activeGroupId, user?.id]);

  async function loadAccount(currentUser: User, preferredGroupId = '') {
    if (!supabase) return;

    const { data: profileRow } = await supabase.from('profiles').select('*').eq('id', currentUser.id).maybeSingle();
    const currentProfile = profileRow as ProfileRow | null;
    if (!currentProfile) {
      const displayName = currentUser.user_metadata.display_name ?? currentUser.email?.split('@')[0] ?? 'ユーザー';
      const { data: createdProfile, error: profileError } = await supabase
        .from('profiles')
        .upsert({ id: currentUser.id, display_name: displayName, avatar_url: null })
        .select()
        .single();
      if (profileError) {
        setStatus(profileError.message);
        return;
      }
      setProfile(createdProfile as ProfileRow);
    } else {
      setProfile(currentProfile);
    }

    const { data: groupRows, error } = await supabase.from('groups').select('*').order('created_at', { ascending: true });
    if (error) {
      setStatus(error.message);
      return;
    }

    const typedGroups = (groupRows ?? []) as GroupRow[];
    console.info('[price-memo] groups loaded', {
      count: typedGroups.length,
      activeGroupId: preferredGroupId || activeGroupId,
      groupIds: typedGroups.map((group) => group.id),
    });
    setGroups(typedGroups);
    const candidateGroupId = preferredGroupId || activeGroupId;
    const nextGroupId = candidateGroupId && typedGroups.some((group) => group.id === candidateGroupId) ? candidateGroupId : typedGroups[0]?.id ?? '';
    setActiveGroupId(nextGroupId);
    if (nextGroupId) {
      await loadGroupData(nextGroupId);
    } else {
      setProducts([]);
      setStores([]);
      setRecords([]);
      setStatus('共有グループを作成してください');
    }

    const { data: inviteRows } = await supabase.from('group_invites').select('*').is('accepted_at', null).order('created_at', { ascending: false });
    setInvites((inviteRows ?? []) as GroupInviteRow[]);
  }

  async function refreshActiveGroupData(groupId = activeGroup?.id ?? activeGroupId) {
    if (!groupId) return;
    await loadGroupData(groupId);
  }

  async function loadGroupData(groupId: string) {
    if (!supabase) return;

    const [productResult, storeResult, recordResult, memberResult, inviteResult] = await Promise.all([
      supabase.from('products').select('*').eq('group_id', groupId).order('created_at', { ascending: true }),
      supabase.from('stores').select('*').eq('group_id', groupId).order('created_at', { ascending: true }),
      supabase.from('price_records').select('*').eq('group_id', groupId).order('recorded_at', { ascending: false }),
      supabase.from('group_members').select('*').eq('group_id', groupId).order('created_at', { ascending: true }),
      supabase.from('group_invites').select('*').eq('group_id', groupId).order('created_at', { ascending: false }),
    ]);

    if (productResult.error || storeResult.error || recordResult.error) {
      setStatus(productResult.error?.message ?? storeResult.error?.message ?? recordResult.error?.message ?? '読み込みに失敗しました');
      return;
    }

    const typedProducts = (productResult.data ?? []) as ProductRow[];
    const typedStores = (storeResult.data ?? []) as StoreRow[];
    const typedRecords = (recordResult.data ?? []) as PriceRecordRow[];
    const typedMembers = (memberResult.data ?? []) as GroupMemberRow[];
    const typedInvites = (inviteResult.data ?? []) as GroupInviteRow[];
    setProducts(typedProducts);
    setStores(typedStores);
    setRecords(typedRecords);
    setMembers(typedMembers);
    setInvites(typedInvites);
    setSelectedProductId((current) => current || typedProducts[0]?.id || '');

    const userIds = Array.from(new Set([...typedRecords.map((record) => record.recorded_by), ...typedMembers.map((member) => member.user_id)]));
    if (userIds.length > 0) {
      const { data: profileRows } = await supabase.from('profiles').select('*').in('id', userIds);
      setProfiles((profileRows ?? []) as ProfileRow[]);
    } else {
      setProfiles([]);
    }

    setStatus('同期済み');
  }

  function resetData() {
    setProfile(null);
    setGroups([]);
    setMembers([]);
    setInvites([]);
    setProfiles([]);
    setProducts([]);
    setStores([]);
    setRecords([]);
    setActiveGroupId('');
    setSelectedProductId('');
  }

  async function signOut() {
    await supabase?.auth.signOut();
  }

  async function createGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !user || isCreatingGroup) return;
    const form = new FormData(event.currentTarget);
    const name = String(form.get('name') ?? '').trim();
    const area = String(form.get('area') ?? '').trim();
    if (!name || !area) return;

    const normalizedKey = `${normalizeName(name)}:${normalizeName(area)}`;
    const duplicate = groups.some((group) => normalizeName(group.name) === normalizeName(name) && normalizeName(group.area) === normalizeName(area));
    if (duplicate || recentGroupCreationKey === normalizedKey) {
      setStatus('同じグループがすでにあります');
      setToast('同じグループがすでにあります');
      return;
    }

    setIsCreatingGroup(true);
    setRecentGroupCreationKey(normalizedKey);
    setStatus('共有グループを作成中です');

    try {
      const groupId = crypto.randomUUID();
      const createdAt = new Date().toISOString();
      const { error } = await supabase
        .from('groups')
        .insert({ id: groupId, name, area, created_by: user.id, created_at: createdAt });
      if (error) throw error;

      const { error: memberError } = await supabase.from('group_members').insert({ group_id: groupId, user_id: user.id, role: 'owner' });
      if (memberError) throw memberError;

      event.currentTarget.reset();
      setActiveGroupId(groupId);
      await loadAccount(user, groupId);
      setToast('共有グループを作成しました');
      setStatus('共有グループを作成しました');
    } catch (error) {
      console.error('[price-memo] failed to create group', error);
      const message = error instanceof Error ? error.message : '共有グループの作成に失敗しました';
      setStatus(message);
      setToast('共有グループの作成に失敗しました');
      setRecentGroupCreationKey('');
    } finally {
      setIsCreatingGroup(false);
      window.setTimeout(() => {
        setRecentGroupCreationKey((current) => (current === normalizedKey ? '' : current));
      }, 30000);
    }
  }

  async function updateGroup(group: GroupRow) {
    if (!supabase) return;
    const name = window.prompt('グループ名', group.name)?.trim();
    if (!name) return;
    const area = window.prompt('エリア', group.area)?.trim() ?? group.area;
    const { error } = await supabase.from('groups').update({ name, area }).eq('id', group.id);
    if (error) setStatus(error.message);
    else await loadAccount(session!.user, group.id);
  }

  async function deleteGroup(group: GroupRow) {
    if (!supabase || !user || deletingGroupIds.includes(group.id)) return;
    if (!window.confirm(`${group.name}を削除しますか？\n商品・店舗・価格記録もまとめて削除されます。`)) return;

    setDeletingGroupIds((current) => [...current, group.id]);
    setStatus('共有グループを削除中です');
    try {
      const { data, error } = await supabase.from('groups').delete().eq('id', group.id).select('id');
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('削除対象が見つからないか、削除権限がありません');

      const nextGroupId = groups.find((candidate) => candidate.id !== group.id)?.id ?? '';
      setActiveGroupId(nextGroupId);
      await loadAccount(user, nextGroupId);
      setToast('削除しました');
      setStatus('削除しました');
    } catch (error) {
      console.error('[price-memo] failed to delete group', error);
      const message = error instanceof Error ? error.message : '共有グループの削除に失敗しました';
      setStatus(`削除失敗: ${message}`);
      setToast(`削除失敗: ${message}`);
    } finally {
      setDeletingGroupIds((current) => current.filter((id) => id !== group.id));
    }
  }

  async function inviteMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !user || !activeGroup) return;
    const form = new FormData(event.currentTarget);
    const invitedEmail = String(form.get('email') ?? '').trim().toLowerCase();
    if (!invitedEmail) return;
    const { error } = await supabase.from('group_invites').insert({
      group_id: activeGroup.id,
      invited_email: invitedEmail,
      invited_by: user.id,
    });
    if (error) setStatus(error.message);
    else {
      event.currentTarget.reset();
      setStatus('招待を作成しました');
      await loadGroupData(activeGroup.id);
    }
  }

  async function acceptInvite(invite: GroupInviteRow) {
    if (!supabase || !user) return;
    const { error: memberError } = await supabase.from('group_members').insert({
      group_id: invite.group_id,
      user_id: user.id,
      role: invite.role,
    });
    if (memberError) {
      setStatus(memberError.message);
      return;
    }
    await supabase.from('group_invites').update({ accepted_by: user.id, accepted_at: new Date().toISOString() }).eq('id', invite.id);
    await loadAccount(user);
  }

  async function addProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !activeGroup) return;
    const form = new FormData(event.currentTarget);
    const name = String(form.get('name') ?? '').trim();
    if (!name) return;

    const duplicate = products.some((product) => normalizeName(product.name) === normalizeName(name));
    if (duplicate && !window.confirm('似た商品名があります。登録しますか？')) return;

    const { error } = await supabase.from('products').insert({
      group_id: activeGroup.id,
      name,
      category: String(form.get('category') ?? '').trim() || null,
      amount: String(form.get('amount') ?? '').trim() || null,
      barcode: String(form.get('barcode') ?? '').trim() || null,
    });
    if (error) setStatus(error.message);
    else {
      event.currentTarget.reset();
      await refreshActiveGroupData(activeGroup.id);
      setStatus('商品を追加しました');
    }
  }

  async function updateProduct(product: ProductRow) {
    if (!supabase) return;
    const name = window.prompt('商品名', product.name)?.trim();
    if (!name) return;
    const category = window.prompt('カテゴリ', product.category ?? '')?.trim() || null;
    const amount = window.prompt('内容量・容量', product.amount ?? '')?.trim() || null;
    const { error } = await supabase.from('products').update({ name, category, amount }).eq('id', product.id);
    if (error) setStatus(error.message);
    else {
      await refreshActiveGroupData(product.group_id);
      setStatus('商品を更新しました');
    }
  }

  async function deleteProduct(productId: string) {
    if (!supabase || !window.confirm('商品を削除しますか？')) return;
    const groupId = products.find((product) => product.id === productId)?.group_id ?? activeGroup?.id ?? '';
    const { error } = await supabase.from('products').delete().eq('id', productId);
    if (error) setStatus(error.message);
    else {
      await refreshActiveGroupData(groupId);
      setStatus('商品を削除しました');
    }
  }

  async function addStore(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !activeGroup) return;
    const form = new FormData(event.currentTarget);
    const name = String(form.get('name') ?? '').trim();
    if (!name) return;
    const { error } = await supabase.from('stores').insert({
      group_id: activeGroup.id,
      name,
      store_type: String(form.get('type') ?? '').trim(),
      address: String(form.get('address') ?? '').trim() || null,
    });
    if (error) setStatus(error.message);
    else {
      event.currentTarget.reset();
      await refreshActiveGroupData(activeGroup.id);
      setStatus('店舗を追加しました');
    }
  }

  async function updateStore(store: StoreRow) {
    if (!supabase) return;
    const name = window.prompt('店舗名', store.name)?.trim();
    if (!name) return;
    const storeType = window.prompt('区分', store.store_type)?.trim() ?? store.store_type;
    const address = window.prompt('住所', store.address ?? '')?.trim() || null;
    const { error } = await supabase.from('stores').update({ name, store_type: storeType, address }).eq('id', store.id);
    if (error) setStatus(error.message);
    else {
      await refreshActiveGroupData(store.group_id);
      setStatus('店舗を更新しました');
    }
  }

  async function deleteStore(storeId: string) {
    if (!supabase || !window.confirm('店舗を削除しますか？')) return;
    const groupId = stores.find((store) => store.id === storeId)?.group_id ?? activeGroup?.id ?? '';
    const { error } = await supabase.from('stores').delete().eq('id', storeId);
    if (error) setStatus(error.message);
    else {
      await refreshActiveGroupData(groupId);
      setStatus('店舗を削除しました');
    }
  }

  async function addRecord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !user || !activeGroup) return;
    const form = new FormData(event.currentTarget);
    const productId = String(form.get('productId'));
    const storeId = String(form.get('storeId'));
    const price = Number(form.get('price'));
    if (!productId || !storeId || !price) return;
    const { error } = await supabase.from('price_records').insert({
      group_id: activeGroup.id,
      product_id: productId,
      store_id: storeId,
      price,
      memo: String(form.get('memo') ?? '').trim() || null,
      recorded_by: user.id,
      recorded_at: String(form.get('recordedAt') || new Date().toISOString()),
    });
    if (error) setStatus(error.message);
    else {
      setSelectedProductId(productId);
      setActiveTab('compare');
      event.currentTarget.reset();
      await refreshActiveGroupData(activeGroup.id);
      setStatus('価格を保存しました');
    }
  }

  async function updateRecord(record: PriceRecordRow) {
    if (!supabase) return;
    const price = Number(window.prompt('価格', String(record.price)));
    if (!price) return;
    const memo = window.prompt('メモ', record.memo ?? '')?.trim() || null;
    const { error } = await supabase.from('price_records').update({ price, memo }).eq('id', record.id);
    if (error) setStatus(error.message);
    else {
      await refreshActiveGroupData(record.group_id);
      setStatus('価格を更新しました');
    }
  }

  async function deleteRecord(recordId: string) {
    if (!supabase || !window.confirm('価格記録を削除しますか？')) return;
    const groupId = records.find((record) => record.id === recordId)?.group_id ?? activeGroup?.id ?? '';
    const { error } = await supabase.from('price_records').delete().eq('id', recordId);
    if (error) setStatus(error.message);
    else {
      await refreshActiveGroupData(groupId);
      setStatus('価格記録を削除しました');
    }
  }

  function exportBackup() {
    const backup = {
      app: 'price-memo-app',
      version: 3,
      exportedAt: new Date().toISOString(),
      activeGroup,
      groups,
      products,
      stores,
      records,
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `price-memo-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setStatus('バックアップを作成しました');
  }

  if (!isSupabaseConfigured || !supabase) return <SetupNotice />;
  if (!session) return <AuthPanel />;

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">Supabaseで同期</p>
          <h1>近所価格メモ</h1>
        </div>
        <button className="ghost-button" type="button" onClick={signOut}>ログアウト</button>
      </header>

      {toast && <div className="toast" role="status">{toast}</div>}

      <section className="group-band">
        <label htmlFor="active-group">共有グループ</label>
        <div className="group-selector">
          <select id="active-group" value={selectedGroupId} onChange={(event) => setActiveGroupId(event.target.value)} disabled={groups.length === 0}>
            {groups.length === 0 ? (
              <option value="">共有グループなし</option>
            ) : (
              groups.map((group) => (
                <option key={group.id} value={group.id}>{group.name} / {group.area}</option>
              ))
            )}
          </select>
          <button className="secondary-button" type="button" onClick={() => setActiveTab('groups')}>管理</button>
        </div>
        {groups.length > 0 && (
          <div className="group-chip-list" aria-label="共有グループ一覧">
            {groups.map((group) => (
              <button key={group.id} className={group.id === selectedGroupId ? 'active' : ''} type="button" onClick={() => setActiveGroupId(group.id)}>
                <span>{group.name}</span>
                <small>{group.area}</small>
              </button>
            ))}
          </div>
        )}
        <p>{groups.length === 0 ? '共有グループを作成してください' : `${activeGroup?.area ?? ''} / ${members.length}人で共有`}</p>
        <p>状態: {status}</p>
      </section>

      {pendingInvites(invites, session.user.email).length > 0 && (
        <section className="panel">
          <h2>招待</h2>
          <div className="list">
            {pendingInvites(invites, session.user.email).map((invite) => (
              <div className="list-row" key={invite.id}>
                <span>{invite.group_id}</span>
                <button type="button" onClick={() => acceptInvite(invite)}>参加</button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="search-band">
        <label htmlFor="search">商品検索</label>
        <input id="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="卵、牛乳、豆腐など" />
      </section>

      <main>
        {activeTab === 'dashboard' && (
          <Dashboard products={filteredProducts} stores={stores} records={records} profiles={profiles} setSelectedProductId={setSelectedProductId} />
        )}
        {activeTab === 'records' && (
          <RecordForm products={products} stores={stores} selectedProductId={selectedProduct?.id ?? ''} addRecord={addRecord} />
        )}
        {activeTab === 'compare' && (
          <Comparison products={products} stores={stores} records={records} selectedProductId={selectedProduct?.id ?? ''} setSelectedProductId={setSelectedProductId} />
        )}
        {activeTab === 'history' && (
          <History products={products} stores={stores} records={records} profiles={profiles} selectedProductId={selectedProduct?.id ?? ''} setSelectedProductId={setSelectedProductId} updateRecord={updateRecord} deleteRecord={deleteRecord} />
        )}
        {activeTab === 'items' && (
          <ProductManager products={filteredProducts} addProduct={addProduct} updateProduct={updateProduct} deleteProduct={deleteProduct} />
        )}
        {activeTab === 'stores' && (
          <StoreManager stores={stores} addStore={addStore} updateStore={updateStore} deleteStore={deleteStore} />
        )}
        {activeTab === 'groups' && (
          <GroupManager groups={groups} members={members} profiles={profiles} invites={invites} activeGroupId={selectedGroupId} isCreatingGroup={isCreatingGroup} deletingGroupIds={deletingGroupIds} createGroup={createGroup} updateGroup={updateGroup} deleteGroup={deleteGroup} inviteMember={inviteMember} setActiveGroupId={setActiveGroupId} profile={profile} />
        )}
        {activeTab === 'backup' && (
          <BackupPanel groups={groups.length} products={products.length} stores={stores.length} records={records.length} exportBackup={exportBackup} />
        )}
      </main>

      <nav className="bottom-nav" aria-label="メインメニュー">
        {tabs.map((tab) => (
          <button key={tab.id} className={activeTab === tab.id ? 'active' : ''} type="button" onClick={() => setActiveTab(tab.id)}>
            {tab.label}
          </button>
        ))}
      </nav>
    </div>
  );
}

function SetupNotice() {
  return (
    <div className="app-shell">
      <section className="panel">
        <h1>Supabase設定が必要です</h1>
        <p>.env に VITE_SUPABASE_URL と VITE_SUPABASE_ANON_KEY を設定してください。</p>
      </section>
    </div>
  );
}

function AuthPanel() {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [message, setMessage] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email') ?? '').trim();
    const password = String(form.get('password') ?? '');
    const displayName = String(form.get('displayName') ?? '').trim();
    const result =
      mode === 'signup'
        ? await supabase.auth.signUp({ email, password, options: { data: { display_name: displayName || email.split('@')[0] } } })
        : await supabase.auth.signInWithPassword({ email, password });

    if (result.error) setMessage(result.error.message);
    else setMessage(mode === 'signup' ? '登録しました。メール確認が必要な場合は受信箱を確認してください。' : 'ログインしました。');
  }

  return (
    <div className="app-shell">
      <section className="panel">
        <h1>近所価格メモ</h1>
        <div className="auth-switch">
          <button className={mode === 'login' ? 'active' : 'secondary-button'} type="button" onClick={() => setMode('login')}>ログイン</button>
          <button className={mode === 'signup' ? 'active' : 'secondary-button'} type="button" onClick={() => setMode('signup')}>新規登録</button>
        </div>
        <form className="form-grid" onSubmit={submit}>
          {mode === 'signup' && <label>表示名<input name="displayName" placeholder="大石さん" /></label>}
          <label>メールアドレス<input name="email" type="email" required /></label>
          <label>パスワード<input name="password" type="password" minLength={6} required /></label>
          <button type="submit">{mode === 'signup' ? '登録' : 'ログイン'}</button>
        </form>
        {message && <div className="status-line">{message}</div>}
      </section>
    </div>
  );
}

function Dashboard({
  products,
  stores,
  records,
  profiles,
  setSelectedProductId,
}: {
  products: ProductRow[];
  stores: StoreRow[];
  records: PriceRecordRow[];
  profiles: ProfileRow[];
  setSelectedProductId: (id: string) => void;
}) {
  const favoriteProducts = products.filter((product) => product.is_favorite);
  const recentRecords = [...records].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 8);

  return (
    <section className="stack">
      {favoriteProducts.length > 0 && (
        <article className="summary-card">
          <h2>お気に入り商品</h2>
          <div className="chip-list">
            {favoriteProducts.map((product) => <span className="sale-chip" key={product.id}>☆ {product.name}</span>)}
          </div>
        </article>
      )}
      {products.map((product) => {
        const latest = latestRecordsForProduct(records, product.id);
        const cheapest = latest[0];
        return (
          <article className="summary-card" key={product.id} onClick={() => setSelectedProductId(product.id)}>
            <div className="card-topline">
              <div>
                <h2>{product.name}</h2>
                <p>{product.category ?? '未分類'} / {product.amount ?? '-'}</p>
              </div>
              {cheapest && <strong>{currency.format(cheapest.price)}</strong>}
            </div>
            <div className="metric-grid">
              <Metric label="最安値店舗" value={cheapest ? storeName(stores, cheapest.store_id) : '未記録'} />
              <Metric label="鮮度" value={cheapest ? freshnessLabel(cheapest.updated_at) : '-'} />
              <Metric label="更新者" value={cheapest ? profileName(profiles, cheapest.recorded_by) : '-'} />
              <Metric label="更新" value={cheapest ? relativeTime(cheapest.updated_at) : '-'} />
            </div>
          </article>
        );
      })}
      {recentRecords.length === 0 && <EmptyState title="価格記録がありません" text="商品・店舗・価格を登録してください。" />}
    </section>
  );
}

function ProductManager({
  products,
  addProduct,
  updateProduct,
  deleteProduct,
}: {
  products: ProductRow[];
  addProduct: (event: FormEvent<HTMLFormElement>) => void;
  updateProduct: (product: ProductRow) => void;
  deleteProduct: (id: string) => void;
}) {
  return (
    <section className="panel">
      <h2>商品登録</h2>
      <form className="form-grid" onSubmit={addProduct}>
        <label>商品名<input name="name" placeholder="卵 Mサイズ" required /></label>
        <label>カテゴリ<input name="category" placeholder="食品" /></label>
        <label>内容量・容量<input name="amount" placeholder="10個" /></label>
        <label>バーコード<input name="barcode" inputMode="numeric" placeholder="任意" /></label>
        <button type="submit">商品を追加</button>
      </form>
      <div className="list">
        {products.map((product) => (
          <div className="list-row" key={product.id}>
            <div><strong>{product.name}</strong><span>{product.category ?? '未分類'} / {product.amount ?? '-'}</span></div>
            <div className="row-actions">
              <button className="ghost-button" type="button" onClick={() => updateProduct(product)}>編集</button>
              <button className="ghost-button" type="button" onClick={() => deleteProduct(product.id)}>削除</button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function StoreManager({
  stores,
  addStore,
  updateStore,
  deleteStore,
}: {
  stores: StoreRow[];
  addStore: (event: FormEvent<HTMLFormElement>) => void;
  updateStore: (store: StoreRow) => void;
  deleteStore: (id: string) => void;
}) {
  return (
    <section className="panel">
      <h2>店舗登録</h2>
      <form className="form-grid" onSubmit={addStore}>
        <label>店舗名<input name="name" placeholder="業務スーパー" required /></label>
        <label>区分<input name="type" placeholder="スーパー" /></label>
        <label className="wide">住所<input name="address" placeholder="将来の地図連携用" /></label>
        <button type="submit">店舗を追加</button>
      </form>
      <div className="list">
        {stores.map((store) => (
          <div className="list-row" key={store.id}>
            <div><strong>{store.name}</strong><span>{store.store_type || '店舗'} / {store.address ?? '住所未登録'}</span></div>
            <div className="row-actions">
              <button className="ghost-button" type="button" onClick={() => updateStore(store)}>編集</button>
              <button className="ghost-button" type="button" onClick={() => deleteStore(store.id)}>削除</button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function RecordForm({
  products,
  stores,
  selectedProductId,
  addRecord,
}: {
  products: ProductRow[];
  stores: StoreRow[];
  selectedProductId: string;
  addRecord: (event: FormEvent<HTMLFormElement>) => void;
}) {
  if (products.length === 0 || stores.length === 0) {
    return <EmptyState title="商品と店舗が必要です" text="先に商品と店舗を登録してください。" />;
  }

  return (
    <section className="panel">
      <h2>価格登録</h2>
      <form className="form-grid" onSubmit={addRecord}>
        <label>商品<select name="productId" defaultValue={selectedProductId}>{products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label>
        <label>店舗<select name="storeId">{stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}</select></label>
        <label>価格<input name="price" type="number" inputMode="numeric" min="1" placeholder="178" required /></label>
        <label>記録日<input name="recordedAt" type="datetime-local" /></label>
        <label className="wide">メモ<textarea name="memo" rows={3} placeholder="特売、1人1パックまで、夕方には売り切れなど" /></label>
        <button type="submit">価格を保存</button>
      </form>
    </section>
  );
}

function Comparison({
  products,
  stores,
  records,
  selectedProductId,
  setSelectedProductId,
}: {
  products: ProductRow[];
  stores: StoreRow[];
  records: PriceRecordRow[];
  selectedProductId: string;
  setSelectedProductId: (id: string) => void;
}) {
  const rows = latestRecordsForProduct(records, selectedProductId);
  return (
    <section className="panel">
      <h2>価格比較</h2>
      <ProductPicker products={products} selectedProductId={selectedProductId} onChange={setSelectedProductId} />
      <div className="price-table">
        {rows.map((record, index) => (
          <article className={`price-row ${index === 0 ? 'cheapest' : ''}`} key={record.id}>
            <div>
              <h3>{storeName(stores, record.store_id)}</h3>
              <p>{freshnessLabel(record.updated_at)} / {relativeTime(record.updated_at)}</p>
            </div>
            <div className="price-stack"><strong>{currency.format(record.price)}</strong>{record.memo && <span>{record.memo}</span>}</div>
          </article>
        ))}
      </div>
      {rows.length === 0 && <EmptyState title="価格がありません" text="価格登録から記録してください。" />}
    </section>
  );
}

function History({
  products,
  stores,
  records,
  profiles,
  selectedProductId,
  setSelectedProductId,
  updateRecord,
  deleteRecord,
}: {
  products: ProductRow[];
  stores: StoreRow[];
  records: PriceRecordRow[];
  profiles: ProfileRow[];
  selectedProductId: string;
  setSelectedProductId: (id: string) => void;
  updateRecord: (record: PriceRecordRow) => void;
  deleteRecord: (id: string) => void;
}) {
  const history = records.filter((record) => record.product_id === selectedProductId);
  return (
    <section className="panel">
      <h2>価格履歴</h2>
      <ProductPicker products={products} selectedProductId={selectedProductId} onChange={setSelectedProductId} />
      <div className="timeline">
        {history.map((record) => (
          <article className="history-row" key={record.id}>
            <div>
              <div className="row-title">{storeName(stores, record.store_id)} / {currency.format(record.price)}</div>
              <div className="row-prices">
                <span>{relativeTime(record.updated_at)}更新</span>
                <span className={`freshness ${freshnessLevel(record.updated_at)}`}>{freshnessLabel(record.updated_at)}</span>
              </div>
              <p>{profileName(profiles, record.recorded_by)}が登録</p>
              {record.memo && <p>{record.memo}</p>}
            </div>
            <div className="row-actions">
              <button className="ghost-button" type="button" onClick={() => updateRecord(record)}>編集</button>
              <button className="ghost-button" type="button" onClick={() => deleteRecord(record.id)}>削除</button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function GroupManager({
  groups,
  members,
  profiles,
  invites,
  activeGroupId,
  isCreatingGroup,
  deletingGroupIds,
  createGroup,
  updateGroup,
  deleteGroup,
  inviteMember,
  setActiveGroupId,
}: {
  groups: GroupRow[];
  members: GroupMemberRow[];
  profiles: ProfileRow[];
  invites: GroupInviteRow[];
  activeGroupId: string;
  isCreatingGroup: boolean;
  deletingGroupIds: string[];
  createGroup: (event: FormEvent<HTMLFormElement>) => void;
  updateGroup: (group: GroupRow) => void;
  deleteGroup: (group: GroupRow) => void;
  inviteMember: (event: FormEvent<HTMLFormElement>) => void;
  setActiveGroupId: (id: string) => void;
  profile: ProfileRow | null;
}) {
  return (
    <section className="panel">
      <h2>共有グループ</h2>
      <form className="form-grid" onSubmit={createGroup}>
        <label>グループ名<input name="name" placeholder="京都の生活" required disabled={isCreatingGroup} /></label>
        <label>エリア<input name="area" placeholder="京都市 / 三重県" required disabled={isCreatingGroup} /></label>
        <button className={isCreatingGroup ? 'loading-button' : ''} type="submit" disabled={isCreatingGroup} aria-busy={isCreatingGroup}>
          {isCreatingGroup && <span className="spinner" aria-hidden="true" />}
          {isCreatingGroup ? '追加中…' : 'グループを追加'}
        </button>
      </form>
      <div className="list">
        {groups.length === 0 && <div className="status-line">共有グループはまだありません。</div>}
        {groups.map((group) => (
          <div className={`group-row ${group.id === activeGroupId ? 'active' : ''}`} key={group.id}>
            <button className="group-select-button" type="button" onClick={() => setActiveGroupId(group.id)}>
              <strong>{group.name}</strong>
              <small>{group.area}</small>
            </button>
            <div className="row-actions">
              <button className="ghost-button" type="button" onClick={() => updateGroup(group)}>編集</button>
              <button
                className="ghost-button"
                type="button"
                onClick={() => deleteGroup(group)}
                disabled={deletingGroupIds.includes(group.id)}
              >
                {deletingGroupIds.includes(group.id) ? '削除中…' : '削除'}
              </button>
            </div>
          </div>
        ))}
      </div>
      <h2>メンバー</h2>
      <div className="list">
        {members.map((member) => (
          <div className="list-row" key={member.id}>
            <strong>{profileName(profiles, member.user_id)}</strong>
            <span>{member.role}</span>
          </div>
        ))}
      </div>
      <form className="form-grid" onSubmit={inviteMember}>
        <label>招待メール<input name="email" type="email" placeholder="family@example.com" required /></label>
        <button type="submit">招待を作成</button>
      </form>
      {invites.length > 0 && (
        <div className="list">
          {invites.map((invite) => (
            <div className="list-row" key={invite.id}>
              <span>{invite.invited_email}</span>
              <span>{invite.accepted_at ? '参加済み' : '招待中'}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function BackupPanel({
  groups,
  products,
  stores,
  records,
  exportBackup,
}: {
  groups: number;
  products: number;
  stores: number;
  records: number;
  exportBackup: () => void;
}) {
  return (
    <section className="panel">
      <h2>データ保管</h2>
      <div className="metric-grid highlight">
        <Metric label="共有グループ" value={`${groups}件`} />
        <Metric label="商品" value={`${products}件`} />
        <Metric label="店舗" value={`${stores}件`} />
        <Metric label="価格記録" value={`${records}件`} />
      </div>
      <button type="button" onClick={exportBackup}>バックアップをダウンロード</button>
    </section>
  );
}

function ProductPicker({ products, selectedProductId, onChange }: { products: ProductRow[]; selectedProductId: string; onChange: (id: string) => void }) {
  return (
    <label>
      商品
      <select value={selectedProductId} onChange={(event) => onChange(event.target.value)}>
        {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
      </select>
    </label>
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

function latestRecordsForProduct(records: PriceRecordRow[], productId: string) {
  const latest = new Map<string, PriceRecordRow>();
  records
    .filter((record) => record.product_id === productId)
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .forEach((record) => {
      if (!latest.has(record.store_id)) latest.set(record.store_id, record);
    });
  return Array.from(latest.values()).sort((a, b) => a.price - b.price);
}

function storeName(stores: StoreRow[], storeId: string) {
  return stores.find((store) => store.id === storeId)?.name ?? '未登録の店舗';
}

function profileName(profiles: ProfileRow[], userId: string) {
  return profiles.find((profile) => profile.id === userId)?.display_name || 'メンバー';
}

function pendingInvites(invites: GroupInviteRow[], email?: string) {
  return invites.filter((invite) => !invite.accepted_at && invite.invited_email === email);
}

function normalizeName(name: string) {
  return name
    .toLowerCase()
    .replace(/玉子/g, '卵')
    .replace(/たまご/g, '卵')
    .replace(/\s+/g, '')
    .replace(/[ｍmＭ]/g, 'm');
}

function freshnessLevel(date: string) {
  const days = (Date.now() - new Date(date).getTime()) / 86_400_000;
  if (days <= 3) return 'fresh';
  if (days <= 7) return 'warm';
  return 'old';
}

function freshnessLabel(date: string) {
  const level = freshnessLevel(date);
  if (level === 'fresh') return '新鮮';
  if (level === 'warm') return '要確認';
  return '古い';
}

function relativeTime(date: string) {
  const diff = Date.now() - new Date(date).getTime();
  const minutes = Math.max(1, Math.round(diff / 60_000));
  if (minutes < 60) return `${minutes}分前`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}時間前`;
  return `${Math.round(hours / 24)}日前`;
}

export default App;
