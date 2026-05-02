'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { Gym, User } from '@/types'
import { Upload, Save, Building2, CheckCircle, Plus, ImageIcon } from 'lucide-react'

interface GymWithManager extends Gym { manager?: User }

export default function BusinessOpsGymsPage() {
  const [gyms, setGyms] = useState<GymWithManager[]>([])
  const [managers, setManagers] = useState<User[]>([])
  const [selectedGym, setSelectedGym] = useState<GymWithManager | null>(null)
  const [gymForm, setGymForm] = useState({ name: '', address: '', phone: '', manager_id: '' })
  const [gymLogoFile, setGymLogoFile] = useState<File | null>(null)
  const [gymLogoPreview, setGymLogoPreview] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [newGymName, setNewGymName] = useState('')
  const [commissionForm, setCommissionForm] = useState({ signup_pct: '10', session_pct: '15' })
  const supabase = createClient()

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    const { data: gymData } = await supabase.from('gyms').select('*').order('name')
    const { data: managerData } = await supabase.from('users').select('*')
      .eq('role', 'manager').eq('is_active', true).order('full_name')
    setManagers(managerData || [])
    const enriched = (gymData || []).map(g => ({ ...g, manager: managerData?.find(m => m.manager_gym_id === g.id) }))
    setGyms(enriched)
    if (enriched.length > 0 && !selectedGym) selectGym(enriched[0])
  }

  const selectGym = (gym: GymWithManager) => {
    setSelectedGym(gym)
    setGymForm({ name: gym.name, address: gym.address || '', phone: gym.phone || '', manager_id: gym.manager?.id || '' })
    setGymLogoPreview(gym.logo_url ? gym.logo_url + '?t=' + Date.now() : null)
    setGymLogoFile(null); setSaved(false)
  }

  const uploadLogo = async (file: File, path: string) => {
    await supabase.storage.from('gym-logos').remove([path])
    const { error } = await supabase.storage.from('gym-logos').upload(path, file, { upsert: true, cacheControl: '0' })
    if (error) return null
    const { data } = supabase.storage.from('gym-logos').getPublicUrl(path)
    return data.publicUrl + '?t=' + Date.now()
  }

  const handleSaveGym = async () => {
    if (!selectedGym) return
    setSaving(true)
    let logo_url = selectedGym.logo_url
    if (gymLogoFile) {
      const url = await uploadLogo(gymLogoFile, `${selectedGym.id}/logo`)
      if (url) { logo_url = url.split('?')[0]; setGymLogoPreview(url) }
    }
    await supabase.from('gyms').update({ name: gymForm.name, address: gymForm.address || null, phone: gymForm.phone || null, logo_url }).eq('id', selectedGym.id)
    if (selectedGym.manager && selectedGym.manager.id !== gymForm.manager_id)
      await supabase.from('users').update({ manager_gym_id: null }).eq('id', selectedGym.manager.id)
    if (gymForm.manager_id)
      await supabase.from('users').update({ manager_gym_id: selectedGym.id }).eq('id', gymForm.manager_id)
    await loadData(); setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 3000)
  }

  const handleAddGym = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newGymName.trim()) return
    await supabase.from('gyms').insert({ name: newGymName.trim() })
    setNewGymName(''); setShowAdd(false); loadData()
  }

  const handleSaveCommission = async () => {
    setSaving(true)
    await supabase.from('users').update({
      commission_signup_pct: parseFloat(commissionForm.signup_pct),
      commission_session_pct: parseFloat(commissionForm.session_pct),
    }).eq('role', 'trainer')
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 3000)
  }

  const availableManagers = managers.filter(m => !m.manager_gym_id || m.manager_gym_id === selectedGym?.id)

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Gym Clubs</h1>
        <p className="text-sm text-gray-500">Manage gym locations, logos and manager assignments</p>
      </div>

      <div className="card">
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900 text-sm flex items-center gap-2">
            <Building2 className="w-4 h-4 text-red-600" /> Gym Locations
          </h2>
          <button onClick={() => setShowAdd(!showAdd)} className="btn-primary flex items-center gap-1.5 text-xs py-1.5">
            <Plus className="w-3.5 h-3.5" /> Add Gym
          </button>
        </div>

        {showAdd && (
          <form onSubmit={handleAddGym} className="p-4 border-b border-gray-100 bg-red-50 flex gap-2">
            <input className="input flex-1" placeholder="New gym name..." value={newGymName}
              onChange={e => setNewGymName(e.target.value)} required />
            <button type="submit" className="btn-primary">Add</button>
            <button type="button" onClick={() => setShowAdd(false)} className="btn-secondary">Cancel</button>
          </form>
        )}

        <div className="p-3 flex gap-2 flex-wrap border-b border-gray-100">
          {gyms.map(g => (
            <button key={g.id} onClick={() => selectGym(g)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${selectedGym?.id === g.id ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'} ${!g.is_active ? 'opacity-50' : ''}`}>
              {g.name}{!g.is_active ? ' (Inactive)' : ''}
            </button>
          ))}
        </div>

        {selectedGym && (
          <div className="p-4 space-y-4">
            {/* Logo */}
            <div className="space-y-2">
              <label className="label">Gym Club Logo</label>
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 rounded-xl border-2 border-dashed border-gray-200 flex items-center justify-center overflow-hidden bg-gray-50 flex-shrink-0">
                  {gymLogoPreview ? <img src={gymLogoPreview} alt="logo" className="w-full h-full object-contain p-1" /> : <ImageIcon className="w-8 h-8 text-gray-300" />}
                </div>
                <label className="btn-secondary cursor-pointer flex items-center gap-2 text-xs">
                  <Upload className="w-3.5 h-3.5" /> Upload Logo
                  <input type="file" accept="image/*" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) { setGymLogoFile(f); setGymLogoPreview(URL.createObjectURL(f)) } }} />
                </label>
              </div>
            </div>
            <div>
              <label className="label">Gym Name *</label>
              <input className="input" required value={gymForm.name} onChange={e => setGymForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label className="label">Address</label>
              <input className="input" value={gymForm.address} onChange={e => setGymForm(f => ({ ...f, address: e.target.value }))} placeholder="e.g. 391 Orchard Road, Singapore" />
            </div>
            <div>
              <label className="label">Phone</label>
              <input className="input" value={gymForm.phone} onChange={e => setGymForm(f => ({ ...f, phone: e.target.value }))} placeholder="+65 6123 4567" />
            </div>
            <div>
              <label className="label">Assigned Manager</label>
              <select className="input" value={gymForm.manager_id} onChange={e => setGymForm(f => ({ ...f, manager_id: e.target.value }))}>
                <option value="">— No manager assigned —</option>
                {availableManagers.map(m => <option key={m.id} value={m.id}>{m.full_name} ({m.email})</option>)}
              </select>
              {selectedGym.manager && <p className="text-xs text-green-600 mt-1">Currently: {selectedGym.manager.full_name}</p>}
            </div>
            <button onClick={handleSaveGym} disabled={saving} className="btn-primary flex items-center gap-2">
              {saved ? <><CheckCircle className="w-4 h-4" /> Saved!</> : <><Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save Gym Settings'}</>}
            </button>
          </div>
        )}
      </div>

      {/* Commission rates */}
      <div className="card p-4 space-y-4">
        <h2 className="font-semibold text-gray-900 text-sm">Default Trainer Commission Rates</h2>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Sign-up Commission %</label>
            <input className="input" type="number" min="0" max="100" step="0.5"
              value={commissionForm.signup_pct} onChange={e => setCommissionForm(f => ({ ...f, signup_pct: e.target.value }))} />
          </div>
          <div>
            <label className="label">Per-Session Commission %</label>
            <input className="input" type="number" min="0" max="100" step="0.5"
              value={commissionForm.session_pct} onChange={e => setCommissionForm(f => ({ ...f, session_pct: e.target.value }))} />
          </div>
        </div>
        <button onClick={handleSaveCommission} disabled={saving} className="btn-primary flex items-center gap-2">
          {saved ? <><CheckCircle className="w-4 h-4" /> Saved!</> : <><Save className="w-4 h-4" /> Save Commission Rates</>}
        </button>
      </div>
    </div>
  )
}
