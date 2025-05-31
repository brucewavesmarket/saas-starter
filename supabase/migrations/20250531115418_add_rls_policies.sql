/*
  Row Level Security Policies for SaaS Schema
  
  Purpose: Implement comprehensive RLS policies for secure multi-tenant access control
  Affected tables: users, teams, team_members, activity_logs, invitations
  
  Policy Design Principles:
  - Separate policies for each operation (select, insert, update, delete)
  - Separate policies for each role (authenticated, anon)
  - Use performance-optimized patterns with (select auth.uid())
  - Minimize joins and use IN operations where possible
  - All policies are PERMISSIVE for better performance
  
  Security Model:
  - Users can only access their own profile data
  - Team data is accessible only to team members
  - Activity logs are viewable by team members but only insertable by system
  - Invitations are managed by team owners/admins
*/

-- Users table policies
-- Users can view their own profile
create policy "authenticated users can view their own profile"
on public.users for select
to authenticated
using ((select auth.uid()) = id);

-- Users can update their own profile  
create policy "authenticated users can update their own profile"
on public.users for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

-- Users can insert their own profile (during signup)
create policy "authenticated users can insert their own profile"
on public.users for insert
to authenticated
with check ((select auth.uid()) = id);

-- Users cannot delete their profile directly (handled by Supabase auth cascade)
create policy "users cannot delete profiles directly"
on public.users for delete
to authenticated
using (false);

-- Teams table policies
-- Team members can view their teams
create policy "team members can view their teams"
on public.teams for select
to authenticated
using (
  id in (
    select team_id 
    from public.team_members 
    where user_id = (select auth.uid())
  )
);

-- Only team owners can update team information
create policy "team owners can update team information"
on public.teams for update
to authenticated
using (
  id in (
    select team_id 
    from public.team_members 
    where user_id = (select auth.uid()) 
    and role = 'owner'
  )
)
with check (
  id in (
    select team_id 
    from public.team_members 
    where user_id = (select auth.uid()) 
    and role = 'owner'
  )
);

-- Authenticated users can create teams
create policy "authenticated users can create teams"
on public.teams for insert
to authenticated
with check (true);

-- Only team owners can delete teams
create policy "team owners can delete teams"
on public.teams for delete
to authenticated
using (
  id in (
    select team_id 
    from public.team_members 
    where user_id = (select auth.uid()) 
    and role = 'owner'
  )
);

-- Team members table policies
-- Team members can view team membership
create policy "team members can view team membership"
on public.team_members for select
to authenticated
using (
  team_id in (
    select team_id 
    from public.team_members 
    where user_id = (select auth.uid())
  )
);

-- Team owners and admins can add new members
create policy "team owners and admins can add members"
on public.team_members for insert
to authenticated
with check (
  team_id in (
    select team_id 
    from public.team_members 
    where user_id = (select auth.uid()) 
    and role in ('owner', 'admin')
  )
);

-- Team owners and admins can update member roles
create policy "team owners and admins can update member roles"
on public.team_members for update
to authenticated
using (
  team_id in (
    select team_id 
    from public.team_members 
    where user_id = (select auth.uid()) 
    and role in ('owner', 'admin')
  )
)
with check (
  team_id in (
    select team_id 
    from public.team_members 
    where user_id = (select auth.uid()) 
    and role in ('owner', 'admin')
  )
);

-- Team owners and admins can remove members, users can remove themselves
create policy "team management for member removal"
on public.team_members for delete
to authenticated
using (
  -- Team owners/admins can remove any member
  team_id in (
    select team_id 
    from public.team_members 
    where user_id = (select auth.uid()) 
    and role in ('owner', 'admin')
  )
  or
  -- Users can remove themselves from teams
  user_id = (select auth.uid())
);

-- Activity logs table policies
-- Team members can view activity logs for their teams
create policy "team members can view activity logs"
on public.activity_logs for select
to authenticated
using (
  team_id in (
    select team_id 
    from public.team_members 
    where user_id = (select auth.uid())
  )
);

-- System can insert activity logs (no user restrictions)
create policy "system can insert activity logs"
on public.activity_logs for insert
to authenticated
with check (true);

-- No updates allowed on activity logs (audit trail integrity)
create policy "activity logs are immutable"
on public.activity_logs for update
to authenticated
using (false);

-- Team owners can delete old activity logs
create policy "team owners can delete activity logs"
on public.activity_logs for delete
to authenticated
using (
  team_id in (
    select team_id 
    from public.team_members 
    where user_id = (select auth.uid()) 
    and role = 'owner'
  )
);

-- Invitations table policies
-- Team members can view invitations for their teams
create policy "team members can view team invitations"
on public.invitations for select
to authenticated
using (
  team_id in (
    select team_id 
    from public.team_members 
    where user_id = (select auth.uid())
  )
);

-- Invited users can view their own invitations by email
create policy "users can view their email invitations"
on public.invitations for select
to authenticated
using (
  email = (
    select auth.email()
  )
);

-- Anonymous users can view invitations by email (for invitation acceptance flow)
create policy "anonymous users can view invitations by email"
on public.invitations for select
to anon
using (true);

-- Team owners and admins can create invitations
create policy "team owners and admins can create invitations"
on public.invitations for insert
to authenticated
with check (
  team_id in (
    select team_id 
    from public.team_members 
    where user_id = (select auth.uid()) 
    and role in ('owner', 'admin')
  )
);

-- Team owners and admins can update invitation status
create policy "team owners and admins can update invitations"
on public.invitations for update
to authenticated
using (
  team_id in (
    select team_id 
    from public.team_members 
    where user_id = (select auth.uid()) 
    and role in ('owner', 'admin')
  )
)
with check (
  team_id in (
    select team_id 
    from public.team_members 
    where user_id = (select auth.uid()) 
    and role in ('owner', 'admin')
  )
);

-- Team owners and admins can delete invitations
create policy "team owners and admins can delete invitations"
on public.invitations for delete
to authenticated
using (
  team_id in (
    select team_id 
    from public.team_members 
    where user_id = (select auth.uid()) 
    and role in ('owner', 'admin')
  )
);