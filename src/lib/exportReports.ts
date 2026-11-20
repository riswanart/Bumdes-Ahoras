import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { BumdesProfile, FinancialStatements, JournalEntryRecord } from '../types/accounting';
import { formatDateId, formatRupiah } from './formatters';

export function exportReportsToExcel(
  reports: FinancialStatements,
  profile: BumdesProfile,
  journals: JournalEntryRecord[]
): void {
  const wb = XLSX.utils.book_new();
  const periodLabel = `${formatDateId(reports.startDate)} s/d ${formatDateId(reports.endDate)}`;

  // Sheet 1: Neraca Saldo
  const tbRows = reports.trialBalance.map((r) => ({
    'Kode Akun': r.code,
    'Nama Akun': r.name,
    Kategori: r.category,
    'Saldo Awal (D)': r.openingDebit,
    'Saldo Awal (K)': r.openingCredit,
    'Mutasi (D)': r.periodDebit,
    'Mutasi (K)': r.periodCredit,
    'Saldo Akhir (D)': r.endingDebit,
    'Saldo Akhir (K)': r.endingCredit,
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(tbRows), 'Neraca Saldo');

  // Sheet 2: Laba Rugi
  const isRows: { Pos: string; Kode: string; Uraian: string; Jumlah: number }[] = [
    ...reports.incomeStatement.revenues.map((r) => ({
      Pos: 'Pendapatan Usaha',
      Kode: r.code,
      Uraian: r.name,
      Jumlah: r.amount,
    })),
    { Pos: 'SUBTOTAL', Kode: '', Uraian: 'Total Pendapatan Usaha', Jumlah: reports.incomeStatement.totalRevenue },
    ...reports.incomeStatement.cogs.map((r) => ({
      Pos: 'Harga Pokok Penjualan',
      Kode: r.code,
      Uraian: r.name,
      Jumlah: -r.amount,
    })),
    { Pos: 'LABA KOTOR', Kode: '', Uraian: 'Laba Kotor (Gross Profit)', Jumlah: reports.incomeStatement.grossProfit },
    ...reports.incomeStatement.operatingExpenses.map((r) => ({
      Pos: 'Beban Operasional',
      Kode: r.code,
      Uraian: r.name,
      Jumlah: -r.amount,
    })),
    { Pos: 'LABA BERSIH', Kode: '', Uraian: 'Laba Bersih Periode Berjalan', Jumlah: reports.incomeStatement.netProfit },
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(isRows), 'Laba Rugi');

  // Sheet 3: Neraca
  const bsRows = [
    ...reports.balanceSheet.currentAssets.map((r) => ({
      Kelompok: 'Aset Lancar',
      Kode: r.code,
      Akun: r.name,
      Saldo: r.amount,
    })),
    ...reports.balanceSheet.fixedAssets.map((r) => ({
      Kelompok: 'Aset Tetap',
      Kode: r.code,
      Akun: r.name,
      Saldo: r.amount,
    })),
    { Kelompok: 'TOTAL ASET', Kode: '', Akun: 'Jumlah Aset', Saldo: reports.balanceSheet.totalAssets },
    ...reports.balanceSheet.liabilities.map((r) => ({
      Kelompok: 'Kewajiban',
      Kode: r.code,
      Akun: r.name,
      Saldo: r.amount,
    })),
    ...reports.balanceSheet.equityItems.map((r) => ({
      Kelompok: 'Ekuitas',
      Kode: r.code,
      Akun: r.name,
      Saldo: r.amount,
    })),
    {
      Kelompok: 'Ekuitas',
      Kode: '',
      Akun: 'Laba Periode Berjalan',
      Saldo: reports.balanceSheet.currentPeriodProfit,
    },
    {
      Kelompok: 'TOTAL KEWAJIBAN & EKUITAS',
      Kode: '',
      Akun: 'Jumlah Kewajiban + Ekuitas',
      Saldo: reports.balanceSheet.totalLiabilitiesAndEquity,
    },
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(bsRows), 'Neraca');

  // Sheet 4: Arus Kas
  const cfRows = [
    { Aktivitas: 'Saldo Awal Kas & Bank', Keterangan: periodLabel, Jumlah: reports.cashFlow.beginningCash },
    ...reports.cashFlow.operatingDetails.map((d) => ({
      Aktivitas: 'Aktivitas Operasi',
      Keterangan: d.label,
      Jumlah: d.amount,
    })),
    ...reports.cashFlow.investingDetails.map((d) => ({
      Aktivitas: 'Aktivitas Investasi',
      Keterangan: d.label,
      Jumlah: d.amount,
    })),
    ...reports.cashFlow.financingDetails.map((d) => ({
      Aktivitas: 'Aktivitas Pendanaan',
      Keterangan: d.label,
      Jumlah: d.amount,
    })),
    { Aktivitas: 'Saldo Akhir Kas & Bank', Keterangan: 'Posisi Akhir', Jumlah: reports.cashFlow.endingCash },
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(cfRows), 'Arus Kas');

  // Sheet 5: Jurnal Umum
  const jRows: {
    Nomor: string;
    Tanggal: string;
    Unit: string;
    Uraian: string;
    Akun: string;
    Debit: number;
    Kredit: number;
  }[] = [];
  for (const j of journals) {
    if (j.entryDate < reports.startDate || j.entryDate > reports.endDate) continue;
    if (reports.unitId && j.unitId !== reports.unitId) continue;
    for (const l of j.lines) {
      jRows.push({
        Nomor: j.journalNumber,
        Tanggal: j.entryDate,
        Unit: j.unitName,
        Uraian: j.description,
        Akun: `${l.accountCode} - ${l.accountName}`,
        Debit: l.debit,
        Kredit: l.credit,
      });
    }
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(jRows), 'Jurnal Umum');

  const safeName = profile.name.replace(/[^a-zA-Z0-9]+/g, '_');
  XLSX.writeFile(wb, `Laporan_Keuangan_${safeName}_${reports.endDate}.xlsx`);
}

export function exportReportsToPdf(
  reports: FinancialStatements,
  profile: BumdesProfile
): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const periodLabel = `${formatDateId(reports.startDate)} s/d ${formatDateId(reports.endDate)}`;

  const addHeader = (title: string) => {
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text(profile.name.toUpperCase(), 14, 16);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(
      `${profile.villageName}, ${profile.subDistrict}, ${profile.district} · SK AHU: ${profile.ahuNumber}`,
      14,
      21
    );
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(title, 14, 29);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Unit: ${reports.unitLabel} | Periode: ${periodLabel}`, 14, 34);
  };

  // Page 1: Laporan Laba Rugi
  addHeader('LAPORAN LABA RUGI (KEPMENDESA PDTT NO. 136 TAHUN 2022)');
  autoTable(doc, {
    startY: 38,
    head: [['Kode', 'Pos / Nama Akun', 'Nilai (Rp)']],
    body: [
      ...reports.incomeStatement.revenues.map((r) => [r.code, r.name, formatRupiah(r.amount)]),
      ['', 'Total Pendapatan Usaha', formatRupiah(reports.incomeStatement.totalRevenue)],
      ...reports.incomeStatement.cogs.map((r) => [r.code, r.name, formatRupiah(-r.amount)]),
      ['', 'Laba Kotor (Gross Profit)', formatRupiah(reports.incomeStatement.grossProfit)],
      ...reports.incomeStatement.operatingExpenses.map((r) => [r.code, r.name, formatRupiah(-r.amount)]),
      ['', 'Laba Bersih Periode Berjalan', formatRupiah(reports.incomeStatement.netProfit)],
    ],
    styles: { fontSize: 8.5 },
    headStyles: { fillColor: [15, 23, 42] },
    columnStyles: { 2: { halign: 'right' } },
  });

  // Page 2: Laporan Posisi Keuangan (Neraca)
  doc.addPage();
  addHeader('LAPORAN POSISI KEUANGAN / NERACA (SAK EMKM)');
  autoTable(doc, {
    startY: 38,
    head: [['Kode', 'Aset / Kewajiban / Ekuitas', 'Saldo (Rp)']],
    body: [
      ...reports.balanceSheet.currentAssets.map((r) => [r.code, r.name, formatRupiah(r.amount)]),
      ...reports.balanceSheet.fixedAssets.map((r) => [r.code, r.name, formatRupiah(r.amount)]),
      ['', 'TOTAL ASET', formatRupiah(reports.balanceSheet.totalAssets)],
      ...reports.balanceSheet.liabilities.map((r) => [r.code, r.name, formatRupiah(r.amount)]),
      ...reports.balanceSheet.equityItems.map((r) => [r.code, r.name, formatRupiah(r.amount)]),
      ['', 'Laba Periode Berjalan', formatRupiah(reports.balanceSheet.currentPeriodProfit)],
      ['', 'TOTAL KEWAJIBAN & EKUITAS', formatRupiah(reports.balanceSheet.totalLiabilitiesAndEquity)],
    ],
    styles: { fontSize: 8.5 },
    headStyles: { fillColor: [15, 23, 42] },
    columnStyles: { 2: { halign: 'right' } },
  });

  // Page 3: Neraca Saldo & Perubahan Ekuitas
  doc.addPage();
  addHeader('NERACA SALDO & ALOKASI PADes');
  autoTable(doc, {
    startY: 38,
    head: [['Kode', 'Nama Akun', 'Saldo Akhir (Debit)', 'Saldo Akhir (Kredit)']],
    body: [
      ...reports.trialBalance.map((r) => [
        r.code,
        r.name,
        formatRupiah(r.endingDebit, false),
        formatRupiah(r.endingCredit, false),
      ]),
      [
        '',
        'TOTAL NERACA SALDO',
        formatRupiah(reports.trialBalanceTotals.endingDebit),
        formatRupiah(reports.trialBalanceTotals.endingCredit),
      ],
    ],
    styles: { fontSize: 8 },
    headStyles: { fillColor: [15, 23, 42] },
    columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' } },
  });

  const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || 140;
  doc.setFontSize(9);
  doc.text(`Proyeksi Bagi Hasil PADes (${profile.padesSharePercent}%): ${formatRupiah(reports.equityStatement.projectedPadesAllocation)}`, 14, finalY + 10);
  doc.text(`Mengetahui, Direktur BUMDes: ${profile.directorName}`, 14, finalY + 24);
  doc.text(`Bendahara BUMDes: ${profile.treasurerName}`, 120, finalY + 24);

  const safeName = profile.name.replace(/[^a-zA-Z0-9]+/g, '_');
  doc.save(`Laporan_BUMDes_${safeName}_${reports.endDate}.pdf`);
}
