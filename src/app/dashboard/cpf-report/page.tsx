'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { formatSGD, getMonthName } from '@/lib/utils'
import { FileText, CheckCircle, Download, AlertCircle, Calculator } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function CpfReportPage() {
  const [submissions, setSubmissions] = useState<any[]>([])
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1)
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [preview, setPreview] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')
  const supabase = createClient()

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    const { data } = await supabase.from('cpf_submissions')
      .select('*, submitted_by:users!cpf_submissions_submitted_by_fkey(full_name)')
      .order('payroll_year', { ascending: false })
      .order('payroll_month', { ascending: false })
    setSubmissions(data || [])
    setLoading(false)
  }

  const generatePreview = async () => {
    setGenerating(true); setError('')

    // Get all payslips for the selected month/year that are approved or paid
    const { data: payslips, error: err } = await supabase.from('payslips')
      .select('*, user:users(full_name, nric, employment_type)')
      .eq('month', selectedMonth).eq('year', selectedYear)
      .in('status', ['approved', 'paid'])

    if (err) { setError(err.message); setGenerating(false); return }

    const cpfLiable = payslips?.filter(p => p.is_cpf_liable) || []

    const totalEmployeeCpf = cpfLiable.reduce((s: number, p: any) => s + (p.employee_cpf_amount || 0), 0)
    const totalEmployerCpf = cpfLiable.reduce((s: number, p: any) => s + (p.employer_cpf_amount || 0), 0)
    const totalWages = cpfLiable.reduce((s: number, p: any) => s + (p.gross_salary || 0), 0)

    setPreview({
      month: selectedMonth, year: selectedYear,
      totalEmployeeCpf, totalEmployerCpf, totalWages,
      staffCount: cpfLiable.length,
      totalCpf: totalEmployeeCpf + totalEmployerCpf,
      breakdown: cpfLiable.map((p: any) => ({
        name: p.user?.full_name, nric: p.user?.nric,
        grossSalary: p.gross_salary,
        employeeCpf: p.employee_cpf_amount,
        employerCpf: p.employer_cpf_amount,
        totalCpf: p.employee_cpf_amount + p.employer_cpf_amount,
      }))
    })
    setGenerating(false)
  }

  const handleSaveSubmission = async () => {
    if (!preview) return
    const { data: { user: authUser } } = await supabase.auth.getUser()

    const { error: err } = await supabase.from('cpf_submissions').upsert({
      payroll_month: preview.month, payroll_year: preview.year,
      total_employee_cpf: preview.totalEmployeeCpf,
      total_employer_cpf: preview.totalEmployerCpf,
      total_wages: preview.totalWages,
      staff_count: preview.staffCount,
      status: 'pending',
      generated_at: new Date().toISOString(),
    }, { onConflict: 'payroll_month,payroll_year' })

    if (err) { setError(err.message); return }
    await loadData()
    setPreview(null)
  }

  const handleMarkSubmitted = async (submissionId: string) => {
    const { data: { user: authUser } } = await supabase.auth.getUser()
    await supabase.from('cpf_submissions').update({
      status: 'submitted',
      submitted_by: authUser!.id,
      submitted_at: new Date().toISOString(),
    }).eq('id', submissionId)
    await loadData()
  }

  const downloadCpfReport = async (sub: any) => {
    const { default: jsPDF } = await import('jspdf')
    const { default: autoTable } = await import('jspdf-autotable')
    const doc = new jsPDF()

    doc.setFontSize(18); doc.text('CPF CONTRIBUTION REPORT', 14, 22)
    doc.setFontSize(10); doc.setTextColor(100)
    doc.text(`${getMonthName(sub.payroll_month)} ${sub.payroll_year}`, 14, 30)
    doc.text(`Generated: ${new Date(sub.generated_at).toLocaleDateString('en-SG')}`, 14, 36)
    doc.setTextColor(0)

    autoTable(doc, {
      startY: 44,
      head: [['Description', 'Amount (SGD)']],
      body: [
        ['Total Wages Subject to CPF', formatSGD(sub.total_wages)],
        ['', ''],
        ['Employee CPF Contributions', formatSGD(sub.total_employee_cpf)],
        ['Employer CPF Contributions', formatSGD(sub.total_employer_cpf)],
        ['', ''],
        ['Total CPF to Submit', formatSGD(sub.total_employee_cpf + sub.total_employer_cpf)],
      ],
      styles: { fontSize: 10 },
      headStyles: { fillColor: [220, 38, 38] },
      columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } },
    })

    const finalY = (doc as any).lastAutoTable.finalY + 10
    doc.setFontSize(9); doc.setTextColor(100)
    doc.text(`Number of CPF-liable staff: ${sub.staff_count}`, 14, finalY)
    doc.text('Submit this amount via CPF e-Submit at cpf.gov.sg', 14, finalY + 6)

    doc.save(`cpf_report_${getMonthName(sub.payroll_month)}_${sub.payroll_year}.pdf`)
  }

  if (loading) return <div className="flex items-center justify-center h-48"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-red-600" /></div>

  return (
    <div className="space-y-5 max-w-2xl">
      <div>
        <h1 className="text-xl font-bold text-gray-900">CPF Submission Report</h1>
        <p className="text-sm text-gray-500">Generate monthly CPF reports to submit via CPF e-Submit</p>
      </div>

      {error && <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600"><AlertCircle className="w-4 h-4" />{error}</div>}

      {/* Generate new report */}
      <div className="card p-4 space-y-4">
        <h2 className="font-semibold text-gray-900 text-sm flex items-center gap-2">
          <Calculator className="w-4 h-4 text-red-600" /> Generate CPF Report
        </h2>
        <p className="text-xs text-gray-500">
          This generates a CPF contribution report from approved payslips for the selected month.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Month</label>
            <select className="input" value={selectedMonth} onChange={e => setSelectedMonth(parseInt(e.target.value))}>
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i + 1} value={i + 1}>{getMonthName(i + 1)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Year</label>
            <input className="input" type="number" value={selectedYear}
              onChange={e => setSelectedYear(parseInt(e.target.value))} />
          </div>
        </div>
        <button onClick={generatePreview} disabled={generating} className="btn-primary flex items-center gap-2">
          <Calculator className="w-4 h-4" />
          {generating ? 'Generating...' : 'Generate Preview'}
        </button>

        {/* Preview */}
        {preview && (
          <div className="border border-gray-200 rounded-xl p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900 text-sm">
                CPF Report Preview — {getMonthName(preview.month)} {preview.year}
              </h3>
              <span className="text-xs text-gray-400">{preview.staffCount} CPF-liable staff</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-50 rounded-lg p-3 text-center">
                <p className="text-xs text-gray-500">Total Wages</p>
                <p className="text-lg font-bold text-gray-900">{formatSGD(preview.totalWages)}</p>
              </div>
              <div className="bg-blue-50 rounded-lg p-3 text-center">
                <p className="text-xs text-blue-600">Employee CPF</p>
                <p className="text-lg font-bold text-blue-700">{formatSGD(preview.totalEmployeeCpf)}</p>
              </div>
              <div className="bg-red-50 rounded-lg p-3 text-center">
                <p className="text-xs text-red-600">Employer CPF</p>
                <p className="text-lg font-bold text-red-700">{formatSGD(preview.totalEmployerCpf)}</p>
              </div>
              <div className="bg-gray-900 rounded-lg p-3 text-center">
                <p className="text-xs text-gray-400">Total to Submit</p>
                <p className="text-lg font-bold text-white">{formatSGD(preview.totalCpf)}</p>
              </div>
            </div>

            {/* Per-staff breakdown */}
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 text-gray-500 uppercase">
                    <th className="text-left p-2">Staff</th>
                    <th className="text-right p-2">Gross</th>
                    <th className="text-right p-2">Employee CPF</th>
                    <th className="text-right p-2">Employer CPF</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {preview.breakdown.map((row: any, i: number) => (
                    <tr key={i}>
                      <td className="p-2">
                        <p className="font-medium text-gray-900">{row.name}</p>
                        {row.nric && <p className="text-gray-400">{row.nric}</p>}
                      </td>
                      <td className="p-2 text-right">{formatSGD(row.grossSalary)}</td>
                      <td className="p-2 text-right text-blue-600">{formatSGD(row.employeeCpf)}</td>
                      <td className="p-2 text-right text-red-600">{formatSGD(row.employerCpf)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <button onClick={handleSaveSubmission} className="btn-primary w-full">
              Save Report
            </button>
          </div>
        )}
      </div>

      {/* Past submissions */}
      <div className="card">
        <div className="p-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900 text-sm">Past CPF Reports</h2>
        </div>
        {submissions.length === 0 ? (
          <p className="p-4 text-sm text-gray-400 text-center">No reports generated yet</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {submissions.map(sub => (
              <div key={sub.id} className="p-4 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-gray-900 text-sm">{getMonthName(sub.payroll_month)} {sub.payroll_year}</p>
                    <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium',
                      sub.status === 'submitted' ? 'bg-green-100 text-green-700' : 'badge-pending')}>
                      {sub.status === 'submitted' ? '✓ Submitted to CPF' : 'Pending Submission'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {sub.staff_count} staff · Employee: {formatSGD(sub.total_employee_cpf)} · Employer: {formatSGD(sub.total_employer_cpf)} · Total: {formatSGD(sub.total_employee_cpf + sub.total_employer_cpf)}
                  </p>
                  {sub.submitted_at && (
                    <p className="text-xs text-green-600 mt-0.5">
                      Submitted by {sub.submitted_by?.full_name} on {new Date(sub.submitted_at).toLocaleDateString('en-SG')}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {sub.status === 'pending' && (
                    <button onClick={() => handleMarkSubmitted(sub.id)}
                      className="btn-primary text-xs py-1.5 flex items-center gap-1">
                      <CheckCircle className="w-3.5 h-3.5" /> Mark Submitted
                    </button>
                  )}
                  <button onClick={() => downloadCpfReport(sub)}
                    className="btn-secondary text-xs py-1.5 flex items-center gap-1">
                    <Download className="w-3.5 h-3.5" /> PDF
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
