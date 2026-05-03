-- ============================================================
-- GymApp Master Migration v17
-- Full revamp: members, memberships, PT, HR, payroll
-- Run AFTER all previous migrations in Supabase SQL Editor
-- ============================================================

-- ── MEMBERSHIP TYPES (configurable by Biz Ops) ─────────────
create table if not exists membership_types (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,           -- e.g. Monthly, Annual, Student
  duration_days int not null,          -- e.g. 30, 365, 90
  price_sgd numeric(10,2) not null,
  is_active boolean default true,
  created_by uuid references users(id),
  created_at timestamptz default now()
);

-- Seed common types
insert into membership_types (name, duration_days, price_sgd)
values
  ('Monthly', 30, 80.00),
  ('Quarterly', 90, 220.00),
  ('Annual', 365, 800.00),
  ('Student Monthly', 30, 60.00),
  ('Trial (1 Week)', 7, 30.00)
on conflict (name) do nothing;

-- ── MEMBERS (gym members — separate from staff users) ───────
-- A member is anyone who has bought a gym membership
-- They are NOT system users — they don't log in
create table if not exists members (
  id uuid primary key default uuid_generate_v4(),
  gym_id uuid references gyms(id) on delete cascade,
  membership_number text,              -- from physical card, keyed in by staff
  full_name text not null,
  phone text not null,
  email text,
  date_of_birth date,
  gender text check (gender in ('male', 'female', 'other', 'prefer_not_to_say')),
  health_notes text,
  -- Membership status (derived from memberships table, cached here)
  is_active boolean default true,
  created_by uuid references users(id),
  created_at timestamptz default now(),
  unique(gym_id, membership_number)
);

-- ── GYM MEMBERSHIPS (one active at a time per member) ───────
create table if not exists gym_memberships (
  id uuid primary key default uuid_generate_v4(),
  member_id uuid references members(id) on delete cascade,
  gym_id uuid references gyms(id) on delete cascade,
  membership_type_id uuid references membership_types(id),
  membership_type_name text not null,  -- snapshot at time of sale
  membership_number text,
  price_sgd numeric(10,2) not null,
  start_date date not null,
  end_date date not null,              -- start_date + duration_days
  status text not null default 'active'
    check (status in ('active', 'expired', 'cancelled')),
  -- Sale tracking
  sold_by_user_id uuid references users(id),
  -- Commission
  commission_pct numeric(5,2) not null default 5.00,
  commission_sgd numeric(10,2) generated always as (price_sgd * commission_pct / 100) stored,
  commission_paid boolean default false,
  commission_payout_id uuid,
  -- Approval
  confirmed_by uuid references users(id),
  confirmed_at timestamptz,
  sale_status text not null default 'pending'
    check (sale_status in ('pending', 'confirmed', 'rejected')),
  rejection_reason text,
  notes text,
  created_at timestamptz default now()
);

-- ── PT PACKAGES (tied to a member, not just a client record) ─
-- Member must have active gym membership to buy PT package
alter table packages
  add column if not exists member_id uuid references members(id),
  add column if not exists selling_trainer_id uuid references users(id),
  add column if not exists end_date_calculated date,
  add column if not exists manager_confirmed boolean default false,
  add column if not exists manager_confirmed_by uuid references users(id),
  add column if not exists manager_confirmed_at timestamptz;

-- ── PT SESSIONS (update: separate selling vs conducting trainer)─
-- session_commission goes to conducting (trainer_id)
-- signup_commission goes to selling_trainer_id on the package
alter table sessions
  add column if not exists manager_confirmed boolean default false,
  add column if not exists manager_confirmed_by uuid references users(id),
  add column if not exists manager_confirmed_at timestamptz,
  add column if not exists whatsapp_24h_sent boolean default false,
  add column if not exists whatsapp_24h_sent_at timestamptz;

-- ── WHATSAPP NOTIFICATIONS ──────────────────────────────────
create table if not exists whatsapp_queue (
  id uuid primary key default uuid_generate_v4(),
  notification_type text not null
    check (notification_type in ('pt_reminder_24h', 'roster_reminder_24h', 'manager_note_alert')),
  recipient_phone text not null,
  recipient_name text,
  message text not null,
  related_id uuid,                     -- session_id or roster_id
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'failed')),
  scheduled_for timestamptz not null,
  sent_at timestamptz,
  twilio_sid text,
  error_message text,
  created_at timestamptz default now()
);

-- ── RLS FOR NEW TABLES ──────────────────────────────────────
alter table members enable row level security;
alter table gym_memberships enable row level security;
alter table membership_types enable row level security;
alter table whatsapp_queue enable row level security;

-- Members: all authenticated staff can read; trainers can create; managers can manage gym members
create policy "members_read" on members
  for select using (auth.uid() is not null);

create policy "members_write" on members
  for insert with check (auth.uid() is not null);

create policy "members_update" on members
  for update using (
    get_user_role() in ('manager', 'business_ops')
    or (get_user_role() = 'trainer' and created_by = auth.uid())
  );

-- Gym memberships: staff can insert; manager can confirm; biz ops full access
create policy "gym_memberships_read" on gym_memberships
  for select using (auth.uid() is not null);

create policy "gym_memberships_insert" on gym_memberships
  for insert with check (auth.uid() is not null and sold_by_user_id = auth.uid());

create policy "gym_memberships_confirm" on gym_memberships
  for update using (get_user_role() in ('manager', 'business_ops'));

-- Membership types: all read; biz ops write
create policy "membership_types_read" on membership_types
  for select using (auth.uid() is not null);

create policy "membership_types_write" on membership_types
  for all using (get_user_role() = 'business_ops');

-- WhatsApp queue: biz ops and system
create policy "whatsapp_queue_biz_ops" on whatsapp_queue
  for all using (get_user_role() in ('business_ops', 'admin', 'manager'));

-- ── INDEXES ─────────────────────────────────────────────────
create index if not exists idx_members_gym on members(gym_id);
create index if not exists idx_members_phone on members(phone);
create index if not exists idx_members_number on members(membership_number);
create index if not exists idx_gym_memberships_member on gym_memberships(member_id);
create index if not exists idx_gym_memberships_status on gym_memberships(status);
create index if not exists idx_whatsapp_queue_status on whatsapp_queue(status);
create index if not exists idx_whatsapp_queue_scheduled on whatsapp_queue(scheduled_for);

select 'Migration v17 complete' as status;
