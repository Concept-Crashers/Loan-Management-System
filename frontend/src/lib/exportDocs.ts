/**
 * exportDocs.ts — Corporate document export utility
 * Generates professional PDF and styled Excel reports, receipts, and statements
 * for the Loan Management System.
 *
 * Dependencies: jspdf, jspdf-autotable, xlsx (already installed)
 * Install: pnpm add jspdf jspdf-autotable
 */

import type { LoanAccount, Repayment, ScheduleInstallment } from './types'

// ─── Org info shape ──────────────────────────────────────────────────────────
export interface OrgInfo {
  companyName: string
  tagline: string
  country: string
  currency: string
  logoDataUrl: string | null
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Generate a document number like RPT-20241108-7294 */
export function docNumber(prefix: string): string {
  const d = new Date()
  const dateStr = d.toISOString().slice(0, 10).replace(/-/g, '')
  const rand = Math.floor(1000 + Math.random() * 9000)
  return `${prefix}-${dateStr}-${rand}`
}

/** Format a number as UGX 1,250,000 */
function fmtUGX(value: number): string {
  return `UGX ${new Intl.NumberFormat('en-UG', { maximumFractionDigits: 0 }).format(value)}`
}

/** Format date as "08 Nov 2024" */
function fmtDate(value: string | Date | undefined | null): string {
  if (!value) return '—'
  try {
    const d = typeof value === 'string' ? new Date(value) : value
    if (isNaN(d.getTime())) return String(value)
    return d.toLocaleDateString('en-UG', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch { return String(value) }
}

/** Format datetime as "08 Nov 2024, 14:30" */
function fmtDateTime(d = new Date()): string {
  return d.toLocaleDateString('en-UG', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

/** Convert a number to English words (supports up to billions) */
export function numberToWords(n: number): string {
  if (n === 0) return 'Zero'
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

  function below1000(num: number): string {
    if (num < 20) return ones[num] ?? ''
    if (num < 100) return tens[Math.floor(num / 10)] + (num % 10 ? ' ' + ones[num % 10] : '')
    return ones[Math.floor(num / 100)] + ' Hundred' + (num % 100 ? ' ' + below1000(num % 100) : '')
  }

  const parts: string[] = []
  const groups = [
    { div: 1_000_000_000, label: 'Billion' },
    { div: 1_000_000, label: 'Million' },
    { div: 1_000, label: 'Thousand' },
    { div: 1, label: '' },
  ]
  let rem = Math.abs(Math.round(n))
  for (const { div, label } of groups) {
    const q = Math.floor(rem / div)
    if (q > 0) {
      parts.push(below1000(q) + (label ? ' ' + label : ''))
      rem -= q * div
    }
  }
  return (n < 0 ? 'Negative ' : '') + parts.join(' ')
}

/** Title-case a snake_case or camelCase field key */
function humanLabel(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\bUgx\b/g, 'UGX')
    .replace(/\bId\b/g, 'ID')
    .replace(/\bRef\b/g, 'Ref')
}

// ─── Colour palette (navy corporate) ─────────────────────────────────────────
const NAVY: [number, number, number] = [23, 54, 93]
const NAVY_LIGHT: [number, number, number] = [52, 91, 134]
const SILVER: [number, number, number] = [247, 249, 252]
const WHITE: [number, number, number] = [255, 255, 255]
const GOLD: [number, number, number] = [193, 154, 61]
const TEXT_DARK: [number, number, number] = [30, 45, 70]
const TEXT_MUTED: [number, number, number] = [110, 125, 145]
const BORDER: [number, number, number] = [220, 228, 238]

// ─── A. exportReportPDF ───────────────────────────────────────────────────────

export interface ReportPDFOptions {
  reportLabel: string
  rows: Record<string, unknown>[]
  fromDate: string
  toDate: string
  org: OrgInfo
  summary?: { totalDisbursed?: number; totalRepayments?: number; totalOutstanding?: number; parRate?: string }
  save?: boolean
}

export async function exportReportPDF(options: ReportPDFOptions): Promise<Blob | void> {
  const { default: jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')

  const { reportLabel, rows, fromDate, toDate, org, summary, save = true } = options
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const W = doc.internal.pageSize.getWidth()
  const docNo = docNumber('RPT')
  const now = new Date()
  const filename = `${reportLabel.toLowerCase().replace(/\s+/g, '-')}-${now.toISOString().slice(0, 10)}.pdf`

  // ── TOP HEADER BAR ──
  doc.setFillColor(...NAVY)
  doc.rect(0, 0, W, 22, 'F')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  doc.setTextColor(...WHITE)
  doc.text(org.companyName.toUpperCase(), 10, 10)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(180, 210, 245)
  doc.text(org.tagline || 'LOAN OPERATIONS', 10, 16)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.setTextColor(255, 220, 130)
  doc.text('CONFIDENTIAL', W - 10, 10, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.5)
  doc.setTextColor(180, 210, 245)
  doc.text(`${org.country} · Authorised Personnel Only`, W - 10, 16, { align: 'right' })

  // ── GOLD ACCENT LINE ──
  doc.setFillColor(...GOLD)
  doc.rect(0, 22, W, 1.2, 'F')

  // ── REPORT TITLE ──
  let y = 32
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(...NAVY)
  doc.text(reportLabel.toUpperCase(), 10, y)

  y += 4
  doc.setFillColor(...BORDER)
  doc.rect(10, y, W - 20, 0.4, 'F')
  y += 6

  // ── META GRID ──
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(...TEXT_MUTED)
  const col2 = W / 2 + 5

  doc.text('Generated:', 10, y)
  doc.setTextColor(...TEXT_DARK)
  doc.text(fmtDateTime(now), 32, y)

  doc.setTextColor(...TEXT_MUTED)
  doc.text('Report Period:', col2, y)
  doc.setTextColor(...TEXT_DARK)
  doc.text(`${fmtDate(fromDate)} – ${fmtDate(toDate)}`, col2 + 25, y)

  y += 5.5
  doc.setTextColor(...TEXT_MUTED)
  doc.text('Document No:', 10, y)
  doc.setTextColor(...NAVY)
  doc.setFont('helvetica', 'bold')
  doc.text(docNo, 32, y)

  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...TEXT_MUTED)
  doc.text('Total Records:', col2, y)
  doc.setTextColor(...TEXT_DARK)
  doc.text(String(rows.length), col2 + 25, y)

  y += 8

  // ── SUMMARY KPIs (if monetary data available) ──
  if (summary && Object.values(summary).some((v) => v !== undefined)) {
    const kpis: { label: string; value: string }[] = []
    if (summary.totalDisbursed !== undefined) kpis.push({ label: 'Total Disbursed', value: fmtUGX(summary.totalDisbursed) })
    if (summary.totalRepayments !== undefined) kpis.push({ label: 'Repayments Collected', value: fmtUGX(summary.totalRepayments) })
    if (summary.totalOutstanding !== undefined) kpis.push({ label: 'Outstanding Balance', value: fmtUGX(summary.totalOutstanding) })
    if (summary.parRate !== undefined) kpis.push({ label: 'Portfolio at Risk (PAR)', value: `${summary.parRate}%` })

    if (kpis.length) {
      const boxW = (W - 20 - (kpis.length - 1) * 4) / kpis.length
      kpis.forEach((kpi, i) => {
        const bx = 10 + i * (boxW + 4)
        doc.setFillColor(...SILVER)
        doc.roundedRect(bx, y, boxW, 14, 2, 2, 'F')
        doc.setDrawColor(...BORDER)
        doc.roundedRect(bx, y, boxW, 14, 2, 2, 'S')
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(7)
        doc.setTextColor(...TEXT_MUTED)
        doc.text(kpi.label, bx + boxW / 2, y + 5, { align: 'center' })
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(9)
        doc.setTextColor(...NAVY)
        doc.text(kpi.value, bx + boxW / 2, y + 11, { align: 'center' })
      })
      y += 19
    }
  }

  // ── DATA TABLE ──
  if (rows.length === 0) {
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(9)
    doc.setTextColor(...TEXT_MUTED)
    doc.text('No records found for the selected filters.', W / 2, y + 10, { align: 'center' })
  } else {
    const keys = Object.keys(rows[0])
    const head = [keys.map(humanLabel)]
    const body = rows.map((row) =>
      keys.map((k) => {
        const v = row[k]
        if (typeof v === 'number' && k.toLowerCase().includes('ugx')) return fmtUGX(v)
        if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) return fmtDate(v)
        return v === null || v === undefined ? '—' : String(v)
      })
    )

    // Detect right-align columns (UGX amounts)
    const columnStyles: Record<number, { halign: 'right' | 'left' | 'center' }> = {}
    keys.forEach((k, i) => {
      if (k.toLowerCase().includes('ugx') || k.toLowerCase().includes('amount') || k.toLowerCase().includes('balance')) {
        columnStyles[i] = { halign: 'right' }
      }
    })

    autoTable(doc, {
      head,
      body,
      startY: y,
      theme: 'grid',
      headStyles: {
        fillColor: NAVY,
        textColor: WHITE,
        fontStyle: 'bold',
        fontSize: 8,
        cellPadding: 4,
      },
      alternateRowStyles: { fillColor: SILVER },
      bodyStyles: { fontSize: 8, textColor: TEXT_DARK, cellPadding: 3 },
      columnStyles,
      tableLineColor: BORDER,
      tableLineWidth: 0.3,
      margin: { left: 10, right: 10 },
      didDrawPage: (data) => {
        // Page footer
        const pageCount = (doc as any).internal.getNumberOfPages()
        const pg = data.pageNumber
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(7)
        doc.setTextColor(...TEXT_MUTED)
        const H = doc.internal.pageSize.getHeight()
        doc.setFillColor(...SILVER)
        doc.rect(0, H - 10, W, 10, 'F')
        doc.setDrawColor(...BORDER)
        doc.line(0, H - 10, W, H - 10)
        doc.text(
          `Generated by ${org.companyName} Loan Management System · ${fmtDateTime(now)}`,
          10, H - 4
        )
        doc.text(`Page ${pg} of ${pageCount}`, W - 10, H - 4, { align: 'right' })
        doc.text('This document is confidential and intended for authorised personnel only.', W / 2, H - 4, { align: 'center' })
      },
    })
  }

  if (!save) return doc.output('blob') as Blob
  doc.save(filename)
}

// ─── B. exportReportExcel ─────────────────────────────────────────────────────

export interface ReportExcelOptions {
  reportLabel: string
  reportKey: string
  rows: Record<string, unknown>[]
  fromDate: string
  toDate: string
  org: OrgInfo
  summary?: { totalDisbursed?: number; totalRepayments?: number; totalOutstanding?: number; parRate?: string }
  save?: boolean
}

export async function exportReportExcel(options: ReportExcelOptions): Promise<Blob | void> {
  const XLSX = await import('xlsx')
  const { reportLabel, reportKey, rows, fromDate, toDate, org, summary, save = true } = options
  const docNo = docNumber('RPT')
  const now = new Date()
  const filename = `${reportKey}-report-${now.toISOString().slice(0, 10)}.xlsx`

  const wb = XLSX.utils.book_new()

  // Build sheet data as array of arrays for full control
  const sheetData: unknown[][] = []

  // Row 1: Company name header
  sheetData.push([`${org.companyName.toUpperCase()} — ${org.tagline || 'LOAN OPERATIONS'}`])
  // Row 2: Tagline + confidential
  sheetData.push([`${org.country} · Loan Management System`, '', '', '', '', 'CONFIDENTIAL'])
  // Row 3: empty
  sheetData.push([])
  // Row 4: Report title
  sheetData.push([reportLabel.toUpperCase()])
  // Row 5: Generated date and period
  sheetData.push([`Generated: ${fmtDateTime(now)}`, '', `Period: ${fmtDate(fromDate)} – ${fmtDate(toDate)}`])
  // Row 6: Doc number and record count
  sheetData.push([`Document No: ${docNo}`, '', `Records: ${rows.length}`])
  // Row 7: empty
  sheetData.push([])

  // Row 8: KPI summary (if applicable)
  const kpiRow: unknown[] = []
  if (summary) {
    if (summary.totalDisbursed !== undefined) { kpiRow.push('Total Disbursed'); kpiRow.push(fmtUGX(summary.totalDisbursed)); kpiRow.push('') }
    if (summary.totalRepayments !== undefined) { kpiRow.push('Repayments'); kpiRow.push(fmtUGX(summary.totalRepayments)); kpiRow.push('') }
    if (summary.totalOutstanding !== undefined) { kpiRow.push('Outstanding'); kpiRow.push(fmtUGX(summary.totalOutstanding)); kpiRow.push('') }
    if (summary.parRate !== undefined) { kpiRow.push('PAR'); kpiRow.push(`${summary.parRate}%`) }
  }
  sheetData.push(kpiRow.length ? kpiRow : [])
  // Row 9: empty
  sheetData.push([])

  // Row 10+: Data table
  if (rows.length > 0) {
    const keys = Object.keys(rows[0])
    // Header row
    sheetData.push(keys.map(humanLabel))
    // Data rows
    rows.forEach((row) => {
      sheetData.push(keys.map((k) => {
        const v = row[k]
        if (typeof v === 'number' && k.toLowerCase().includes('ugx')) return fmtUGX(v)
        if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) return fmtDate(v)
        return v === null || v === undefined ? '—' : v
      }))
    })
    // END OF REPORT row
    sheetData.push([])
    sheetData.push(['— END OF REPORT —'])
  } else {
    sheetData.push(['No records found for the selected filters.'])
  }

  const ws = XLSX.utils.aoa_to_sheet(sheetData)

  // Column widths — auto-calculate from content
  const colWidths: { wch: number }[] = []
  if (rows.length > 0) {
    const keys = Object.keys(rows[0])
    keys.forEach((k) => {
      const header = humanLabel(k)
      const maxData = Math.min(
        rows.reduce((max, row) => Math.max(max, String(row[k] ?? '').length), 0),
        40
      )
      colWidths.push({ wch: Math.max(header.length, maxData) + 2 })
    })
  } else {
    colWidths.push({ wch: 40 })
  }
  ws['!cols'] = colWidths

  // Freeze first 10 rows (header area)
  ws['!freeze'] = { xSplit: 0, ySplit: 10, topLeftCell: 'A11', activePane: 'bottomLeft', state: 'frozen' } as any

  // Merge cells for title rows (columns A-F)
  const mergeCount = Math.max(colWidths.length, 6)
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: mergeCount - 1 } }, // Company name
    { s: { r: 1, c: 0 }, e: { r: 1, c: mergeCount - 2 } }, // Tagline
    { s: { r: 3, c: 0 }, e: { r: 3, c: mergeCount - 1 } }, // Report title
  ]

  XLSX.utils.book_append_sheet(wb, ws, reportLabel.slice(0, 31))
  if (!save) {
    const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer
    return new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  }
  XLSX.writeFile(wb, filename)
}

// ─── C. generateReceiptPDF ────────────────────────────────────────────────────

export interface ReceiptData {
  repayment: Repayment
  loan?: LoanAccount
  org: OrgInfo
  save?: boolean
  filename?: string
}

export async function generateReceiptPDF(data: ReceiptData): Promise<Blob | void> {
  const { default: jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')

  const { repayment, loan, org, save = true, filename } = data
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  const receiptNo = docNumber('RCT')
  const now = new Date()
  const outName = filename || `receipt-${receiptNo}.pdf`

  // ── HEADER BAR ──
  doc.setFillColor(...NAVY)
  doc.rect(0, 0, W, 32, 'F')

  // Logo placeholder box
  doc.setFillColor(255, 255, 255, 0.15)
  doc.setDrawColor(255, 255, 255)
  doc.roundedRect(10, 7, 18, 18, 2, 2, 'S')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...WHITE)
  const initials = org.companyName.split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase()
  doc.text(initials, 19, 18, { align: 'center' })

  // Company name
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(...WHITE)
  doc.text(org.companyName.toUpperCase(), 32, 13)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(180, 210, 245)
  doc.text(`${org.tagline || 'LOAN OPERATIONS'} · ${org.country}`, 32, 19)
  doc.setFontSize(6.5)
  doc.text('Authorised Money Lending Institution', 32, 24)

  // Gold line
  doc.setFillColor(...GOLD)
  doc.rect(0, 32, W, 1.2, 'F')

  let y = 42

  // ── RECEIPT TITLE BOX ──
  doc.setFillColor(...NAVY)
  doc.roundedRect(10, y, W - 20, 16, 3, 3, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.setTextColor(...WHITE)
  doc.text('OFFICIAL PAYMENT RECEIPT', W / 2, y + 7, { align: 'center' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(180, 210, 245)
  doc.text(`Receipt No: ${receiptNo}`, W / 2, y + 13, { align: 'center' })

  y += 24

  // ── TWO-COLUMN INFO GRID ──
  const colLeft = 12
  const colRight = W / 2 + 5
  const rowH = 8

  function infoRow(label: string, value: string, cx: number, cy: number) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(...TEXT_MUTED)
    doc.text(label + ':', cx, cy)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(...TEXT_DARK)
    doc.text(value || '—', cx + 30, cy)
  }

  infoRow('Receipt Date', fmtDate(repayment.date || now.toISOString()), colLeft, y)
  infoRow('Loan Reference', repayment.loan || '—', colRight, y)
  y += rowH
  infoRow('Payment Method', repayment.method || '—', colLeft, y)
  infoRow('Customer Name', repayment.customer || '—', colRight, y)
  y += rowH
  infoRow('Received By', repayment.receivedBy || '—', colLeft, y)
  infoRow('Customer ID', repayment.customerId || '—', colRight, y)
  y += rowH
  infoRow('Reference', repayment.reference || 'N/A (Cash)', colLeft, y)
  infoRow('Status', repayment.status || '—', colRight, y)

  y += 14

  // ── AMOUNT BOX ──
  doc.setFillColor(240, 247, 255)
  doc.setDrawColor(...NAVY_LIGHT)
  doc.roundedRect(20, y, W - 40, 32, 4, 4, 'FD')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.setTextColor(...NAVY_LIGHT)
  doc.text('AMOUNT RECEIVED', W / 2, y + 8, { align: 'center' })

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(22)
  doc.setTextColor(...NAVY)
  doc.text(fmtUGX(repayment.amount || 0), W / 2, y + 20, { align: 'center' })

  doc.setFont('helvetica', 'italic')
  doc.setFontSize(7.5)
  doc.setTextColor(...TEXT_MUTED)
  const words = numberToWords(repayment.amount || 0)
  doc.text(`(${words} Shillings Only)`, W / 2, y + 28, { align: 'center' })

  y += 42

  // ── ALLOCATION TABLE ──
  const allocationBody = [
    ['Principal', '—', '(See loan statement for breakdown)'],
    ['Interest', '—', ''],
    ['Fees', '—', ''],
  ]
  const allocationTotal = [[{ content: 'Total Payment', styles: { fontStyle: 'bold' as const } }, { content: fmtUGX(repayment.amount || 0), styles: { fontStyle: 'bold' as const, halign: 'right' as const } }, '']]

  autoTable(doc, {
    head: [['Description', 'Amount (UGX)', 'Notes']],
    body: [...allocationBody, ...allocationTotal],
    startY: y,
    theme: 'grid',
    headStyles: { fillColor: NAVY, textColor: WHITE, fontSize: 8, fontStyle: 'bold' },
    bodyStyles: { fontSize: 8, textColor: TEXT_DARK },
    alternateRowStyles: { fillColor: SILVER },
    columnStyles: { 1: { halign: 'right' } },
    margin: { left: 20, right: 20 },
    tableLineColor: BORDER,
    tableLineWidth: 0.3,
  })

  y = ((doc as any).lastAutoTable?.finalY ?? y + 30) + 8

  // ── REMAINING BALANCE ──
  if (loan) {
    doc.setFillColor(232, 246, 239)
    doc.setDrawColor(80, 180, 130)
    doc.roundedRect(20, y, W - 40, 10, 2, 2, 'FD')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(30, 100, 70)
    doc.text(`Outstanding Balance After Payment: ${fmtUGX(loan.outstanding || 0)}`, W / 2, y + 7, { align: 'center' })
    y += 18
  }

  // ── FOOTER ──
  const footerY = H - 48
  doc.setFillColor(...BORDER)
  doc.rect(10, footerY, W - 20, 0.4, 'F')

  doc.setFont('helvetica', 'italic')
  doc.setFontSize(7.5)
  doc.setTextColor(...TEXT_MUTED)
  doc.text('This is an official receipt. Please retain for your records.', W / 2, footerY + 7, { align: 'center' })

  // Signature lines
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(...TEXT_DARK)
  doc.text('Authorised Signature:', 20, footerY + 18)
  doc.setDrawColor(...TEXT_MUTED)
  doc.line(50, footerY + 18, 100, footerY + 18)

  doc.text('Date:', W - 60, footerY + 18)
  doc.line(W - 50, footerY + 18, W - 20, footerY + 18)

  // Stamp/Seal box
  doc.setDrawColor(...BORDER)
  doc.roundedRect(W / 2 - 20, footerY + 22, 40, 20, 2, 2, 'S')
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.5)
  doc.setTextColor(...TEXT_MUTED)
  doc.text('OFFICIAL STAMP / SEAL', W / 2, footerY + 34, { align: 'center' })

  // Bottom bar
  doc.setFillColor(...NAVY)
  doc.rect(0, H - 10, W, 10, 'F')
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.5)
  doc.setTextColor(...WHITE)
  doc.text(`${org.companyName} · Loan Management System · Generated: ${fmtDateTime(now)}`, W / 2, H - 4, { align: 'center' })

  if (!save) return doc.output('blob') as Blob
  doc.save(outName)
}

export interface DisbursementReceiptData {
  disbursement: { id: string; reference?: string; customer: string; loanRef: string; amount: number; method: string; status: string; authorizedAt?: string; completedAt?: string }
  org: OrgInfo
  save?: boolean
  filename?: string
}

export async function generateDisbursementReceiptPDF(data: DisbursementReceiptData): Promise<Blob | void> {
  const { default: jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')
  const { disbursement, org, save = true, filename } = data
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  const receiptNo = docNumber('DSB')
  const now = new Date()
  const outName = filename || `disbursement-${receiptNo}.pdf`
  doc.setFillColor(...NAVY); doc.rect(0, 0, W, 32, 'F')
  doc.setDrawColor(255,255,255); doc.roundedRect(10,7,18,18,2,2,'S')
  doc.setFont('helvetica','bold'); doc.setFontSize(9); doc.setTextColor(...WHITE)
  const initials = org.companyName.split(/\s+/).map((p)=>p[0]).join('').slice(0,2).toUpperCase()
  doc.text(initials,19,18,{align:'center'})
  doc.setFontSize(14); doc.text(org.companyName.toUpperCase(),32,13)
  doc.setFont('helvetica','normal'); doc.setFontSize(7.5); doc.setTextColor(180,210,245)
  doc.text(`${org.tagline||'LOAN OPERATIONS'} · ${org.country}`,32,19)
  doc.setFillColor(...GOLD); doc.rect(0,32,W,1.2,'F')
  let y=42
  doc.setFillColor(...NAVY); doc.roundedRect(10,y,W-20,16,3,3,'F')
  doc.setFont('helvetica','bold'); doc.setFontSize(13); doc.setTextColor(...WHITE)
  doc.text('OFFICIAL DISBURSEMENT RECEIPT',W/2,y+7,{align:'center'})
  doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(180,210,245)
  doc.text(`Receipt No: ${receiptNo}`,W/2,y+13,{align:'center'})
  y+=24
  autoTable(doc, { head: [['Field','Value']], body: [['Customer',disbursement.customer],['Loan Account',disbursement.loanRef],['Reference',disbursement.reference||disbursement.id],['Method',disbursement.method],['Status',disbursement.status],['Authorized',disbursement.authorizedAt?fmtDate(disbursement.authorizedAt):'—'],['Completed',disbursement.completedAt?fmtDate(disbursement.completedAt):'—']], startY:y, theme:'grid', headStyles:{fillColor:NAVY,textColor:WHITE}, margin:{left:20,right:20}, tableLineColor:BORDER })
  y=((doc as any).lastAutoTable?.finalY??y+30)+8
  doc.setFillColor(240,247,255); doc.setDrawColor(...NAVY_LIGHT); doc.roundedRect(20,y,W-40,24,4,4,'FD')
  doc.setFont('helvetica','bold'); doc.setFontSize(8.5); doc.setTextColor(...NAVY_LIGHT); doc.text('AMOUNT RELEASED',W/2,y+8,{align:'center'})
  doc.setFontSize(20); doc.setTextColor(...NAVY); doc.text(fmtUGX(disbursement.amount||0),W/2,y+18,{align:'center'})
  doc.setFillColor(...NAVY); doc.rect(0,H-10,W,10,'F'); doc.setFont('helvetica','normal'); doc.setFontSize(6.5); doc.setTextColor(...WHITE); doc.text(`${org.companyName} · Loan Management System · Generated: ${fmtDateTime(now)}`,W/2,H-4,{align:'center'})
  if (!save) return doc.output('blob') as Blob
  doc.save(outName)
}

// ─── D. generateLoanStatementPDF ─────────────────────────────────────────────

export interface LoanStatementData {
  loan: LoanAccount
  repayments: Repayment[]
  schedule?: ScheduleInstallment[]
  org: OrgInfo
  customerInfo?: { address?: string; phone?: string; email?: string }
  save?: boolean
  filename?: string
}

export async function generateLoanStatementPDF(data: LoanStatementData): Promise<Blob | void> {
  const { default: jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')

  const { loan, repayments, schedule, org, customerInfo, save = true, filename } = data
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  const stmNo = docNumber('STM')
  const now = new Date()
  const outName = filename || `loan-statement-${loan.ref || stmNo}-${now.toISOString().slice(0, 10)}.pdf`

  // ── HEADER BAR (same as receipt) ──
  doc.setFillColor(...NAVY)
  doc.rect(0, 0, W, 32, 'F')

  doc.setDrawColor(255, 255, 255)
  doc.roundedRect(10, 7, 18, 18, 2, 2, 'S')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...WHITE)
  const initials = org.companyName.split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase()
  doc.text(initials, 19, 18, { align: 'center' })

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(...WHITE)
  doc.text(org.companyName.toUpperCase(), 32, 13)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(180, 210, 245)
  doc.text(`${org.tagline || 'LOAN OPERATIONS'} · ${org.country}`, 32, 19)
  doc.setFontSize(6.5)
  doc.text('Authorised Money Lending Institution', 32, 24)

  doc.setFillColor(...GOLD)
  doc.rect(0, 32, W, 1.2, 'F')

  let y = 42

  // ── STATEMENT TITLE BOX ──
  doc.setFillColor(...NAVY)
  doc.roundedRect(10, y, W - 20, 18, 3, 3, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.setTextColor(...WHITE)
  doc.text('LOAN ACCOUNT STATEMENT', W / 2, y + 7, { align: 'center' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(180, 210, 245)
  doc.text(`Statement Date: ${fmtDate(now.toISOString())}`, W / 2 - 30, y + 14, { align: 'center' })
  doc.text(`Statement No: ${stmNo}`, W / 2 + 30, y + 14, { align: 'center' })

  y += 26

  // ── BORROWER & LOAN DETAILS (2-column grid) ──
  doc.setFillColor(...SILVER)
  doc.roundedRect(10, y, W - 20, 50, 2, 2, 'F')
  doc.setDrawColor(...BORDER)
  doc.roundedRect(10, y, W - 20, 50, 2, 2, 'S')

  const detailLeft = 14
  const detailRight = W / 2 + 5
  const detailRowH = 7.5

  function detailRow(label: string, value: string, cx: number, cy: number) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(...TEXT_MUTED)
    doc.text(label, cx, cy)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(...TEXT_DARK)
    doc.text(value || '—', cx, cy + 4)
  }

  const r1y = y + 7
  detailRow('Borrower Name', loan.customer || '—', detailLeft, r1y)
  detailRow('Loan Reference', loan.ref || '—', detailRight, r1y)

  const r2y = r1y + detailRowH + 2
  detailRow('Customer ID', loan.customerId || '—', detailLeft, r2y)
  detailRow('Loan Product', loan.product || '—', detailRight, r2y)

  const r3y = r2y + detailRowH + 2
  detailRow('Address', customerInfo?.address || '—', detailLeft, r3y)
  detailRow('Principal Amount', fmtUGX(loan.principal || 0), detailRight, r3y)

  const r4y = r3y + detailRowH + 2
  detailRow('Phone', customerInfo?.phone || '—', detailLeft, r4y)
  detailRow('Disbursement Date', fmtDate(loan.start), detailRight, r4y)

  const r5y = r4y + detailRowH + 2
  detailRow('Loan Status', loan.status || '—', detailLeft, r5y)
  detailRow('Maturity Date', fmtDate(loan.maturity), detailRight, r5y)

  y += 56

  // ── ACCOUNT SUMMARY BOXES ──
  const summaryItems = [
    { label: 'Total Disbursed', value: fmtUGX(loan.disbursed || loan.principal || 0), color: NAVY },
    { label: 'Total Paid', value: fmtUGX(loan.paid || 0), color: [38, 134, 108] as [number, number, number] },
    { label: 'Outstanding Balance', value: fmtUGX(loan.outstanding || 0), color: [180, 70, 40] as [number, number, number] },
    { label: 'Next Due Date', value: fmtDate(loan.nextDue), color: [150, 100, 20] as [number, number, number] },
  ]
  const sumBoxW = (W - 20 - 9) / 4
  summaryItems.forEach((item, i) => {
    const bx = 10 + i * (sumBoxW + 3)
    doc.setFillColor(...item.color)
    doc.roundedRect(bx, y, sumBoxW, 16, 2, 2, 'F')
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6.5)
    doc.setTextColor(...WHITE)
    doc.text(item.label, bx + sumBoxW / 2, y + 5.5, { align: 'center' })
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.5)
    doc.text(item.value, bx + sumBoxW / 2, y + 12, { align: 'center' })
  })

  y += 22

  // ── REPAYMENT HISTORY TABLE ──
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...NAVY)
  doc.text('Repayment History', 10, y)
  y += 4

  if (repayments.length > 0) {
    let runningBalance = loan.disbursed || loan.principal || 0
    const repayBody = repayments.map((r, idx) => {
      runningBalance = Math.max(0, runningBalance - (r.amount || 0))
      return [
        String(idx + 1),
        fmtDate(r.date),
        r.reference || r.id || '—',
        '—',
        fmtUGX(r.amount || 0),
        fmtUGX(runningBalance),
        r.status || '—',
      ]
    })

    autoTable(doc, {
      head: [['#', 'Date', 'Reference', 'Debit', 'Credit', 'Balance', 'Status']],
      body: repayBody,
      startY: y,
      theme: 'grid',
      headStyles: { fillColor: NAVY, textColor: WHITE, fontSize: 7.5, fontStyle: 'bold', cellPadding: 3 },
      bodyStyles: { fontSize: 7.5, textColor: TEXT_DARK, cellPadding: 2.5 },
      alternateRowStyles: { fillColor: SILVER },
      columnStyles: {
        0: { halign: 'center', cellWidth: 8 },
        3: { halign: 'right' },
        4: { halign: 'right' },
        5: { halign: 'right', fontStyle: 'bold' },
      },
      tableLineColor: BORDER,
      tableLineWidth: 0.3,
      margin: { left: 10, right: 10 },
    })
    y = ((doc as any).lastAutoTable?.finalY ?? y + 20) + 8
  } else {
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(8)
    doc.setTextColor(...TEXT_MUTED)
    doc.text('No repayment records found.', 10, y + 6)
    y += 14
  }

  // ── SCHEDULE TABLE (if available & fits) ──
  if (schedule && schedule.length > 0 && y < H - 60) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(...NAVY)
    doc.text('Repayment Schedule', 10, y)
    y += 4

    const schedBody = schedule.map((s, i) => [
      String(i + 1),
      fmtDate(s.due),
      fmtUGX(s.expected || 0),
      fmtUGX(s.paid || 0),
      s.status || '—',
    ])

    autoTable(doc, {
      head: [['#', 'Due Date', 'Expected', 'Paid', 'Status']],
      body: schedBody,
      startY: y,
      theme: 'grid',
      headStyles: { fillColor: NAVY_LIGHT, textColor: WHITE, fontSize: 7.5, fontStyle: 'bold', cellPadding: 3 },
      bodyStyles: { fontSize: 7.5, textColor: TEXT_DARK, cellPadding: 2.5 },
      alternateRowStyles: { fillColor: SILVER },
      columnStyles: {
        0: { halign: 'center', cellWidth: 8 },
        2: { halign: 'right' },
        3: { halign: 'right' },
      },
      tableLineColor: BORDER,
      tableLineWidth: 0.3,
      margin: { left: 10, right: 10 },
    })
  }

  // ── PAGE FOOTER (all pages) ──
  const totalPages = (doc as any).internal.getNumberOfPages()
  for (let pg = 1; pg <= totalPages; pg++) {
    doc.setPage(pg)
    doc.setFillColor(...SILVER)
    doc.rect(0, H - 20, W, 20, 'F')
    doc.setDrawColor(...BORDER)
    doc.line(0, H - 20, W, H - 20)

    doc.setFont('helvetica', 'italic')
    doc.setFontSize(7)
    doc.setTextColor(...TEXT_MUTED)
    doc.text('This statement is generated for informational purposes only and does not constitute a legal notice.', W / 2, H - 14, { align: 'center' })

    doc.setFont('helvetica', 'normal')
    doc.text('Authorised By: ___________________', 20, H - 7)
    doc.text(`Date: ${fmtDate(now.toISOString())}`, W / 2, H - 7, { align: 'center' })
    doc.text(`Page ${pg} of ${totalPages}`, W - 10, H - 7, { align: 'right' })
  }

  if (!save) return doc.output('blob') as Blob
  doc.save(outName)
}

