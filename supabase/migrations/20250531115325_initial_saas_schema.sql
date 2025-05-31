/*
  Initial SaaS Starter Schema Migration
  
  Purpose: Set up the core database schema for a multi-tenant SaaS application
  Affected tables: users, teams, team_members, activity_logs, invitations
  
  Key changes from original Drizzle schema:
  - Users table now references auth.users (Supabase Auth integration)
  - Removed password_hash column (handled by Supabase Auth)
  - All tables have RLS enabled for security
  - Added comprehensive indexes for performance
  - Added database functions for common operations
  
  Special considerations:
  - This migration assumes a clean database with no existing user data
  - All foreign keys properly reference Supabase auth.users table
  - RLS policies will be added in subsequent migration
*/

-- Enable UUID extension for generating UUIDs
create extension if not exists "uuid-ossp";

-- Users table extending Supabase auth.users
create table public.users (
  id uuid references auth.users on delete cascade primary key,
  name varchar(100),
  role varchar(20) not null default 'member',
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  deleted_at timestamp with time zone
);

comment on table public.users is 'User profiles extending Supabase auth.users with application-specific data and role information';
comment on column public.users.id is 'References auth.users.id for Supabase Auth integration';
comment on column public.users.role is 'User role within the application (member, admin, etc.)';
comment on column public.users.deleted_at is 'Soft delete timestamp - null means user is active';

-- Teams table for multi-tenant organization
create table public.teams (
  id bigint generated always as identity primary key,
  name varchar(100) not null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  stripe_product_id text,
  plan_name varchar(50),
  subscription_status varchar(20)
);

comment on table public.teams is 'Organizations/teams that users belong to, with integrated Stripe billing information';
comment on column public.teams.stripe_customer_id is 'Stripe customer ID for billing integration';
comment on column public.teams.subscription_status is 'Current subscription status (active, canceled, etc.)';

-- Team members junction table with roles
create table public.team_members (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  team_id bigint not null references public.teams(id) on delete cascade,
  role varchar(50) not null,
  joined_at timestamp with time zone not null default now(),
  unique(user_id, team_id)
);

comment on table public.team_members is 'Junction table managing user membership in teams with role-based access control';
comment on column public.team_members.role is 'Role within the team (owner, admin, member, etc.)';

-- Activity logs for audit trail
create table public.activity_logs (
  id bigint generated always as identity primary key,
  team_id bigint not null references public.teams(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  action text not null,
  timestamp timestamp with time zone not null default now(),
  ip_address varchar(45)
);

comment on table public.activity_logs is 'Audit trail of user actions within teams for security and compliance';
comment on column public.activity_logs.action is 'Description of the action performed (SIGN_IN, CREATE_TEAM, etc.)';
comment on column public.activity_logs.ip_address is 'IP address of the user when action was performed';

-- Invitations table for team member invitations
create table public.invitations (
  id bigint generated always as identity primary key,
  team_id bigint not null references public.teams(id) on delete cascade,
  email varchar(255) not null,
  role varchar(50) not null,
  invited_by uuid not null references public.users(id) on delete cascade,
  invited_at timestamp with time zone not null default now(),
  status varchar(20) not null default 'pending'
);

comment on table public.invitations is 'Pending invitations for users to join teams';
comment on column public.invitations.status is 'Invitation status (pending, accepted, expired, cancelled)';

-- Enable Row Level Security on all tables
alter table public.users enable row level security;
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.activity_logs enable row level security;
alter table public.invitations enable row level security;

-- Create indexes for performance optimization
-- Note: No email index needed as auth.users already has one
create index idx_team_members_user_id on public.team_members using btree (user_id);
create index idx_team_members_team_id on public.team_members using btree (team_id);
create index idx_activity_logs_team_id on public.activity_logs using btree (team_id);
create index idx_activity_logs_user_id on public.activity_logs using btree (user_id);
create index idx_activity_logs_timestamp on public.activity_logs using btree (timestamp desc);
create index idx_invitations_email on public.invitations using btree (email);
create index idx_invitations_team_id on public.invitations using btree (team_id);
create index idx_teams_stripe_customer_id on public.teams using btree (stripe_customer_id);

-- Function to automatically update updated_at timestamps
create or replace function public.handle_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function public.handle_updated_at() is 'Trigger function to automatically update updated_at column on row modifications';

-- Create triggers for updated_at columns
create trigger users_updated_at
  before update on public.users
  for each row
  execute function public.handle_updated_at();

create trigger teams_updated_at
  before update on public.teams
  for each row
  execute function public.handle_updated_at();

-- Function to log user activities automatically
create or replace function public.log_activity(
  p_team_id bigint,
  p_action text,
  p_ip_address varchar(45) default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into public.activity_logs (team_id, user_id, action, ip_address)
  values (p_team_id, (select auth.uid()), p_action, p_ip_address);
end;
$$;

comment on function public.log_activity(bigint, text, varchar) is 'Helper function to log user activities with automatic user_id detection from auth context';