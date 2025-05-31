import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/types'

type User = Database['public']['Tables']['users']['Row']
type Team = Database['public']['Tables']['teams']['Row']
type ActivityLog = Database['public']['Tables']['activity_logs']['Row']
type TeamMember = Database['public']['Tables']['team_members']['Row']

export async function getUser(): Promise<User | null> {
  const supabase = await createClient()
  
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser()

  if (!authUser) {
    return null
  }

  // Get user profile from our users table
  const { data: user } = await supabase
    .from('users')
    .select('*')
    .eq('id', authUser.id)
    .is('deleted_at', null)
    .single()

  return user
}

export async function getTeamByStripeCustomerId(customerId: string): Promise<Team | null> {
  const supabase = await createClient()
  
  const { data: team } = await supabase
    .from('teams')
    .select('*')
    .eq('stripe_customer_id', customerId)
    .single()

  return team
}

export async function updateTeamSubscription(
  teamId: number,
  subscriptionData: {
    stripeSubscriptionId: string | null
    stripeProductId: string | null
    planName: string | null
    subscriptionStatus: string
  }
) {
  const supabase = await createClient()
  
  const { error } = await supabase
    .from('teams')
    .update({
      stripe_subscription_id: subscriptionData.stripeSubscriptionId,
      stripe_product_id: subscriptionData.stripeProductId,
      plan_name: subscriptionData.planName,
      subscription_status: subscriptionData.subscriptionStatus,
      updated_at: new Date().toISOString()
    })
    .eq('id', teamId)

  if (error) {
    throw new Error(`Failed to update team subscription: ${error.message}`)
  }
}

export async function getUserWithTeam(userId: string) {
  const supabase = await createClient()
  
  const { data } = await supabase
    .from('team_members')
    .select(`
      team_id,
      users!inner(*)
    `)
    .eq('user_id', userId)
    .single()

  return data ? {
    user: data.users,
    teamId: data.team_id
  } : null
}

export async function getActivityLogs() {
  const user = await getUser()
  if (!user) {
    throw new Error('User not authenticated')
  }

  // Get user's team first
  const userTeam = await getUserWithTeam(user.id)
  if (!userTeam) {
    return []
  }

  const supabase = await createClient()
  
  const { data: logs } = await supabase
    .from('activity_logs')
    .select(`
      id,
      action,
      timestamp,
      ip_address,
      users(name)
    `)
    .eq('team_id', userTeam.teamId)
    .order('timestamp', { ascending: false })
    .limit(10)

  return logs?.map(log => ({
    id: log.id,
    action: log.action,
    timestamp: log.timestamp,
    ipAddress: log.ip_address,
    userName: log.users?.name || 'Unknown'
  })) || []
}

export async function getTeamForUser() {
  const user = await getUser()
  if (!user) {
    return null
  }

  const supabase = await createClient()
  
  const { data: teamMemberData } = await supabase
    .from('team_members')
    .select(`
      team_id,
      teams!inner(
        *,
        team_members!inner(
          id,
          role,
          joined_at,
          users!inner(
            id,
            name
          )
        )
      )
    `)
    .eq('user_id', user.id)
    .single()

  if (!teamMemberData?.teams) {
    return null
  }

  const team = teamMemberData.teams
  
  // Get emails for all team members from auth.users
  const userIds = team.team_members.map(member => member.users.id)
  const { data: authUsers } = await supabase.auth.admin.listUsers()
  
  // Create a map of user_id -> email
  const emailMap = new Map(
    authUsers.users.map(authUser => [authUser.id, authUser.email])
  )
  
  // Transform the data to match the expected format
  return {
    ...team,
    teamMembers: team.team_members.map(member => ({
      id: member.id,
      role: member.role,
      joinedAt: member.joined_at,
      user: {
        id: member.users.id,
        name: member.users.name,
        email: emailMap.get(member.users.id) || null
      }
    }))
  }
}

// Additional helper functions for Supabase integration

export async function requireUser(): Promise<User> {
  const user = await getUser()
  if (!user) {
    throw new Error('User not authenticated')
  }
  return user
}

export async function createTeam(name: string, userId: string): Promise<Team> {
  const supabase = await createClient()
  
  const { data: team, error } = await supabase
    .from('teams')
    .insert({ name })
    .select()
    .single()

  if (error || !team) {
    throw new Error(`Failed to create team: ${error?.message}`)
  }

  // Add user as team owner
  const { error: memberError } = await supabase
    .from('team_members')
    .insert({
      user_id: userId,
      team_id: team.id,
      role: 'owner'
    })

  if (memberError) {
    throw new Error(`Failed to add user to team: ${memberError.message}`)
  }

  return team
}

export async function getTeamMembers(teamId: number) {
  const supabase = await createClient()
  
  const { data: members } = await supabase
    .from('team_members')
    .select(`
      id,
      role,
      joined_at,
      users!inner(
        id,
        name
      )
    `)
    .eq('team_id', teamId)

  return members?.map(member => ({
    id: member.id,
    role: member.role,
    joinedAt: member.joined_at,
    user: {
      id: member.users.id,
      name: member.users.name,
      email: null // Email is in auth.users
    }
  })) || []
}

export async function deleteTeam(teamId: number) {
  const supabase = await createClient()
  
  const { error } = await supabase
    .from('teams')
    .delete()
    .eq('id', teamId)

  if (error) {
    throw new Error(`Failed to delete team: ${error.message}`)
  }
}