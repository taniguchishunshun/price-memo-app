drop policy if exists "groups_select_members" on public.groups;
drop policy if exists "groups_delete_owner" on public.groups;

create policy "groups_select_members" on public.groups
  for select to authenticated using (public.is_group_member(id) or created_by = auth.uid());

create or replace function public.is_group_owner(target_group_id uuid)
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
      and role = 'owner'
  );
$$;

create policy "groups_delete_owner" on public.groups
  for delete to authenticated using (created_by = auth.uid() or public.is_group_member(id));
