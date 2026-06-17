-- 既存データ調査: groups.created_by と group_members の整合性を確認します。
select
  g.id as group_id,
  g.name,
  g.area,
  g.created_by,
  count(gm.id) as member_count,
  count(gm.id) filter (where gm.role = 'owner') as owner_count,
  bool_or(gm.user_id = g.created_by) as creator_is_member
from public.groups g
left join public.group_members gm on gm.group_id = g.id
group by g.id, g.name, g.area, g.created_by
order by g.created_at desc;

-- created_by がいるのに owner メンバーが欠落しているグループを補完します。
insert into public.group_members (group_id, user_id, role)
select g.id, g.created_by, 'owner'
from public.groups g
where not exists (
  select 1
  from public.group_members gm
  where gm.group_id = g.id
    and gm.user_id = g.created_by
)
on conflict (group_id, user_id) do update
set role = 'owner';

-- 表示できるグループは削除できるようにします。
drop policy if exists "groups_select_members" on public.groups;
drop policy if exists "groups_delete_owner" on public.groups;

create policy "groups_select_members" on public.groups
  for select to authenticated using (public.is_group_member(id) or created_by = auth.uid());

create policy "groups_delete_owner" on public.groups
  for delete to authenticated using (created_by = auth.uid() or public.is_group_member(id));
