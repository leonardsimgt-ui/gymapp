'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { User, Gym } from '@/types'
import { Users, Package, Building2, Settings, ChevronRight } from 'lucide-react'
import Link from 'next/link'

export default function DashboardPage() {
  const [user, setUser] = useState<User | null>(null)
  const [stats, setStats] = useState({
    totalStaff: 0,
    totalTrainers: 0,
    totalManagers: 0,
    totalAdmins: 0,
    totalGyms: 0,
    totalPackageTemplates: 0,
  })
  const [gyms, setGyms] = useState<Gym[]>([])
  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser) return
      const { data: userData } = await supabase
        .from('users').select('*').eq('id', authUser.id).single()
      if (!userData) return
      setUser(userData)

      if (userData.role === 'admin') {
        // Admin sees only backend config stats — no business data
        const { count: staffCount } = await supabase
          .from('users').select('id', { count: 'exact', head: true })
          .neq('role', 'admin')
        const { count: trainerCount } = await supabase
          .from('users').select('id', { count: 'exact', head: true })
          .eq('role', 'trainer')
        const { count: managerCount } = await supabase
          .from('users').select('id', { count: 'exact', head: true })
          .eq('role', 'manager')
        const { count: adminCount } = await supabase
          .from('users').select('id', { count: 'exact', head: true })
          .eq('role', 'admin')
        const { count: gymCount } = await supabase
          .from('gyms').select('id', { count: 'exact', head: true })
          .eq('is_active', true)
        const { count: pkgCount } = await supabase
          .from('package_templates').select('id', { count: 'exact', head: true })
          .eq('is_active', true)
        const { data: gymData } = await supabase
          .from('gyms').select('*').eq('is_active', true).order('name')

        setStats({
          totalStaff: staffCount || 0,
          totalTrainers: trainerCount || 0,
          totalManagers: managerCount || 0,
          totalAdmins: adminCount || 0,
          totalGyms: gymCount || 0,
          totalPackageTemplates: pkgCount || 0,
        })
        setGyms(gymData || [])
      } else {
        // Non-admin roles — load their own dashboard data
        const now = new Date()
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString()
        const isTrainer = userData.role === 'trainer'

        let clientQuery = supabase.from('clients').select('id', { count: 'exact', head: true }).eq('status', 'active')
        if (isTrainer) clientQuery = clientQuery.eq('trainer_id', authUser.id)
        else if (userData.role === 'manager' && userData.manager_gym_id)
          clientQuery = clientQuery.eq('gym_id', userData.manager_gym_id)
        const { count: clientCount } = await clientQuery

        let pkgQuery = supabase.from('packages').select('id', { count: 'exact', head: true }).eq('status', 'active')
        if (isTrainer) pkgQuery = pkgQuery.eq('trainer_id', authUser.id)
        else if (userData.role === 'manager' && userData.manager_gym_id)
          pkgQuery = pkgQuery.eq('gym_id', userData.manager_gym_id)
        const { count: pkgCount2 } = await pkgQuery

        let sessQuery = supabase.from('sessions').select('id', { count: 'exact', head: true })
          .eq('status', 'completed').gte('marked_complete_at', monthStart).lte('marked_complete_at', monthEnd)
        if (isTrainer) sessQuery = sessQuery.eq('trainer_id', authUser.id)
        else if (userData.role === 'manager' && userData.manager_gym_id)
          sessQuery = sessQuery.eq('gym_id', userData.manager_gym_id)
        const { count: sessCount } = await sessQuery

        setStats(s => ({
          ...s,
          totalStaff: clientCount || 0,
          totalTrainers: pkgCount2 || 0,
          totalManagers: sessCount || 0,
        }))
      }
    }
    load()
  }, [])

  if (!user) return (
    <div className="flex items-center justify-center h-48">
      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-green-600" />
    </div>
  )

  const isAdmin = user.role === 'admin'
  const now = new Date()

  if (isAdmin) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Admin Dashboard</h1>
          <p className="text-sm text-gray-500">Backend configuration — Gym Library</p>
        </div>

        {/* Config stats */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div className="stat-card">
            <div className="flex items-center gap-1.5 mb-1">
              <Building2 className="w-4 h-4 text-green-600" />
              <p className="text-xs text-gray-500">Active Gyms</p>
            </div>
            <p className="text-2xl font-bold text-gray-900">{stats.totalGyms}</p>
          </div>
          <div className="stat-card">
            <div className="flex items-center gap-1.5 mb-1">
              <Users className="w-4 h-4 text-blue-600" />
              <p className="text-xs text-gray-500">Trainers</p>
            </div>
            <p className="text-2xl font-bold text-gray-900">{stats.totalTrainers}</p>
          </div>
          <div className="stat-card">
            <div className="flex items-center gap-1.5 mb-1">
              <Users className="w-4 h-4 text-purple-600" />
              <p className="text-xs text-gray-500">Managers</p>
            </div>
            <p className="text-2xl font-bold text-gray-900">{stats.totalManagers}</p>
          </div>
          <div className="stat-card">
            <div className="flex items-center gap-1.5 mb-1">
              <Users className="w-4 h-4 text-amber-600" />
              <p className="text-xs text-gray-500">Admins</p>
            </div>
            <p className="text-2xl font-bold text-gray-900">{stats.totalAdmins}</p>
          </div>
          <div className="stat-card">
            <div className="flex items-center gap-1.5 mb-1">
              <Package className="w-4 h-4 text-green-600" />
              <p className="text-xs text-gray-500">Package Templates</p>
            </div>
            <p className="text-2xl font-bold text-gray-900">{stats.totalPackageTemplates}</p>
          </div>
        </div>

        {/* Gym clubs list */}
        <div className="card">
          <div className="flex items-center justify-between p-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900 text-sm flex items-center gap-2">
              <Building2 className="w-4 h-4 text-green-600" /> Gym Clubs
            </h2>
            <Link href="/dashboard/settings" className="text-xs text-green-600 font-medium">Manage</Link>
          </div>
          {gyms.length === 0 ? (
            <p className="p-4 text-sm text-gray-400 text-center">No gyms configured yet</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {gyms.map(gym => (
                <div key={gym.id} className="flex items-center gap-3 p-4">
                  <div className="w-8 h-8 bg-green-50 rounded-lg flex items-center justify-center flex-shrink-0">
                    {gym.logo_url
                      ? <img src={gym.logo_url} alt={gym.name} className="w-6 h-6 object-contain" />
                      : <Building2 className="w-4 h-4 text-green-600" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{gym.name}</p>
                    {gym.address && <p className="text-xs text-gray-400 truncate">{gym.address}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick links */}
        <div className="card p-4">
          <h2 className="font-semibold text-gray-900 text-sm mb-3">Quick Actions</h2>
          <div className="space-y-2">
            {[
              { href: '/dashboard/trainers', label: 'Manage Staff Accounts', icon: Users },
              { href: '/dashboard/packages', label: 'Manage Package Templates', icon: Package },
              { href: '/dashboard/settings', label: 'Configure Gym Clubs', icon: Settings },
            ].map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href}
                className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors">
                <Icon className="w-4 h-4 text-green-600" />
                <span className="text-sm text-gray-700 flex-1">{label}</span>
                <ChevronRight className="w-4 h-4 text-gray-400" />
              </Link>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // Non-admin dashboard
  const monthName = now.toLocaleString('default', { month: 'long' })
  const isTrainer = user.role === 'trainer'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">
          Welcome back, {user.full_name.split(' ')[0]} 👋
        </h1>
        <p className="text-sm text-gray-500">{monthName} {now.getFullYear()} overview</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="stat-card">
          <p className="text-xs text-gray-500 mb-1">Active Clients</p>
          <p className="text-2xl font-bold text-gray-900">{stats.totalStaff}</p>
        </div>
        <div className="stat-card">
          <p className="text-xs text-gray-500 mb-1">Active Packages</p>
          <p className="text-2xl font-bold text-gray-900">{stats.totalTrainers}</p>
        </div>
        <div className="stat-card">
          <p className="text-xs text-gray-500 mb-1">Sessions This Month</p>
          <p className="text-2xl font-bold text-gray-900">{stats.totalManagers}</p>
        </div>
      </div>

      {isTrainer && (
        <div className="card p-4">
          <h2 className="font-semibold text-gray-900 text-sm mb-3">Quick Actions</h2>
          <div className="grid grid-cols-2 gap-2">
            <Link href="/dashboard/clients/new" className="btn-primary text-center">+ Add Client</Link>
            <Link href="/dashboard/sessions/new" className="btn-secondary text-center">+ Schedule Session</Link>
          </div>
        </div>
      )}
    </div>
  )
}
