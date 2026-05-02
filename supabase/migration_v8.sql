-- ============================================================
-- GymApp Migration v8
-- Adds auto logout timer to app_settings
-- Run in Supabase SQL Editor
-- ============================================================

alter table app_settings
  add column if not exists auto_logout_minutes int default 10;

update app_settings set auto_logout_minutes = 10 where id = 'global';

select 'Migration v8 complete' as status;
