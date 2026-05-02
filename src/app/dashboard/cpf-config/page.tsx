'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { formatDate } from '@/lib/utils'
import { Calculator, Plus, CheckCircle, AlertCircle, Info } from 'lucide-react'

interface CpfRate {
  id: string
  effective_from: string
  employee_rate: number
  employer_rate: number
  notes: string | null
  created_at: string
}

export default function CpfConfigPage() {
  const [rates, setRates] = useState<CpfRate[]>([])
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    effective_from: '',
    employee_rate: '20',
    employer_rate: '17',
    notes: '',
  })
  const supabase = createClient()

  useEffect(() => { loadRates() }, [])

  const loadRates = async () => {
    const { data } = await supabase
      .from('cpf_rates')
      .select('*')
      .order('effective_from', { ascending: false })
    setRates(data || [])
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true); setError('')

    const { data: { user } } = await supabase.auth.getUser()

    // Validate effective date is not before the latest existing rate
    const latestRate = rates[0]
    if (latestRate && form.effective_from <= latestRate.effective_from) {
      setError('Effective date must be after the current latest rate (' + formatDate(latestRate.effective_from) + ')')
      setSaving(false)
      return
    }

    const { error: err } = await supabase.from('cpf_rates').insert({
      effective_from: form.effective_from,
      employee_rate: parseFloat(form.employee_rate),
      employer_rate: parseFloat(form.employer_rate),
      notes: form.notes || null,
      created_by: user?.id,
    })

    if (err) { setError(err.message); setSaving(false); return }

    await loadRates()
    setShowForm(false)
    setForm({ effective_from: '', employee_rate: '20', employer_rate: '17', notes: '' })
    setSaving(false)
    setSuccess('New CPF rate added successfully')
    setTimeout(() => setSuccess(''), 3000)
  }

  const currentRate = rates[0]
  const totalCurrentRate = currentRate
    ? currentRate.employee_rate + currentRate.employer_rate
    : 0

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-bold text-gray-900">CPF Configuration</h1>
        <p className="text-sm text-gray-500">
          Manage CPF contribution rates. Historical rates are preserved for past payroll accuracy.
        </p>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <Info className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-blue-700">
          <p className="font-medium">About CPF Rate History</p>
          <p className="text-xs mt-1 text-blue-600">
            When the government updates CPF rates, add a new rate with the new effective date.
            Past payrolls that were already concluded will continue to use the rate that was
            active at the time — they will not be affected by new rate changes.
          </p>
        </div>
      </div>

      {/* Current rate summary */}
      {currentRate && (
        <div className="card p-4">
          <h2 className="font-semibold text-gray-900 text-sm mb-3 flex items-center gap-2">
            <Calculator className="w-4 h-4 text-red-600" /> Current Active Rate
          </h2>
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-red-50 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-red-700">{currentRate.employee_rate}%</p>
              <p className="text-xs text-red-600 mt-1">Employee contribution</p>
              <p className="text-xs text-gray-400">Deducted from salary</p>
            </div>
            <div className="bg-blue-50 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-blue-700">{currentRate.employer_rate}%</p>
              <p className="text-xs text-blue-600 mt-1">Employer contribution</p>
              <p className="text-xs text-gray-400">Paid by employer</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-gray-700">{totalCurrentRate}%</p>
              <p className="text-xs text-gray-600 mt-1">Total CPF</p>
              <p className="text-xs text-gray-400">Combined rate</p>
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-3">
            Effective from: <span className="font-medium text-gray-600">{formatDate(currentRate.effective_from)}</span>
            {currentRate.notes && <span> · {currentRate.notes}</span>}
          </p>
        </div>
      )}

      {/* Banners */}
      {success && (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700">
          <CheckCircle className="w-4 h-4 flex-shrink-0" /> {success}
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}

      {/* Add new rate */}
      <div className="card">
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900 text-sm">Rate History</h2>
          <button onClick={() => setShowForm(!showForm)} className="btn-primary flex items-center gap-1.5 text-xs py-1.5">
            <Plus className="w-3.5 h-3.5" /> Add New Rate
          </button>
        </div>

        {showForm && (
          <form onSubmit={handleSubmit} className="p-4 border-b border-gray-100 bg-red-50 space-y-4">
            <p className="text-sm font-medium text-gray-900">Add New CPF Rate</p>
            <p className="text-xs text-gray-500">
              Add this when the government announces a CPF rate change. Enter the date the new rate takes effect.
            </p>

            <div>
              <label className="label">Effective From Date *</label>
              <input className="input" type="date" required value={form.effective_from}
                onChange={e => setForm(f => ({ ...f, effective_from: e.target.value }))} />
              {currentRate && (
                <p className="text-xs text-gray-400 mt-1">
                  Must be after {formatDate(currentRate.effective_from)} (current latest rate)
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Employee Rate % *</label>
                <input className="input" type="number" required min="0" max="100" step="0.5"
                  value={form.employee_rate}
                  onChange={e => setForm(f => ({ ...f, employee_rate: e.target.value }))} />
                <p className="text-xs text-gray-400 mt-1">Deducted from employee salary</p>
              </div>
              <div>
                <label className="label">Employer Rate % *</label>
                <input className="input" type="number" required min="0" max="100" step="0.5"
                  value={form.employer_rate}
                  onChange={e => setForm(f => ({ ...f, employer_rate: e.target.value }))} />
                <p className="text-xs text-gray-400 mt-1">Additional contribution by employer</p>
              </div>
            </div>

            <div>
              <label className="label">Notes</label>
              <input className="input" value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="e.g. Updated per MOM circular dated 1 Jan 2025, for employees aged 55 and below" />
            </div>

            <div className="flex gap-2">
              <button type="submit" disabled={saving} className="btn-primary flex-1 disabled:opacity-50">
                {saving ? 'Saving...' : 'Add Rate'}
              </button>
              <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
            </div>
          </form>
        )}

        {/* Rate history table */}
        {rates.length === 0 ? (
          <p className="p-4 text-sm text-gray-400 text-center">No rates configured yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                  <th className="text-left p-3">Effective From</th>
                  <th className="text-center p-3">Employee %</th>
                  <th className="text-center p-3">Employer %</th>
                  <th className="text-center p-3">Total %</th>
                  <th className="text-left p-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rates.map((rate, idx) => {
                  const isCurrent = idx === 0
                  const nextRate = idx > 0 ? rates[idx - 1] : null
                  return (
                    <tr key={rate.id} className={isCurrent ? 'bg-red-50' : ''}>
                      <td className="p-3">
                        <p className={`font-medium ${isCurrent ? 'text-red-700' : 'text-gray-900'}`}>
                          {formatDate(rate.effective_from)}
                        </p>
                        {rate.notes && <p className="text-xs text-gray-400 mt-0.5">{rate.notes}</p>}
                      </td>
                      <td className="p-3 text-center font-medium">{rate.employee_rate}%</td>
                      <td className="p-3 text-center font-medium">{rate.employer_rate}%</td>
                      <td className="p-3 text-center font-medium">{(rate.employee_rate + rate.employer_rate).toFixed(1)}%</td>
                      <td className="p-3">
                        {isCurrent ? (
                          <span className="badge-active">Current</span>
                        ) : (
                          <span className="badge-inactive">
                            Until {nextRate ? formatDate(nextRate.effective_from) : '—'}
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
