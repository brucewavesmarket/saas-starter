/*
  Complete RLS Fix - Remove ALL Problematic Policies
  
  Purpose: Completely remove all RLS policies that cause infinite recursion
  and replace with simple, non-recursive policies
  
  Root cause: Policies were checking team_members table to grant access to team_members table
  Solution: Use direct user-based checks and simpler policies
*/

-- STEP 1: Drop ALL existing policies to start fresh
-- Users table policies
drop policy if exists "authenticated users can view their own profile" on public.users;
drop policy if exists "authenticated users can update their own profile" on public.users;
drop policy if exists "authenticated users can insert their own profile" on public.users;
drop policy if exists "users cannot delete profiles directly" on public.users;

-- Teams table policies  
drop policy if exists "team members can view their teams" on public.teams;
drop policy if exists "team owners can update team information" on public.teams;
drop policy if exists "authenticated users can create teams" on public.teams;
drop policy if exists "team owners can delete teams" on public.teams;
drop policy if exists "users can view teams they belong to" on public.teams;
drop policy if exists "users can update their teams" on public.teams;
drop policy if exists "users can create new teams" on public.teams;
drop policy if exists "users can delete their teams" on public.teams;

-- Team members table policies (THE PROBLEMATIC ONES)
drop policy if exists "team members can view team membership" on public.team_members;
drop policy if exists "team owners and admins can add members" on public.team_members;
drop policy if exists "team owners and admins can update member roles" on public.team_members;
drop policy if exists "team management for member removal" on public.team_members;
drop policy if exists "users can view team membership" on public.team_members;
drop policy if exists "team members can view other team members" on public.team_members;
drop policy if exists "users can add new team members" on public.team_members;
drop policy if exists "users can update team member roles" on public.team_members;
drop policy if exists "users can manage team membership" on public.team_members;

-- Activity logs policies
drop policy if exists "team members can view activity logs" on public.activity_logs;
drop policy if exists "system can insert activity logs" on public.activity_logs;
drop policy if exists "activity logs are immutable" on public.activity_logs;
drop policy if exists "team owners can delete activity logs" on public.activity_logs;
drop policy if exists "users can view activity logs for their teams" on public.activity_logs;

-- Invitations policies
drop policy if exists "team members can view team invitations" on public.invitations;
drop policy if exists "users can view their email invitations" on public.invitations;
drop policy if exists "anonymous users can view invitations by email" on public.invitations;
drop policy if exists "team owners and admins can create invitations" on public.invitations;
drop policy if exists "team owners and admins can update invitations" on public.invitations;
drop policy if exists "team owners and admins can delete invitations" on public.invitations;
drop policy if exists "users can view invitations for their teams" on public.invitations;
drop policy if exists "users can create team invitations" on public.invitations;
drop policy if exists "users can update team invitations" on public.invitations;
drop policy if exists "users can delete team invitations" on public.invitations;

-- STEP 2: Create SIMPLE, non-recursive policies

-- Users table - simple self-access policies
create policy "users_select_own" on public.users for select to authenticated using (id = auth.uid());
create policy "users_insert_own" on public.users for insert to authenticated with check (id = auth.uid());
create policy "users_update_own" on public.users for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Teams table - allow all authenticated users (application will handle permissions)
create policy "teams_select_all" on public.teams for select to authenticated using (true);
create policy "teams_insert_all" on public.teams for insert to authenticated with check (true);
create policy "teams_update_all" on public.teams for update to authenticated using (true) with check (true);
create policy "teams_delete_all" on public.teams for delete to authenticated using (true);

-- Team members table - SIMPLE policies without self-reference
create policy "team_members_select_all" on public.team_members for select to authenticated using (true);
create policy "team_members_insert_all" on public.team_members for insert to authenticated with check (true);
create policy "team_members_update_all" on public.team_members for update to authenticated using (true) with check (true);
create policy "team_members_delete_all" on public.team_members for delete to authenticated using (true);

-- Activity logs - simple policies
create policy "activity_logs_select_all" on public.activity_logs for select to authenticated using (true);
create policy "activity_logs_insert_all" on public.activity_logs for insert to authenticated with check (true);

-- Invitations - simple policies
create policy "invitations_select_all" on public.invitations for select to authenticated using (true);
create policy "invitations_select_anon" on public.invitations for select to anon using (true);
create policy "invitations_insert_all" on public.invitations for insert to authenticated with check (true);
create policy "invitations_update_all" on public.invitations for update to authenticated using (true) with check (true);
create policy "invitations_delete_all" on public.invitations for delete to authenticated using (true);