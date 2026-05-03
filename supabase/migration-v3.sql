-- ============================================================
-- GymApp Schema Migration v2 → v3
-- Run this in Supabase SQL Editor if you already have the v2 schema
-- If starting fresh, use schema.sql instead
-- ============================================================

-- Add manager_id to gyms table (which manager manages this gym)
alter table gyms add column if not exists manager_id uuid references users(id) on delete set null;

-- Add notes_submitted_at to sessions (auto-captured timestamp when trainer closes session)
alter table sessions add column if not exists notes_submitted_at timestamptz;

-- Add qualified_sessions to commission_payouts
alter table commission_payouts add column if not exists qualified_sessions int default 0;

-- Update users role check to include business_ops
alter table users drop constraint if exists users_role_check;
alter table users add constraint users_role_check check (role in ('admin', 'manager', 'business_ops', 'trainer'));

-- Add business_ops RLS policies (if not already added)
drop policy if exists "gyms_biz_ops_read" on gyms;
create policy "gyms_biz_ops_read" on gyms for select using (get_user_role() = 'business_ops');

drop policy if exists "clients_biz_ops_read" on clients;
create policy "clients_biz_ops_read" on clients for select using (get_user_role() = 'business_ops');

drop policy if exists "packages_biz_ops_read" on packages;
create policy "packages_biz_ops_read" on packages for select using (get_user_role() = 'business_ops');

drop policy if exists "sessions_biz_ops_read" on sessions;
create policy "sessions_biz_ops_read" on sessions for select using (get_user_role() = 'business_ops');

drop policy if exists "payouts_biz_ops_read" on commission_payouts;
create policy "payouts_biz_ops_read" on commission_payouts for select using (get_user_role() = 'business_ops');

drop policy if exists "users_biz_ops_read" on users;
create policy "users_biz_ops_read" on users for select using (get_user_role() = 'business_ops');

-- Storage bucket for gym logos (safe to run even if exists)
insert into storage.buckets (id, name, public)
values ('gym-logos', 'gym-logos', true)
on conflict (id) do nothing;

drop policy if exists "logo_upload_admin" on storage.objects;
create policy "logo_upload_admin" on storage.objects
  for insert with check (bucket_id = 'gym-logos' and get_user_role() = 'admin');

drop policy if exists "logo_read_all" on storage.objects;
create policy "logo_read_all" on storage.objects
  for select using (bucket_id = 'gym-logos');

drop policy if exists "logo_update_admin" on storage.objects;
create policy "logo_update_admin" on storage.objects
  for update using (bucket_id = 'gym-logos' and get_user_role() = 'admin');
