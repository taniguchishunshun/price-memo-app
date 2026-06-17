-- 価格記録を「どの店舗の、なんの商品が、いくらなのか」で扱うための安全な追加マイグレーションです。

alter table public.price_records add column if not exists quantity numeric;
alter table public.price_records add column if not exists unit text;

-- 既存データ調査: product/store/group の紐づきが壊れていないか確認します。
select
  pr.id as price_record_id,
  pr.group_id as price_group_id,
  pr.product_id,
  p.name as product_name,
  p.group_id as product_group_id,
  pr.store_id,
  s.name as store_name,
  s.group_id as store_group_id,
  pr.price
from public.price_records pr
left join public.products p on p.id = pr.product_id
left join public.stores s on s.id = pr.store_id
where p.id is null
   or s.id is null
   or p.group_id <> pr.group_id
   or s.group_id <> pr.group_id
order by pr.created_at desc;

create or replace function public.ensure_price_record_group_match()
returns trigger
language plpgsql
as $$
declare
  product_group_id uuid;
  store_group_id uuid;
begin
  select group_id into product_group_id from public.products where id = new.product_id;
  select group_id into store_group_id from public.stores where id = new.store_id;

  if product_group_id is null then
    raise exception 'product_id % does not exist', new.product_id;
  end if;

  if store_group_id is null then
    raise exception 'store_id % does not exist', new.store_id;
  end if;

  if new.group_id <> product_group_id or new.group_id <> store_group_id then
    raise exception 'price_records group_id must match products.group_id and stores.group_id';
  end if;

  return new;
end;
$$;

drop trigger if exists ensure_price_records_group_match on public.price_records;
create trigger ensure_price_records_group_match
before insert or update of group_id, product_id, store_id on public.price_records
for each row execute function public.ensure_price_record_group_match();
