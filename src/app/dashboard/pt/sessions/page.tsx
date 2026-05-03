'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useViewMode } from '@/lib/view-mode-context'
import { formatDateTime, formatSGD } from '@/lib/utils'
import { Calendar, Clock, CheckCircle, XCircle, AlertCircle, Plus, Filter } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

export default function PtSessionsPage() {
  const [user, setUser] = useState<any>(null)
  const [sessions, setSessions] = useState<any[]>([])
  const [filter, setFilter] = useState('upcoming')
  const [viewFilter, setViewFilter] = useState<'all' | 'mine'>('mine')
  const [loading, setLoading] = useState(true)
  const supabase = createClient()
  const { isActingAsTrainer } = useViewMode()

  const loadSessions = async () => {
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) return
    const { data: userData } = await supabase.from('users').select('*').eq('id', authUser.id).single()
    setUser(userData)

    let q = supabase.from('sessions')
      .select('*, member:members(full_name, phone), trainer:users!sessions_trainer_id_fkey(full_name), gym:gyms(name), package:packages(package_name)')
      .order('scheduled_at', { ascending: filter === 'upcoming' })

    const isTrainer = userData.role === 'trainer' || isActingAsTrainer
    const isManager = userData.role === 'manager' && !isActingAsTrainer
    const gymId = userData.manager_gym_id

    // Scope by gym first
    if (gymId) q = q.eq('gym_id', gymId)
    else if (userData.role === 'trainer') {
      // Trainer always sees own + full gym schedule
      const { data: tg } = await supabase.from('trainer_gyms').select('gym_id').eq('trainer_id', authUser.id).eq('is_primary', true).single()
      if (tg) q = q.eq('gym_id', tg.gym_id)
    }

    // View filter: mine = own sessions only; all = full gym schedule
    if (viewFilter === 'mine' && (isTrainer || isActingAsTrainer)) {
      q = q.eq('trainer_id', authUser.id)
    }

    const now = new Date().toISOString()
    if (filter === 'upcoming') q = q.gte('scheduled_at', now).in('status', ['scheduled'])
    else if (filter === 'pending_confirm') q = q.eq('status', 'completed').eq('manager_confirmed', false).eq('is_notes_complete', true)
    else if (filter === 'completed') q = q.eq('status', 'completed').eq('manager_confirmed', true)

    const { data } = await q.limit(60)
    setSessions(data || [])
    setLoading(false)
  }

  useEffect(() => { loadSessions() }, [filter, viewFilter, isActingAsTrainer])

  const handleManagerConfirm = async (sessionId: string) => {
    const { data: { user: authUser } } = await supabase.auth.getUser()
    await supabase.from('sessions').update({
      manager_confirmed: true,
      manager_confirmed_by: authUser!.id,
      manager_confirmed_at: new Date().toISOString(),
    }).eq('id', sessionId)
    loadSessions()
  }

  const isManager = user?.role === 'manager' && !isActingAsTrainer
  const isTrainer = user?.role === 'trainer' || isActingAsTrainer

  const statusColors: Record<string, string> = {
    scheduled: 'bg-blue-100 text-blue-700',
    completed: 'bg-green-100 text-green-700',
    cancelled: 'bg-gray-100 text-gray-600',
    no_show: 'bg-red-100 text-red-700',
  }

  if (loading) return <div className="flex items-center justify-center h-48"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-red-600" /></div>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">PT Sessions</h1>
          <p className="text-sm text-gray-500">{sessions.length} sessions</p>
        </div>
        {isTrainer && (
          <Link href="/dashboard/pt/sessions/new" className="btn-primary flex items-center gap-1.5">
            <Plus className="w-4 h-4" /> Schedule Session
          </Link>
        )}
      </div>

      {/* View toggle — trainers can switch between own / all gym */}
      {isTrainer && (
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          <button onClick={() => setViewFilter('mine')} className={cn('flex-1 py-1.5 rounded-md text-xs font-medium transition-colors', viewFilter === 'mine' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600')}>My Sessions</button>
          <button onClick={() => setViewFilter('all')} className={cn('flex-1 py-1.5 rounded-md text-xs font-medium transition-colors', viewFilter === 'all' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600')}>Full Gym Schedule</button>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-1 flex-wrap">
        {[
          { k: 'upcoming', l: 'Upcoming' },
          { k: 'pending_confirm', l: 'Pending Manager Confirm' },
          { k: 'completed', l: 'Completed' },
          { k: 'all', l: 'All' },
        ].map(({ k, l }) => (
          <button key={k} onClick={() => setFilter(k)}
            className={cn('px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap',
              filter === k ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}>
            {l}
          </button>
        ))}
      </div>

      {sessions.length === 0 ? (
        <div className="card p-8 text-center">
          <Calendar className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">No sessions found</p>
          {isTrainer && <Link href="/dashboard/pt/sessions/new" className="btn-primary inline-block mt-3">Schedule first session</Link>}
        </div>
      ) : (
        <div className="space-y-2">
          {sessions.map(session => {
            const needsNotes = session.status === 'completed' && !session.is_notes_complete
            const needsManagerConfirm = session.status === 'completed' && session.is_notes_complete && !session.manager_confirmed
            const isOwnSession = session.trainer_id === user?.id

            return (
              <div key={session.id} className={cn('card p-4 space-y-2', needsManagerConfirm && 'border-amber-200')}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2">
                    <div>
                      <p className="font-medium text-gray-900 text-sm">{(session.member as any)?.full_name || 'Unknown member'}</p>
                      <p className="text-xs text-gray-500">{formatDateTime(session.scheduled_at)}</p>
                      {!isOwnSession && <p className="text-xs text-blue-600">Trainer: {(session.trainer as any)?.full_name}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium capitalize', statusColors[session.status] || 'bg-gray-100 text-gray-600')}>{session.status}</span>
                    {session.manager_confirmed && <span className="text-xs text-green-600 font-medium">✓ Mgr confirmed</span>}
                  </div>
                </div>

                {session.package?.package_name && (
                  <p className="text-xs text-gray-400">{session.package.package_name} · {(session.gym as any)?.name}</p>
                )}

                {session.performance_notes && (
                  <p className="text-xs text-gray-600 bg-gray-50 rounded-lg px-3 py-2">{session.performance_notes}</p>
                )}

                {session.session_commission_sgd > 0 && (
                  <p className="text-xs text-green-600 font-medium">Commission: {formatSGD(session.session_commission_sgd)}</p>
                )}

                {/* Actions */}
                <div className="flex gap-2 pt-1 flex-wrap">
                  {/* Trainer: add/edit notes */}
                  {isOwnSession && session.status === 'completed' && !session.manager_confirmed && (
                    <Link href={`/dashboard/pt/sessions/${session.id}/notes`}
                      className={cn('btn-primary text-xs py-1.5', session.is_notes_complete ? 'btn-secondary' : 'btn-primary')}>
                      {session.is_notes_complete ? 'Edit Notes' : 'Submit Notes ⚠'}
                    </Link>
                  )}
                  {/* Manager: confirm sessions that have notes */}
                  {isManager && needsManagerConfirm && (
                    <button onClick={() => handleManagerConfirm(session.id)} className="btn-primary text-xs py-1.5 flex items-center gap-1">
                      <CheckCircle className="w-3.5 h-3.5" /> Confirm Session
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
