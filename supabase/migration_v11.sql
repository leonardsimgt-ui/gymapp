-- ============================================================
-- GymApp Migration v11
-- Fix trainer_gyms RLS to allow manager to assign trainers
-- Fix app_settings RLS to allow public read for login logo
-- Run in Supabase SQL Editor
-- ============================================================

-- ── trainer_gyms policies ──────────────────────────────────
alter table trainer_gyms enable row level security;

drop policy if exists "trainer_gyms_admin" on trainer_gyms;
drop policy if exists "trainer_gyms_manager_insert" on trainer_gyms;
drop policy if exists "trainer_gyms_manager_delete" on trainer_gyms;
drop policy if exists "trainer_gyms_read" on trainer_gyms;

-- Everyone authenticated can read trainer_gyms (needed for gym assignment lookups)
create policy "trainer_gyms_read" on trainer_gyms
  for select using (auth.uid() is not null);

-- Admin full access
create policy "trainer_gyms_admin" on trainer_gyms
  for all using (get_user_role() = 'admin');

-- Manager can insert trainers into their own gym only
create policy "trainer_gyms_manager_insert" on trainer_gyms
  for insert with check (
    get_user_role() = 'manager'
    and gym_id = get_manager_gym_id()
  );

-- Manager can delete trainers from their own gym only
create policy "trainer_gyms_manager_delete" on trainer_gyms
  for delete using (
    get_user_role() = 'manager'
    and gym_id = get_manager_gym_id()
  );

-- Trainers can read their own gym assignments
create policy "trainer_gyms_trainer_read" on trainer_gyms
  for select using (trainer_id = auth.uid());

-- ── app_settings: allow anon read for login page logo ──────
drop policy if exists "app_settings_read_all" on app_settings;

-- Allow even unauthenticated users to read app_settings
-- (needed so login page can load the logo before user is logged in)
create policy "app_settings_public_read" on app_settings
  for select using (true);

-- ── storage: allow public read on app-logos bucket ─────────
-- Run this only if the policy doesn't already exist
do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'objects'
    and policyname = 'app_logos_public_read'
  ) then
    execute $policy$
      create policy "app_logos_public_read" on storage.objects
        for select using (bucket_id = 'app-logos')
    $policy$;
  end if;
end $$;

-- Ensure gym-logos bucket is also public
update storage.buckets set public = true where id in ('app-logos', 'gym-logos');

select 'Migration v11 complete' as status;
