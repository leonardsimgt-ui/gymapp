-- ============================================================
-- GymApp Migration v26
-- Add total_hours and hourly_rate_used columns to payslips
-- Run in Supabase SQL Editor after v25
-- ============================================================

alter table payslips
  add column if not exists total_hours numeric(8,2),
  add column if not exists hourly_rate_used numeric(10,2);

select 'Migration v26 complete' as status;
