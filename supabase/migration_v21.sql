-- ============================================================
-- GymApp Migration v21
-- Payslip logo, roster shift templates, shared PT package
-- Run in Supabase SQL Editor after v20
-- ============================================================

-- ── Payslip logo on app_settings ───────────────────────────
alter table app_settings
  add column if not exists payslip_logo_url text,
  add column if not exists company_name text default 'Gym Operations Suite';

-- ── Roster shift time presets (manager configures per gym) ──
create table if not exists roster_shift_presets (
  id uuid primary key default uuid_generate_v4(),
  gym_id uuid not null references gyms(id) on delete cascade,
  label text not null,          -- e.g. 'Morning', 'Afternoon', 'Evening'
  shift_start time not null,
  shift_end time not null,
  is_active boolean default true,
  sort_order int default 0,
  created_by uuid references users(id),
  created_at timestamptz not null default now()
);

-- Seed default shifts (can be customised per gym)
-- These get inserted when a gym is first used; handled in app logic

-- ── Shared PT package ───────────────────────────────────────
-- Secondary member linked to a package
alter table packages
  add column if not exists secondary_member_id uuid references members(id),
  add column if not exists is_shared boolean default false;

-- Sessions can be linked to either primary or secondary member
alter table sessions
  add column if not exists attending_member_id uuid references members(id),
  add column if not exists is_secondary_member boolean default false;

-- RLS for roster presets
alter table roster_shift_presets enable row level security;

create policy "roster_presets_read" on roster_shift_presets
  for select using (auth.uid() is not null);

create policy "roster_presets_write" on roster_shift_presets
  for all using (
    get_user_role() in ('manager', 'business_ops')
  );

-- Indexes
create index if not exists idx_roster_presets_gym on roster_shift_presets(gym_id);
create index if not exists idx_packages_secondary_member on packages(secondary_member_id);

select 'Migration v21 complete' as status;
