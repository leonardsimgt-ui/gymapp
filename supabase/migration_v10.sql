-- ============================================================
-- GymApp Migration v10
-- Fix RLS policies to allow admin to update any user
-- Run in Supabase SQL Editor
-- ============================================================

-- Drop restrictive update policies and replace with permissive ones
drop policy if exists "users_update_own" on users;
drop policy if exists "users_admin_update_all" on users;
drop policy if exists "users_admin_all" on users;

-- Admin can do everything on users table
create policy "users_admin_full" on users
  for all using (get_user_role() = 'admin');

-- Users can update their own non-sensitive fields
create policy "users_update_own" on users
  for update using (id = auth.uid());

-- Manager can update trainers in their gym
create policy "users_manager_update_trainer" on users
  for update using (
    get_user_role() = 'manager'
    and role = 'trainer'
    and id in (
      select trainer_id from trainer_gyms
      where gym_id = get_manager_gym_id()
    )
  );

select 'Migration v10 complete' as status;
