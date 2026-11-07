-- WAYMARK: execute in selected Supabase project after reviewing.
-- Separate Waymark data; shared Supabase Auth users.
create table if not exists public.waymark_workspaces (
  user_id uuid primary key references auth.users(id) on delete cascade,
  trips jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.waymark_workspaces enable row level security;
revoke all on public.waymark_workspaces from anon;
grant select,insert,update,delete on public.waymark_workspaces to authenticated;
create policy "waymark own workspace read" on public.waymark_workspaces for select to authenticated using ((select auth.uid())=user_id);
create policy "waymark own workspace insert" on public.waymark_workspaces for insert to authenticated with check ((select auth.uid())=user_id);
create policy "waymark own workspace update" on public.waymark_workspaces for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy "waymark own workspace delete" on public.waymark_workspaces for delete to authenticated using ((select auth.uid())=user_id);
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('waymark-documents','waymark-documents',false,15728640,array['image/png','image/jpeg','image/webp','application/pdf'])
on conflict (id) do nothing;
create policy "waymark own documents read" on storage.objects for select to authenticated using (bucket_id='waymark-documents' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy "waymark own documents upload" on storage.objects for insert to authenticated with check (bucket_id='waymark-documents' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy "waymark own documents delete" on storage.objects for delete to authenticated using (bucket_id='waymark-documents' and (storage.foldername(name))[1]=(select auth.uid())::text);
