-- ============================================================
-- GymApp Schema Migration v4 → v5
-- Run this in Supabase SQL Editor ONLY if you already ran v4
-- If starting fresh, run schema.sql instead
-- ============================================================

-- Add notes_submitted_at to sessions
alter table sessions
  add column if not exists notes_submitted_at timestamptz;

-- Add manager_gym_id to users if not already present
alter table users
  add column if not exists manager_gym_id uuid references gyms(id) on delete set null;

-- Update role check to include business_ops if not already done
-- (safe to run even if already updated)
alter table users
  drop constraint if exists users_role_check;

alter table users
  add constraint users_role_check
  check (role in ('admin', 'manager', 'business_ops', 'trainer'));

-- Add logo_url to gyms if not already present
alter table gyms
  add column if not exists logo_url text;

-- Add qualified_sessions to commission_payouts
alter table commission_payouts
  add column if not exists qualified_sessions int default 0;

-- Create gym-logos storage bucket if not exists
insert into storage.buckets (id, name, public)
  values ('gym-logos', 'gym-logos', true)
  on conflict (id) do nothing;

-- Storage policies (safe to skip if already exist)
do $$
begin
  if not exists (
    select 1 from pg_policies where policyname = 'logo_upload_admin'
  ) then
    create policy "logo_upload_admin" on storage.objects
      for insert with check (
        bucket_id = 'gym-logos' and get_user_role() = 'admin'
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies where policyname = 'logo_read_all'
  ) then
    create policy "logo_read_all" on storage.objects
      for select using (bucket_id = 'gym-logos');
  end if;
end $$;

-- Add business_ops RLS policies (safe to run again)
do $$
begin
  if not exists (
    select 1 from pg_policies where policyname = 'clients_biz_ops_read'
  ) then
    create policy "clients_biz_ops_read" on clients for select using (
      get_user_role() = 'business_ops'
    );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies where policyname = 'sessions_biz_ops_read'
  ) then
    create policy "sessions_biz_ops_read" on sessions for select using (
      get_user_role() = 'business_ops'
    );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies where policyname = 'packages_biz_ops_read'
  ) then
    create policy "packages_biz_ops_read" on packages for select using (
      get_user_role() = 'business_ops'
    );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies where policyname = 'payouts_biz_ops_read'
  ) then
    create policy "payouts_biz_ops_read" on commission_payouts for select using (
      get_user_role() = 'business_ops'
    );
  end if;
end $$;

-- Update get_manager_gym_id function
create or replace function get_manager_gym_id()
returns uuid as $$
  select manager_gym_id from users where id = auth.uid();
$$ language sql security definer;

select 'Migration complete' as status;
