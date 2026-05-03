'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { formatDate, formatSGD } from '@/lib/utils'
import {
  Plus, CheckCircle, AlertCircle, X, Clock,
  XCircle, Search, User, CreditCard
} from 'lucide-react'
import { cn } from '@/lib/utils'

const MEMBERSHIP_TYPES = ['Monthly', 'Quarterly', '6-Month', 'Annual', 'Student', 'Senior', 'Corporate', 'Trial']

const statusConfig = {
  pending: { label: 'Pending Review', badge: 'badge-pending', icon: Clock },
  confirmed: { label: 'Confirmed', badge: 'badge-active', icon: CheckCircle },
  rejected: { label: 'Rejected', badge: 'badge-danger', icon: XCircle },
}

export default function MembershipSalesPage() {
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [sales, setSales] = useState<any[]>([])
  const [gyms, setGyms] = useState<any[]>([])
  const [config, setConfig] = useState<any>({})
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [rejectId, setRejectId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  const [form, setForm] = useState({
    gym_id: '', member_name: '', member_phone: '', member_email: '',
    membership_number: '', date_of_joining: new Date().toISOString().split('T')[0],
    membership_type: 'Monthly', membership_price_sgd: '', notes: '',
  })
  const supabase = createClient()

  const showMsg = (msg: string) => { setSuccess(msg); setTimeout(() => setSuccess(''), 3000) }

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) return
    const { data: userData } = await supabase.from('users').select('*').eq('id', authUser.id).single()
    setCurrentUser(userData)

    const { data: gymsData } = await supabase.from('gyms').select('*').eq('is_active', true).order('name')
    setGyms(gymsData || [])

    // Get commission config
    const { data: cfgData } = await supabase.from('commission_config').select('*')
    const cfg: any = {}
    cfgData?.forEach((c: any) => { cfg[c.config_key] = c.config_value })
    setConfig(cfg)

    // Load sales — scope by role
    let salesQ = supabase.from('membership_sales')
      .select('*, sold_by:users!membership_sales_sold_by_user_id_fkey(full_name), gym:gyms(name)')
      .order('created_at', { ascending: false })

    if (userData?.role === 'trainer' || (userData?.role === 'manager' && userData?.is_also_trainer)) {
      // Trainers/manager-trainers see own sales only
      salesQ = salesQ.eq('sold_by_user_id', authUser.id)
    } else if (userData?.role === 'manager' && userData?.manager_gym_id) {
      salesQ = salesQ.eq('gym_id', userData.manager_gym_id)
    }
    // business_ops sees all

    const { data: salesData } = await salesQ
    setSales(salesData || [])

    // Auto-set gym for manager
    if (userData?.role === 'manager' && userData?.manager_gym_id) {
      setForm(f => ({ ...f, gym_id: userData.manager_gym_id }))
    } else if (gymsData?.length === 1) {
      setForm(f => ({ ...f, gym_id: gymsData[0].id }))
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true); setError('')
    const { data: { user: authUser } } = await supabase.auth.getUser()

    const commissionPct = config['membership_commission_pct'] || 5
    const { error: err } = await supabase.from('membership_sales').insert({
      gym_id: form.gym_id,
      sold_by_user_id: authUser!.id,
      member_name: form.member_name,
      member_phone: form.member_phone,
      member_email: form.member_email || null,
      membership_number: form.membership_number || null,
      date_of_joining: form.date_of_joining,
      membership_type: form.membership_type,
      membership_price_sgd: parseFloat(form.membership_price_sgd),
      commission_pct: commissionPct,
      notes: form.notes || null,
      status: 'pending',
    })

    if (err) { setError(err.message); setSaving(false); return }
    await loadData()
    setShowForm(false)
    setForm({ gym_id: currentUser?.manager_gym_id || '', member_name: '', member_phone: '', member_email: '', membership_number: '', date_of_joining: new Date().toISOString().split('T')[0], membership_type: 'Monthly', membership_price_sgd: '', notes: '' })
    setSaving(false)
    showMsg('Membership sale submitted — pending manager review')
  }

  const handleConfirm = async (saleId: string) => {
    const { data: { user: authUser } } = await supabase.auth.getUser()
    await supabase.from('membership_sales').update({
      status: 'confirmed',
      confirmed_by: authUser!.id,
      confirmed_at: new Date().toISOString(),
    }).eq('id', saleId)
    await loadData()
    showMsg('Sale confirmed — commission will be included in next payout')
  }

  const handleReject = async () => {
    if (!rejectId || !rejectReason.trim()) return
    await supabase.from('membership_sales').update({
      status: 'rejected', rejection_reason: rejectReason,
    }).eq('id', rejectId)
    setRejectId(null); setRejectReason('')
    await loadData()
    showMsg('Sale rejected')
  }

  const canConfirm = currentUser?.role === 'manager' || currentUser?.role === 'business_ops'

  const filtered = sales.filter(s => {
    const matchSearch = s.member_name?.toLowerCase().includes(search.toLowerCase()) ||
      s.member_phone?.includes(search) || s.membership_number?.includes(search)
    const matchStatus = filterStatus === 'all' || s.status === filterStatus
    return matchSearch && matchStatus
  })

  const pendingCount = sales.filter(s => s.status === 'pending').length
  const confirmedTotal = sales.filter(s => s.status === 'confirmed')
    .reduce((sum, s) => sum + s.commission_sgd, 0)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Membership Sales</h1>
          <p className="text-sm text-gray-500">Log and confirm gym membership sales</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary flex items-center gap-1.5">
          <Plus className="w-4 h-4" /> Log Sale
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="stat-card">
          <p className="text-xs text-gray-500 mb-1">Total Sales</p>
          <p className="text-2xl font-bold text-gray-900">{sales.length}</p>
        </div>
        <div className="stat-card">
          <p className="text-xs text-gray-500 mb-1">Pending Review</p>
          <p className="text-2xl font-bold text-amber-600">{pendingCount}</p>
        </div>
        <div className="stat-card">
          <p className="text-xs text-gray-500 mb-1">Confirmed Commission</p>
          <p className="text-xl font-bold text-green-700">{formatSGD(confirmedTotal)}</p>
        </div>
      </div>

      {success && <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700"><CheckCircle className="w-4 h-4 flex-shrink-0" />{success}</div>}
      {error && <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600"><AlertCircle className="w-4 h-4 flex-shrink-0" />{error}<button onClick={() => setError('')} className="ml-auto"><X className="w-4 h-4" /></button></div>}

      {/* Reject modal */}
      {rejectId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full space-y-4">
            <h3 className="font-bold text-gray-900">Reject Sale</h3>
            <div>
              <label className="label">Reason for rejection *</label>
              <textarea className="input min-h-[80px]" value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                placeholder="e.g. Duplicate entry, incorrect price..." />
            </div>
            <div className="flex gap-2">
              <button onClick={handleReject} disabled={!rejectReason.trim()} className="btn-danger flex-1">Reject Sale</button>
              <button onClick={() => { setRejectId(null); setRejectReason('') }} className="btn-secondary">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Log sale form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="card p-4 space-y-4 border-red-200">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-900 text-sm">Log New Membership Sale</h2>
            <button type="button" onClick={() => setShowForm(false)}><X className="w-4 h-4 text-gray-400" /></button>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700">
            Commission rate: <strong>{config['membership_commission_pct'] || 5}%</strong> — set by Business Ops.
            Sale must be confirmed by your manager to qualify for payout.
          </div>

          {gyms.length > 1 && (
            <div>
              <label className="label">Gym *</label>
              <select className="input" required value={form.gym_id} onChange={e => setForm(f => ({ ...f, gym_id: e.target.value }))}>
                <option value="">Select gym...</option>
                {gyms.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Member Name *</label>
              <input className="input" required value={form.member_name} onChange={e => setForm(f => ({ ...f, member_name: e.target.value }))} placeholder="Full legal name" />
            </div>
            <div>
              <label className="label">Member Phone *</label>
              <input className="input" required type="tel" value={form.member_phone} onChange={e => setForm(f => ({ ...f, member_phone: e.target.value }))} placeholder="+65 9123 4567" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Membership Number</label>
              <input className="input" value={form.membership_number} onChange={e => setForm(f => ({ ...f, membership_number: e.target.value }))} placeholder="e.g. GYM-2024-0001" />
            </div>
            <div>
              <label className="label">Date of Joining *</label>
              <input className="input" type="date" required value={form.date_of_joining} onChange={e => setForm(f => ({ ...f, date_of_joining: e.target.value }))} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Membership Type *</label>
              <select className="input" required value={form.membership_type} onChange={e => setForm(f => ({ ...f, membership_type: e.target.value }))}>
                {MEMBERSHIP_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Membership Price (SGD) *</label>
              <input className="input" required type="number" min="0" step="0.01" value={form.membership_price_sgd}
                onChange={e => setForm(f => ({ ...f, membership_price_sgd: e.target.value }))} placeholder="e.g. 120" />
              {form.membership_price_sgd && (
                <p className="text-xs text-green-600 mt-1">
                  Your commission: {formatSGD(parseFloat(form.membership_price_sgd) * (config['membership_commission_pct'] || 5) / 100)}
                </p>
              )}
            </div>
          </div>

          <div>
            <label className="label">Member Email</label>
            <input className="input" type="email" value={form.member_email} onChange={e => setForm(f => ({ ...f, member_email: e.target.value }))} />
          </div>
          <div>
            <label className="label">Notes</label>
            <input className="input" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>

          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="btn-primary flex-1 disabled:opacity-50">
              {saving ? 'Submitting...' : 'Submit for Manager Review'}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
          </div>
        </form>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input className="input pl-9" placeholder="Search by name, phone or membership no..."
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-1">
          {['all', 'pending', 'confirmed', 'rejected'].map(s => (
            <button key={s} onClick={() => setFilterStatus(s)}
              className={cn('px-3 py-2 rounded-lg text-xs font-medium capitalize transition-colors',
                filterStatus === s ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Sales list */}
      {filtered.length === 0 ? (
        <div className="card p-8 text-center">
          <CreditCard className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">No membership sales found</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(sale => {
            const statusCfg = statusConfig[sale.status as keyof typeof statusConfig] || statusConfig.pending
            const StatusIcon = statusCfg.icon
            return (
              <div key={sale.id} className="card p-4">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <User className="w-4 h-4 text-red-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-gray-900 text-sm">{sale.member_name}</p>
                      <span className={statusCfg.badge}>{statusCfg.label}</span>
                    </div>
                    <p className="text-xs text-gray-500">{sale.member_phone}{sale.membership_number && ` · #${sale.membership_number}`}</p>
                    <div className="flex items-center gap-3 mt-1 flex-wrap text-xs text-gray-500">
                      <span>{sale.membership_type} · {formatSGD(sale.membership_price_sgd)}</span>
                      <span>Commission: <strong className="text-green-700">{formatSGD(sale.commission_sgd)}</strong></span>
                      <span>Joined: {formatDate(sale.date_of_joining)}</span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Sold by: {sale.sold_by?.full_name} · {sale.gym?.name}
                    </p>
                    {sale.rejection_reason && (
                      <p className="text-xs text-red-500 mt-1">Reason: {sale.rejection_reason}</p>
                    )}
                  </div>
                  {canConfirm && sale.status === 'pending' && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={() => handleConfirm(sale.id)}
                        className="btn-primary text-xs py-1.5 flex items-center gap-1">
                        <CheckCircle className="w-3.5 h-3.5" /> Confirm
                      </button>
                      <button onClick={() => setRejectId(sale.id)}
                        className="btn-secondary text-xs py-1.5 flex items-center gap-1">
                        <XCircle className="w-3.5 h-3.5" /> Reject
                      </button>
                    </div>
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
