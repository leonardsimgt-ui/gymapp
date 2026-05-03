'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useViewMode } from '@/lib/view-mode-context'
import { formatSGD, formatDateTime } from '@/lib/utils'
import {
  Users, Building2, Settings, ChevronRight, CheckCircle,
  Clock, TrendingUp, DollarSign, Briefcase, UserCheck,
  Dumbbell, Shield, CreditCard, Calendar, Package
} from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

export default function DashboardPage() {
  const [user, setUser] = useState<any>(null)
  const [stats, setStats] = useState<any>({})
  const [upcomingSessions, setUpcomingSessions] = useState<any[]>([])
  const [pendingConfirmations, setPendingConfirmations] = useState(0)
  const [gymBreakdown, setGymBreakdown] = useState<any[]>([])
  const [roleCounts, setRoleCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const supabase = createClient()
  const { isActingAsTrainer } = useViewMode()

  useEffect(() => {
    const load = async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser) return
      const { data: u } = await supabase.from('users').select('*').eq('id', authUser.id).single()
      if (!u) return
      setUser(u)

      if (u.role === 'admin') {
        const { data: gyms } = await supabase.from('gyms').select('*').order('name')
        const { data: allStaff } = await supabase.from('users').select('id, role, manager_gym_id, trainer_gyms(gym_id)').eq('is_archived', false)
        const rc: Record<string, number> = {}
        allStaff?.forEach((s: any) => { rc[s.role] = (rc[s.role] || 0) + 1 })
        setRoleCounts(rc)
        const gymRows = (gyms || []).map(g => ({
          ...g,
          managers: allStaff?.filter((s: any) => s.role === 'manager' && s.manager_gym_id === g.id).length || 0,
          trainers: allStaff?.filter((s: any) => s.role === 'trainer' && (s.trainer_gyms as any[])?.some((tg: any) => tg.gym_id === g.id)).length || 0,
        }))
        setGymBreakdown(gymRows)
        setLoading(false)
        return
      }

      const now = new Date()
      const gymId = u.manager_gym_id
      const isTrainer = u.role === 'trainer' || isActingAsTrainer

      // Active members
      let memberQ = supabase.from('members').select('id', { count: 'exact', head: true }).eq('is_active', true)
      if (isTrainer) memberQ = memberQ.eq('created_by', authUser.id)
      else if (gymId) memberQ = memberQ.eq('gym_id', gymId)
      const { count: members } = await memberQ

      // Active PT packages
      let pkgQ = supabase.from('packages').select('id', { count: 'exact', head: true }).eq('status', 'active')
      if (isTrainer) pkgQ = pkgQ.eq('trainer_id', authUser.id)
      else if (gymId) pkgQ = pkgQ.eq('gym_id', gymId)
      const { count: packages } = await pkgQ

      // Commission this month
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
      let sessQ = supabase.from('sessions').select('session_commission_sgd').eq('status', 'completed').gte('marked_complete_at', monthStart)
      if (isTrainer) sessQ = sessQ.eq('trainer_id', authUser.id)
      else if (gymId) sessQ = sessQ.eq('gym_id', gymId)
      const { data: sessData } = await sessQ
      const commission = sessData?.reduce((s: number, r: any) => s + (r.session_commission_sgd || 0), 0) || 0

      // Upcoming sessions
      let upQ = supabase.from('sessions').select('*, member:members(full_name), trainer:users!sessions_trainer_id_fkey(full_name)')
        .eq('status', 'scheduled').gte('scheduled_at', now.toISOString()).order('scheduled_at').limit(5)
      if (isTrainer) upQ = upQ.eq('trainer_id', authUser.id)
      else if (gymId) upQ = upQ.eq('gym_id', gymId)
      const { data: upcoming } = await upQ
      setUpcomingSessions(upcoming || [])

      // Pending confirmations for manager
      if (u.role === 'manager' && !isActingAsTrainer && gymId) {
        const { count: memPending } = await supabase.from('gym_memberships').select('id', { count: 'exact', head: true }).eq('gym_id', gymId).eq('sale_status', 'pending')
        const { count: sessPending } = await supabase.from('sessions').select('id', { count: 'exact', head: true }).eq('gym_id', gymId).eq('status', 'completed').eq('is_notes_complete', true).eq('manager_confirmed', false)
        setPendingConfirmations((memPending || 0) + (sessPending || 0))
      }

      setStats({ members: members || 0, packages: packages || 0, commission })
      setLoading(false)
    }
    load()
  }, [isActingAsTrainer])

  if (loading || !user) return <div className="flex items-center justify-center h-48"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600" /></div>

  const now = new Date()
  const monthName = now.toLocaleString('default', { month: 'long' })
  const isAdmin = user.role === 'admin'
  const isManager = user.role === 'manager' && !isActingAsTrainer
  const isTrainer = user.role === 'trainer' || isActingAsTrainer

  const roleColors: Record<string, string> = {
    admin: 'text-red-600', business_ops: 'text-purple-600', manager: 'text-yellow-700', trainer: 'text-green-700',
  }
  const roleIcons: Record<string, any> = {
    admin: Shield, business_ops: Briefcase, manager: UserCheck, trainer: Dumbbell,
  }
  const roleLabels: Record<string, string> = {
    admin: 'Admins', business_ops: 'Business Ops', manager: 'Managers', trainer: 'Trainers',
  }

  if (isAdmin) return (
    <div className="space-y-6">
      <div><h1 className="text-xl font-bold text-gray-900">Admin Dashboard</h1><p className="text-sm text-gray-500">View-only overview · Gym Library</p></div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="stat-card"><div className="flex items-center gap-1.5 mb-1"><Building2 className="w-4 h-4 text-red-600" /><p className="text-xs text-gray-500">Active Gyms</p></div><p className="text-2xl font-bold">{gymBreakdown.filter(g => g.is_active).length}</p></div>
        {['business_ops', 'manager', 'trainer'].map(role => {
          const Icon = roleIcons[role]; const color = roleColors[role]
          return <div key={role} className="stat-card"><div className="flex items-center gap-1.5 mb-1"><Icon className={cn('w-4 h-4', color)} /><p className="text-xs text-gray-500">{roleLabels[role]}</p></div><p className="text-2xl font-bold">{roleCounts[role] || 0}</p></div>
        })}
      </div>
      <div className="card">
        <div className="p-4 border-b border-gray-100"><h2 className="font-semibold text-gray-900 text-sm">Gym Clubs · Staff Breakdown</h2></div>
        {gymBreakdown.map(gym => (
          <div key={gym.id} className={cn('p-4 border-b border-gray-100 last:border-0', !gym.is_active && 'opacity-50')}>
            <div className="flex items-center gap-3">
              <Building2 className="w-4 h-4 text-red-600 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">{gym.name}{!gym.is_active && ' (Inactive)'}</p>
                {gym.address && <p className="text-xs text-gray-400">{gym.address}</p>}
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span className="bg-yellow-50 text-yellow-700 px-2 py-0.5 rounded-full font-medium">{gym.managers} Mgr</span>
                <span className="bg-green-50 text-green-700 px-2 py-0.5 rounded-full font-medium">{gym.trainers} Trainer</span>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="card p-4">
        <h2 className="font-semibold text-gray-900 text-sm mb-3">Quick Actions</h2>
        {[{ href: '/dashboard/admin/staff', l: 'Business Ops Staff', icon: Briefcase }, { href: '/dashboard/admin/settings', l: 'App Settings', icon: Settings }].map(({ href, l, icon: Icon }) => (
          <Link key={href} href={href} className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors">
            <Icon className="w-4 h-4 text-red-600 flex-shrink-0" /><span className="text-sm text-gray-700 flex-1">{l}</span><ChevronRight className="w-4 h-4 text-gray-400" />
          </Link>
        ))}
      </div>
    </div>
  )

  return (
    <div className="space-y-6">
      <div><h1 className="text-xl font-bold text-gray-900">Welcome, {user.full_name.split(' ')[0]} 👋</h1><p className="text-sm text-gray-500">{monthName} {now.getFullYear()}</p></div>

      {/* Pending actions alert for manager */}
      {isManager && pendingConfirmations > 0 && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
          <CheckCircle className="w-5 h-5 text-amber-600 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-800">{pendingConfirmations} item{pendingConfirmations > 1 ? 's' : ''} pending your confirmation</p>
            <p className="text-xs text-amber-600">Membership sales or PT sessions waiting for review</p>
          </div>
          <div className="flex gap-2">
            <Link href="/dashboard/membership/sales" className="btn-primary text-xs py-1.5">Memberships</Link>
            <Link href="/dashboard/pt/sessions?filter=pending_confirm" className="btn-secondary text-xs py-1.5">Sessions</Link>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className="stat-card"><div className="flex items-center justify-between"><p className="text-xs text-gray-500">Active Members</p><Users className="w-4 h-4 text-red-600" /></div><p className="text-2xl font-bold">{stats.members}</p></div>
        <div className="stat-card"><div className="flex items-center justify-between"><p className="text-xs text-gray-500">Active PT Packages</p><Package className="w-4 h-4 text-red-600" /></div><p className="text-2xl font-bold">{stats.packages}</p></div>
        <div className="stat-card"><div className="flex items-center justify-between"><p className="text-xs text-gray-500">Commission ({monthName})</p><DollarSign className="w-4 h-4 text-red-600" /></div><p className="text-xl font-bold">{formatSGD(stats.commission)}</p></div>
      </div>

      <div className="card">
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900 text-sm">Upcoming PT Sessions</h2>
          <Link href="/dashboard/pt/sessions" className="text-xs text-red-600 font-medium">View all</Link>
        </div>
        {upcomingSessions.length === 0 ? (
          <div className="p-6 text-center"><Clock className="w-8 h-8 text-gray-300 mx-auto mb-2" /><p className="text-sm text-gray-500">No upcoming sessions</p>{isTrainer && <Link href="/dashboard/pt/sessions/new" className="btn-primary inline-block mt-3 text-xs py-1.5">Schedule</Link>}</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {upcomingSessions.map((s: any) => (
              <div key={s.id} className="flex items-center gap-3 p-4">
                <div className="bg-red-50 p-2 rounded-lg flex-shrink-0"><Calendar className="w-4 h-4 text-red-600" /></div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">{s.member?.full_name}</p>
                  <p className="text-xs text-gray-500">{formatDateTime(s.scheduled_at)}{s.trainer?.full_name && ` · ${s.trainer.full_name}`}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {isTrainer && (
        <div className="card p-4">
          <h2 className="font-semibold text-gray-900 text-sm mb-3">Quick Actions</h2>
          <div className="grid grid-cols-2 gap-2">
            <Link href="/dashboard/members/new" className="btn-primary text-center text-sm">Register Member</Link>
            <Link href="/dashboard/pt/sessions/new" className="btn-secondary text-center text-sm">Schedule Session</Link>
          </div>
        </div>
      )}
    </div>
  )
}
