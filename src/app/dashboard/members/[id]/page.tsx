'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { useViewMode } from '@/lib/view-mode-context'
import { formatDate, formatSGD } from '@/lib/utils'
import { ArrowLeft, Phone, Heart, CreditCard, Package, Calendar, Plus, CheckCircle, XCircle, Clock, Edit2, Save, X } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

export default function MemberProfilePage() {
  const { id } = useParams()
  const [member, setMember] = useState<any>(null)
  const [memberships, setMemberships] = useState<any[]>([])
  const [ptPackages, setPtPackages] = useState<any[]>([])
  const [packageTemplates, setPackageTemplates] = useState<any[]>([])
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [showEditForm, setShowEditForm] = useState(false)
  const [showPkgForm, setShowPkgForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editForm, setEditForm] = useState<any>({})
  const [pkgForm, setPkgForm] = useState({ template_id: '', total_price_sgd: '', start_date: new Date().toISOString().split('T')[0], validity_days: '180' })
  const supabase = createClient()
  const { isActingAsTrainer } = useViewMode()

  const load = async () => {
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) return
    const { data: userData } = await supabase.from('users').select('*').eq('id', authUser.id).single()
    setCurrentUser(userData)

    const { data: m } = await supabase.from('members').select('*, gym:gyms(name)').eq('id', id).single()
    setMember(m)
    if (m) setEditForm({ full_name: m.full_name, phone: m.phone, email: m.email || '', date_of_birth: m.date_of_birth || '', gender: m.gender || '', health_notes: m.health_notes || '', membership_number: m.membership_number || '' })

    const { data: mems } = await supabase.from('gym_memberships')
      .select('*, sold_by:users!gym_memberships_sold_by_user_id_fkey(full_name), confirmed_by_user:users!gym_memberships_confirmed_by_fkey(full_name)')
      .eq('member_id', id).order('created_at', { ascending: false })
    setMemberships(mems || [])

    const { data: pkgs } = await supabase.from('packages')
      .select('*, trainer:users!packages_trainer_id_fkey(full_name), selling_trainer:users!packages_selling_trainer_id_fkey(full_name)')
      .eq('member_id', id).order('created_at', { ascending: false })
    setPtPackages(pkgs || [])

    const { data: templates } = await supabase.from('package_templates').select('*').eq('is_archived', false)
    setPackageTemplates(templates || [])
  }

  useEffect(() => { load() }, [id])

  const handleSaveMember = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true)
    await supabase.from('members').update({
      full_name: editForm.full_name, phone: editForm.phone,
      email: editForm.email || null, date_of_birth: editForm.date_of_birth || null,
      gender: editForm.gender || null, health_notes: editForm.health_notes || null,
      membership_number: editForm.membership_number || null,
    }).eq('id', id as string)
    await load(); setSaving(false); setShowEditForm(false)
  }

  const handleConfirmSale = async (membershipId: string) => {
    const { data: { user: authUser } } = await supabase.auth.getUser()
    await supabase.from('gym_memberships').update({
      sale_status: 'confirmed', status: 'active',
      confirmed_by: authUser!.id, confirmed_at: new Date().toISOString(),
    }).eq('id', membershipId)
    await load()
  }

  const handleRejectSale = async (membershipId: string) => {
    const reason = prompt('Reason for rejection:')
    if (!reason) return
    await supabase.from('gym_memberships').update({ sale_status: 'rejected', rejection_reason: reason }).eq('id', membershipId)
    await load()
  }

  const handleSellPtPackage = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true)
    const { data: { user: authUser } } = await supabase.auth.getUser()
    const template = packageTemplates.find(t => t.id === pkgForm.template_id)
    if (!template) return

    const endDate = new Date(pkgForm.start_date)
    endDate.setDate(endDate.getDate() + parseInt(pkgForm.validity_days))

    await supabase.from('packages').insert({
      template_id: template.id, member_id: id,
      client_id: id, // legacy field
      trainer_id: authUser!.id,
      selling_trainer_id: authUser!.id,
      gym_id: member.gym_id,
      package_name: template.name,
      total_sessions: template.total_sessions,
      total_price_sgd: parseFloat(pkgForm.total_price_sgd),
      start_date: pkgForm.start_date,
      end_date_calculated: endDate.toISOString().split('T')[0],
      signup_commission_pct: currentUser?.commission_signup_pct || 10,
      session_commission_pct: currentUser?.commission_session_pct || 15,
    })

    await load(); setSaving(false); setShowPkgForm(false)
    setPkgForm({ template_id: '', total_price_sgd: '', start_date: new Date().toISOString().split('T')[0], validity_days: '180' })
  }

  const activeMembership = memberships.find(m => m.status === 'active' && m.sale_status === 'confirmed')
  const canManage = currentUser?.role === 'manager' || currentUser?.role === 'business_ops'
  const canSellPT = (isActingAsTrainer || currentUser?.role === 'trainer') && !!activeMembership

  if (!member) return <div className="flex items-center justify-center h-48"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-red-600" /></div>

  return (
    <div className="space-y-4 max-w-2xl mx-auto">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/members" className="p-2 hover:bg-gray-100 rounded-lg"><ArrowLeft className="w-4 h-4 text-gray-600" /></Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-900">{member.full_name}</h1>
          <p className="text-xs text-gray-500">{member.gym?.name}{member.membership_number && ` · #${member.membership_number}`}</p>
        </div>
        {canManage && <button onClick={() => setShowEditForm(!showEditForm)} className="btn-secondary flex items-center gap-1.5 text-xs py-1.5"><Edit2 className="w-3.5 h-3.5" /> Edit</button>}
      </div>

      {/* Edit form */}
      {showEditForm && (
        <form onSubmit={handleSaveMember} className="card p-4 space-y-3 border-red-200">
          <div className="flex items-center justify-between"><h2 className="font-semibold text-sm">Edit Member</h2><button type="button" onClick={() => setShowEditForm(false)}><X className="w-4 h-4 text-gray-400" /></button></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Full Name *</label><input className="input" required value={editForm.full_name} onChange={e => setEditForm((f: any) => ({ ...f, full_name: e.target.value }))} /></div>
            <div><label className="label">Phone *</label><input className="input" required type="tel" value={editForm.phone} onChange={e => setEditForm((f: any) => ({ ...f, phone: e.target.value }))} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Membership Card No</label><input className="input" value={editForm.membership_number} onChange={e => setEditForm((f: any) => ({ ...f, membership_number: e.target.value }))} /></div>
            <div><label className="label">Date of Birth</label><input className="input" type="date" value={editForm.date_of_birth} onChange={e => setEditForm((f: any) => ({ ...f, date_of_birth: e.target.value }))} /></div>
          </div>
          <div><label className="label">Health Notes</label><textarea className="input min-h-[60px] resize-none" value={editForm.health_notes} onChange={e => setEditForm((f: any) => ({ ...f, health_notes: e.target.value }))} /></div>
          <div className="flex gap-2"><button type="submit" disabled={saving} className="btn-primary flex-1 flex items-center justify-center gap-2"><Save className="w-4 h-4" />{saving ? 'Saving...' : 'Save'}</button><button type="button" onClick={() => setShowEditForm(false)} className="btn-secondary">Cancel</button></div>
        </form>
      )}

      {/* Contact & Health */}
      <div className="card p-4 space-y-3">
        <h2 className="font-semibold text-gray-900 text-sm">Contact & Health</h2>
        <div className="space-y-2">
          <div className="flex items-center gap-2"><Phone className="w-4 h-4 text-gray-400" /><a href={`tel:${member.phone}`} className="text-sm text-gray-700 hover:text-red-600">{member.phone}</a></div>
          {member.email && <p className="text-sm text-gray-500">{member.email}</p>}
          {member.date_of_birth && <p className="text-xs text-gray-400">DOB: {formatDate(member.date_of_birth)}</p>}
          {member.health_notes && (
            <div className="flex items-start gap-2">
              <Heart className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
              <p className="text-xs bg-red-50 text-red-700 rounded-lg px-3 py-2 flex-1">{member.health_notes}</p>
            </div>
          )}
        </div>
      </div>

      {/* Gym Memberships */}
      <div className="card">
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900 text-sm flex items-center gap-2"><CreditCard className="w-4 h-4 text-red-600" /> Gym Membership</h2>
          <Link href={`/dashboard/members/new?member_id=${id}`} className="btn-primary text-xs py-1.5">+ Renew / Sell</Link>
        </div>
        {memberships.length === 0 ? (
          <p className="p-4 text-sm text-gray-400 text-center">No membership records</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {memberships.map(m => (
              <div key={m.id} className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-gray-900 text-sm">{m.membership_type_name}</p>
                      <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium',
                        m.sale_status === 'confirmed' && m.status === 'active' ? 'bg-green-100 text-green-700' :
                        m.sale_status === 'pending' ? 'badge-pending' :
                        m.sale_status === 'rejected' ? 'badge-danger' : 'badge-inactive')}>
                        {m.sale_status === 'confirmed' ? m.status : m.sale_status}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500">{formatDate(m.start_date)} — {formatDate(m.end_date)} · {formatSGD(m.price_sgd)}</p>
                    <p className="text-xs text-gray-400">Sold by: {m.sold_by?.full_name}</p>
                    {m.rejection_reason && <p className="text-xs text-red-500">Rejected: {m.rejection_reason}</p>}
                  </div>
                  {canManage && m.sale_status === 'pending' && (
                    <div className="flex gap-1">
                      <button onClick={() => handleConfirmSale(m.id)} className="btn-primary text-xs py-1 px-2 flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Confirm</button>
                      <button onClick={() => handleRejectSale(m.id)} className="btn-secondary text-xs py-1 px-2"><XCircle className="w-3 h-3" /></button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* PT Packages */}
      <div className="card">
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900 text-sm flex items-center gap-2"><Package className="w-4 h-4 text-red-600" /> PT Packages</h2>
          {canSellPT && <button onClick={() => setShowPkgForm(!showPkgForm)} className="btn-primary text-xs py-1.5"><Plus className="w-3.5 h-3.5" /> Sell PT Package</button>}
          {!activeMembership && (isActingAsTrainer || currentUser?.role === 'trainer') && (
            <p className="text-xs text-amber-600">Active membership required to sell PT</p>
          )}
        </div>

        {showPkgForm && (
          <form onSubmit={handleSellPtPackage} className="p-4 border-b border-gray-100 bg-red-50 space-y-3">
            <p className="text-sm font-medium text-gray-900">Sell PT Package</p>
            <select className="input" required value={pkgForm.template_id}
              onChange={e => { const t = packageTemplates.find(x => x.id === e.target.value); setPkgForm(f => ({ ...f, template_id: e.target.value, total_price_sgd: t?.default_price_sgd.toString() || '' })) }}>
              <option value="">Select package...</option>
              {packageTemplates.map(t => <option key={t.id} value={t.id}>{t.name} ({t.total_sessions} sessions)</option>)}
            </select>
            <div className="grid grid-cols-3 gap-2">
              <div><label className="label">Price (SGD)</label><input className="input" type="number" step="0.01" required value={pkgForm.total_price_sgd} onChange={e => setPkgForm(f => ({ ...f, total_price_sgd: e.target.value }))} /></div>
              <div><label className="label">Start Date</label><input className="input" type="date" required value={pkgForm.start_date} onChange={e => setPkgForm(f => ({ ...f, start_date: e.target.value }))} /></div>
              <div><label className="label">Valid for (days)</label><input className="input" type="number" required value={pkgForm.validity_days} onChange={e => setPkgForm(f => ({ ...f, validity_days: e.target.value }))} /></div>
            </div>
            <div className="flex gap-2"><button type="submit" disabled={saving} className="btn-primary flex-1">{saving ? 'Saving...' : 'Sell Package'}</button><button type="button" onClick={() => setShowPkgForm(false)} className="btn-secondary">Cancel</button></div>
          </form>
        )}

        {ptPackages.length === 0 ? (
          <p className="p-4 text-sm text-gray-400 text-center">No PT packages</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {ptPackages.map(pkg => {
              const pct = Math.round(pkg.sessions_used / pkg.total_sessions * 100)
              return (
                <div key={pkg.id} className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="font-medium text-gray-900 text-sm">{pkg.package_name}</p>
                      <p className="text-xs text-gray-500">Trainer: {pkg.trainer?.full_name}</p>
                      {pkg.selling_trainer?.full_name !== pkg.trainer?.full_name && <p className="text-xs text-gray-400">Sold by: {pkg.selling_trainer?.full_name}</p>}
                    </div>
                    <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', pkg.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600')}>{pkg.status}</span>
                  </div>
                  <div className="text-xs text-gray-500 mb-2">
                    {pkg.sessions_used}/{pkg.total_sessions} sessions · {formatSGD(pkg.price_per_session_sgd)}/session · {formatSGD(pkg.total_price_sgd)} total
                    {pkg.end_date_calculated && ` · Expires ${formatDate(pkg.end_date_calculated)}`}
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-red-500 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                  <p className="text-xs text-gray-400 mt-1">{pkg.total_sessions - pkg.sessions_used} sessions remaining</p>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
