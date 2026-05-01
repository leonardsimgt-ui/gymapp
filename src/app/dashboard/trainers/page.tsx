'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { User, Gym } from '@/types'
import { Plus, UserCheck, ToggleLeft, ToggleRight, Shield, Users, Briefcase, Dumbbell } from 'lucide-react'

const ROLES_FOR_ADMIN = [
  { value: 'admin', label: 'Admin', icon: Shield, description: 'Backend config only — tagged to Gym Library' },
  { value: 'business_ops', label: 'Business Operations', icon: Briefcase, description: 'View all gyms, reports, payroll' },
  { value: 'manager', label: 'Manager', icon: Users, description: 'Manage one gym club' },
  { value: 'trainer', label: 'Personal Trainer', icon: Dumbbell, description: 'Manage own clients and sessions' },
]

const ROLES_FOR_MANAGER = [
  { value: 'trainer', label: 'Personal Trainer', icon: Dumbbell, description: 'Manage own clients and sessions' },
  { value: 'manager', label: 'Manager', icon: Users, description: 'Manage one gym club' },
]

const roleBadgeClass: Record<string, string> = {
  admin: 'bg-red-100 text-red-700 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
  trainer: 'badge-active',
  manager: 'badge-pending',
  business_ops: 'bg-purple-100 text-purple-700 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
}

export default function TrainersPage() {
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [staff, setStaff] = useState<any[]>([])
  const [gyms, setGyms] = useState<Gym[]>([])
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [filterRole, setFilterRole] = useState('all')
  const [form, setForm] = useState({
    full_name: '', email: '', phone: '', role: 'trainer',
    commission_signup_pct: '10', commission_session_pct: '15',
    gym_ids: [] as string[],
    manager_gym_id: '',
  })
  const supabase = createClient()

  const loadData = async () => {
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) return
    const { data: userData } = await supabase.from('users').select('*').eq('id', authUser.id).single()
    setCurrentUser(userData)

    const { data: staffData } = await supabase
      .from('users')
      .select('*, trainer_gyms(gym_id, gyms(name)), gyms!users_manager_gym_id_fkey(name)')
      .order('role').order('full_name')
    setStaff(staffData || [])

    const { data: gymData } = await supabase.from('gyms').select('*').eq('is_active', true)
    setGyms(gymData || [])
  }

  useEffect(() => { loadData() }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const res = await fetch('/api/trainers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const result = await res.json()

    if (!res.ok) {
      setError(result.error || 'Failed to create account')
      setLoading(false)
      return
    }

    await loadData()
    setShowForm(false)
    resetForm()
    setLoading(false)
  }

  const resetForm = () => setForm({
    full_name: '', email: '', phone: '', role: 'trainer',
    commission_signup_pct: '10', commission_session_pct: '15',
    gym_ids: [], manager_gym_id: '',
  })

  const toggleActive = async (u: User) => {
    await supabase.from('users').update({ is_active: !u.is_active }).eq('id', u.id)
    loadData()
  }

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [field]: e.target.value }))

  const toggleGym = (gymId: string) => {
    setForm(f => ({
      ...f,
      gym_ids: f.gym_ids.includes(gymId)
        ? f.gym_ids.filter(g => g !== gymId)
        : [...f.gym_ids, gymId]
    }))
  }

  const isAdmin = currentUser?.role === 'admin'
  const isBusinessOps = currentUser?.role === 'business_ops'
  const canCreateAdmin = isAdmin || isBusinessOps
  const availableRoles = canCreateAdmin ? ROLES_FOR_ADMIN : ROLES_FOR_MANAGER

  const isTrainer = form.role === 'trainer'
  const isManager = form.role === 'manager'
  const isAdminRole = form.role === 'admin'
  const isBusinessOpsRole = form.role === 'business_ops'

  const filteredStaff = filterRole === 'all' ? staff : staff.filter(s => s.role === filterRole)

  const roleCounts = {
    all: staff.length,
    admin: staff.filter(s => s.role === 'admin').length,
    business_ops: staff.filter(s => s.role === 'business_ops').length,
    manager: staff.filter(s => s.role === 'manager').length,
    trainer: staff.filter(s => s.role === 'trainer').length,
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Staff Management</h1>
          <p className="text-sm text-gray-500">All roles across Gym Library</p>
        </div>
        <button onClick={() => { setShowForm(!showForm); resetForm() }}
          className="btn-primary flex items-center gap-1.5">
          <Plus className="w-4 h-4" /> Add Staff
        </button>
      </div>

      {/* Role filter tabs */}
      <div className="flex gap-1 flex-wrap">
        {[
          { key: 'all', label: `All (${roleCounts.all})` },
          { key: 'admin', label: `Admin (${roleCounts.admin})` },
          { key: 'business_ops', label: `Biz Ops (${roleCounts.business_ops})` },
          { key: 'manager', label: `Manager (${roleCounts.manager})` },
          { key: 'trainer', label: `Trainer (${roleCounts.trainer})` },
        ].map(({ key, label }) => (
          <button key={key} onClick={() => setFilterRole(key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filterRole === key ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {/* Add staff form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="card p-4 space-y-3 border-green-200">
          <h2 className="font-semibold text-gray-900 text-sm">Add New Staff Member</h2>
          {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600">{error}</div>}

          {/* Role selection */}
          <div>
            <label className="label">Role *</label>
            <div className="space-y-2">
              {availableRoles.map(r => (
                <label key={r.value}
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    form.role === r.value
                      ? 'border-green-500 bg-green-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}>
                  <input type="radio" name="role" value={r.value}
                    checked={form.role === r.value}
                    onChange={set('role')}
                    className="mt-0.5" />
                  <div>
                    <div className="flex items-center gap-2">
                      <r.icon className="w-4 h-4 text-gray-600" />
                      <span className="text-sm font-medium text-gray-900">{r.label}</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">{r.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="label">Full Name *</label>
            <input className="input" required value={form.full_name}
              onChange={set('full_name')} placeholder="e.g. John Lim" />
          </div>

          <div>
            <label className="label">Email Address *</label>
            <input className="input" required type="email" value={form.email}
              onChange={set('email')} placeholder="john@gymapp.com" />
            <p className="text-xs text-gray-400 mt-1">Must be unique. They sign in with this Google account.</p>
          </div>

          <div>
            <label className="label">Phone</label>
            <input className="input" value={form.phone}
              onChange={set('phone')} placeholder="+65 9123 4567" />
          </div>

          {/* Trainer commission rates */}
          {isTrainer && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Sign-up Commission %</label>
                <input className="input" type="number" min="0" max="100" step="0.5"
                  value={form.commission_signup_pct} onChange={set('commission_signup_pct')} />
              </div>
              <div>
                <label className="label">Per-Session Commission %</label>
                <input className="input" type="number" min="0" max="100" step="0.5"
                  value={form.commission_session_pct} onChange={set('commission_session_pct')} />
              </div>
            </div>
          )}

          {/* Manager — one gym */}
          {isManager && (
            <div>
              <label className="label">Assigned Gym (Manager sees this gym only) *</label>
              <select className="input" required value={form.manager_gym_id}
                onChange={set('manager_gym_id')}>
                <option value="">Select gym...</option>
                {gyms.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
          )}

          {/* Trainer — one or more gyms */}
          {isTrainer && (
            <div>
              <label className="label">Assign to Gym(s) *</label>
              <div className="space-y-2 mt-1">
                {gyms.map(g => (
                  <label key={g.id} className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={form.gym_ids.includes(g.id)}
                      onChange={() => toggleGym(g.id)}
                      className="rounded border-gray-300 text-green-600" />
                    <span className="text-sm text-gray-700">{g.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Admin / Business Ops — no gym assignment */}
          {(isAdminRole || isBusinessOpsRole) && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700">
              {isAdminRole
                ? '🔒 Admin accounts are tagged to Gym Library (parent company) — not assigned to any specific gym.'
                : '🔍 Business Operations accounts have view access to all gym clubs.'
              }
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={loading} className="btn-primary flex-1 disabled:opacity-50">
              {loading ? 'Creating...' : 'Create Account'}
            </button>
            <button type="button" onClick={() => { setShowForm(false); resetForm() }}
              className="btn-secondary">Cancel</button>
          </div>
        </form>
      )}

      {/* Staff list */}
      {filteredStaff.length === 0 ? (
        <div className="card p-8 text-center">
          <UserCheck className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">No staff found</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredStaff.map((member: any) => {
            const roleInfo = ROLES_FOR_ADMIN.find(r => r.value === member.role)
            const Icon = roleInfo?.icon || Users
            return (
              <div key={member.id}
                className={`card p-4 ${!member.is_active ? 'opacity-60' : ''}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-green-700 font-semibold text-sm">
                        {member.full_name.charAt(0)}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-gray-900 text-sm">{member.full_name}</p>
                        <span className={member.is_active ? 'badge-active' : 'badge-inactive'}>
                          {member.is_active ? 'Active' : 'Inactive'}
                        </span>
                        <span className={roleBadgeClass[member.role] || 'badge-inactive'}>
                          {roleInfo?.label || member.role}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 truncate">{member.email}</p>
                      {member.role === 'trainer' && (
                        <p className="text-xs text-gray-400 mt-0.5">
                          Commission: {member.commission_signup_pct}% sign-up · {member.commission_session_pct}% per session
                          {member.trainer_gyms?.length > 0 && (
                            <> · {member.trainer_gyms.map((tg: any) => tg.gyms?.name).filter(Boolean).join(', ')}</>
                          )}
                        </p>
                      )}
                      {member.role === 'manager' && (
                        <p className="text-xs text-gray-400 mt-0.5">
                          Gym: {member.gyms?.name || 'Not assigned'}
                        </p>
                      )}
                      {member.role === 'admin' && (
                        <p className="text-xs text-gray-400 mt-0.5">Gym Library — all gyms (config only)</p>
                      )}
                      {member.role === 'business_ops' && (
                        <p className="text-xs text-gray-400 mt-0.5">View access — all gyms</p>
                      )}
                    </div>
                  </div>
                  {/* Don't allow deactivating yourself */}
                  {member.id !== currentUser?.id && (
                    <button onClick={() => toggleActive(member)}
                      className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 flex-shrink-0">
                      {member.is_active
                        ? <ToggleRight className="w-4 h-4 text-green-600" />
                        : <ToggleLeft className="w-4 h-4" />
                      }
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
