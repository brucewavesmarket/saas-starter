'use server'

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { createCheckoutSession } from '@/lib/payments/stripe'
import type { Database } from '@/lib/supabase/types'

type User = Database['public']['Tables']['users']['Row']
type Team = Database['public']['Tables']['teams']['Row']

const signInSchema = z.object({
  email: z.string().email().min(3).max(255),
  password: z.string().min(8).max(100)
})

export async function signIn(prevState: any, formData: FormData) {
  const email = formData.get('email') as string
  const password = formData.get('password') as string

  const validatedData = signInSchema.safeParse({ email, password })
  if (!validatedData.success) {
    return {
      error: 'Invalid email or password format.',
      email,
      password
    }
  }

  const supabase = await createClient()

  const { error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (signInError) {
    return {
      error: 'Invalid email or password. Please try again.',
      email,
      password
    }
  }

  // Log the sign in activity
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (authUser) {
    // Get user's team for activity logging
    const { data: teamMember } = await supabase
      .from('team_members')
      .select('team_id')
      .eq('user_id', authUser.id)
      .single()

    if (teamMember) {
      await supabase.rpc('log_activity', {
        p_team_id: teamMember.team_id,
        p_action: 'SIGN_IN'
      })
    }
  }

  const redirectTo = formData.get('redirect') as string | null
  if (redirectTo === 'checkout') {
    const priceId = formData.get('priceId') as string
    // Get user's team for checkout
    const { data: teamData } = await supabase
      .from('team_members')
      .select('teams(*)')
      .eq('user_id', authUser!.id)
      .single()
    
    return createCheckoutSession({ team: teamData?.teams as Team, priceId })
  }

  redirect('/dashboard')
}

const signUpSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  inviteId: z.string().optional()
})

export async function signUp(prevState: any, formData: FormData) {
  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const inviteId = formData.get('inviteId') as string | undefined

  const validatedData = signUpSchema.safeParse({ email, password, inviteId })
  if (!validatedData.success) {
    return {
      error: 'Invalid input data.',
      email,
      password
    }
  }

  const supabase = await createClient()

  // Check if user already exists in auth.users
  const { data: existingUser } = await supabase.auth.getUser()
  if (existingUser.user) {
    return {
      error: 'User already exists. Please sign in instead.',
      email,
      password
    }
  }

  // Sign up with Supabase Auth
  const { data: authData, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
  })

  if (signUpError || !authData.user) {
    return {
      error: 'Failed to create account. Please try again.',
      email,
      password
    }
  }

  const userId = authData.user.id
  let teamId: number
  let userRole = 'owner'
  let createdTeam: Team | null = null

  if (inviteId) {
    // Check for valid invitation
    const { data: invitation } = await supabase
      .from('invitations')
      .select('*')
      .eq('id', parseInt(inviteId))
      .eq('email', email)
      .eq('status', 'pending')
      .single()

    if (invitation) {
      teamId = invitation.team_id
      userRole = invitation.role

      // Update invitation status
      await supabase
        .from('invitations')
        .update({ status: 'accepted' })
        .eq('id', invitation.id)

      // Get the team
      const { data: team } = await supabase
        .from('teams')
        .select('*')
        .eq('id', teamId)
        .single()
      
      createdTeam = team

      // Log activity
      await supabase.rpc('log_activity', {
        p_team_id: teamId,
        p_action: 'ACCEPT_INVITATION'
      })
    } else {
      return { error: 'Invalid or expired invitation.', email, password }
    }
  } else {
    // Create a new team
    const { data: team, error: teamError } = await supabase
      .from('teams')
      .insert({
        name: `${email}'s Team`
      })
      .select()
      .single()

    if (teamError) {
      console.error('Team creation error:', teamError)
      return {
        error: `Failed to create team: ${teamError.message}`,
        email,
        password
      }
    }

    if (!team) {
      return {
        error: 'Failed to create team. Please try again.',
        email,
        password
      }
    }

    createdTeam = team
    teamId = team.id
    userRole = 'owner'

    // Log team creation
    await supabase.rpc('log_activity', {
      p_team_id: teamId,
      p_action: 'CREATE_TEAM'
    })
  }

  // Create user profile
  const { error: userError } = await supabase
    .from('users')
    .insert({
      id: userId,
      role: userRole
    })

  if (userError) {
    console.error('User profile creation error:', userError)
    return {
      error: `Failed to create user profile: ${userError.message}`,
      email,
      password
    }
  }

  // Add user to team
  const { error: memberError } = await supabase
    .from('team_members')
    .insert({
      user_id: userId,
      team_id: teamId,
      role: userRole
    })

  if (memberError) {
    console.error('Team member creation error:', memberError)
    return {
      error: `Failed to add user to team: ${memberError.message}`,
      email,
      password
    }
  }

  // Log sign up activity
  await supabase.rpc('log_activity', {
    p_team_id: teamId,
    p_action: 'SIGN_UP'
  })

  const redirectTo = formData.get('redirect') as string | null
  if (redirectTo === 'checkout') {
    const priceId = formData.get('priceId') as string
    return createCheckoutSession({ team: createdTeam, priceId })
  }

  redirect('/dashboard')
}

export async function signOut() {
  const supabase = await createClient()
  
  // Get user info for activity logging before signing out
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (authUser) {
    const { data: teamMember } = await supabase
      .from('team_members')
      .select('team_id')
      .eq('user_id', authUser.id)
      .single()

    if (teamMember) {
      await supabase.rpc('log_activity', {
        p_team_id: teamMember.team_id,
        p_action: 'SIGN_OUT'
      })
    }
  }

  await supabase.auth.signOut()
  redirect('/sign-in')
}

const updatePasswordSchema = z.object({
  currentPassword: z.string().min(8).max(100),
  newPassword: z.string().min(8).max(100),
  confirmPassword: z.string().min(8).max(100)
})

export async function updatePassword(prevState: any, formData: FormData) {
  const currentPassword = formData.get('currentPassword') as string
  const newPassword = formData.get('newPassword') as string
  const confirmPassword = formData.get('confirmPassword') as string

  const validatedData = updatePasswordSchema.safeParse({
    currentPassword,
    newPassword,
    confirmPassword
  })

  if (!validatedData.success) {
    return {
      currentPassword,
      newPassword,
      confirmPassword,
      error: 'Invalid input data.'
    }
  }

  if (currentPassword === newPassword) {
    return {
      currentPassword,
      newPassword,
      confirmPassword,
      error: 'New password must be different from the current password.'
    }
  }

  if (confirmPassword !== newPassword) {
    return {
      currentPassword,
      newPassword,
      confirmPassword,
      error: 'New password and confirmation password do not match.'
    }
  }

  const supabase = await createClient()

  const { error } = await supabase.auth.updateUser({
    password: newPassword
  })

  if (error) {
    return {
      currentPassword,
      newPassword,
      confirmPassword,
      error: 'Failed to update password. Please try again.'
    }
  }

  // Log activity
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (authUser) {
    const { data: teamMember } = await supabase
      .from('team_members')
      .select('team_id')
      .eq('user_id', authUser.id)
      .single()

    if (teamMember) {
      await supabase.rpc('log_activity', {
        p_team_id: teamMember.team_id,
        p_action: 'UPDATE_PASSWORD'
      })
    }
  }

  return {
    success: 'Password updated successfully.'
  }
}

const deleteAccountSchema = z.object({
  password: z.string().min(8).max(100)
})

export async function deleteAccount(prevState: any, formData: FormData) {
  const password = formData.get('password') as string

  const validatedData = deleteAccountSchema.safeParse({ password })
  if (!validatedData.success) {
    return {
      password,
      error: 'Invalid password format.'
    }
  }

  const supabase = await createClient()

  // Get user info before deletion
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) {
    return {
      password,
      error: 'User not authenticated.'
    }
  }

  // Verify password by attempting to sign in
  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email: authUser.email!,
    password
  })

  if (verifyError) {
    return {
      password,
      error: 'Incorrect password. Account deletion failed.'
    }
  }

  // Log activity before deletion
  const { data: teamMember } = await supabase
    .from('team_members')
    .select('team_id')
    .eq('user_id', authUser.id)
    .single()

  if (teamMember) {
    await supabase.rpc('log_activity', {
      p_team_id: teamMember.team_id,
      p_action: 'DELETE_ACCOUNT'
    })
  }

  // Soft delete user (the auth.users deletion will cascade)
  await supabase
    .from('users')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', authUser.id)

  // Delete auth user (this will cascade to our users table)
  const { error: deleteError } = await supabase.auth.admin.deleteUser(authUser.id)
  
  if (deleteError) {
    return {
      password,
      error: 'Failed to delete account. Please try again.'
    }
  }

  redirect('/sign-in')
}

const updateAccountSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100)
})

export async function updateAccount(prevState: any, formData: FormData) {
  const name = formData.get('name') as string

  const validatedData = updateAccountSchema.safeParse({ name })
  if (!validatedData.success) {
    return {
      name,
      error: 'Invalid name format.'
    }
  }

  const supabase = await createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  
  if (!authUser) {
    return {
      name,
      error: 'User not authenticated.'
    }
  }

  const { error } = await supabase
    .from('users')
    .update({ name })
    .eq('id', authUser.id)

  if (error) {
    return {
      name,
      error: 'Failed to update account. Please try again.'
    }
  }

  // Log activity
  const { data: teamMember } = await supabase
    .from('team_members')
    .select('team_id')
    .eq('user_id', authUser.id)
    .single()

  if (teamMember) {
    await supabase.rpc('log_activity', {
      p_team_id: teamMember.team_id,
      p_action: 'UPDATE_ACCOUNT'
    })
  }

  return { name, success: 'Account updated successfully.' }
}

const removeTeamMemberSchema = z.object({
  memberId: z.number()
})

export async function removeTeamMember(prevState: any, formData: FormData) {
  const memberId = parseInt(formData.get('memberId') as string)

  const validatedData = removeTeamMemberSchema.safeParse({ memberId })
  if (!validatedData.success) {
    return { error: 'Invalid member ID.' }
  }

  const supabase = await createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  
  if (!authUser) {
    return { error: 'User not authenticated.' }
  }

  // Get user's team
  const { data: userTeam } = await supabase
    .from('team_members')
    .select('team_id')
    .eq('user_id', authUser.id)
    .single()

  if (!userTeam) {
    return { error: 'User is not part of a team' }
  }

  const { error } = await supabase
    .from('team_members')
    .delete()
    .eq('id', memberId)
    .eq('team_id', userTeam.team_id)

  if (error) {
    return { error: 'Failed to remove team member.' }
  }

  // Log activity
  await supabase.rpc('log_activity', {
    p_team_id: userTeam.team_id,
    p_action: 'REMOVE_TEAM_MEMBER'
  })

  return { success: 'Team member removed successfully' }
}

const inviteTeamMemberSchema = z.object({
  email: z.string().email('Invalid email address'),
  role: z.enum(['member', 'admin', 'owner'])
})

export async function inviteTeamMember(prevState: any, formData: FormData) {
  const email = formData.get('email') as string
  const role = formData.get('role') as string

  const validatedData = inviteTeamMemberSchema.safeParse({ email, role })
  if (!validatedData.success) {
    return { error: 'Invalid input data.' }
  }

  const supabase = await createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  
  if (!authUser) {
    return { error: 'User not authenticated.' }
  }

  // Get user's team
  const { data: userTeam } = await supabase
    .from('team_members')
    .select('team_id')
    .eq('user_id', authUser.id)
    .single()

  if (!userTeam) {
    return { error: 'User is not part of a team' }
  }

  // Check if the email being invited is already a team member
  // First, find if there's a user with this email in auth.users
  const { data: authUsers } = await supabase.auth.admin.listUsers()
  const invitedUser = authUsers.users.find(u => u.email === email)
  
  if (invitedUser) {
    // Check if this user is already a team member
    const { data: existingMember } = await supabase
      .from('team_members')
      .select('*')
      .eq('team_id', userTeam.team_id)
      .eq('user_id', invitedUser.id)
      .single()

    if (existingMember) {
      return { error: 'User is already a member of this team' }
    }
  }

  // Check for existing pending invitation
  const { data: existingInvitation } = await supabase
    .from('invitations')
    .select('*')
    .eq('email', email)
    .eq('team_id', userTeam.team_id)
    .eq('status', 'pending')
    .single()

  if (existingInvitation) {
    return { error: 'An invitation has already been sent to this email' }
  }

  // Create invitation
  const { error } = await supabase
    .from('invitations')
    .insert({
      team_id: userTeam.team_id,
      email,
      role,
      invited_by: authUser.id,
      status: 'pending'
    })

  if (error) {
    return { error: 'Failed to send invitation.' }
  }

  // Log activity
  await supabase.rpc('log_activity', {
    p_team_id: userTeam.team_id,
    p_action: 'INVITE_TEAM_MEMBER'
  })

  return { success: 'Invitation sent successfully' }
}