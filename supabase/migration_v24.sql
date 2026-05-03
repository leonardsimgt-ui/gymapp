-- ============================================================
-- GymApp Migration v24
-- Add admin role to leave_applications RLS policy
-- Run in Supabase SQL Editor after v23
-- ============================================================

-- Drop existing policy and recreate with admin included
drop policy if exists "leave_own" on leave_applications;

create policy "leave_own" on leave_applications
  for all using (
    user_id = auth.uid()
    or get_user_role() in ('manager', 'business_ops', 'admin')
  );

select 'Migration v24 complete' as status;
