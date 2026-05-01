import { createAdminClient, createSupabaseServerClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const serverClient = await createSupabaseServerClient()
    const { data: { user } } = await serverClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: currentUser } = await serverClient
      .from('users').select('role').eq('id', user.id).single()

    // Admin and business_ops can create any role
    // Manager can only create trainers and managers
    const allowedRoles = ['admin', 'manager', 'business_ops']
    if (!currentUser || !allowedRoles.includes(currentUser.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const {
      full_name, email, phone, role,
      commission_signup_pct, commission_session_pct,
      gym_ids, manager_gym_id,
    } = body

    // Managers can only create trainers and other managers
    if (currentUser.role === 'manager' && !['trainer', 'manager'].includes(role)) {
      return NextResponse.json({ error: 'Managers can only create trainer or manager accounts' }, { status: 403 })
    }

    const adminClient = createAdminClient()

    // Create auth user
    const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { full_name },
    })
    if (authError) return NextResponse.json({ error: authError.message }, { status: 400 })

    // Build user record
    const userPayload: any = {
      id: authData.user.id,
      full_name,
      email,
      phone: phone || null,
      role: role || 'trainer',
      commission_signup_pct: parseFloat(commission_signup_pct) || 10,
      commission_session_pct: parseFloat(commission_session_pct) || 15,
    }

    // Manager gets gym assignment
    if (role === 'manager' && manager_gym_id) {
      userPayload.manager_gym_id = manager_gym_id
    }

    // Admin and business_ops are not assigned to any gym
    // (manager_gym_id stays null)

    const { error: userError } = await adminClient.from('users').insert(userPayload)
    if (userError) return NextResponse.json({ error: userError.message }, { status: 400 })

    // Assign gyms for trainers only
    if (role === 'trainer' && gym_ids && gym_ids.length > 0) {
      const gymAssignments = gym_ids.map((gymId: string, idx: number) => ({
        trainer_id: authData.user.id,
        gym_id: gymId,
        is_primary: idx === 0,
      }))
      await adminClient.from('trainer_gyms').insert(gymAssignments)
    }

    return NextResponse.json({ success: true, userId: authData.user.id })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
