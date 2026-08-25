import { format } from 'date-fns';
import { FaceInfo, isDateInArray } from './attendanceUtils';
import { supabase } from '@/integrations/supabase/client';
import { isWorkingDayForSchool } from '@/utils/workingDays';

interface ReportGenerationProps {
  selectedFace: FaceInfo;
  workingDays: Date[];
  attendanceDays: Date[];
  lateAttendanceDays: Date[];
  absentDays: Date[];
  selectedDate?: Date;
  dailyAttendance: {
    id: string;
    timestamp: string;
    status: string;
  }[];
}

// Generate and open a printable report
export const generatePrintableReport = async ({
  selectedFace,
  workingDays,
  attendanceDays,
  lateAttendanceDays,
  absentDays,
  selectedDate,
  dailyAttendance
}: ReportGenerationProps): Promise<Window | null> => {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    return null;
  }

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  // Get today's actual date for reference
  const today = new Date();
  
  // Get date 30 days ago from today
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(today.getDate() - 30);

  // First, get the registration record to find the face ID and identifiers
  const { data: registrationRecord, error: regError } = await supabase
    .from('attendance_records')
    .select('*')
    .eq('id', selectedFace.recordId)
    .eq('status', 'registered')
    .maybeSingle();

  // If no record found by recordId, try by user_id
  let regRecord = registrationRecord;
  if (!regRecord) {
    const { data: altRecord } = await supabase
      .from('attendance_records')
      .select('*')
      .eq('user_id', selectedFace.recordId)
      .eq('status', 'registered')
      .maybeSingle();
    regRecord = altRecord;
  }

  if (!regRecord) {
    console.warn('No registration record found for selected face:', selectedFace);
    return null;
  }

  const deviceInfo = regRecord.device_info as any;
  const registeredEmployeeId = selectedFace.employee_id || deviceInfo?.metadata?.employee_id || deviceInfo?.employee_id;
  const registeredUserId = regRecord.user_id || selectedFace.recordId;
  const faceDescriptor = deviceInfo?.metadata?.faceDescriptor;
  
  console.log('Report matching identifiers:', { registeredEmployeeId, registeredUserId });

  // Now get all attendance records for the last 30 days (ascending for earliest-first)
  const { data: allAttendanceRecords, error: attendanceError } = await supabase
    .from('attendance_records')
    .select('*')
    .gte('timestamp', thirtyDaysAgo.toISOString())
    .lte('timestamp', today.toISOString())
    .in('status', ['present', 'late', 'unauthorized'])
    .order('timestamp', { ascending: true });

  if (attendanceError) {
    console.error('Error fetching attendance records:', attendanceError);
    return null;
  }

  // Filter records to find matches for this specific person
  let attendanceRecords: any[] = [];
  if (allAttendanceRecords) {
    attendanceRecords = allAttendanceRecords.filter(record => {
      const recordDeviceInfo = record.device_info as any;
      if (!recordDeviceInfo) return false;
      
      // Primary: Match by employee_id (most reliable)
      const recordEmployeeId = recordDeviceInfo?.metadata?.employee_id || recordDeviceInfo?.employee_id;
      if (registeredEmployeeId && recordEmployeeId && registeredEmployeeId === recordEmployeeId) {
        return true;
      }
      
      // Secondary: Match by user_id
      if (record.user_id && registeredUserId && record.user_id === registeredUserId) {
        return true;
      }
      
      // Tertiary: Match by name (fallback)
      const recordName = recordDeviceInfo?.metadata?.name;
      if (recordName && selectedFace.name && recordName.toLowerCase() === selectedFace.name.toLowerCase()) {
        return true;
      }
      
      // Last resort: Face descriptor matching
      if (faceDescriptor && recordDeviceInfo.faceDescriptor) {
        const recordDescriptor = recordDeviceInfo.faceDescriptor;
        if (Array.isArray(recordDescriptor) && Array.isArray(faceDescriptor)) {
          const similarity = calculateDescriptorSimilarity(faceDescriptor, recordDescriptor);
          return similarity > 0.6;
        }
      }
      
      return false;
    });
  }
  
  console.log(`Found ${attendanceRecords.length} matching attendance records for ${selectedFace.name}`);

  // Helper function to calculate descriptor similarity
  function calculateDescriptorSimilarity(desc1: number[], desc2: number[]): number {
    if (desc1.length !== desc2.length) return 0;
    
    let distance = 0;
    for (let i = 0; i < desc1.length; i++) {
      distance += Math.pow(desc1[i] - desc2[i], 2);
    }
    distance = Math.sqrt(distance);
    
    // Convert distance to similarity (lower distance = higher similarity)
    return Math.max(0, 1 - distance);
  }

  if (attendanceRecords.length === 0) {
    console.warn('No attendance records found for selected face');
  }

  // Normalize status to match calendar logic: unauthorized = present
  function normalizeReportStatus(status: string): string {
    const s = (status || '').toLowerCase().trim();
    if (s === 'unauthorized' || s.includes('present')) return 'present';
    if (s.includes('late')) return 'late';
    return s;
  }

  // Process attendance records to get status counts - keep only earliest per day
  const recordsByDate = new Map<string, any[]>();
  attendanceRecords?.forEach(record => {
    const recordDate = new Date(record.timestamp).toDateString();
    if (!recordsByDate.has(recordDate)) {
      recordsByDate.set(recordDate, []);
    }
    recordsByDate.get(recordDate)!.push(record);
  });
  // Sort each day's records ascending (earliest first)
  recordsByDate.forEach((records, key) => {
    records.sort((a: any, b: any) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  });

  // Generate working days for the last 30 days
  const realtimeWorkingDays: Date[] = [];
  for (let i = 0; i < 30; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    if (isWorkingDayForSchool(date)) {
      realtimeWorkingDays.push(date);
    }
  }

  // Calculate realtime stats
  const totalWorkDays = realtimeWorkingDays.length;
  let presentCount = 0;
  let lateCount = 0;
  let absentCount = 0;

  realtimeWorkingDays.forEach(workDate => {
    const dateKey = workDate.toDateString();
    const dayRecords = recordsByDate.get(dateKey) || [];
    
    if (dayRecords.length > 0) {
      // Check for registration records (these don't count as attendance)
      const attendanceOnlyRecords = dayRecords.filter(record => {
        const deviceInfo = record.device_info as any;
        return !deviceInfo?.registration;
      });
      
      if (attendanceOnlyRecords.length > 0) {
        // Use earliest record's normalized status
        const earliestStatus = normalizeReportStatus(attendanceOnlyRecords[0].status);
        if (earliestStatus === 'late') {
          lateCount++;
        } else {
          presentCount++;
        }
      } else {
        absentCount++;
      }
    } else {
      absentCount++;
    }
  });
  
  const attendanceRate = totalWorkDays > 0 ? ((presentCount + lateCount) / totalWorkDays * 100).toFixed(1) : "0.0";

  // Create rows for attendance table using realtime data
  const tableRows = realtimeWorkingDays
    .sort((a, b) => b.getTime() - a.getTime())
    .map(date => {
      const dateKey = date.toDateString();
      const dayRecords = recordsByDate.get(dateKey) || [];
      
      // Filter out registration records
      const attendanceOnlyRecords = dayRecords.filter(record => {
        const deviceInfo = record.device_info as any;
        return !deviceInfo?.registration;
      });
      
      let attendanceTime = '';
      let status = 'Absent';
      let statusClass = 'status-absent';
      let statusIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="status-icon"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
      
      if (attendanceOnlyRecords.length > 0) {
        // Use earliest record (already sorted ascending)
        const firstRecord = attendanceOnlyRecords[0];
        const recordTime = new Date(firstRecord.timestamp);
        attendanceTime = recordTime.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit'
        });
        
        const earliestStatus = normalizeReportStatus(firstRecord.status);
        if (earliestStatus === 'late') {
          status = 'Late';
          statusClass = 'status-late';
          statusIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="status-icon"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>';
        } else {
          status = 'Present';
          statusClass = 'status-present';
          statusIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="status-icon"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><polyline points="16 11 18 13 22 9"></polyline></svg>';
        }
      }
      
      return `
        <tr>
          <td>${formatDate(date)}</td>
          <td>
            <div class="status-with-icon">
              ${statusIcon}
              <span class="status-badge ${statusClass}">${status}</span>
            </div>
          </td>
          <td>${attendanceOnlyRecords.length > 0 ? attendanceTime : '-'}</td>
        </tr>
      `;
    }).join('');

  // Build mini bar chart data for last 7 working days
  const last7Working = realtimeWorkingDays.slice(0, 7).reverse();
  const chartBars = last7Working.map(date => {
    const dateKey = date.toDateString();
    const dayRecords = recordsByDate.get(dateKey) || [];
    const attendanceOnly = dayRecords.filter((r: any) => !(r.device_info as any)?.registration);
    let status = 'absent';
    if (attendanceOnly.length > 0) {
      status = normalizeReportStatus(attendanceOnly[0].status) === 'late' ? 'late' : 'present';
    }
    const dayLabel = date.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' });
    return { dayLabel, status };
  });

  const chartBarsHTML = chartBars.map(b => {
    const color = b.status === 'present' ? '#10b981' : b.status === 'late' ? '#f59e0b' : '#ef4444';
    const height = b.status === 'absent' ? '20%' : b.status === 'late' ? '65%' : '100%';
    return `<div style="display:flex;flex-direction:column;align-items:center;gap:4px;flex:1">
      <div style="width:100%;height:120px;display:flex;align-items:flex-end">
        <div style="width:100%;height:${height};background:${color};border-radius:6px 6px 2px 2px;transition:height 0.3s"></div>
      </div>
      <span style="font-size:10px;color:#94a3b8;font-weight:500">${b.dayLabel}</span>
    </div>`;
  }).join('');

  // Attendance rate ring SVG
  const rate = parseFloat(attendanceRate);
  const circumference = 2 * Math.PI * 54;
  const strokeDash = (rate / 100) * circumference;
  const rateColor = rate >= 90 ? '#10b981' : rate >= 75 ? '#f59e0b' : '#ef4444';

  printWindow.document.write(`
    <html>
      <head>
        <title>Attendance Report - ${selectedFace.name}</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
          
          * { margin: 0; padding: 0; box-sizing: border-box; }
          
          body {
            font-family: 'Inter', -apple-system, sans-serif;
            color: #1e293b;
            background: #f8fafc;
            min-height: 100vh;
          }

          .page {
            max-width: 900px;
            margin: 0 auto;
            background: white;
            min-height: 100vh;
          }

          /* ---- HEADER ---- */
          .report-header {
            background: linear-gradient(135deg, #0f172a 0%, #1e3a5f 50%, #0ea5e9 100%);
            padding: 40px 48px 36px;
            position: relative;
            overflow: hidden;
          }
          .report-header::before {
            content: '';
            position: absolute;
            top: -60%;
            right: -20%;
            width: 500px;
            height: 500px;
            background: radial-gradient(circle, rgba(14,165,233,0.15) 0%, transparent 70%);
            border-radius: 50%;
          }
          .report-header::after {
            content: '';
            position: absolute;
            bottom: -40%;
            left: -10%;
            width: 400px;
            height: 400px;
            background: radial-gradient(circle, rgba(139,92,246,0.1) 0%, transparent 70%);
            border-radius: 50%;
          }
          .header-top {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            position: relative;
            z-index: 1;
          }
          .header-brand {
            display: flex;
            align-items: center;
            gap: 12px;
          }
          .brand-icon {
            width: 40px;
            height: 40px;
            background: rgba(255,255,255,0.15);
            border-radius: 10px;
            display: flex;
            align-items: center;
            justify-content: center;
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255,255,255,0.1);
          }
          .brand-icon svg { color: white; }
          .brand-text {
            font-size: 13px;
            font-weight: 600;
            color: rgba(255,255,255,0.9);
            letter-spacing: 0.5px;
          }
          .header-date {
            font-size: 12px;
            color: rgba(255,255,255,0.5);
            text-align: right;
          }
          .header-main {
            margin-top: 28px;
            position: relative;
            z-index: 1;
          }
          .header-main h1 {
            font-size: 28px;
            font-weight: 800;
            color: white;
            letter-spacing: -0.5px;
            margin-bottom: 4px;
          }
          .header-subtitle {
            font-size: 14px;
            color: rgba(255,255,255,0.6);
            font-weight: 400;
          }
          .header-meta {
            display: flex;
            gap: 24px;
            margin-top: 20px;
            position: relative;
            z-index: 1;
          }
          .meta-chip {
            display: flex;
            align-items: center;
            gap: 6px;
            background: rgba(255,255,255,0.1);
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255,255,255,0.1);
            padding: 6px 14px;
            border-radius: 20px;
            font-size: 12px;
            color: rgba(255,255,255,0.85);
            font-weight: 500;
          }
          .meta-chip svg { opacity: 0.7; }

          /* ---- STATS GRID ---- */
          .stats-section {
            padding: 32px 48px;
            display: grid;
            grid-template-columns: 1fr 1fr 1fr 200px;
            gap: 20px;
            border-bottom: 1px solid #f1f5f9;
          }
          .stat-card {
            padding: 20px;
            border-radius: 16px;
            border: 1px solid #f1f5f9;
            background: #fafbfc;
          }
          .stat-card .stat-label {
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.8px;
            color: #94a3b8;
            margin-bottom: 8px;
          }
          .stat-card .stat-value {
            font-size: 32px;
            font-weight: 800;
            letter-spacing: -1px;
          }
          .stat-card .stat-sub {
            font-size: 12px;
            color: #94a3b8;
            margin-top: 4px;
          }
          .stat-present .stat-value { color: #10b981; }
          .stat-late .stat-value { color: #f59e0b; }
          .stat-absent .stat-value { color: #ef4444; }

          .rate-card {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 16px;
            border-radius: 16px;
            background: linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%);
            border: 1px solid #d1fae5;
          }
          .rate-ring { position: relative; }
          .rate-label {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            text-align: center;
          }
          .rate-label .rate-num {
            font-size: 22px;
            font-weight: 800;
            color: #1e293b;
          }
          .rate-label .rate-pct {
            font-size: 10px;
            color: #64748b;
          }

          /* ---- CHART ---- */
          .chart-section {
            padding: 28px 48px;
            border-bottom: 1px solid #f1f5f9;
          }
          .section-title {
            font-size: 14px;
            font-weight: 700;
            color: #1e293b;
            margin-bottom: 16px;
            display: flex;
            align-items: center;
            gap: 8px;
          }
          .section-title .dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: #0ea5e9;
          }
          .chart-container {
            display: flex;
            gap: 8px;
            align-items: flex-end;
          }

          /* ---- TABLE ---- */
          .table-section {
            padding: 28px 48px 48px;
          }
          .report-table {
            width: 100%;
            border-collapse: separate;
            border-spacing: 0;
            font-size: 13px;
          }
          .report-table thead th {
            background: #f8fafc;
            padding: 12px 16px;
            text-align: left;
            font-weight: 600;
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 0.8px;
            color: #64748b;
            border-bottom: 2px solid #e2e8f0;
          }
          .report-table thead th:first-child { border-radius: 10px 0 0 0; }
          .report-table thead th:last-child { border-radius: 0 10px 0 0; }
          .report-table tbody td {
            padding: 12px 16px;
            border-bottom: 1px solid #f1f5f9;
            color: #334155;
          }
          .report-table tbody tr:hover { background: #f8fafc; }
          .report-table tbody tr:last-child td { border-bottom: none; }

          .badge {
            display: inline-flex;
            align-items: center;
            gap: 5px;
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 11px;
            font-weight: 600;
          }
          .badge-present { background: #ecfdf5; color: #059669; }
          .badge-late { background: #fffbeb; color: #d97706; }
          .badge-absent { background: #fef2f2; color: #dc2626; }
          .badge-dot {
            width: 6px;
            height: 6px;
            border-radius: 50%;
          }
          .badge-present .badge-dot { background: #10b981; }
          .badge-late .badge-dot { background: #f59e0b; }
          .badge-absent .badge-dot { background: #ef4444; }

          .time-display {
            font-variant-numeric: tabular-nums;
            font-weight: 500;
            color: #475569;
          }

          /* ---- FOOTER ---- */
          .report-footer {
            padding: 24px 48px;
            background: #f8fafc;
            border-top: 1px solid #f1f5f9;
            display: flex;
            justify-content: space-between;
            align-items: center;
          }
          .footer-text {
            font-size: 11px;
            color: #94a3b8;
          }
          .print-btn {
            background: linear-gradient(135deg, #0ea5e9, #6366f1);
            color: white;
            border: none;
            padding: 10px 28px;
            border-radius: 10px;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 8px;
            transition: transform 0.15s, box-shadow 0.15s;
          }
          .print-btn:hover {
            transform: translateY(-1px);
            box-shadow: 0 4px 20px rgba(14,165,233,0.3);
          }

          @media print {
            body { background: white; }
            .page { box-shadow: none; }
            .print-btn { display: none !important; }
            .report-header { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .stat-card, .rate-card, .badge, .chart-container div div {
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
          }
        </style>
      </head>
      <body>
        <div class="page">
          <!-- HEADER -->
          <div class="report-header">
            <div class="header-top">
              <div class="header-brand">
                <div class="brand-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="10"/></svg>
                </div>
                <span class="brand-text">PRESENCE SYSTEM</span>
              </div>
              <div class="header-date">
                Generated<br/>
                <strong>${formatDate(today)}</strong>
              </div>
            </div>
            <div class="header-main">
              <h1>${selectedFace.name}</h1>
              <div class="header-subtitle">Attendance Report — Last 30 Working Days</div>
            </div>
            <div class="header-meta">
              ${selectedFace.employee_id ? `<div class="meta-chip">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>
                ID: ${selectedFace.employee_id}
              </div>` : ''}
              ${selectedFace.department ? `<div class="meta-chip">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
                ${selectedFace.department}
              </div>` : ''}
              <div class="meta-chip">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                ${formatDate(thirtyDaysAgo)} — ${formatDate(today)}
              </div>
            </div>
          </div>

          <!-- STATS -->
          <div class="stats-section">
            <div class="stat-card stat-present">
              <div class="stat-label">Present Days</div>
              <div class="stat-value">${presentCount}</div>
              <div class="stat-sub">of ${totalWorkDays} working days</div>
            </div>
            <div class="stat-card stat-late">
              <div class="stat-label">Late Arrivals</div>
              <div class="stat-value">${lateCount}</div>
              <div class="stat-sub">${totalWorkDays > 0 ? ((lateCount / totalWorkDays) * 100).toFixed(0) : 0}% of total</div>
            </div>
            <div class="stat-card stat-absent">
              <div class="stat-label">Absent Days</div>
              <div class="stat-value">${absentCount}</div>
              <div class="stat-sub">${totalWorkDays > 0 ? ((absentCount / totalWorkDays) * 100).toFixed(0) : 0}% of total</div>
            </div>
            <div class="rate-card">
              <div class="rate-ring">
                <svg width="120" height="120" viewBox="0 0 120 120">
                  <circle cx="60" cy="60" r="54" fill="none" stroke="#e2e8f0" stroke-width="8"/>
                  <circle cx="60" cy="60" r="54" fill="none" stroke="${rateColor}" stroke-width="8"
                    stroke-dasharray="${strokeDash} ${circumference}"
                    stroke-linecap="round"
                    transform="rotate(-90 60 60)"
                    style="transition: stroke-dasharray 0.5s ease"/>
                </svg>
                <div class="rate-label">
                  <div class="rate-num">${attendanceRate}</div>
                  <div class="rate-pct">% Rate</div>
                </div>
              </div>
            </div>
          </div>

          <!-- CHART -->
          <div class="chart-section">
            <div class="section-title"><span class="dot"></span> Last 7 Working Days</div>
            <div class="chart-container">
              ${chartBarsHTML}
            </div>
          </div>

          <!-- TABLE -->
          <div class="table-section">
            <div class="section-title"><span class="dot"></span> Detailed Attendance Log</div>
            <table class="report-table">
              <thead>
                <tr>
                  <th style="width:40%">Date</th>
                  <th style="width:30%">Status</th>
                  <th style="width:30%">Check-in Time</th>
                </tr>
              </thead>
              <tbody>
                ${realtimeWorkingDays
                  .sort((a, b) => b.getTime() - a.getTime())
                  .map(date => {
                    const dateKey = date.toDateString();
                    const dayRecords = recordsByDate.get(dateKey) || [];
                    const attendanceOnly = dayRecords.filter((r: any) => !(r.device_info as any)?.registration);
                    
                    let status = 'Absent';
                    let badgeClass = 'badge-absent';
                    let timeStr = '—';
                    
                    if (attendanceOnly.length > 0) {
                      const first = attendanceOnly[0]; // earliest (sorted ascending)
                      const t = new Date(first.timestamp);
                      timeStr = t.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                      const earliestNorm = normalizeReportStatus(first.status);
                      status = earliestNorm === 'late' ? 'Late' : 'Present';
                      badgeClass = earliestNorm === 'late' ? 'badge-late' : 'badge-present';
                    }
                    
                    const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
                    const dateDisplay = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                    
                    return `<tr>
                      <td><span style="color:#94a3b8;font-size:11px;margin-right:8px">${dayName}</span>${dateDisplay}</td>
                      <td><span class="badge ${badgeClass}"><span class="badge-dot"></span>${status}</span></td>
                      <td class="time-display">${timeStr}</td>
                    </tr>`;
                  }).join('')}
              </tbody>
            </table>
          </div>

          <!-- FOOTER -->
          <div class="report-footer">
            <div class="footer-text">
              This report is auto-generated by the Presence System.<br/>
              Data period: ${formatDate(thirtyDaysAgo)} — ${formatDate(today)} • ${attendanceRecords.length} records processed
            </div>
            <button class="print-btn" onclick="window.print()">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
              Print Report
            </button>
          </div>
        </div>
      </body>
    </html>
  `);
  
  printWindow.document.close();
  return printWindow;
};

// Generate and download CSV file
export const exportToCSV = async ({
  selectedFace,
  workingDays,
  attendanceDays,
  lateAttendanceDays,
  absentDays,
  selectedDate,
  dailyAttendance
}: ReportGenerationProps): Promise<void> => {
  let csvContent = "Date,Status,Time\n";
  
  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  };

  // Get today's actual date for reference
  const today = new Date();
  
  // Get date 30 days ago from today
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(today.getDate() - 30);

  // First, get the registration record to find identifiers
  const { data: registrationRecord, error: regError } = await supabase
    .from('attendance_records')
    .select('*')
    .eq('id', selectedFace.recordId)
    .eq('status', 'registered')
    .maybeSingle();

  // If no record found by recordId, try by user_id
  let regRecord = registrationRecord;
  if (!regRecord) {
    const { data: altRecord } = await supabase
      .from('attendance_records')
      .select('*')
      .eq('user_id', selectedFace.recordId)
      .eq('status', 'registered')
      .maybeSingle();
    regRecord = altRecord;
  }

  if (!regRecord) {
    console.warn('No registration record found for CSV export:', selectedFace);
    return;
  }

  const regDeviceInfo = regRecord.device_info as any;
  const registeredEmployeeId = selectedFace.employee_id || regDeviceInfo?.metadata?.employee_id || regDeviceInfo?.employee_id;
  const registeredUserId = regRecord.user_id || selectedFace.recordId;
  const faceDescriptor = regDeviceInfo?.metadata?.faceDescriptor;

  console.log('CSV export matching identifiers:', { registeredEmployeeId, registeredUserId });

  // Now get all attendance records for the last 30 days
  const { data: allAttendanceRecords, error: attendanceError } = await supabase
    .from('attendance_records')
    .select('*')
    .gte('timestamp', thirtyDaysAgo.toISOString())
    .lte('timestamp', today.toISOString())
    .in('status', ['present', 'late', 'unauthorized'])
    .order('timestamp', { ascending: true });

  if (attendanceError) {
    console.error('Error fetching attendance records:', attendanceError);
    return;
  }

  // Filter records to find matches for this specific person
  let attendanceRecords: any[] = [];
  if (allAttendanceRecords) {
    attendanceRecords = allAttendanceRecords.filter(record => {
      const recordDeviceInfo = record.device_info as any;
      if (!recordDeviceInfo) return false;
      
      // Primary: Match by employee_id (most reliable)
      const recordEmployeeId = recordDeviceInfo?.metadata?.employee_id || recordDeviceInfo?.employee_id;
      if (registeredEmployeeId && recordEmployeeId && registeredEmployeeId === recordEmployeeId) {
        return true;
      }
      
      // Secondary: Match by user_id
      if (record.user_id && registeredUserId && record.user_id === registeredUserId) {
        return true;
      }
      
      // Tertiary: Match by name (fallback)
      const recordName = recordDeviceInfo?.metadata?.name;
      if (recordName && selectedFace.name && recordName.toLowerCase() === selectedFace.name.toLowerCase()) {
        return true;
      }
      
      // Last resort: Face descriptor matching
      if (faceDescriptor && recordDeviceInfo.faceDescriptor) {
        const recordDescriptor = recordDeviceInfo.faceDescriptor;
        if (Array.isArray(recordDescriptor) && Array.isArray(faceDescriptor)) {
          const similarity = calculateDescriptorSimilarityCSV(faceDescriptor, recordDescriptor);
          return similarity > 0.6;
        }
      }
      
      return false;
    });
  }

  console.log(`CSV: Found ${attendanceRecords.length} matching attendance records for ${selectedFace.name}`);
  // Helper function to calculate descriptor similarity for CSV
  function calculateDescriptorSimilarityCSV(desc1: number[], desc2: number[]): number {
    if (desc1.length !== desc2.length) return 0;
    
    let distance = 0;
    for (let i = 0; i < desc1.length; i++) {
      distance += Math.pow(desc1[i] - desc2[i], 2);
    }
    distance = Math.sqrt(distance);
    
    // Convert distance to similarity (lower distance = higher similarity)
    return Math.max(0, 1 - distance);
  }

  // Normalize status for CSV (same logic as calendar)
  function normalizeCSVStatus(status: string): string {
    const s = (status || '').toLowerCase().trim();
    if (s === 'unauthorized' || s.includes('present')) return 'present';
    if (s.includes('late')) return 'late';
    return s;
  }

  // Process attendance records - sort ascending per day for earliest first
  const recordsByDate = new Map<string, any[]>();
  attendanceRecords?.forEach(record => {
    const recordDate = new Date(record.timestamp).toDateString();
    if (!recordsByDate.has(recordDate)) {
      recordsByDate.set(recordDate, []);
    }
    recordsByDate.get(recordDate)!.push(record);
  });
  recordsByDate.forEach((records) => {
    records.sort((a: any, b: any) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  });

  // Generate working days for the last 30 days
  const realtimeWorkingDays: Date[] = [];
  for (let i = 0; i < 30; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    if (isWorkingDayForSchool(date)) {
      realtimeWorkingDays.push(date);
    }
  }

  const sortedDays = [...realtimeWorkingDays]
    .sort((a, b) => b.getTime() - a.getTime());
  
  sortedDays.forEach(date => {
    const dateKey = date.toDateString();
    const dayRecords = recordsByDate.get(dateKey) || [];
    
    // Filter out registration records
    const attendanceOnlyRecords = dayRecords.filter(record => {
      const deviceInfo = record.device_info as any;
      return !deviceInfo?.registration;
    });
    
    let status = 'Absent';
    let timeInfo = '';
    
    if (attendanceOnlyRecords.length > 0) {
      const firstRecord = attendanceOnlyRecords[0]; // earliest
      const recordTime = new Date(firstRecord.timestamp);
      timeInfo = recordTime.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit'
      });
      
      const earliestNorm = normalizeCSVStatus(firstRecord.status);
      status = earliestNorm === 'late' ? 'Late' : 'Present';
    }
    
    csvContent += `${formatDate(date)},${status},${attendanceOnlyRecords.length > 0 ? timeInfo : '-'}\n`;
  });
  
  const encodedUri = encodeURI("data:text/csv;charset=utf-8," + csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `${selectedFace.name.replace(/\s+/g, '_')}_last_30_days_attendance.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};
