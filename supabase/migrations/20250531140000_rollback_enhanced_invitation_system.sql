/*
  Rollback Enhanced Invitation System
  
  Purpose: Undo all changes from 20250531125438_enhance_invitation_system.sql
  This will restore the database to its previous state before the enhanced invitation system.
*/

-- Drop the new RLS policies
drop policy if exists "users can view pending invitations for their email" on public.invitations;
drop policy if exists "team members can view team invitations and requests" on public.invitations;

-- Drop all the new functions
drop function if exists public.request_to_join_team(uuid, text, uuid);
drop function if exists public.accept_invitation(bigint, uuid);
drop function if exists public.get_team_by_invite_code(uuid);
drop function if exists public.get_pending_invitations(text);

-- Drop the index
drop index if exists idx_teams_invite_code;

-- Remove the invite_code column from teams table
alter table public.teams drop column if exists invite_code;

-- Reset the invitations table status column comment
comment on column public.invitations.status is 'Invitation status (pending, accepted, expired, cancelled)';

-- The status column default was already 'pending' so no need to change that