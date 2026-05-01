'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { Gym, User } from '@/types'
import { Upload, Save, Building2, CheckCircle, Plus, Trash2, Edit2 } from 'lucide-react'

interface GymWithManager extends Gym {
  manager?: User
}

export default function SettingsPage() {
  const [gyms, setGyms] = useState<GymWithManager[]>([])
  const [managers, setManagers] = useState<User[]>([])
  const [selectedGym, setSelectedGym] = useState<GymWithManager | null>(null)
  const [form, setForm] = useState({
    name: '', address: '', phone: '', manager_id: '',
  })
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newGymName, setNewGymName] = useState('')
  const [commissionForm, setCommissionForm] = useState({
    signup_pct: '10', session_pct: '15',
  })
  const supabase = createClient()

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    // Load gyms with their assigned manager
    const { data: gymData } = await supabase
      .from('gyms')
      .select('*')
      .order('name')
    
    // Load all manager accounts
    const { data: managerData } = await supabase
      .from('users')
      .select('*')
      .eq('role', 'manager')
      .eq('is_active', true)
      .order('full_name')
    
    setManagers(managerData || [])

    // Enrich gyms with their manager info
    const enriched = (gymData || []).map(gym => {
      const mgr = managerData?.find(m => m.manager_gym_id === gym.id)
      return { ...gym, manager: mgr }
    })
    setGyms(enriched)

    if (enriched.length > 0 && !selectedGym) {
      selectGym(enriched[0])
    }
  }

  const selectGym = (gym: GymWithManager) => {
    setSelectedGym(gym)
    setForm({
      name: gym.name,
      address: gym.address || '',
      phone: gym.phone || '',
      manager_id: gym.manager?.id || '',
    })
    setLogoPreview(gym.logo_url || null)
    setLogoFile(null)
    setSaved(false)
  }

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setLogoFile(file)
    setLogoPreview(URL.createObjectURL(file))
  }

  const handleSave = async () => {
    if (!selectedGym) return
    setSaving(true)
    setSaved(false)

    let logo_url = selectedGym.logo_url

    // Upload logo if changed
    if (logoFile) {
      setUploading(true)
      const ext = logoFile.name.split('.').pop()
      const path = `${selectedGym.id}/logo.${ext}`
      const { error: uploadError } = await supabase.storage
        .from('gym-logos')
        .upload(path, logoFile, { upsert: true })
      if (!uploadError) {
        const { data: urlData } = supabase.storage
          .from('gym-logos').getPublicUrl(path)
        logo_url = urlData.publicUrl
      }
      setUploading(false)
    }

    // Update gym details
    await supabase.from('gyms').update({
      name: form.name,
      address: form.address || null,
      phone: form.phone || null,
      logo_url,
    }).eq('id', selectedGym.id)

    // Update manager assignment:
    // 1. Remove current manager's gym assignment if changing
    if (selectedGym.manager && selectedGym.manager.id !== form.manager_id) {
      await supabase.from('users')
        .update({ manager_gym_id: null })
        .eq('id', selectedGym.manager.id)
    }

    // 2. Assign new manager to this gym
    if (form.manager_id) {
      await supabase.from('users')
        .update({ manager_gym_id: selectedGym.id })
        .eq('id', form.manager_id)
    }

    await loadData()
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  const handleAddGym = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newGymName.trim()) return
    await supabase.from('gyms').insert({ name: newGymName.trim() })
    setNewGymName('')
    setShowAddForm(false)
    loadData()
  }

  const handleToggleActive = async (gym: GymWithManager) => {
    await supabase.from('gyms')
      .update({ is_active: !gym.is_active })
      .eq('id', gym.id)
    loadData()
  }

  const handleSaveCommission = async () => {
    setSaving(true)
    await supabase.from('users').update({
      commission_signup_pct: parseFloat(commissionForm.signup_pct),
      commission_session_pct: parseFloat(commissionForm.session_pct),
    }).eq('role', 'trainer')
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  const set = (field: string) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => setForm(f => ({ ...f, [field]: e.target.value }))

  // Find managers not yet assigned (or assigned to this gym)
  const availableManagers = managers.filter(m =>
    !m.manager_gym_id || m.manager_gym_id === selectedGym?.id
  )

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500">Manage gym clubs, logos and commission rates</p>
      </div>

      {/* Gym List */}
      <div className="card">
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900 text-sm flex items-center gap-2">
            <Building2 className="w-4 h-4 text-green-600" /> Gym Clubs
          </h2>
          <button onClick={() => setShowAddForm(!showAddForm)} className="btn-primary flex items-center gap-1.5 text-xs py-1.5">
            <Plus className="w-3.5 h-3.5" /> Add Gym
          </button>
        </div>

        {showAddForm && (
          <form onSubmit={handleAddGym} className="p-4 border-b border-gray-100 bg-green-50 flex gap-2">
            <input
              className="input flex-1"
              placeholder="New gym name..."
              value={newGymName}
              onChange={e => setNewGymName(e.target.value)}
              required
            />
            <button type="submit" className="btn-primary">Add</button>
            <button type="button" onClick={() => setShowAddForm(false)} className="btn-secondary">Cancel</button>
          </form>
        )}

        {/* Gym selector tabs */}
        <div className="p-3 flex gap-2 flex-wrap border-b border-gray-100">
          {gyms.map(g => (
            <button key={g.id} onClick={() => selectGym(g)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                selectedGym?.id === g.id
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              } ${!g.is_active ? 'opacity-50' : ''}`}>
              {g.name}
              {!g.is_active && ' (Inactive)'}
            </button>
          ))}
        </div>

        {/* Gym details form */}
        {selectedGym && (
          <div className="p-4 space-y-4">
            {/* Logo */}
            <div>
              <label className="label">Gym Logo</label>
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 rounded-xl border-2 border-dashed border-gray-200 flex items-center justify-center overflow-hidden bg-gray-50 flex-shrink-0">
                  {logoPreview
                    ? <img src={logoPreview} alt="Logo" className="w-full h-full object-contain p-1" />
                    : <Building2 className="w-8 h-8 text-gray-300" />
                  }
                </div>
                <div>
                  <label className="btn-secondary cursor-pointer flex items-center gap-2 text-xs">
                    <Upload className="w-3.5 h-3.5" />
                    {uploading ? 'Uploading...' : 'Upload Logo'}
                    <input type="file" accept="image/*" className="hidden" onChange={handleLogoChange} />
                  </label>
                  <p className="text-xs text-gray-400 mt-1">PNG, JPG or SVG. Max 2MB.</p>
                </div>
              </div>
            </div>

            {/* Gym Name */}
            <div>
              <label className="label">Gym Name *</label>
              <input className="input" required value={form.name} onChange={set('name')} placeholder="e.g. FitZone Orchard" />
            </div>

            {/* Address */}
            <div>
              <label className="label">Address</label>
              <input className="input" value={form.address} onChange={set('address')} placeholder="e.g. 391 Orchard Road, #B1-01, Singapore 238872" />
            </div>

            {/* Phone */}
            <div>
              <label className="label">Phone</label>
              <input className="input" value={form.phone} onChange={set('phone')} placeholder="+65 6123 4567" />
            </div>

            {/* Manager Assignment */}
            <div>
              <label className="label">Assigned Manager</label>
              <select className="input" value={form.manager_id} onChange={set('manager_id')}>
                <option value="">— No manager assigned —</option>
                {availableManagers.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.full_name} ({m.email})
                  </option>
                ))}
              </select>
              {managers.length === 0 && (
                <p className="text-xs text-amber-600 mt-1">
                  ⚠ No manager accounts found. Create a manager account under Staff Management first.
                </p>
              )}
              {selectedGym.manager && (
                <p className="text-xs text-green-600 mt-1">
                  Currently assigned: {selectedGym.manager.full_name}
                </p>
              )}
            </div>

            <div className="flex gap-2 pt-2">
              <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-2 flex-1">
                {saved
                  ? <><CheckCircle className="w-4 h-4" /> Saved!</>
                  : <><Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save Gym Settings'}</>
                }
              </button>
              <button
                onClick={() => handleToggleActive(selectedGym)}
                className="btn-secondary text-xs"
              >
                {selectedGym.is_active ? 'Deactivate' : 'Activate'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Commission Rates */}
      <div className="card p-4 space-y-4">
        <h2 className="font-semibold text-gray-900 text-sm">Default Commission Rates</h2>
        <p className="text-xs text-gray-500">
          These rates apply to all trainers. Individual rates can be overridden in Staff Management.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Sign-up Commission %</label>
            <input className="input" type="number" min="0" max="100" step="0.5"
              value={commissionForm.signup_pct}
              onChange={e => setCommissionForm(f => ({ ...f, signup_pct: e.target.value }))} />
            <p className="text-xs text-gray-400 mt-1">% of total package price</p>
          </div>
          <div>
            <label className="label">Per-Session Commission %</label>
            <input className="input" type="number" min="0" max="100" step="0.5"
              value={commissionForm.session_pct}
              onChange={e => setCommissionForm(f => ({ ...f, session_pct: e.target.value }))} />
            <p className="text-xs text-gray-400 mt-1">% of session price</p>
          </div>
        </div>
        <button onClick={handleSaveCommission} disabled={saving} className="btn-primary flex items-center gap-2">
          {saved
            ? <><CheckCircle className="w-4 h-4" /> Saved!</>
            : <><Save className="w-4 h-4" /> Save Commission Rates</>
          }
        </button>
      </div>
    </div>
  )
}
