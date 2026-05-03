-- ============================================================
-- GymApp Database Schema v2
-- Run this entire file in Supabase SQL Editor
-- ============================================================

create extension if not exists "uuid-ossp";

-- ============================================================
-- GYMS (now with logo_url)
-- ============================================================
create table gyms (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  address text,
  phone text,
  logo_url text,
  is_active boolean default true,
  created_at timestamptz default now()
);

-- ============================================================
-- USERS
-- role: admin | manager | business_ops | trainer
-- manager_gym_id: for managers, restricts them to one gym
-- ============================================================
create table users (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null unique,
  phone text,
  role text not null check (role in ('admin', 'manager', 'business_ops', 'trainer')),
  manager_gym_id uuid references gyms(id) on delete set null,
  is_active boolean default true,
  commission_signup_pct numeric(5,2) default 10.00,
  commission_session_pct numeric(5,2) default 15.00,
  created_at timestamptz default now()
);

-- ============================================================
-- TRAINER <-> GYM ASSIGNMENTS
-- ============================================================
create table trainer_gyms (
  id uuid primary key default uuid_generate_v4(),
  trainer_id uuid references users(id) on delete cascade,
  gym_id uuid references gyms(id) on delete cascade,
  is_primary boolean default true,
  assigned_at timestamptz default now(),
  unique(trainer_id, gym_id)
);

-- ============================================================
-- PACKAGE TEMPLATES (created by Admin)
-- ============================================================
create table package_templates (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  description text,
  total_sessions int not null,
  default_price_sgd numeric(10,2) not null,
  is_active boolean default true,
  created_by uuid references users(id),
  created_at timestamptz default now()
);

-- ============================================================
-- CLIENTS (email now optional)
-- ============================================================
create table clients (
  id uuid primary key default uuid_generate_v4(),
  gym_id uuid references gyms(id) on delete cascade,
  trainer_id uuid references users(id) on delete set null,
  full_name text not null,
  phone text not null,
  email text,
  date_of_birth date,
  gender text check (gender in ('male', 'female', 'other', 'prefer_not_to_say')),
  health_notes text,
  status text not null default 'active' check (status in ('active', 'inactive', 'lost')),
  created_at timestamptz default now()
);

-- ============================================================
-- CLIENT PACKAGES
-- ============================================================
create table packages (
  id uuid primary key default uuid_generate_v4(),
  template_id uuid references package_templates(id),
  client_id uuid references clients(id) on delete cascade,
  trainer_id uuid references users(id) on delete set null,
  gym_id uuid references gyms(id) on delete cascade,
  package_name text not null,
  total_sessions int not null,
  sessions_used int not null default 0,
  total_price_sgd numeric(10,2) not null,
  price_per_session_sgd numeric(10,2) generated always as (total_price_sgd / total_sessions) stored,
  start_date date not null,
  end_date date,
  status text not null default 'active' check (status in ('active', 'completed', 'expired', 'cancelled')),
  signup_commission_pct numeric(5,2) not null,
  signup_commission_sgd numeric(10,2) generated always as (total_price_sgd * signup_commission_pct / 100) stored,
  session_commission_pct numeric(5,2) not null,
  signup_commission_paid boolean default false,
  created_at timestamptz default now()
);

-- ============================================================
-- SESSIONS
-- session_notes mandatory for payout qualification
-- is_notes_complete: true when trainer has submitted notes
-- ============================================================
create table sessions (
  id uuid primary key default uuid_generate_v4(),
  package_id uuid references packages(id) on delete cascade,
  client_id uuid references clients(id) on delete cascade,
  trainer_id uuid references users(id) on delete set null,
  gym_id uuid references gyms(id) on delete cascade,
  scheduled_at timestamptz not null,
  duration_minutes int default 60,
  location text,
  status text not null default 'scheduled' check (status in ('scheduled', 'completed', 'cancelled', 'no_show')),
  performance_notes text,
  is_notes_complete boolean default false,
  session_commission_pct numeric(5,2),
  session_commission_sgd numeric(10,2),
  commission_paid boolean default false,
  marked_complete_by uuid references users(id),
  marked_complete_at timestamptz,
  reminder_24h_sent boolean default false,
  reminder_24h_sent_at timestamptz,
  created_at timestamptz default now()
);

-- ============================================================
-- MONTHLY COMMISSION PAYOUTS
-- Only sessions with is_notes_complete = true qualify
-- ============================================================
create table commission_payouts (
  id uuid primary key default uuid_generate_v4(),
  trainer_id uuid references users(id) on delete cascade,
  gym_id uuid references gyms(id) on delete cascade,
  month int not null check (month between 1 and 12),
  year int not null,
  signup_commissions_sgd numeric(10,2) default 0,
  session_commissions_sgd numeric(10,2) default 0,
  total_commission_sgd numeric(10,2) default 0,
  sessions_conducted int default 0,
  qualified_sessions int default 0,
  new_clients int default 0,
  status text default 'pending' check (status in ('pending', 'approved', 'paid')),
  approved_by uuid references users(id),
  approved_at timestamptz,
  paid_at timestamptz,
  generated_at timestamptz default now(),
  unique(trainer_id, gym_id, month, year)
);

-- ============================================================
-- WHATSAPP LOG
-- ============================================================
create table whatsapp_logs (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid references sessions(id) on delete cascade,
  recipient_type text check (recipient_type in ('trainer', 'client')),
  recipient_phone text not null,
  message text not null,
  status text default 'sent' check (status in ('sent', 'failed', 'pending')),
  twilio_sid text,
  sent_at timestamptz default now()
);

-- ============================================================
-- SUPABASE STORAGE BUCKET FOR GYM LOGOS
-- ============================================================
insert into storage.buckets (id, name, public) values ('gym-logos', 'gym-logos', true)
on conflict (id) do nothing;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table gyms enable row level security;
alter table users enable row level security;
alter table trainer_gyms enable row level security;
alter table package_templates enable row level security;
alter table clients enable row level security;
alter table packages enable row level security;
alter table sessions enable row level security;
alter table commission_payouts enable row level security;
alter table whatsapp_logs enable row level security;

-- Helper: get current user role
create or replace function get_user_role()
returns text as $$
  select role from users where id = auth.uid();
$$ language sql security definer;

-- Helper: get manager's assigned gym
create or replace function get_manager_gym_id()
returns uuid as $$
  select manager_gym_id from users where id = auth.uid();
$$ language sql security definer;

-- ============================================================
-- GYMS POLICIES
-- admin: full access
-- manager: only their assigned gym
-- business_ops + trainer: read assigned gyms
-- ============================================================
create policy "gyms_admin_all" on gyms for all using (get_user_role() = 'admin');

create policy "gyms_manager_read" on gyms for select using (
  get_user_role() = 'manager' and id = get_manager_gym_id()
);

create policy "gyms_biz_ops_read" on gyms for select using (
  get_user_role() = 'business_ops'
);

create policy "gyms_trainer_read" on gyms for select using (
  get_user_role() = 'trainer' and
  id in (select gym_id from trainer_gyms where trainer_id = auth.uid())
);

-- ============================================================
-- USERS POLICIES
-- ============================================================
create policy "users_admin_all" on users for all using (get_user_role() = 'admin');

create policy "users_manager_read" on users for select using (
  get_user_role() = 'manager' and (
    id = auth.uid() or
    (role = 'trainer' and id in (
      select tg.trainer_id from trainer_gyms tg where tg.gym_id = get_manager_gym_id()
    ))
  )
);

create policy "users_manager_insert" on users for insert with check (
  get_user_role() in ('admin', 'manager')
);

create policy "users_biz_ops_read" on users for select using (
  get_user_role() = 'business_ops'
);

create policy "users_trainer_read_self" on users for select using (
  id = auth.uid()
);

create policy "users_update_own" on users for update using (id = auth.uid());

-- ============================================================
-- PACKAGE TEMPLATES POLICIES
-- ============================================================
create policy "templates_admin_all" on package_templates for all using (get_user_role() = 'admin');
create policy "templates_read_all" on package_templates for select using (auth.uid() is not null);

-- ============================================================
-- CLIENTS POLICIES
-- ============================================================
create policy "clients_admin_all" on clients for all using (get_user_role() = 'admin');

create policy "clients_manager_read" on clients for select using (
  get_user_role() = 'manager' and gym_id = get_manager_gym_id()
);

create policy "clients_biz_ops_read" on clients for select using (
  get_user_role() = 'business_ops'
);

create policy "clients_trainer_read" on clients for select using (
  get_user_role() = 'trainer' and trainer_id = auth.uid()
);

create policy "clients_trainer_insert" on clients for insert with check (
  get_user_role() = 'trainer' and trainer_id = auth.uid()
);

create policy "clients_trainer_update" on clients for update using (
  get_user_role() = 'trainer' and trainer_id = auth.uid()
);

-- ============================================================
-- PACKAGES POLICIES
-- ============================================================
create policy "packages_admin_all" on packages for all using (get_user_role() = 'admin');

create policy "packages_manager_read" on packages for select using (
  get_user_role() = 'manager' and gym_id = get_manager_gym_id()
);

create policy "packages_biz_ops_read" on packages for select using (
  get_user_role() = 'business_ops'
);

create policy "packages_trainer_read" on packages for select using (
  get_user_role() = 'trainer' and trainer_id = auth.uid()
);

create policy "packages_trainer_insert" on packages for insert with check (
  get_user_role() = 'trainer' and trainer_id = auth.uid()
);

create policy "packages_manager_update" on packages for update using (
  get_user_role() in ('admin', 'manager')
);

-- ============================================================
-- SESSIONS POLICIES
-- ============================================================
create policy "sessions_admin_all" on sessions for all using (get_user_role() = 'admin');

create policy "sessions_manager_read" on sessions for select using (
  get_user_role() = 'manager' and gym_id = get_manager_gym_id()
);

create policy "sessions_manager_update" on sessions for update using (
  get_user_role() = 'manager' and gym_id = get_manager_gym_id()
);

create policy "sessions_biz_ops_read" on sessions for select using (
  get_user_role() = 'business_ops'
);

create policy "sessions_trainer_read" on sessions for select using (
  get_user_role() = 'trainer' and trainer_id = auth.uid()
);

create policy "sessions_trainer_insert" on sessions for insert with check (
  get_user_role() = 'trainer' and trainer_id = auth.uid()
);

create policy "sessions_trainer_update" on sessions for update using (
  get_user_role() = 'trainer' and trainer_id = auth.uid()
);

-- ============================================================
-- PAYOUTS POLICIES
-- ============================================================
create policy "payouts_admin_all" on commission_payouts for all using (get_user_role() = 'admin');

create policy "payouts_manager_all" on commission_payouts for all using (
  get_user_role() = 'manager' and gym_id = get_manager_gym_id()
);

create policy "payouts_biz_ops_read" on commission_payouts for select using (
  get_user_role() = 'business_ops'
);

create policy "payouts_trainer_read" on commission_payouts for select using (
  trainer_id = auth.uid()
);

-- ============================================================
-- WHATSAPP LOG POLICIES
-- ============================================================
create policy "whatsapp_admin_manager" on whatsapp_logs for all using (
  get_user_role() in ('admin', 'manager', 'business_ops')
);

-- ============================================================
-- STORAGE POLICY FOR GYM LOGOS
-- ============================================================
create policy "logo_upload_admin" on storage.objects
  for insert with check (
    bucket_id = 'gym-logos' and get_user_role() = 'admin'
  );

create policy "logo_read_all" on storage.objects
  for select using (bucket_id = 'gym-logos');

create policy "logo_update_admin" on storage.objects
  for update using (
    bucket_id = 'gym-logos' and get_user_role() = 'admin'
  );

-- ============================================================
-- SEED DATA
-- ============================================================
insert into gyms (name, address, phone) values
  ('FitZone Orchard', '391 Orchard Road, #B1-01, Singapore 238872', '+65 6123 4567'),
  ('FitZone Tampines', '4 Tampines Central 5, #03-01, Singapore 529510', '+65 6234 5678')
on conflict do nothing;
