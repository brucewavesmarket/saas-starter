/*
  Enhanced Invitation System
  
  Purpose: Add comprehensive invitation and join request functionality
  Changes:
  1. Add invite_code (UUID) to teams table for shareable invite links
  2. Add 'requested' status to invitations for join requests
  3. Add indexes for performance
  4. Add helper functions for invitation management
  
  New features:
  - Shareable team invite links with UUID codes
  - Join requests when using invite links without prior invitation
  - Pending invitation discovery during signup
  - Automatic team joining with valid invitations
*/

-- Add invite_code column to teams table
alter table public.teams 
add column invite_code uuid unique default gen_random_uuid();

comment on column public.teams.invite_code is 'Unique UUID for shareable team invite links';

-- Update invitations table to support join requests
alter table public.invitations 
alter column status set default 'pending';

comment on column public.invitations.status is 'Invitation status: pending (invited by team), requested (user requested to join), accepted, expired, cancelled';

-- Create index for invite_code lookups
create index idx_teams_invite_code on public.teams using btree (invite_code);

-- Create function to get pending invitations for an email
create or replace function public.get_pending_invitations(user_email text)
returns table (
  invitation_id bigint,
  team_id bigint,
  team_name varchar(100),
  role varchar(50),
  invited_by_name varchar(100),
  invited_at timestamp with time zone
)
language plpgsql
security invoker
set search_path = ''
as $$
begin
  return query
  select 
    i.id as invitation_id,
    i.team_id,
    t.name as team_name,
    i.role,
    u.name as invited_by_name,
    i.invited_at
  from public.invitations i
  join public.teams t on i.team_id = t.id
  join public.users u on i.invited_by = u.id
  where i.email = user_email 
    and i.status = 'pending';
end;
$$;

comment on function public.get_pending_invitations(text) is 'Get all pending invitations for a given email address';

-- Create function to find team by invite code
create or replace function public.get_team_by_invite_code(code uuid)
returns table (
  team_id bigint,
  team_name varchar(100),
  member_count bigint
)
language plpgsql
security invoker
set search_path = ''
as $$
begin
  return query
  select 
    t.id as team_id,
    t.name as team_name,
    count(tm.id) as member_count
  from public.teams t
  left join public.team_members tm on t.id = tm.team_id
  where t.invite_code = code
  group by t.id, t.name;
end;
$$;

comment on function public.get_team_by_invite_code(uuid) is 'Get team information by invite code with member count';

-- Create function to accept invitation
create or replace function public.accept_invitation(
  invitation_id bigint,
  user_id uuid
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  invite_record record;
begin
  -- Get invitation details
  select i.team_id, i.role, i.email, i.status
  into invite_record
  from public.invitations i
  where i.id = invitation_id and i.status = 'pending';
  
  if not found then
    return false;
  end if;
  
  -- Add user to team
  insert into public.team_members (user_id, team_id, role)
  values (user_id, invite_record.team_id, invite_record.role);
  
  -- Update invitation status
  update public.invitations 
  set status = 'accepted'
  where id = invitation_id;
  
  -- Log activity
  perform public.log_activity(
    invite_record.team_id,
    'ACCEPT_INVITATION'
  );
  
  return true;
exception
  when others then
    return false;
end;
$$;

comment on function public.accept_invitation(bigint, uuid) is 'Accept a pending invitation and add user to team';

-- Create function to request to join team
create or replace function public.request_to_join_team(
  team_invite_code uuid,
  user_email text,
  requesting_user_id uuid
)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  team_record record;
  invitation_id bigint;
begin
  -- Get team by invite code
  select id, name
  into team_record
  from public.teams
  where invite_code = team_invite_code;
  
  if not found then
    return null;
  end if;
  
  -- Check if user is already a member
  if exists (
    select 1 from public.team_members 
    where team_id = team_record.id and user_id = requesting_user_id
  ) then
    return null;
  end if;
  
  -- Check if there's already a pending invitation or request
  if exists (
    select 1 from public.invitations 
    where team_id = team_record.id 
      and email = user_email 
      and status in ('pending', 'requested')
  ) then
    return null;
  end if;
  
  -- Create join request
  insert into public.invitations (
    team_id, 
    email, 
    role, 
    invited_by, 
    status
  )
  values (
    team_record.id,
    user_email,
    'member',
    requesting_user_id,
    'requested'
  )
  returning id into invitation_id;
  
  -- Log activity
  perform public.log_activity(
    team_record.id,
    'REQUEST_TO_JOIN'
  );
  
  return invitation_id;
end;
$$;

comment on function public.request_to_join_team(uuid, text, uuid) is 'Create a join request for a team using invite code';

-- Add RLS policies for new functionality
create policy "users can view pending invitations for their email"
on public.invitations for select
to anon, authenticated
using (
  email = (select auth.email()) or
  email in (
    select email from auth.users where id = (select auth.uid())
  )
);

-- Update existing policies to handle 'requested' status
drop policy if exists "team owners and admins can view team invitations" on public.invitations;
create policy "team members can view team invitations and requests"
on public.invitations for select
to authenticated
using (
  team_id in (
    select team_id 
    from public.team_members 
    where user_id = (select auth.uid())
  )
);