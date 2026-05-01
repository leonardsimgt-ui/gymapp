'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { User, Gym } from '@/types'
import { formatSGD, formatDate, formatDateTime, getMonthName } from '@/lib/utils'
import { Download, FileText, Calendar, Users, Package, Clock } from 'lucide-react'

interface TrainerReport {
  trainer_id: string
  trainer_name: string
  packages_sold: number
  package_details: any[]
  sessions: any[]
  total_sessions: number
  completed_sessions: number
}

export default function ActivityReportPage() {
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [gyms, setGyms] = useState<Gym[]>([])
  const [trainers, setTrainers] = useState<User[]>([])
  const [selectedGym, setSelectedGym] = useState<string>('all')
  const [selectedTrainer, setSelectedTrainer] = useState<string>('all')
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date()
    d.setDate(1)
    return d.toISOString().split('T')[0]
  })
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split('T')[0])
  const [report, setReport] = useState<TrainerReport[]>([])
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser) return
      const { data: userData } = await supabase.from('users').select('*').eq('id', authUser.id).single()
      setCurrentUser(userData)

      if (userData?.role === 'business_ops') {
        const { data: gymData } = await supabase.from('gyms').select('*').eq('is_active', true).order('name')
        setGyms(gymData || [])
        const { data: trainerData } = await supabase.from('users').select('*').eq('role', 'trainer').eq('is_active', true).order('full_name')
        setTrainers(trainerData || [])
      } else if (userData?.role === 'manager' && userData?.manager_gym_id) {
        // Load trainers in this gym only
        const { data: gymTrainers } = await supabase
          .from('trainer_gyms')
          .select('trainer_id, users(*)')
          .eq('gym_id', userData.manager_gym_id)
        setTrainers(gymTrainers?.map((t: any) => t.users).filter(Boolean) || [])
        setSelectedGym(userData.manager_gym_id)
      } else if (userData?.role === 'trainer') {
        setSelectedTrainer(authUser.id)
      }
    }
    load()
  }, [])

  const generateReport = async () => {
    if (!currentUser) return
    setLoading(true)

    const from = new Date(dateFrom + 'T00:00:00').toISOString()
    const to = new Date(dateTo + 'T23:59:59').toISOString()

    // Determine which trainers to include
    let trainerIds: string[] = []

    if (currentUser.role === 'trainer') {
      trainerIds = [currentUser.id]
    } else if (currentUser.role === 'manager' && currentUser.manager_gym_id) {
      const { data: gymTrainers } = await supabase
        .from('trainer_gyms').select('trainer_id').eq('gym_id', currentUser.manager_gym_id)
      trainerIds = gymTrainers?.map(t => t.trainer_id) || []
    } else if (currentUser.role === 'business_ops') {
      if (selectedTrainer !== 'all') {
        trainerIds = [selectedTrainer]
      } else if (selectedGym !== 'all') {
        const { data: gymTrainers } = await supabase
          .from('trainer_gyms').select('trainer_id').eq('gym_id', selectedGym)
        trainerIds = gymTrainers?.map(t => t.trainer_id) || []
      } else {
        const { data: allTrainers } = await supabase
          .from('users').select('id').eq('role', 'trainer').eq('is_active', true)
        trainerIds = allTrainers?.map(t => t.id) || []
      }
    }

    // Build report per trainer
    const reports: TrainerReport[] = []

    for (const tid of trainerIds) {
      const trainerInfo = trainers.find(t => t.id === tid) ||
        (currentUser.role === 'trainer' ? currentUser : null)
      if (!trainerInfo) continue

      // Packages sold in date range
      const { data: pkgs } = await supabase
        .from('packages')
        .select('*, clients(full_name)')
        .eq('trainer_id', tid)
        .gte('created_at', from)
        .lte('created_at', to)
        .order('created_at', { ascending: false })

      // Sessions conducted in date range
      const { data: sessions } = await supabase
        .from('sessions')
        .select('*, clients(full_name)')
        .eq('trainer_id', tid)
        .gte('scheduled_at', from)
        .lte('scheduled_at', to)
        .order('scheduled_at', { ascending: true })

      const completedSessions = sessions?.filter(s => s.status === 'completed') || []

      reports.push({
        trainer_id: tid,
        trainer_name: (trainerInfo as User).full_name,
        packages_sold: pkgs?.length || 0,
        package_details: pkgs || [],
        sessions: sessions || [],
        total_sessions: sessions?.length || 0,
        completed_sessions: completedSessions.length,
      })
    }

    setReport(reports)
    setLoading(false)
  }

  const exportCSV = () => {
    const rows: string[][] = []
    rows.push(['Activity Report', `${formatDate(dateFrom)} to ${formatDate(dateTo)}`])
    rows.push([])

    for (const r of report) {
      rows.push([`TRAINER: ${r.trainer_name}`])
      rows.push(['Packages Sold', r.packages_sold.toString()])
      rows.push(['Sessions Scheduled', r.total_sessions.toString()])
      rows.push(['Sessions Completed', r.completed_sessions.toString()])
      rows.push([])
      rows.push(['--- PACKAGES ---'])
      rows.push(['Package Name', 'Client', 'Sessions', 'Price (SGD)', 'Date Sold'])
      for (const p of r.package_details) {
        rows.push([
          p.package_name,
          p.clients?.full_name || '',
          p.total_sessions,
          p.total_price_sgd,
          formatDate(p.created_at),
        ])
      }
      rows.push([])
      rows.push(['--- SESSIONS ---'])
      rows.push(['Date', 'Time', 'Client', 'Status', 'Notes Submitted'])
      for (const s of r.sessions) {
        const dt = new Date(s.scheduled_at)
        rows.push([
          dt.toLocaleDateString('en-SG'),
          dt.toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit' }),
          s.clients?.full_name || '',
          s.status,
          s.is_notes_complete ? 'Yes' : 'No',
        ])
      }
      rows.push([])
    }

    const csv = rows.map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `activity_report_${dateFrom}_to_${dateTo}.csv`
    a.click()
  }

  const exportPDF = async () => {
    const { default: jsPDF } = await import('jspdf')
    const { default: autoTable } = await import('jspdf-autotable')
    const doc = new jsPDF()
    let y = 20

    doc.setFontSize(16)
    doc.text('Activity Report', 14, y); y += 8
    doc.setFontSize(10)
    doc.setTextColor(100)
    doc.text(`Period: ${formatDate(dateFrom)} to ${formatDate(dateTo)}`, 14, y); y += 6
    doc.text(`Generated: ${formatDateTime(new Date().toISOString())}`, 14, y); y += 12
    doc.setTextColor(0)

    for (const r of report) {
      doc.setFontSize(13)
      doc.setFont('helvetica', 'bold')
      doc.text(r.trainer_name, 14, y); y += 6
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.text(`Packages sold: ${r.packages_sold}   Sessions scheduled: ${r.total_sessions}   Completed: ${r.completed_sessions}`, 14, y); y += 8

      if (r.package_details.length > 0) {
        doc.setFontSize(10)
        doc.setFont('helvetica', 'bold')
        doc.text('Packages', 14, y); y += 4
        doc.setFont('helvetica', 'normal')

        autoTable(doc, {
          startY: y,
          head: [['Package', 'Client', 'Sessions', 'Price (SGD)', 'Date Sold']],
          body: r.package_details.map(p => [
            p.package_name,
            p.clients?.full_name || '-',
            p.total_sessions,
            formatSGD(p.total_price_sgd),
            formatDate(p.created_at),
          ]),
          styles: { fontSize: 8 },
          headStyles: { fillColor: [22, 163, 74] },
          margin: { left: 14 },
        })
        y = (doc as any).lastAutoTable.finalY + 8
      }

      if (r.sessions.length > 0) {
        doc.setFontSize(10)
        doc.setFont('helvetica', 'bold')
        doc.text('Sessions', 14, y); y += 4
        doc.setFont('helvetica', 'normal')

        autoTable(doc, {
          startY: y,
          head: [['Date', 'Time', 'Client', 'Status', 'Notes Done']],
          body: r.sessions.map(s => {
            const dt = new Date(s.scheduled_at)
            return [
              dt.toLocaleDateString('en-SG'),
              dt.toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit' }),
              s.clients?.full_name || '-',
              s.status,
              s.is_notes_complete ? '✓' : '—',
            ]
          }),
          styles: { fontSize: 8 },
          headStyles: { fillColor: [22, 163, 74] },
          margin: { left: 14 },
        })
        y = (doc as any).lastAutoTable.finalY + 12
      }

      if (y > 250) { doc.addPage(); y = 20 }
    }

    // Summary table at end
    if (report.length > 1) {
      doc.setFontSize(12)
      doc.setFont('helvetica', 'bold')
      doc.text('Summary', 14, y); y += 4
      autoTable(doc, {
        startY: y,
        head: [['Trainer', 'Packages Sold', 'Sessions Scheduled', 'Sessions Completed']],
        body: report.map(r => [r.trainer_name, r.packages_sold, r.total_sessions, r.completed_sessions]),
        foot: [['TOTAL',
          report.reduce((s, r) => s + r.packages_sold, 0),
          report.reduce((s, r) => s + r.total_sessions, 0),
          report.reduce((s, r) => s + r.completed_sessions, 0),
        ]],
        styles: { fontSize: 9 },
        headStyles: { fillColor: [22, 163, 74] },
        footStyles: { fillColor: [240, 253, 244], textColor: [22, 163, 74], fontStyle: 'bold' },
        margin: { left: 14 },
      })
    }

    doc.save(`activity_report_${dateFrom}_to_${dateTo}.pdf`)
  }

  const isTrainer = currentUser?.role === 'trainer'
  const isManager = currentUser?.role === 'manager'
  const isBusinessOps = currentUser?.role === 'business_ops'

  const totalPackages = report.reduce((s, r) => s + r.packages_sold, 0)
  const totalSessions = report.reduce((s, r) => s + r.total_sessions, 0)
  const totalCompleted = report.reduce((s, r) => s + r.completed_sessions, 0)

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Activity Report</h1>
          <p className="text-sm text-gray-500">
            {isTrainer ? 'Your sessions and packages' : 'Trainer sessions and packages by date range'}
          </p>
        </div>
        {report.length > 0 && (
          <div className="flex gap-2">
            <button onClick={exportCSV} className="btn-secondary flex items-center gap-1.5 text-xs">
              <Download className="w-3.5 h-3.5" /> CSV
            </button>
            <button onClick={exportPDF} className="btn-secondary flex items-center gap-1.5 text-xs">
              <Download className="w-3.5 h-3.5" /> PDF
            </button>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="card p-4 space-y-3">
        <h2 className="font-semibold text-gray-900 text-sm">Report Filters</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="label">From Date</label>
            <input className="input" type="date" value={dateFrom}
              onChange={e => setDateFrom(e.target.value)} />
          </div>
          <div>
            <label className="label">To Date</label>
            <input className="input" type="date" value={dateTo}
              onChange={e => setDateTo(e.target.value)} />
          </div>
          {isBusinessOps && (
            <>
              <div>
                <label className="label">Gym Club</label>
                <select className="input" value={selectedGym}
                  onChange={e => { setSelectedGym(e.target.value); setSelectedTrainer('all') }}>
                  <option value="all">All Gyms</option>
                  {gyms.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Trainer</label>
                <select className="input" value={selectedTrainer}
                  onChange={e => setSelectedTrainer(e.target.value)}>
                  <option value="all">All Trainers</option>
                  {trainers.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
                </select>
              </div>
            </>
          )}
        </div>
        <button onClick={generateReport} disabled={loading}
          className="btn-primary flex items-center gap-2">
          <FileText className="w-4 h-4" />
          {loading ? 'Generating...' : 'Generate Report'}
        </button>
      </div>

      {/* Summary Cards */}
      {report.length > 0 && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <div className="stat-card">
              <div className="flex items-center gap-1.5 mb-1">
                <Package className="w-4 h-4 text-green-600" />
                <p className="text-xs text-gray-500">Packages Sold</p>
              </div>
              <p className="text-2xl font-bold text-gray-900">{totalPackages}</p>
            </div>
            <div className="stat-card">
              <div className="flex items-center gap-1.5 mb-1">
                <Calendar className="w-4 h-4 text-blue-600" />
                <p className="text-xs text-gray-500">Sessions Scheduled</p>
              </div>
              <p className="text-2xl font-bold text-gray-900">{totalSessions}</p>
            </div>
            <div className="stat-card">
              <div className="flex items-center gap-1.5 mb-1">
                <Clock className="w-4 h-4 text-purple-600" />
                <p className="text-xs text-gray-500">Sessions Completed</p>
              </div>
              <p className="text-2xl font-bold text-gray-900">{totalCompleted}</p>
            </div>
          </div>

          {/* Per-Trainer Detail */}
          {report.map(r => (
            <div key={r.trainer_id} className="card">
              {/* Trainer header */}
              <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-green-100 rounded-full flex items-center justify-center">
                    <span className="text-green-700 font-semibold text-sm">{r.trainer_name.charAt(0)}</span>
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900 text-sm">{r.trainer_name}</p>
                    <p className="text-xs text-gray-500">
                      {r.packages_sold} package{r.packages_sold !== 1 ? 's' : ''} sold ·
                      {r.completed_sessions}/{r.total_sessions} sessions completed
                    </p>
                  </div>
                </div>
              </div>

              {/* Packages section */}
              {r.package_details.length > 0 && (
                <div className="p-4 border-b border-gray-100">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                    <Package className="w-3.5 h-3.5" /> Packages Sold ({r.packages_sold})
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-gray-400 uppercase">
                          <th className="text-left pb-2">Package</th>
                          <th className="text-left pb-2">Client</th>
                          <th className="text-center pb-2">Sessions</th>
                          <th className="text-right pb-2">Price</th>
                          <th className="text-right pb-2">Date Sold</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {r.package_details.map(p => (
                          <tr key={p.id}>
                            <td className="py-2 text-gray-900 font-medium">{p.package_name}</td>
                            <td className="py-2 text-gray-600">{p.clients?.full_name}</td>
                            <td className="py-2 text-center text-gray-600">{p.total_sessions}</td>
                            <td className="py-2 text-right text-gray-900">{formatSGD(p.total_price_sgd)}</td>
                            <td className="py-2 text-right text-gray-500">{formatDate(p.created_at)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Sessions section */}
              {r.sessions.length > 0 && (
                <div className="p-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5" /> Sessions ({r.total_sessions})
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-gray-400 uppercase">
                          <th className="text-left pb-2">Date</th>
                          <th className="text-left pb-2">Time</th>
                          <th className="text-left pb-2">Client</th>
                          <th className="text-center pb-2">Status</th>
                          <th className="text-center pb-2">Notes</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {r.sessions.map(s => {
                          const dt = new Date(s.scheduled_at)
                          return (
                            <tr key={s.id}>
                              <td className="py-2 text-gray-900">{dt.toLocaleDateString('en-SG')}</td>
                              <td className="py-2 text-gray-600">
                                {dt.toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit' })}
                              </td>
                              <td className="py-2 text-gray-900">{s.clients?.full_name}</td>
                              <td className="py-2 text-center">
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${
                                  s.status === 'completed' ? 'bg-green-100 text-green-700' :
                                  s.status === 'scheduled' ? 'bg-blue-100 text-blue-700' :
                                  'bg-gray-100 text-gray-600'
                                }`}>
                                  {s.status}
                                </span>
                              </td>
                              <td className="py-2 text-center">
                                {s.is_notes_complete
                                  ? <span className="text-green-600 font-bold">✓</span>
                                  : <span className="text-gray-300">—</span>
                                }
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {r.sessions.length === 0 && r.package_details.length === 0 && (
                <p className="p-4 text-sm text-gray-400 text-center">No activity in this date range</p>
              )}
            </div>
          ))}

          {/* Summary table for multi-trainer views */}
          {report.length > 1 && (
            <div className="card">
              <div className="p-4 border-b border-gray-100">
                <h2 className="font-semibold text-gray-900 text-sm flex items-center gap-2">
                  <Users className="w-4 h-4 text-green-600" /> Summary by Trainer
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                      <th className="text-left p-3">Trainer</th>
                      <th className="text-center p-3">Packages Sold</th>
                      <th className="text-center p-3">Sessions Scheduled</th>
                      <th className="text-center p-3">Sessions Completed</th>
                      <th className="text-center p-3">Completion Rate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {report.map(r => (
                      <tr key={r.trainer_id} className="hover:bg-gray-50">
                        <td className="p-3 font-medium text-gray-900">{r.trainer_name}</td>
                        <td className="p-3 text-center text-gray-600">{r.packages_sold}</td>
                        <td className="p-3 text-center text-gray-600">{r.total_sessions}</td>
                        <td className="p-3 text-center text-gray-600">{r.completed_sessions}</td>
                        <td className="p-3 text-center">
                          <span className={`text-xs font-medium ${
                            r.total_sessions > 0 && r.completed_sessions / r.total_sessions >= 0.8
                              ? 'text-green-600' : 'text-amber-600'
                          }`}>
                            {r.total_sessions > 0
                              ? Math.round(r.completed_sessions / r.total_sessions * 100) + '%'
                              : '—'
                            }
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-green-50 font-bold text-sm">
                      <td className="p-3 text-green-800">TOTAL</td>
                      <td className="p-3 text-center text-green-800">{totalPackages}</td>
                      <td className="p-3 text-center text-green-800">{totalSessions}</td>
                      <td className="p-3 text-center text-green-800">{totalCompleted}</td>
                      <td className="p-3 text-center text-green-800">
                        {totalSessions > 0 ? Math.round(totalCompleted / totalSessions * 100) + '%' : '—'}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
