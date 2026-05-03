'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { formatDate, formatSGD } from '@/lib/utils'
import {
  Plus, Calendar, Clock, Lock, CheckCircle, AlertCircle,
  X, Save, Trash2, ChevronLeft, ChevronRight, User
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface RosterEntry {
  id: string
  user_id: string
  gym_id: string
  shift_date: string
  shift_start: string
  shift_end: string
  hours_worked: number
  hourly_rate: number
  gross_pay: number
  status: string
  is_locked: boolean
  whatsapp_reminder_sent: boolean
  notes?: string
  user?: { full_name: string; phone?: string; hourly_rate?: number }
}

export default function RosterPage() {
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [partTimers, setPartTimers] = useState<any[]>([])
  const [roster, setRoster] = useState<RosterEntry[]>([])
  const [gymId, setGymId] = useState<string | null>(null)
  const [gymName, setGymName] = useState('')
  const [weekStart, setWeekStart] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - d.getDay() + 1) // Monday
    return d.toISOString().split('T')[0]
  })
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [form, setForm] = useState({
    user_id: '', shift_date: '', shift_start: '09:00', shift_end: '17:00',
    hourly_rate: '', notes: '',
  })
  const supabase = createClient()

  const showMsg = (msg: string) => { setSuccess(msg); setTimeout(() => setSuccess(''), 3000) }

  useEffect(() => { loadData() }, [weekStart])

  const loadData = async () => {
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) return
    const { data: userData } = await supabase.from('users').select('*').eq('id', authUser.id).single()
    setCurrentUser(userData)

    const gId = userData?.manager_gym_id || userData?.role === 'business_ops' ? null : null
    if (userData?.role === 'manager') setGymId(userData.manager_gym_id)

    const { data: gym } = await supabase.from('gyms').select('name')
      .eq('id', userData?.manager_gym_id || '').single()
    setGymName(gym?.name || '')

    // Load part-time staff for this gym
    let ptQuery = supabase.from('users').select('*')
      .eq('employment_type', 'part_time').eq('is_archived', false)
    if (userData?.role === 'manager' && userData?.manager_gym_id) {
      // Get part-timers assigned to this gym via trainer_gyms or manager_gym_id
      const { data: gymTrainers } = await supabase
        .from('trainer_gyms').select('trainer_id').eq('gym_id', userData.manager_gym_id)
      const trainerIds = gymTrainers?.map(t => t.trainer_id) || []
      if (trainerIds.length > 0) ptQuery = ptQuery.in('id', trainerIds)
    }
    const { data: pt } = await ptQuery.order('full_name')
    setPartTimers(pt || [])

    // Load roster for the week
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekEnd.getDate() + 6)
    const weekEndStr = weekEnd.toISOString().split('T')[0]

    let rosterQuery = supabase.from('duty_roster')
      .select('*, user:users(full_name, phone, hourly_rate)')
      .gte('shift_date', weekStart).lte('shift_date', weekEndStr)
      .order('shift_date').order('shift_start')
    if (userData?.role === 'manager' && userData?.manager_gym_id) {
      rosterQuery = rosterQuery.eq('gym_id', userData.manager_gym_id)
    }
    const { data: rosterData } = await rosterQuery
    setRoster(rosterData || [])
  }

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + i)
    return d.toISOString().split('T')[0]
  })

  const shiftWeek = (dir: number) => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + dir * 7)
    setWeekStart(d.toISOString().split('T')[0])
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!gymId) { setError('No gym assigned to your account'); return }
    setSaving(true); setError('')

    const pt = partTimers.find(p => p.id === form.user_id)
    const rate = parseFloat(form.hourly_rate) || pt?.hourly_rate || 0
    if (!rate) { setError('Hourly rate is required'); setSaving(false); return }

    const { error: err } = await supabase.from('duty_roster').insert({
      user_id: form.user_id,
      gym_id: gymId,
      shift_date: form.shift_date,
      shift_start: form.shift_start,
      shift_end: form.shift_end,
      hourly_rate: rate,
      status: 'scheduled',
      notes: form.notes || null,
      created_by: currentUser?.id,
    })

    if (err) { setError(err.message); setSaving(false); return }
    await loadData()
    setShowForm(false)
    setForm({ user_id: '', shift_date: '', shift_start: '09:00', shift_end: '17:00', hourly_rate: '', notes: '' })
    setSaving(false)
    showMsg('Shift added')
  }

  const handleLock = async (entry: RosterEntry) => {
    if (!confirm(`Lock this shift for ${entry.user?.full_name}? It will not be editable after locking.`)) return
    await supabase.from('duty_roster').update({
      is_locked: true, locked_at: new Date().toISOString(), locked_by: currentUser?.id,
      status: 'completed',
    }).eq('id', entry.id)
    await loadData()
    showMsg('Shift locked and marked complete')
  }

  const handleDelete = async (entry: RosterEntry) => {
    if (entry.is_locked && currentUser?.role !== 'business_ops') {
      setError('This shift is locked. Only Business Ops can delete it.'); return
    }
    if (!confirm('Delete this shift?')) return
    await supabase.from('duty_roster').delete().eq('id', entry.id)
    await loadData()
    showMsg('Shift deleted')
  }

  const handleSendWhatsApp = async (entry: RosterEntry) => {
    if (!entry.user?.phone) { setError('This staff has no phone number'); return }
    showMsg(`WhatsApp reminder queued for ${entry.user.full_name}`)
    // Actual sending happens via cron job
    await supabase.from('duty_roster').update({
      whatsapp_reminder_sent: true, whatsapp_reminder_sent_at: new Date().toISOString()
    }).eq('id', entry.id)
    await loadData()
  }

  const totalHours = roster.reduce((s, r) => s + (r.hours_worked || 0), 0)
  const totalPay = roster.reduce((s, r) => s + (r.gross_pay || 0), 0)

  const isBizOps = currentUser?.role === 'business_ops'

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Duty Roster</h1>
          <p className="text-sm text-gray-500">{gymName} · Part-time staff shifts</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary flex items-center gap-1.5">
          <Plus className="w-4 h-4" /> Add Shift
        </button>
      </div>

      {success && <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700"><CheckCircle className="w-4 h-4 flex-shrink-0" />{success}</div>}
      {error && <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600"><AlertCircle className="w-4 h-4 flex-shrink-0" />{error}<button onClick={() => setError('')} className="ml-auto"><X className="w-4 h-4" /></button></div>}

      {/* Week navigator */}
      <div className="flex items-center gap-3">
        <button onClick={() => shiftWeek(-1)} className="btn-secondary p-2"><ChevronLeft className="w-4 h-4" /></button>
        <div className="flex-1 text-center">
          <p className="text-sm font-medium text-gray-900">
            Week of {formatDate(weekStart)} — {formatDate(weekDays[6])}
          </p>
          <p className="text-xs text-gray-400">{roster.length} shifts · {totalHours.toFixed(1)}h · {formatSGD(totalPay)}</p>
        </div>
        <button onClick={() => shiftWeek(1)} className="btn-secondary p-2"><ChevronRight className="w-4 h-4" /></button>
      </div>

      {/* Add shift form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="card p-4 space-y-4 border-red-200">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-900 text-sm">Add New Shift</h2>
            <button type="button" onClick={() => setShowForm(false)}><X className="w-4 h-4 text-gray-400" /></button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Staff Member *</label>
              <select className="input" required value={form.user_id}
                onChange={e => {
                  const pt = partTimers.find(p => p.id === e.target.value)
                  setForm(f => ({ ...f, user_id: e.target.value, hourly_rate: pt?.hourly_rate?.toString() || '' }))
                }}>
                <option value="">Select staff...</option>
                {partTimers.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Shift Date *</label>
              <input className="input" type="date" required value={form.shift_date}
                onChange={e => setForm(f => ({ ...f, shift_date: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label">Start Time *</label>
              <input className="input" type="time" required value={form.shift_start}
                onChange={e => setForm(f => ({ ...f, shift_start: e.target.value }))} />
            </div>
            <div>
              <label className="label">End Time *</label>
              <input className="input" type="time" required value={form.shift_end}
                onChange={e => setForm(f => ({ ...f, shift_end: e.target.value }))} />
            </div>
            <div>
              <label className="label">Hourly Rate (SGD) *</label>
              <input className="input" type="number" min="0" step="0.50" required value={form.hourly_rate}
                onChange={e => setForm(f => ({ ...f, hourly_rate: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="label">Notes</label>
            <input className="input" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="e.g. Cover for sick leave" />
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="btn-primary flex-1 disabled:opacity-50">
              {saving ? 'Saving...' : 'Add Shift'}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
          </div>
        </form>
      )}

      {/* Roster by day */}
      {weekDays.map(day => {
        const dayShifts = roster.filter(r => r.shift_date === day)
        const dayName = new Date(day).toLocaleDateString('en-SG', { weekday: 'short', day: 'numeric', month: 'short' })
        return (
          <div key={day} className="card">
            <div className="flex items-center justify-between p-3 border-b border-gray-100 bg-gray-50 rounded-t-xl">
              <p className="text-sm font-medium text-gray-700">{dayName}</p>
              {dayShifts.length > 0 && (
                <p className="text-xs text-gray-400">
                  {dayShifts.reduce((s, r) => s + r.hours_worked, 0).toFixed(1)}h · {formatSGD(dayShifts.reduce((s, r) => s + r.gross_pay, 0))}
                </p>
              )}
            </div>
            {dayShifts.length === 0 ? (
              <p className="p-3 text-xs text-gray-300 text-center">No shifts</p>
            ) : (
              <div className="divide-y divide-gray-100">
                {dayShifts.map(entry => (
                  <div key={entry.id} className={cn('p-3 flex items-center gap-3', entry.is_locked && 'bg-gray-50')}>
                    <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-red-700 font-semibold text-xs">{entry.user?.full_name?.charAt(0)}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-gray-900">{entry.user?.full_name}</p>
                        {entry.is_locked && <Lock className="w-3 h-3 text-gray-400" />}
                        {entry.whatsapp_reminder_sent && <span className="text-xs text-green-600">✓ Reminded</span>}
                      </div>
                      <p className="text-xs text-gray-500">
                        {entry.shift_start} – {entry.shift_end} · {entry.hours_worked?.toFixed(1)}h · {formatSGD(entry.gross_pay)}
                      </p>
                      {entry.notes && <p className="text-xs text-gray-400">{entry.notes}</p>}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {!entry.is_locked && (
                        <>
                          <button onClick={() => handleLock(entry)} title="Lock shift"
                            className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg">
                            <Lock className="w-3.5 h-3.5" />
                          </button>
                          {!entry.whatsapp_reminder_sent && entry.user?.phone && (
                            <button onClick={() => handleSendWhatsApp(entry)} title="Send WhatsApp reminder"
                              className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg text-xs font-medium">
                              WA
                            </button>
                          )}
                        </>
                      )}
                      {(isBizOps || !entry.is_locked) && (
                        <button onClick={() => handleDelete(entry)} title="Delete"
                          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
