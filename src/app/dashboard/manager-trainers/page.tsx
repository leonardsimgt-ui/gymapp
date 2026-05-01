'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { User } from '@/types'
import { Plus, UserMinus, UserPlus, Search, Dumbbell, AlertCircle } from 'lucide-react'

export default function ManagerTrainersPage() {
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [gymId, setGymId] = useState<string | null>(null)
  const [gymName, setGymName] = useState('')
  const [myTrainers, setMyTrainers] = useState<User[]>([])
  const [unassignedTrainers, setUnassignedTrainers] = useState<User[]>([])
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [showCreateNew, setShowCreateNew] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [newForm, setNewForm] = useState({
    full_name: '', email: '', phone: '',
    commission_signup_pct: '10', commission_session_pct: '15',
  })
  const [creating, setCreating] = useState(false)
  const supabase = createClient()

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    setLoading(true)
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) return
    const { data: userData } = await supabase.from('users').select('*').eq('id', authUser.id).single()
    setCurrentUser(userData)

    if (!userData?.manager_gym_id) { setLoading(false); return }
    setGymId(userData.manager_gym_id)

    const { data: gym } = await supabase.from('gyms').select('name').eq('id', userData.manager_gym_id).single()
    setGymName(gym?.name || '')

    // Trainers in this gym
    const { data: gymTrainers } = await supabase
      .from('trainer_gyms')
      .select('trainer_id, users(*)')
      .eq('gym_id', userData.manager_gym_id)
    setMyTrainers(gymTrainers?.map((t: any) => t.users).filter(Boolean) || [])

    // Trainers not assigned to any gym
    const { data: allTrainers } = await supabase
      .from('users').select('*').eq('role', 'trainer').eq('is_active', true)
    const { data: allAssigned } = await supabase.from('trainer_gyms').select('trainer_id')
    const assignedIds = new Set(allAssigned?.map(t => t.trainer_id) || [])
    setUnassignedTrainers(allTrainers?.filter(t => !assignedIds.has(t.id)) || [])

    setLoading(false)
  }

  const handleAddExisting = async (trainerId: string) => {
    if (!gymId) return
    await supabase.from('trainer_gyms').insert({
      trainer_id: trainerId,
      gym_id: gymId,
      is_primary: true,
    })
    await loadData()
    setShowAdd(false)
  }

  const handleRemove = async (trainerId: string) => {
    if (!confirm('Remove this trainer from your gym club? Their account will remain active.')) return
    await supabase.from('trainer_gyms').delete()
      .eq('trainer_id', trainerId).eq('gym_id', gymId!)
    await loadData()
  }

  const handleCreateNew = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!gymId) return
    setCreating(true)
    setError('')

    const res = await fetch('/api/trainers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...newForm,
        role: 'trainer',
        gym_ids: [gymId],
      }),
    })
    const result = await res.json()

    if (!res.ok) {
      setError(result.error || 'Failed to create trainer')
      setCreating(false)
      return
    }

    setShowCreateNew(false)
    setNewForm({ full_name: '', email: '', phone: '', commission_signup_pct: '10', commission_session_pct: '15' })
    setCreating(false)
    await loadData()
  }

  const filteredMine = myTrainers.filter(t =>
    t.full_name.toLowerCase().includes(search.toLowerCase()) ||
    t.email.toLowerCase().includes(search.toLowerCase()) ||
    t.phone?.includes(search)
  )

  if (loading) return (
    <div className="flex items-center justify-center h-48">
      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-green-600" />
    </div>
  )

  if (!gymId) return (
    <div className="card p-8 text-center">
      <AlertCircle className="w-10 h-10 text-amber-400 mx-auto mb-3" />
      <p className="text-gray-700 font-medium">No gym assigned</p>
      <p className="text-sm text-gray-500 mt-1">Ask your admin to assign you to a gym club.</p>
    </div>
  )

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Trainers</h1>
          <p className="text-sm text-gray-500">{gymName} · {myTrainers.length} trainer{myTrainers.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setShowAdd(!showAdd); setShowCreateNew(false) }}
            className="btn-secondary flex items-center gap-1.5 text-xs">
            <UserPlus className="w-3.5 h-3.5" /> Add Existing
          </button>
          <button onClick={() => { setShowCreateNew(!showCreateNew); setShowAdd(false) }}
            className="btn-primary flex items-center gap-1.5 text-xs">
            <Plus className="w-3.5 h-3.5" /> Create New
          </button>
        </div>
      </div>

      {/* Add existing trainer panel */}
      {showAdd && (
        <div className="card p-4 space-y-3 border-blue-200 bg-blue-50">
          <p className="text-sm font-medium text-gray-900">Add Existing Trainer to {gymName}</p>
          <p className="text-xs text-gray-500">Only trainers not currently assigned to any gym are shown.</p>
          {unassignedTrainers.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-2">No unassigned trainers available</p>
          ) : (
            <div className="space-y-2">
              {unassignedTrainers.map(t => (
                <div key={t.id} className="flex items-center justify-between bg-white rounded-lg p-3 border border-gray-200">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{t.full_name}</p>
                    <p className="text-xs text-gray-500">{t.email}</p>
                  </div>
                  <button onClick={() => handleAddExisting(t.id)}
                    className="btn-primary text-xs py-1.5 flex items-center gap-1">
                    <UserPlus className="w-3.5 h-3.5" /> Add
                  </button>
                </div>
              ))}
            </div>
          )}
          <button onClick={() => setShowAdd(false)} className="btn-secondary w-full text-xs">Cancel</button>
        </div>
      )}

      {/* Create new trainer form */}
      {showCreateNew && (
        <form onSubmit={handleCreateNew} className="card p-4 space-y-3 border-green-200">
          <p className="text-sm font-medium text-gray-900">Create New Trainer for {gymName}</p>
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600">{error}</div>
          )}
          <div>
            <label className="label">Full Name *</label>
            <input className="input" required value={newForm.full_name}
              onChange={e => setNewForm(f => ({ ...f, full_name: e.target.value }))}
              placeholder="e.g. Sarah Tan" />
          </div>
          <div>
            <label className="label">Email Address *</label>
            <input className="input" required type="email" value={newForm.email}
              onChange={e => setNewForm(f => ({ ...f, email: e.target.value }))}
              placeholder="sarah@gym.com" />
            <p className="text-xs text-gray-400 mt-1">They will sign in using this Google account</p>
          </div>
          <div>
            <label className="label">Phone</label>
            <input className="input" value={newForm.phone}
              onChange={e => setNewForm(f => ({ ...f, phone: e.target.value }))}
              placeholder="+65 9123 4567" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Sign-up Commission %</label>
              <input className="input" type="number" min="0" max="100" step="0.5"
                value={newForm.commission_signup_pct}
                onChange={e => setNewForm(f => ({ ...f, commission_signup_pct: e.target.value }))} />
            </div>
            <div>
              <label className="label">Per-Session Commission %</label>
              <input className="input" type="number" min="0" max="100" step="0.5"
                value={newForm.commission_session_pct}
                onChange={e => setNewForm(f => ({ ...f, commission_session_pct: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={creating} className="btn-primary flex-1 disabled:opacity-50">
              {creating ? 'Creating...' : 'Create Trainer'}
            </button>
            <button type="button" onClick={() => setShowCreateNew(false)} className="btn-secondary">Cancel</button>
          </div>
        </form>
      )}

      {/* Search */}
      {myTrainers.length > 0 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input className="input pl-9" placeholder="Search trainers..."
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      )}

      {/* Trainer list */}
      {filteredMine.length === 0 ? (
        <div className="card p-8 text-center">
          <Dumbbell className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">
            {myTrainers.length === 0 ? 'No trainers in this gym yet' : 'No trainers match your search'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredMine.map(trainer => (
            <div key={trainer.id} className="card p-4 flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-green-700 font-semibold text-sm">{trainer.full_name.charAt(0)}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-gray-900 text-sm truncate">{trainer.full_name}</p>
                  <span className={trainer.is_active ? 'badge-active' : 'badge-inactive'}>
                    {trainer.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <p className="text-xs text-gray-500 truncate">{trainer.email}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  Commission: {trainer.commission_signup_pct}% sign-up · {trainer.commission_session_pct}% per session
                </p>
              </div>
              <button
                onClick={() => handleRemove(trainer.id)}
                className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0"
                title="Remove from gym"
              >
                <UserMinus className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
