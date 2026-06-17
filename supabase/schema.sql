create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  avatar_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  area text not null default '',
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  unique (group_id, user_id)
);

create table if not exists public.group_invites (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  invited_email text not null,
  role text not null default 'member' check (role in ('admin', 'member')),
  invited_by uuid not null references public.profiles(id) on delete cascade,
  accepted_by uuid references public.profiles(id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.stores (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  name text not null,
  store_type text not null default '',
  address text,
  latitude double precision,
  longitude double precision,
  is_favorite boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  name text not null,
  category text,
  amount text,
  barcode text,
  is_favorite boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.price_records (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  price integer not null check (price >= 0),
  memo text,
  recorded_by uuid not null references public.profiles(id) on delete cascade,
  recorded_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.shopping_lists (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  title text not null default '買い物リスト',
  created_at timestamptz not null default now()
);

create table if not exists public.shopping_list_items (
  id uuid primary key default gen_random_uuid(),
  shopping_list_id uuid not null references public.shopping_lists(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  label text,
  is_checked boolean not null default false,
  checked_by uuid references public.profiles(id) on delete set null,
  checked_at timestamptz,
  created_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_price_records_updated_at on public.price_records;
create trigger set_price_records_updated_at
before update on public.price_records
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.is_group_member(target_group_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.group_members
    where group_id = target_group_id
      and user_id = auth.uid()
  );
$$;

create or replace function public.is_group_admin(target_group_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.group_members
    where group_id = target_group_id
      and user_id = auth.uid()
      and role in ('owner', 'admin')
  );
$$;

alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.group_invites enable row level security;
alter table public.stores enable row level security;
alter table public.products enable row level security;
alter table public.price_records enable row level security;
alter table public.shopping_lists enable row level security;
alter table public.shopping_list_items enable row level security;

create policy "profiles_select_authenticated" on public.profiles
  for select to authenticated using (true);
create policy "profiles_update_own" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy "profiles_insert_own" on public.profiles
  for insert to authenticated with check (id = auth.uid());

create policy "groups_select_members" on public.groups
  for select to authenticated using (public.is_group_member(id) or created_by = auth.uid());
create policy "groups_insert_own" on public.groups
  for insert to authenticated with check (created_by = auth.uid());
create policy "groups_update_admin" on public.groups
  for update to authenticated using (public.is_group_admin(id)) with check (public.is_group_admin(id));
create policy "groups_delete_owner" on public.groups
  for delete to authenticated using (created_by = auth.uid());

create policy "members_select_group" on public.group_members
  for select to authenticated using (public.is_group_member(group_id));
create policy "members_join_self" on public.group_members
  for insert to authenticated with check (user_id = auth.uid());
create policy "members_update_admin" on public.group_members
  for update to authenticated using (public.is_group_admin(group_id)) with check (public.is_group_admin(group_id));
create policy "members_delete_self_or_admin" on public.group_members
  for delete to authenticated using (user_id = auth.uid() or public.is_group_admin(group_id));

create policy "invites_select_group" on public.group_invites
  for select to authenticated using (public.is_group_member(group_id) or invited_email = auth.email());
create policy "invites_insert_admin" on public.group_invites
  for insert to authenticated with check (public.is_group_admin(group_id) and invited_by = auth.uid());
create policy "invites_update_invited_user" on public.group_invites
  for update to authenticated using (invited_email = auth.email()) with check (accepted_by = auth.uid());
create policy "invites_delete_admin" on public.group_invites
  for delete to authenticated using (public.is_group_admin(group_id));

create policy "stores_select_members" on public.stores
  for select to authenticated using (public.is_group_member(group_id));
create policy "stores_insert_members" on public.stores
  for insert to authenticated with check (public.is_group_member(group_id));
create policy "stores_update_members" on public.stores
  for update to authenticated using (public.is_group_member(group_id)) with check (public.is_group_member(group_id));
create policy "stores_delete_members" on public.stores
  for delete to authenticated using (public.is_group_member(group_id));

create policy "products_select_members" on public.products
  for select to authenticated using (public.is_group_member(group_id));
create policy "products_insert_members" on public.products
  for insert to authenticated with check (public.is_group_member(group_id));
create policy "products_update_members" on public.products
  for update to authenticated using (public.is_group_member(group_id)) with check (public.is_group_member(group_id));
create policy "products_delete_members" on public.products
  for delete to authenticated using (public.is_group_member(group_id));

create policy "prices_select_members" on public.price_records
  for select to authenticated using (public.is_group_member(group_id));
create policy "prices_insert_members" on public.price_records
  for insert to authenticated with check (public.is_group_member(group_id) and recorded_by = auth.uid());
create policy "prices_update_members" on public.price_records
  for update to authenticated using (public.is_group_member(group_id)) with check (public.is_group_member(group_id));
create policy "prices_delete_members" on public.price_records
  for delete to authenticated using (public.is_group_member(group_id));

create policy "lists_select_members" on public.shopping_lists
  for select to authenticated using (public.is_group_member(group_id));
create policy "lists_insert_members" on public.shopping_lists
  for insert to authenticated with check (public.is_group_member(group_id));
create policy "lists_update_members" on public.shopping_lists
  for update to authenticated using (public.is_group_member(group_id)) with check (public.is_group_member(group_id));
create policy "lists_delete_members" on public.shopping_lists
  for delete to authenticated using (public.is_group_member(group_id));

create policy "list_items_select_members" on public.shopping_list_items
  for select to authenticated using (
    exists (
      select 1 from public.shopping_lists
      where shopping_lists.id = shopping_list_items.shopping_list_id
        and public.is_group_member(shopping_lists.group_id)
    )
  );
create policy "list_items_insert_members" on public.shopping_list_items
  for insert to authenticated with check (
    exists (
      select 1 from public.shopping_lists
      where shopping_lists.id = shopping_list_items.shopping_list_id
        and public.is_group_member(shopping_lists.group_id)
    )
  );
create policy "list_items_update_members" on public.shopping_list_items
  for update to authenticated using (
    exists (
      select 1 from public.shopping_lists
      where shopping_lists.id = shopping_list_items.shopping_list_id
        and public.is_group_member(shopping_lists.group_id)
    )
  );
create policy "list_items_delete_members" on public.shopping_list_items
  for delete to authenticated using (
    exists (
      select 1 from public.shopping_lists
      where shopping_lists.id = shopping_list_items.shopping_list_id
        and public.is_group_member(shopping_lists.group_id)
    )
  );

alter publication supabase_realtime add table public.groups;
alter publication supabase_realtime add table public.group_members;
alter publication supabase_realtime add table public.group_invites;
alter publication supabase_realtime add table public.stores;
alter publication supabase_realtime add table public.products;
alter publication supabase_realtime add table public.price_records;
alter publication supabase_realtime add table public.shopping_lists;
alter publication supabase_realtime add table public.shopping_list_items;

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy "avatars_public_read" on storage.objects
  for select using (bucket_id = 'avatars');
create policy "avatars_upload_own" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "avatars_update_own" on storage.objects
  for update to authenticated using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
