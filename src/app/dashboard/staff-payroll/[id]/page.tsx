'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { formatDate, formatSGD, getMonthName } from '@/lib/utils'
import {
  ArrowLeft, DollarSign, Plus, TrendingUp, FileText,
  CheckCircle, AlertCircle, Lock, Save, X, ChevronDown, ChevronUp
} from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

export default function StaffPayrollPage() {
  const { id } = useParams()
  const router = useRouter()
  const [staff, setStaff] = useState<any>(null)
  const [payroll, setPayroll] = useState<any>(null)
  const [salaryHistory, setSalaryHistory] = useState<any[]>([])
  const [bonuses, setBonuses] = useState<any[]>([])
  const [payslips, setPayslips] = useState<any[]>([])
  const [cpfRates, setCpfRates] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Form states
  const [showSalaryForm, setShowSalaryForm] = useState(false)
  const [showIncrementForm, setShowIncrementForm] = useState(false)
  const [showBonusForm, setShowBonusForm] = useState(false)
  const [showPayslipForm, setShowPayslipForm] = useState(false)
  const [showHistory, setShowHistory] = useState(false)

  const [salaryForm, setSalaryForm] = useState({ current_salary: '', is_cpf_liable: 'true' })
  const [incrementForm, setIncrementForm] = useState({ change_amount: '', effective_from: '', change_type: 'increment', notes: '' })
  const [bonusForm, setBonusForm] = useState({ bonus_type: 'performance', amount: '', month: new Date().getMonth() + 1, year: new Date().getFullYear(), notes: '' })
  const [payslipForm, setPayslipForm] = useState({ month: new Date().getMonth() + 1, year: new Date().getFullYear(), bonus_amount: '0', notes: '' })

  const supabase = createClient()

  const showMsg = (msg: string) => { setSuccess(msg); setTimeout(() => setSuccess(''), 3000) }

  useEffect(() => { loadData() }, [id])

  const loadData = async () => {
    setLoading(true)
    const { data: staffData } = await supabase.from('users').select('*').eq('id', id).single()
    setStaff(staffData)

    const { data: payrollData } = await supabase.from('staff_payroll').select('*').eq('user_id', id).single()
    setPayroll(payrollData)
    if (payrollData) {
      setSalaryForm({ current_salary: payrollData.current_salary?.toString() || '0', is_cpf_liable: payrollData.is_cpf_liable ? 'true' : 'false' })
    }

    const { data: historyData } = await supabase.from('salary_history').select('*, users!salary_history_created_by_fkey(full_name)')
      .eq('user_id', id).order('effective_from', { ascending: false })
    setSalaryHistory(historyData || [])

    const { data: bonusData } = await supabase.from('staff_bonuses').select('*')
      .eq('user_id', id).order('year', { ascending: false }).order('month', { ascending: false })
    setBonuses(bonusData || [])

    const { data: payslipData } = await supabase.from('payslips').select('*, users!payslips_approved_by_fkey(full_name)')
      .eq('user_id', id).order('year', { ascending: false }).order('month', { ascending: false })
    setPayslips(payslipData || [])

    const { data: cpfData } = await supabase.from('cpf_rates').select('*').order('effective_from', { ascending: false }).limit(1)
    setCpfRates(cpfData || [])

    setLoading(false)
  }

  const handleSavePayroll = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setError('')
    const { data: { user: authUser } } = await supabase.auth.getUser()

    const newSalary = parseFloat(salaryForm.current_salary)
    const isCpf = salaryForm.is_cpf_liable === 'true'

    // Upsert payroll profile
    const { error: err } = await supabase.from('staff_payroll').upsert({
      user_id: id, current_salary: newSalary, is_cpf_liable: isCpf, updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' })

    if (err) { setError(err.message); setSaving(false); return }

    // Add initial salary history record if none exists
    if (salaryHistory.length === 0) {
      await supabase.from('salary_history').insert({
        user_id: id, salary_amount: newSalary, effective_from: staff?.date_of_joining || new Date().toISOString().split('T')[0],
        change_type: 'initial', change_amount: newSalary,
        notes: 'Initial salary set', created_by: authUser?.id,
      })
    }

    await loadData(); setSaving(false); setShowSalaryForm(false); showMsg('Payroll profile saved')
  }

  const handleAddIncrement = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setError('')
    const { data: { user: authUser } } = await supabase.auth.getUser()

    const changeAmt = parseFloat(incrementForm.change_amount)
    const newSalary = (payroll?.current_salary || 0) + changeAmt

    await supabase.from('salary_history').insert({
      user_id: id, salary_amount: newSalary, effective_from: incrementForm.effective_from,
      change_type: incrementForm.change_type, change_amount: changeAmt,
      notes: incrementForm.notes || null, created_by: authUser?.id,
    })
    await supabase.from('staff_payroll').update({ current_salary: newSalary, updated_at: new Date().toISOString() }).eq('user_id', id)

    await loadData(); setSaving(false); setShowIncrementForm(false)
    setIncrementForm({ change_amount: '', effective_from: '', change_type: 'increment', notes: '' })
    showMsg(`Salary updated to ${formatSGD(newSalary)}`)
  }

  const handleAddBonus = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setError('')
    const { data: { user: authUser } } = await supabase.auth.getUser()

    await supabase.from('staff_bonuses').insert({
      user_id: id, bonus_type: bonusForm.bonus_type, amount: parseFloat(bonusForm.amount),
      month: bonusForm.month, year: bonusForm.year, notes: bonusForm.notes || null, created_by: authUser?.id,
    })

    await loadData(); setSaving(false); setShowBonusForm(false)
    setBonusForm({ bonus_type: 'performance', amount: '', month: new Date().getMonth() + 1, year: new Date().getFullYear(), notes: '' })
    showMsg('Bonus recorded')
  }

  const handleGeneratePayslip = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setError('')
    const { data: { user: authUser } } = await supabase.auth.getUser()

    if (!payroll?.current_salary) { setError('Please set a salary before generating a payslip.'); setSaving(false); return }

    // Get CPF rates at time of this payslip
    const { data: rateData } = await supabase.from('cpf_rates').select('*')
      .lte('effective_from', `${payslipForm.year}-${String(payslipForm.month).padStart(2, '0')}-01`)
      .order('effective_from', { ascending: false }).limit(1)
    const rate = rateData?.[0]

    const { error: err } = await supabase.from('payslips').upsert({
      user_id: id, month: payslipForm.month, year: payslipForm.year,
      basic_salary: payroll.current_salary,
      bonus_amount: parseFloat(payslipForm.bonus_amount) || 0,
      is_cpf_liable: payroll.is_cpf_liable,
      employee_cpf_rate: rate?.employee_rate || 20,
      employer_cpf_rate: rate?.employer_rate || 17,
      notes: payslipForm.notes || null,
      status: 'draft', generated_by: authUser?.id, generated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,month,year' })

    if (err) { setError(err.message); setSaving(false); return }

    await loadData(); setSaving(false); setShowPayslipForm(false)
    showMsg('Payslip generated')
  }

  const handlePayslipAction = async (payslipId: string, action: 'approved' | 'paid') => {
    const { data: { user: authUser } } = await supabase.auth.getUser()
    const update: any = { status: action }
    if (action === 'approved') { update.approved_by = authUser?.id; update.approved_at = new Date().toISOString() }
    if (action === 'paid') { update.paid_at = new Date().toISOString() }
    await supabase.from('payslips').update(update).eq('id', payslipId)
    await loadData(); showMsg(`Payslip ${action}`)
  }

  const downloadPayslipPdf = async (payslip: any) => {
    const { default: jsPDF } = await import('jspdf')
    const { default: autoTable } = await import('jspdf-autotable')
    const doc = new jsPDF()

    doc.setFontSize(18); doc.text('PAYSLIP', 14, 20)
    doc.setFontSize(10); doc.setTextColor(100)
    doc.text(`${getMonthName(payslip.month)} ${payslip.year}`, 14, 28)
    doc.text(`Generated: ${new Date(payslip.generated_at).toLocaleDateString('en-SG')}`, 14, 34)
    doc.setTextColor(0)

    doc.setFontSize(11); doc.setFont('helvetica', 'bold')
    doc.text('Employee Details', 14, 46)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10)
    doc.text(`Name: ${staff?.full_name}`, 14, 54)
    doc.text(`Email: ${staff?.email}`, 14, 60)
    if (staff?.date_of_joining) doc.text(`Date of Joining: ${formatDate(staff.date_of_joining)}`, 14, 66)

    autoTable(doc, {
      startY: 74,
      head: [['Description', 'Amount (SGD)']],
      body: [
        ['Basic Salary', formatSGD(payslip.basic_salary)],
        ...(payslip.bonus_amount > 0 ? [['Bonus', formatSGD(payslip.bonus_amount)]] : []),
        ['Gross Salary', formatSGD(payslip.gross_salary)],
        ['', ''],
        ...(payslip.is_cpf_liable ? [
          [`Employee CPF (${payslip.employee_cpf_rate}%)`, `- ${formatSGD(payslip.employee_cpf_amount)}`],
        ] : [['CPF', 'Not applicable']]),
        ['', ''],
        ['Net Pay', formatSGD(payslip.net_salary)],
      ],
      styles: { fontSize: 10 },
      headStyles: { fillColor: [220, 38, 38] },
      bodyStyles: { textColor: [17, 24, 39] },
      columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } },
    })

    const finalY = (doc as any).lastAutoTable.finalY + 10
    if (payslip.is_cpf_liable) {
      doc.setFontSize(9); doc.setTextColor(100)
      doc.text(`Employer CPF Contribution (${payslip.employer_cpf_rate}%): ${formatSGD(payslip.employer_cpf_amount)}`, 14, finalY)
      doc.text(`Total Cost to Employer: ${formatSGD(payslip.total_employer_cost)}`, 14, finalY + 6)
    }

    const status = payslip.status.charAt(0).toUpperCase() + payslip.status.slice(1)
    doc.setFontSize(10); doc.setTextColor(0)
    doc.text(`Status: ${status}`, 14, finalY + 20)
    if (payslip.paid_at) doc.text(`Paid on: ${new Date(payslip.paid_at).toLocaleDateString('en-SG')}`, 14, finalY + 26)

    doc.save(`payslip_${staff?.full_name}_${getMonthName(payslip.month)}_${payslip.year}.pdf`)
  }

  if (loading) return <div className="flex items-center justify-center h-48"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-red-600" /></div>
  if (!staff) return <div className="card p-8 text-center"><p className="text-gray-500">Staff not found</p></div>

  const changeTypeLabels: Record<string, string> = {
    initial: 'Initial', increment: 'Increment', adjustment: 'Adjustment', promotion: 'Promotion'
  }

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/payroll" className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft className="w-4 h-4 text-gray-600" />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-900">{staff.full_name}</h1>
          <p className="text-sm text-gray-500 capitalize">{staff.role} · {staff.email}</p>
        </div>
        <div className={cn('text-xs px-2.5 py-1 rounded-full font-medium',
          payroll?.is_cpf_liable ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600')}>
          {payroll?.is_cpf_liable ? 'CPF Liable' : 'No CPF'}
        </div>
      </div>

      {/* Banners */}
      {success && <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700"><CheckCircle className="w-4 h-4 flex-shrink-0" /> {success}</div>}
      {error && <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600"><AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}<button onClick={() => setError('')} className="ml-auto"><X className="w-4 h-4" /></button></div>}

      {/* Salary & CPF */}
      <div className="card">
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900 text-sm flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-red-600" /> Salary & CPF
          </h2>
          <div className="flex gap-2">
            <button onClick={() => { setShowSalaryForm(!showSalaryForm); setShowIncrementForm(false) }}
              className="btn-secondary text-xs py-1.5">Edit</button>
            {payroll?.current_salary > 0 && (
              <button onClick={() => { setShowIncrementForm(!showIncrementForm); setShowSalaryForm(false) }}
                className="btn-primary flex items-center gap-1 text-xs py-1.5">
                <TrendingUp className="w-3.5 h-3.5" /> Add Increment
              </button>
            )}
          </div>
        </div>

        <div className="p-4">
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-gray-50 rounded-lg p-3 text-center">
              <p className="text-xl font-bold text-gray-900">{formatSGD(payroll?.current_salary || 0)}</p>
              <p className="text-xs text-gray-500 mt-1">Current Salary</p>
            </div>
            <div className="bg-blue-50 rounded-lg p-3 text-center">
              <p className="text-xl font-bold text-blue-700">
                {payroll?.is_cpf_liable ? `${cpfRates[0]?.employee_rate || 20}%` : 'N/A'}
              </p>
              <p className="text-xs text-blue-600 mt-1">Employee CPF</p>
            </div>
            <div className="bg-red-50 rounded-lg p-3 text-center">
              <p className="text-xl font-bold text-red-700">
                {payroll?.is_cpf_liable ? `${cpfRates[0]?.employer_rate || 17}%` : 'N/A'}
              </p>
              <p className="text-xs text-red-600 mt-1">Employer CPF</p>
            </div>
          </div>

          {payroll?.is_cpf_liable && payroll?.current_salary > 0 && (
            <div className="text-xs text-gray-500 bg-gray-50 rounded-lg p-3 space-y-1">
              <div className="flex justify-between"><span>Gross Salary</span><span className="font-medium">{formatSGD(payroll.current_salary)}</span></div>
              <div className="flex justify-between text-blue-600"><span>Employee CPF deduction</span><span>- {formatSGD(payroll.current_salary * (cpfRates[0]?.employee_rate || 20) / 100)}</span></div>
              <div className="flex justify-between font-medium text-gray-900 border-t border-gray-200 pt-1"><span>Net Take-home</span><span>{formatSGD(payroll.current_salary * (1 - (cpfRates[0]?.employee_rate || 20) / 100))}</span></div>
              <div className="flex justify-between text-red-600 border-t border-gray-200 pt-1"><span>Employer CPF contribution</span><span>+ {formatSGD(payroll.current_salary * (cpfRates[0]?.employer_rate || 17) / 100)}</span></div>
              <div className="flex justify-between font-medium text-gray-900"><span>Total cost to employer</span><span>{formatSGD(payroll.current_salary * (1 + (cpfRates[0]?.employer_rate || 17) / 100))}</span></div>
            </div>
          )}
        </div>

        {/* Edit salary form */}
        {showSalaryForm && (
          <form onSubmit={handleSavePayroll} className="px-4 pb-4 space-y-3 border-t border-gray-100">
            <p className="text-sm font-medium text-gray-900 pt-3">Edit Salary & CPF Settings</p>
            <div>
              <label className="label">Monthly Salary (SGD) *</label>
              <input className="input" type="number" required min="0" step="0.01"
                value={salaryForm.current_salary}
                onChange={e => setSalaryForm(f => ({ ...f, current_salary: e.target.value }))} />
            </div>
            <div>
              <label className="label">CPF Liability</label>
              <select className="input" value={salaryForm.is_cpf_liable}
                onChange={e => setSalaryForm(f => ({ ...f, is_cpf_liable: e.target.value }))}>
                <option value="true">CPF Liable (Singapore Citizen / PR)</option>
                <option value="false">Not CPF Liable (Foreigner / Exempt)</option>
              </select>
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={saving} className="btn-primary flex-1 disabled:opacity-50">
                {saving ? 'Saving...' : 'Save'}
              </button>
              <button type="button" onClick={() => setShowSalaryForm(false)} className="btn-secondary">Cancel</button>
            </div>
          </form>
        )}

        {/* Add increment form */}
        {showIncrementForm && (
          <form onSubmit={handleAddIncrement} className="px-4 pb-4 space-y-3 border-t border-gray-100">
            <p className="text-sm font-medium text-gray-900 pt-3">Add Salary Change</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Change Type</label>
                <select className="input" value={incrementForm.change_type}
                  onChange={e => setIncrementForm(f => ({ ...f, change_type: e.target.value }))}>
                  <option value="increment">Increment</option>
                  <option value="adjustment">Adjustment</option>
                  <option value="promotion">Promotion</option>
                </select>
              </div>
              <div>
                <label className="label">Amount (SGD) *</label>
                <input className="input" type="number" required step="0.01"
                  value={incrementForm.change_amount} placeholder="e.g. 200 or -100"
                  onChange={e => setIncrementForm(f => ({ ...f, change_amount: e.target.value }))} />
                <p className="text-xs text-gray-400 mt-1">Positive = raise, negative = reduction</p>
              </div>
            </div>
            <div>
              <label className="label">Effective From *</label>
              <input className="input" type="date" required value={incrementForm.effective_from}
                onChange={e => setIncrementForm(f => ({ ...f, effective_from: e.target.value }))} />
            </div>
            {incrementForm.change_amount && payroll?.current_salary && (
              <div className="text-xs bg-green-50 border border-green-200 rounded-lg p-3">
                New salary: <span className="font-bold text-green-700">
                  {formatSGD((payroll.current_salary || 0) + parseFloat(incrementForm.change_amount || '0'))}
                </span>
              </div>
            )}
            <div>
              <label className="label">Notes</label>
              <input className="input" value={incrementForm.notes} placeholder="e.g. Annual performance review"
                onChange={e => setIncrementForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={saving} className="btn-primary flex-1 disabled:opacity-50">
                {saving ? 'Saving...' : 'Add Change'}
              </button>
              <button type="button" onClick={() => setShowIncrementForm(false)} className="btn-secondary">Cancel</button>
            </div>
          </form>
        )}
      </div>

      {/* Salary History */}
      <div className="card">
        <button className="w-full flex items-center justify-between p-4"
          onClick={() => setShowHistory(!showHistory)}>
          <h2 className="font-semibold text-gray-900 text-sm flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-red-600" /> Salary History ({salaryHistory.length})
          </h2>
          {showHistory ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </button>
        {showHistory && (
          <div className="border-t border-gray-100">
            {salaryHistory.length === 0 ? (
              <p className="p-4 text-sm text-gray-400 text-center">No salary history yet</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-xs text-gray-500 uppercase">
                      <th className="text-left p-3">Effective</th>
                      <th className="text-left p-3">Type</th>
                      <th className="text-right p-3">Change</th>
                      <th className="text-right p-3">New Salary</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {salaryHistory.map(h => (
                      <tr key={h.id}>
                        <td className="p-3 text-gray-900">{formatDate(h.effective_from)}</td>
                        <td className="p-3 text-gray-600">{changeTypeLabels[h.change_type] || h.change_type}</td>
                        <td className={cn('p-3 text-right font-medium', h.change_amount > 0 ? 'text-green-600' : h.change_amount < 0 ? 'text-red-600' : 'text-gray-600')}>
                          {h.change_amount > 0 ? '+' : ''}{formatSGD(h.change_amount)}
                        </td>
                        <td className="p-3 text-right font-bold text-gray-900">{formatSGD(h.salary_amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bonuses */}
      <div className="card">
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900 text-sm flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-red-600" /> Bonus Payouts ({bonuses.length})
          </h2>
          <button onClick={() => setShowBonusForm(!showBonusForm)}
            className="btn-primary flex items-center gap-1 text-xs py-1.5">
            <Plus className="w-3.5 h-3.5" /> Add Bonus
          </button>
        </div>

        {showBonusForm && (
          <form onSubmit={handleAddBonus} className="p-4 border-b border-gray-100 bg-red-50 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Bonus Type</label>
                <select className="input" value={bonusForm.bonus_type}
                  onChange={e => setBonusForm(f => ({ ...f, bonus_type: e.target.value }))}>
                  <option value="performance">Performance</option>
                  <option value="annual">Annual Bonus</option>
                  <option value="discretionary">Discretionary</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="label">Amount (SGD) *</label>
                <input className="input" type="number" required min="0" step="0.01"
                  value={bonusForm.amount}
                  onChange={e => setBonusForm(f => ({ ...f, amount: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Month</label>
                <select className="input" value={bonusForm.month}
                  onChange={e => setBonusForm(f => ({ ...f, month: parseInt(e.target.value) }))}>
                  {Array.from({ length: 12 }, (_, i) => (
                    <option key={i + 1} value={i + 1}>{getMonthName(i + 1)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Year</label>
                <input className="input" type="number" value={bonusForm.year}
                  onChange={e => setBonusForm(f => ({ ...f, year: parseInt(e.target.value) }))} />
              </div>
            </div>
            <div>
              <label className="label">Notes</label>
              <input className="input" value={bonusForm.notes}
                onChange={e => setBonusForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="e.g. Q4 performance bonus" />
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={saving} className="btn-primary flex-1 disabled:opacity-50">
                {saving ? 'Saving...' : 'Record Bonus'}
              </button>
              <button type="button" onClick={() => setShowBonusForm(false)} className="btn-secondary">Cancel</button>
            </div>
          </form>
        )}

        {bonuses.length === 0 ? (
          <p className="p-4 text-sm text-gray-400 text-center">No bonuses recorded</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {bonuses.map(b => (
              <div key={b.id} className="flex items-center gap-3 p-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 capitalize">{b.bonus_type} Bonus</p>
                  <p className="text-xs text-gray-500">{getMonthName(b.month)} {b.year}{b.notes && ` · ${b.notes}`}</p>
                </div>
                <p className="text-sm font-bold text-green-700">{formatSGD(b.amount)}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Payslips */}
      <div className="card">
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900 text-sm flex items-center gap-2">
            <FileText className="w-4 h-4 text-red-600" /> Payslips ({payslips.length})
          </h2>
          <button onClick={() => setShowPayslipForm(!showPayslipForm)}
            className="btn-primary flex items-center gap-1 text-xs py-1.5">
            <Plus className="w-3.5 h-3.5" /> Generate Payslip
          </button>
        </div>

        {showPayslipForm && (
          <form onSubmit={handleGeneratePayslip} className="p-4 border-b border-gray-100 bg-red-50 space-y-3">
            <p className="text-sm font-medium text-gray-900">Generate Payslip</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Month *</label>
                <select className="input" value={payslipForm.month}
                  onChange={e => setPayslipForm(f => ({ ...f, month: parseInt(e.target.value) }))}>
                  {Array.from({ length: 12 }, (_, i) => (
                    <option key={i + 1} value={i + 1}>{getMonthName(i + 1)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Year *</label>
                <input className="input" type="number" value={payslipForm.year}
                  onChange={e => setPayslipForm(f => ({ ...f, year: parseInt(e.target.value) }))} />
              </div>
            </div>
            <div>
              <label className="label">Bonus Amount (SGD)</label>
              <input className="input" type="number" min="0" step="0.01" value={payslipForm.bonus_amount}
                onChange={e => setPayslipForm(f => ({ ...f, bonus_amount: e.target.value }))} />
              <p className="text-xs text-gray-400 mt-1">Leave 0 if no bonus this month</p>
            </div>
            <div className="bg-white rounded-lg p-3 text-xs text-gray-600 space-y-1 border border-gray-200">
              <p className="font-medium text-gray-900">Payslip Preview</p>
              <div className="flex justify-between"><span>Basic Salary</span><span>{formatSGD(payroll?.current_salary || 0)}</span></div>
              {parseFloat(payslipForm.bonus_amount) > 0 && <div className="flex justify-between"><span>Bonus</span><span>{formatSGD(parseFloat(payslipForm.bonus_amount))}</span></div>}
              <div className="flex justify-between font-medium"><span>Gross</span><span>{formatSGD((payroll?.current_salary || 0) + parseFloat(payslipForm.bonus_amount || '0'))}</span></div>
              {payroll?.is_cpf_liable && (
                <div className="flex justify-between text-blue-600"><span>Employee CPF ({cpfRates[0]?.employee_rate || 20}%)</span>
                  <span>- {formatSGD(((payroll?.current_salary || 0) + parseFloat(payslipForm.bonus_amount || '0')) * (cpfRates[0]?.employee_rate || 20) / 100)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-gray-900 border-t pt-1"><span>Net Pay</span>
                <span>{formatSGD(((payroll?.current_salary || 0) + parseFloat(payslipForm.bonus_amount || '0')) * (payroll?.is_cpf_liable ? (1 - (cpfRates[0]?.employee_rate || 20) / 100) : 1))}</span>
              </div>
            </div>
            <div>
              <label className="label">Notes</label>
              <input className="input" value={payslipForm.notes}
                onChange={e => setPayslipForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={saving} className="btn-primary flex-1 disabled:opacity-50">
                {saving ? 'Generating...' : 'Generate Payslip'}
              </button>
              <button type="button" onClick={() => setShowPayslipForm(false)} className="btn-secondary">Cancel</button>
            </div>
          </form>
        )}

        {payslips.length === 0 ? (
          <p className="p-4 text-sm text-gray-400 text-center">No payslips generated yet</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {payslips.map(ps => (
              <div key={ps.id} className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="font-medium text-gray-900 text-sm">{getMonthName(ps.month)} {ps.year}</p>
                    <p className="text-xs text-gray-500">Basic: {formatSGD(ps.basic_salary)}{ps.bonus_amount > 0 && ` + Bonus: ${formatSGD(ps.bonus_amount)}`}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-gray-900">{formatSGD(ps.net_salary)}</p>
                    <p className="text-xs text-gray-400">net pay</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium',
                    ps.status === 'paid' ? 'bg-green-100 text-green-700' :
                    ps.status === 'approved' ? 'bg-blue-100 text-blue-700' :
                    'badge-pending')}>
                    {ps.status.charAt(0).toUpperCase() + ps.status.slice(1)}
                  </span>
                  {ps.status === 'draft' && (
                    <button onClick={() => handlePayslipAction(ps.id, 'approved')}
                      className="text-xs text-blue-600 hover:underline">Approve</button>
                  )}
                  {ps.status === 'approved' && (
                    <button onClick={() => handlePayslipAction(ps.id, 'paid')}
                      className="text-xs text-green-600 hover:underline">Mark Paid</button>
                  )}
                  <button onClick={() => downloadPayslipPdf(ps)}
                    className="text-xs text-red-600 hover:underline flex items-center gap-1">
                    <FileText className="w-3 h-3" /> PDF
                  </button>
                  {ps.paid_at && <span className="text-xs text-gray-400">Paid {new Date(ps.paid_at).toLocaleDateString('en-SG')}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
