-- ============================================================
-- GymApp Migration v7
-- Adds archive support to users table
-- Run in Supabase SQL Editor
-- ============================================================

alter table users
  add column if not exists is_archived boolean default false,
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references users(id) on delete set null;

-- Update RLS: archived users visible to admin only
create policy "users_admin_read_archived" on users
  for select using (
    get_user_role() = 'admin' and is_archived = true
  );

select 'Migration v7 complete' as status;
