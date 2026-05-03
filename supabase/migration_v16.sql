-- ============================================================
-- GymApp Master Migration v16
-- Full HR, Payroll, Commission, Membership Sales revamp
-- Run in Supabase SQL Editor
-- ============================================================

-- ── EXTEND USERS TABLE ─────────────────────────────────────
-- employment_type: full_time | part_time
-- hourly_rate: for part-timers only
alter table users
  add column if not exists employment_type text default 'full_time'
    check (employment_type in ('full_time', 'part_time')),
  add column if not exists hourly_rate numeric(10,2),
  add column if not exists membership_commission_pct numeric(5,2) default 0,
  add column if not exists nric text,
  add column if not exists nationality text;

-- ── PART-TIMER DUTY ROSTER ─────────────────────────────────
create table if not exists duty_roster (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references users(id) on delete cascade,
  gym_id uuid references gyms(id) on delete cascade,
  shift_date date not null,
  shift_start time not null,
  shift_end time not null,
  hours_worked numeric(5,2) generated always as (
    extract(epoch from (shift_end::interval - shift_start::interval)) / 3600
  ) stored,
  hourly_rate numeric(10,2) not null,
  gross_pay numeric(10,2) generated always as (
    extract(epoch from (shift_end::interval - shift_start::interval)) / 3600
    * hourly_rate
  ) stored,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'completed', 'absent', 'cancelled')),
  is_locked boolean default false,
  locked_at timestamptz,
  locked_by uuid references users(id),
  whatsapp_reminder_sent boolean default false,
  whatsapp_reminder_sent_at timestamptz,
  notes text,
  created_by uuid references users(id),
  created_at timestamptz default now()
);

-- ── GYM MEMBERSHIP SALES ───────────────────────────────────
-- Any staff can log a membership sale
-- Manager must confirm before it qualifies for commission
create table if not exists membership_sales (
  id uuid primary key default uuid_generate_v4(),
  gym_id uuid references gyms(id) on delete cascade,
  sold_by_user_id uuid references users(id) on delete set null,
  -- Member details
  member_name text not null,
  member_phone text not null,
  member_email text,
  membership_number text,         -- unique gym membership number
  date_of_joining date not null,
  membership_type text not null,  -- e.g. 'Monthly', 'Annual', 'Student'
  membership_price_sgd numeric(10,2) not null,
  -- Commission
  commission_pct numeric(5,2) not null default 0,
  commission_sgd numeric(10,2) generated always as (
    membership_price_sgd * commission_pct / 100
  ) stored,
  commission_paid boolean default false,
  commission_payout_id uuid,
  -- Approval workflow
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'rejected')),
  confirmed_by uuid references users(id),
  confirmed_at timestamptz,
  rejection_reason text,
  -- Metadata
  notes text,
  created_at timestamptz default now()
);

-- ── COMMISSION PAYOUT (expanded) ───────────────────────────
-- Covers PT signup + PT session + membership commissions
create table if not exists commission_payouts (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references users(id) on delete cascade,
  gym_id uuid references gyms(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  -- PT commissions
  pt_signup_commission_sgd numeric(12,2) default 0,
  pt_session_commission_sgd numeric(12,2) default 0,
  -- Membership commissions
  membership_commission_sgd numeric(12,2) default 0,
  -- Totals
  total_commission_sgd numeric(12,2) generated always as (
    pt_signup_commission_sgd + pt_session_commission_sgd + membership_commission_sgd
  ) stored,
  -- Counts
  pt_signups_count int default 0,
  pt_sessions_count int default 0,
  membership_sales_count int default 0,
  -- Workflow
  status text not null default 'draft'
    check (status in ('draft', 'approved', 'paid')),
  approved_by uuid references users(id),
  approved_at timestamptz,
  paid_at timestamptz,
  notes text,
  generated_by uuid references users(id),
  generated_at timestamptz default now(),
  unique(user_id, period_start, period_end)
);

-- ── COMMISSION CONFIGURATION ───────────────────────────────
create table if not exists commission_config (
  id uuid primary key default uuid_generate_v4(),
  config_key text not null unique,  -- 'membership_commission_pct', 'pt_hourly_rate' etc
  config_value numeric(10,2) not null,
  description text,
  updated_by uuid references users(id),
  updated_at timestamptz default now()
);

-- Seed default commission config
insert into commission_config (config_key, config_value, description)
values
  ('membership_commission_pct', 5.00, 'Default membership sale commission percentage for all staff'),
  ('default_hourly_rate', 12.00, 'Default hourly rate for part-time staff (SGD)')
on conflict (config_key) do nothing;

-- ── CPF SUBMISSION REPORT ──────────────────────────────────
create table if not exists cpf_submissions (
  id uuid primary key default uuid_generate_v4(),
  payroll_month int not null check (payroll_month between 1 and 12),
  payroll_year int not null,
  total_employee_cpf numeric(12,2) not null default 0,
  total_employer_cpf numeric(12,2) not null default 0,
  total_wages numeric(12,2) not null default 0,
  staff_count int not null default 0,
  status text not null default 'pending'
    check (status in ('pending', 'submitted')),
  submitted_by uuid references users(id),
  submitted_at timestamptz,
  notes text,
  generated_at timestamptz default now(),
  unique(payroll_month, payroll_year)
);

-- ── RLS POLICIES ───────────────────────────────────────────

alter table duty_roster enable row level security;
alter table membership_sales enable row level security;
alter table commission_payouts enable row level security;
alter table commission_config enable row level security;
alter table cpf_submissions enable row level security;

-- Duty roster: manager can read/write for their gym; business_ops full access; staff can read own
create policy "duty_roster_manager" on duty_roster
  for all using (
    get_user_role() = 'business_ops'
    or (get_user_role() = 'manager' and gym_id = get_manager_gym_id())
  );

create policy "duty_roster_own_read" on duty_roster
  for select using (user_id = auth.uid());

-- Membership sales: any authenticated user can insert; manager confirms; business_ops full
create policy "membership_sales_insert" on membership_sales
  for insert with check (
    auth.uid() is not null
    and sold_by_user_id = auth.uid()
  );

create policy "membership_sales_read" on membership_sales
  for select using (
    sold_by_user_id = auth.uid()
    or get_user_role() in ('manager', 'business_ops', 'admin')
  );

create policy "membership_sales_manager_confirm" on membership_sales
  for update using (
    get_user_role() in ('manager', 'business_ops')
  );

-- Commission payouts: business_ops full; staff read own
create policy "commission_payouts_biz_ops" on commission_payouts
  for all using (get_user_role() = 'business_ops');

create policy "commission_payouts_own_read" on commission_payouts
  for select using (user_id = auth.uid());

-- Commission config: business_ops manages
create policy "commission_config_biz_ops" on commission_config
  for all using (get_user_role() = 'business_ops');

create policy "commission_config_read" on commission_config
  for select using (auth.uid() is not null);

-- CPF submissions: business_ops only
create policy "cpf_submissions_biz_ops" on cpf_submissions
  for all using (get_user_role() = 'business_ops');

-- ── INDEXES ────────────────────────────────────────────────
create index if not exists idx_duty_roster_user on duty_roster(user_id);
create index if not exists idx_duty_roster_gym on duty_roster(gym_id);
create index if not exists idx_duty_roster_date on duty_roster(shift_date);
create index if not exists idx_membership_sales_gym on membership_sales(gym_id);
create index if not exists idx_membership_sales_user on membership_sales(sold_by_user_id);
create index if not exists idx_commission_payouts_user on commission_payouts(user_id);

select 'Migration v16 complete' as status;
