'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useViewMode } from '@/lib/view-mode-context'
import { formatSGD, formatDateTime, formatDate } from '@/lib/utils'
import {
  Users, Building2, Settings, ChevronRight, CheckCircle,
  Clock, DollarSign, Briefcase, UserCheck, Dumbbell, Shield,
  CreditCard, Calendar, Package, AlertTriangle, AlertCircle,
  TrendingUp, UserX, Bell
} from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

export default function DashboardPage() {
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  // Admin state
  const [gymBreakdown, setGymBreakdown] = useState<any[]>([])
  const [roleCounts, setRoleCounts] = useState<Record<string, number>>({})

  // Manager/trainer shared state
  const [todaySessions, setTodaySessions] = useState<any[]>([])
  const [upcomingSessions, setUpcomingSessions] = useState<any[]>([])
  const [pendingMemberships, setPendingMemberships] = useState(0)
  const [pendingSessions, setPendingSessions] = useState(0)

  // Manager alerts
  const [lowSessionPackages, setLowSessionPackages] = useState<any[]>([])
  const [expiringPackages, setExpiringPackages] = useState<any[]>([])
  const [atRiskMembers, setAtRiskMembers] = useState<any[]>([])
  const [pendingLeave, setPendingLeave] = useState(0)

  // Stats
  const [stats, setStats] = useState<any>({})

  const supabase = createClient()
  const { isActingAsTrainer } = useViewMode()

  useEffect(() => {
    const load = async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser) return
      const { data: u } = await supabase.from('users').select('*').eq('id', authUser.id).single()
      if (!u) return
      setUser(u)

      // ── Admin ────────────────────────────────────────────
      if (u.role === 'admin') {
        const { data: gyms } = await supabase.from('gyms').select('*').order('name')
        const { data: allStaff } = await supabase.from('users').select('id, role, manager_gym_id, trainer_gyms(gym_id)').eq('is_archived', false)
        const rc: Record<string, number> = {}
        allStaff?.forEach((s: any) => { rc[s.role] = (rc[s.role] || 0) + 1 })
        setRoleCounts(rc)
        setGymBreakdown((gyms || []).map(g => ({
          ...g,
          managers: allStaff?.filter((s: any) => s.role === 'manager' && s.manager_gym_id === g.id).length || 0,
          trainers: allStaff?.filter((s: any) => s.role === 'trainer' && (s.trainer_gyms as any[])?.some((tg: any) => tg.gym_id === g.id)).length || 0,
        })))
        setLoading(false)
        return
      }

      const gymId = u.manager_gym_id
      const isManager = u.role === 'manager' && !isActingAsTrainer
      const isTrainer = u.role === 'trainer' || isActingAsTrainer
      const now = new Date()
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
      const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString()
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

      // ── Today's sessions ─────────────────────────────────
      let todayQ = supabase.from('sessions')
        .select('*, member:members(full_name), trainer:users!sessions_trainer_id_fkey(full_name), package:packages(package_name)')
        .gte('scheduled_at', todayStart).lte('scheduled_at', todayEnd)
        .order('scheduled_at')
      if (isTrainer) todayQ = todayQ.eq('trainer_id', authUser.id)
      else if (gymId) todayQ = todayQ.eq('gym_id', gymId)
      const { data: todayData } = await todayQ
      setTodaySessions(todayData || [])

      // ── Upcoming (next 5 excluding today) ────────────────
      let upQ = supabase.from('sessions')
        .select('*, member:members(full_name), trainer:users!sessions_trainer_id_fkey(full_name)')
        .eq('status', 'scheduled').gt('scheduled_at', todayEnd)
        .order('scheduled_at').limit(5)
      if (isTrainer) upQ = upQ.eq('trainer_id', authUser.id)
      else if (gymId) upQ = upQ.eq('gym_id', gymId)
      const { data: upData } = await upQ
      setUpcomingSessions(upData || [])

      // ── Stats ────────────────────────────────────────────
      let memberQ = supabase.from('members').select('id', { count: 'exact', head: true })
      if (isTrainer) memberQ = memberQ.eq('created_by', authUser.id)
      else if (gymId) memberQ = memberQ.eq('gym_id', gymId)
      const { count: memberCount } = await memberQ

      let pkgQ = supabase.from('packages').select('id', { count: 'exact', head: true }).eq('status', 'active')
      if (isTrainer) pkgQ = pkgQ.eq('trainer_id', authUser.id)
      else if (gymId) pkgQ = pkgQ.eq('gym_id', gymId)
      const { count: pkgCount } = await pkgQ

      let sessQ = supabase.from('sessions').select('session_commission_sgd').eq('status', 'completed').gte('marked_complete_at', monthStart)
      if (isTrainer) sessQ = sessQ.eq('trainer_id', authUser.id)
      else if (gymId) sessQ = sessQ.eq('gym_id', gymId)
      const { data: sessData } = await sessQ
      const commission = sessData?.reduce((s: number, r: any) => s + (r.session_commission_sgd || 0), 0) || 0
      const sessCount = sessData?.length || 0

      setStats({ members: memberCount || 0, packages: pkgCount || 0, sessions: sessCount, commission })

      // ── Manager-only alerts ──────────────────────────────
      if (isManager && gymId) {
        // Pending membership confirmations
        const { count: memPending } = await supabase.from('gym_memberships')
          .select('id', { count: 'exact', head: true }).eq('gym_id', gymId).eq('sale_status', 'pending')
        setPendingMemberships(memPending || 0)

        // Pending session confirmations
        const { count: sessPending } = await supabase.from('sessions')
          .select('id', { count: 'exact', head: true })
          .eq('gym_id', gymId).eq('status', 'completed').eq('is_notes_complete', true).eq('manager_confirmed', false)
        setPendingSessions(sessPending || 0)

        // Packages with ≤3 sessions remaining
        const { data: lowPkgs } = await supabase.from('packages')
          .select('*, member:members(full_name), trainer:users!packages_trainer_id_fkey(full_name)')
          .eq('gym_id', gymId).eq('status', 'active')
          .filter('total_sessions - sessions_used', 'lte', 3)
          .order('sessions_used', { ascending: false })
          .limit(10)
        setLowSessionPackages(lowPkgs || [])

        // Packages expiring within 14 days
        const in14Days = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        const { data: expPkgs } = await supabase.from('packages')
          .select('*, member:members(full_name), trainer:users!packages_trainer_id_fkey(full_name)')
          .eq('gym_id', gymId).eq('status', 'active')
          .lte('end_date_calculated', in14Days)
          .gte('end_date_calculated', now.toISOString().split('T')[0])
          .order('end_date_calculated')
          .limit(10)
        setExpiringPackages(expPkgs || [])

        // At-risk: packages expired in last 30 days with no new active package
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        const { data: expiredPkgs } = await supabase.from('packages')
          .select('member_id, member:members(full_name, phone), end_date_calculated')
          .eq('gym_id', gymId).eq('status', 'expired')
          .gte('end_date_calculated', thirtyDaysAgo)
        // Filter out those who have a new active package
        const expiredMemberIds = [...new Set(expiredPkgs?.map((p: any) => p.member_id))]
        if (expiredMemberIds.length > 0) {
          const { data: activePkgs } = await supabase.from('packages')
            .select('member_id').eq('gym_id', gymId).eq('status', 'active').in('member_id', expiredMemberIds)
          const activeIds = new Set(activePkgs?.map((p: any) => p.member_id))
          const atRisk = expiredPkgs?.filter((p: any) => !activeIds.has(p.member_id))
            .reduce((acc: any[], p: any) => {
              if (!acc.find(x => x.member_id === p.member_id)) acc.push(p)
              return acc
            }, []) || []
          setAtRiskMembers(atRisk)
        }

        // Pending leave approvals
        const { data: gymStaff } = await supabase.from('users').select('id').eq('manager_gym_id', gymId)
        const staffIds = gymStaff?.map((s: any) => s.id) || []
        if (staffIds.length > 0) {
          const { count: leavePending } = await supabase.from('leave_applications')
            .select('id', { count: 'exact', head: true }).in('user_id', staffIds).eq('status', 'pending')
          setPendingLeave(leavePending || 0)
        }
      }

      setLoading(false)
    }
    load()
  }, [isActingAsTrainer])

  if (loading || !user) return (
    <div className="flex items-center justify-center h-48">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600" />
    </div>
  )

  const now = new Date()
  const todayStr = now.toLocaleDateString('en-SG', { weekday: 'long', day: 'numeric', month: 'long' })
  const isAdmin = user.role === 'admin'
  const isManager = user.role === 'manager' && !isActingAsTrainer
  const isTrainer = user.role === 'trainer' || isActingAsTrainer
  const totalPending = pendingMemberships + pendingSessions
  const totalAlerts = lowSessionPackages.length + expiringPackages.length + atRiskMembers.length

  // ── Admin dashboard ──────────────────────────────────────
  if (isAdmin) return (
    <div className="space-y-6">
      <div><h1 className="text-xl font-bold text-gray-900">Admin Dashboard</h1><p className="text-sm text-gray-500">View-only · Gym Library</p></div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="stat-card"><div className="flex items-center gap-1.5 mb-1"><Building2 className="w-4 h-4 text-red-600" /><p className="text-xs text-gray-500">Active Gyms</p></div><p className="text-2xl font-bold">{gymBreakdown.filter(g => g.is_active).length}</p></div>
        {(['business_ops', 'manager', 'trainer'] as const).map(role => {
          const icons = { business_ops: Briefcase, manager: UserCheck, trainer: Dumbbell }
          const colors = { business_ops: 'text-purple-600', manager: 'text-yellow-700', trainer: 'text-green-700' }
          const labels = { business_ops: 'Business Ops', manager: 'Managers', trainer: 'Trainers' }
          const Icon = icons[role]
          return <div key={role} className="stat-card"><div className="flex items-center gap-1.5 mb-1"><Icon className={cn('w-4 h-4', colors[role])} /><p className="text-xs text-gray-500">{labels[role]}</p></div><p className="text-2xl font-bold">{roleCounts[role] || 0}</p></div>
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
              <div className="flex items-center gap-2 text-xs">
                <span className="bg-yellow-50 text-yellow-700 px-2 py-0.5 rounded-full font-medium">{gym.managers} Mgr</span>
                <span className="bg-green-50 text-green-700 px-2 py-0.5 rounded-full font-medium">{gym.trainers} Trainers</span>
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

  // ── Manager / Trainer dashboard ──────────────────────────
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">
          {isTrainer ? `Welcome, ${user.full_name.split(' ')[0]} 👋` : 'Operations Dashboard'}
        </h1>
        <p className="text-sm text-gray-500">{todayStr}</p>
      </div>

      {/* ── Pending actions banner ── */}
      {isManager && totalPending > 0 && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
          <Bell className="w-5 h-5 text-amber-600 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-800">
              {totalPending} item{totalPending > 1 ? 's' : ''} pending your confirmation
            </p>
            <p className="text-xs text-amber-600 mt-0.5">
              {pendingMemberships > 0 && `${pendingMemberships} membership sale${pendingMemberships > 1 ? 's' : ''}`}
              {pendingMemberships > 0 && pendingSessions > 0 && ' · '}
              {pendingSessions > 0 && `${pendingSessions} PT session${pendingSessions > 1 ? 's' : ''}`}
            </p>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            {pendingMemberships > 0 && <Link href="/dashboard/membership/sales" className="btn-primary text-xs py-1.5">Memberships</Link>}
            {pendingSessions > 0 && <Link href="/dashboard/pt/sessions" className="btn-secondary text-xs py-1.5">Sessions</Link>}
          </div>
        </div>
      )}

      {/* ── Pending leave banner ── */}
      {isManager && pendingLeave > 0 && (
        <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-xl p-4">
          <Calendar className="w-5 h-5 text-blue-600 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-blue-800">{pendingLeave} leave application{pendingLeave > 1 ? 's' : ''} awaiting approval</p>
          </div>
          <Link href="/dashboard/hr/leave" className="btn-primary text-xs py-1.5 flex-shrink-0">Review</Link>
        </div>
      )}

      {/* ── Stats row ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="stat-card">
          <div className="flex items-center justify-between"><p className="text-xs text-gray-500">{isTrainer ? 'My Members' : 'Members'}</p><Users className="w-4 h-4 text-red-600" /></div>
          <p className="text-2xl font-bold">{stats.members}</p>
        </div>
        <div className="stat-card">
          <div className="flex items-center justify-between"><p className="text-xs text-gray-500">Active Packages</p><Package className="w-4 h-4 text-red-600" /></div>
          <p className="text-2xl font-bold">{stats.packages}</p>
        </div>
        <div className="stat-card">
          <div className="flex items-center justify-between"><p className="text-xs text-gray-500">Sessions This Month</p><CheckCircle className="w-4 h-4 text-green-600" /></div>
          <p className="text-2xl font-bold">{stats.sessions}</p>
        </div>
        <div className="stat-card">
          <div className="flex items-center justify-between"><p className="text-xs text-gray-500">Commission</p><DollarSign className="w-4 h-4 text-red-600" /></div>
          <p className="text-xl font-bold">{formatSGD(stats.commission)}</p>
        </div>
      </div>

      {/* ── Today's sessions ── */}
      <div className="card">
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900 text-sm flex items-center gap-2">
            <Calendar className="w-4 h-4 text-red-600" /> Today's Sessions
            {todaySessions.length > 0 && <span className="bg-red-100 text-red-700 text-xs px-2 py-0.5 rounded-full font-medium">{todaySessions.length}</span>}
          </h2>
          <Link href="/dashboard/pt/sessions" className="text-xs text-red-600 font-medium">All sessions</Link>
        </div>
        {todaySessions.length === 0 ? (
          <div className="p-6 text-center">
            <Clock className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-500">No sessions scheduled for today</p>
            {isTrainer && <Link href="/dashboard/pt/sessions/new" className="btn-primary inline-block mt-3 text-xs py-1.5">Schedule session</Link>}
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {todaySessions.map((s: any) => {
              const time = new Date(s.scheduled_at).toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit' })
              const statusColor = s.status === 'completed' ? 'bg-green-100 text-green-700' : s.status === 'cancelled' ? 'bg-red-100 text-red-700' : s.status === 'no_show' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'
              return (
                <div key={s.id} className="flex items-center gap-3 p-4">
                  <div className="text-center w-12 flex-shrink-0">
                    <p className="text-sm font-bold text-gray-900">{time}</p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">{s.member?.full_name}</p>
                    {!isTrainer && <p className="text-xs text-gray-400">{s.trainer?.full_name}</p>}
                    {s.package?.package_name && <p className="text-xs text-gray-400">{s.package.package_name}</p>}
                  </div>
                  <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium capitalize flex-shrink-0', statusColor)}>
                    {s.status === 'no_show' ? 'No-show' : s.status}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Manager alerts section ── */}
      {isManager && totalAlerts > 0 && (
        <div className="space-y-3">
          <h2 className="font-semibold text-gray-900 text-sm flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" /> Alerts Requiring Attention
          </h2>

          {/* Low session packages */}
          {lowSessionPackages.length > 0 && (
            <div className="card">
              <div className="p-3 border-b border-amber-100 bg-amber-50 rounded-t-xl">
                <p className="text-sm font-medium text-amber-800 flex items-center gap-2">
                  <Package className="w-4 h-4" /> {lowSessionPackages.length} PT Package{lowSessionPackages.length > 1 ? 's' : ''} Running Low (≤3 sessions left)
                </p>
              </div>
              <div className="divide-y divide-gray-100">
                {lowSessionPackages.map((pkg: any) => (
                  <div key={pkg.id} className="flex items-center gap-3 p-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">{pkg.member?.full_name}</p>
                      <p className="text-xs text-gray-500">{pkg.package_name} · {pkg.trainer?.full_name}</p>
                    </div>
                    <span className="text-sm font-bold text-amber-600 flex-shrink-0">
                      {pkg.total_sessions - pkg.sessions_used} left
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Expiring packages */}
          {expiringPackages.length > 0 && (
            <div className="card">
              <div className="p-3 border-b border-red-100 bg-red-50 rounded-t-xl">
                <p className="text-sm font-medium text-red-800 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" /> {expiringPackages.length} PT Package{expiringPackages.length > 1 ? 's' : ''} Expiring Within 14 Days
                </p>
              </div>
              <div className="divide-y divide-gray-100">
                {expiringPackages.map((pkg: any) => (
                  <div key={pkg.id} className="flex items-center gap-3 p-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">{pkg.member?.full_name}</p>
                      <p className="text-xs text-gray-500">{pkg.package_name} · {pkg.trainer?.full_name}</p>
                    </div>
                    <span className="text-xs text-red-600 font-medium flex-shrink-0">
                      Expires {formatDate(pkg.end_date_calculated)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* At-risk members */}
          {atRiskMembers.length > 0 && (
            <div className="card">
              <div className="p-3 border-b border-gray-200 bg-gray-50 rounded-t-xl">
                <p className="text-sm font-medium text-gray-700 flex items-center gap-2">
                  <UserX className="w-4 h-4" /> {atRiskMembers.length} Member{atRiskMembers.length > 1 ? 's' : ''} with Expired Package — Not Renewed
                </p>
              </div>
              <div className="divide-y divide-gray-100">
                {atRiskMembers.map((m: any) => (
                  <div key={m.member_id} className="flex items-center gap-3 p-3">
                    <UserX className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">{m.member?.full_name}</p>
                      <p className="text-xs text-gray-500">{m.member?.phone} · expired {formatDate(m.end_date_calculated)}</p>
                    </div>
                    <Link href={`/dashboard/members/${m.member_id}`} className="text-xs text-red-600 font-medium flex-shrink-0">View</Link>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Upcoming sessions ── */}
      {upcomingSessions.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between p-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900 text-sm">Upcoming Sessions</h2>
            <Link href="/dashboard/pt/sessions" className="text-xs text-red-600 font-medium">View all</Link>
          </div>
          <div className="divide-y divide-gray-100">
            {upcomingSessions.map((s: any) => (
              <div key={s.id} className="flex items-center gap-3 p-4">
                <div className="bg-red-50 p-2 rounded-lg flex-shrink-0"><Clock className="w-4 h-4 text-red-600" /></div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">{s.member?.full_name}</p>
                  <p className="text-xs text-gray-500">{formatDateTime(s.scheduled_at)}{!isTrainer && ` · ${s.trainer?.full_name}`}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Trainer quick actions ── */}
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
