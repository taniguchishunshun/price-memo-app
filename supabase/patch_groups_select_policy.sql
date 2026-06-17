drop policy if exists "groups_select_members" on public.groups;

create policy "groups_select_members" on public.groups
  for select to authenticated using (public.is_group_member(id) or created_by = auth.uid());
