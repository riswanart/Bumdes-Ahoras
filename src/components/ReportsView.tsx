import React, { useMemo, useState } from 'react';
import { Download, FileText, Printer } from 'lucide-react';
import { generateFinancialStatements } from '../lib/accountingEngine';
import { exportReportsToExcel, exportReportsToPdf } from '../lib/exportReports';
import { formatDateId, formatNumber, formatRupiah } from '../lib/formatters';
import type {
  Account,
  BudgetPlanRecord,
  BumdesProfile,
  BusinessUnit,
  FertilizerProduct,
  JournalEntryRecord,
} from '../types/accounting';

interface ReportsViewProps {
  profile: BumdesProfile;
  units: BusinessUnit[];
  accounts: Account[];
  budgets: BudgetPlanRecord[];
  journals: JournalEntryRecord[];
  products: FertilizerProduct[];
}

type ReportTab =
  | 'ledger'
  | 'trial_balance'
  | 'income'
  | 'equity'
  | 'balance_sheet'
  | 'cash_flow'
  | 'calk';

const REPORT_TABS: { id: ReportTab; label: string }[] = [
  { id: 'ledger', label: '1. Jurnal & Buku Besar' },
  { id: 'trial_balance', label: '2. Neraca Saldo' },
  { id: 'income', label: '3. Laba Rugi' },
  { id: 'equity', label: '4. Perubahan Ekuitas' },
  { id: 'balance_sheet', label: '5. Neraca' },
  { id: 'cash_flow', label: '6. Arus Kas' },
  { id: 'calk', label: '7. Catatan (CaLK)' },
];

export const ReportsView: React.FC<ReportsViewProps> = ({
  profile,
  units,
  accounts,
  budgets,
  journals,
  products,
}) => {
  const [activeTab, setActiveTab] = useState<ReportTab>('income');
  const [startDate, setStartDate] = useState(`${profile.fiscalYear}-01-01`);
  const [endDate, setEndDate] = useState(`${profile.fiscalYear}-12-31`);
  const [unitId, setUnitId] = useState<number | null>(null);
  const [ledgerAccountId, setLedgerAccountId] = useState<number>(accounts[0]?.id || 1);

  const unitLabel = unitId
    ? units.find((u) => u.id === unitId)?.name || 'Unit Usaha'
    : 'Konsolidasi BUMDes';

  const reports = useMemo(
    () =>
      generateFinancialStatements({
        accounts,
        entries: journals,
        budgets,
        profile,
        startDate,
        endDate,
        unitId,
        unitLabel,
      }),
    [accounts, journals, budgets, profile, startDate, endDate, unitId, unitLabel]
  );

  // General Ledger entries for selected account
  const selectedLedgerAccount = accounts.find((a) => a.id === ledgerAccountId) || accounts[0];
  const ledgerRows = useMemo(() => {
    if (!selectedLedgerAccount) return { openingBalance: 0, rows: [] };
    const scoped = [...journals]
      .filter((j) => (unitId ? j.unitId === unitId : true))
      .sort((a, b) => a.entryDate.localeCompare(b.entryDate) || a.id - b.id);

    let running = 0;
    const rows: {
      date: string;
      journalNumber: string;
      description: string;
      debit: number;
      credit: number;
      balance: number;
    }[] = [];

    for (const j of scoped) {
      if (j.entryDate > endDate) continue;
      for (const l of j.lines) {
        if (l.accountId !== selectedLedgerAccount.id) continue;
        const delta =
          selectedLedgerAccount.normalBalance === 'DEBIT'
            ? l.debit - l.credit
            : l.credit - l.debit;
        running += delta;
        if (j.entryDate >= startDate) {
          rows.push({
            date: j.entryDate,
            journalNumber: j.journalNumber,
            description: j.description,
            debit: l.debit,
            credit: l.credit,
            balance: running,
          });
        }
      }
    }

    const openingBalance =
      rows.length > 0
        ? rows[0].balance -
          (selectedLedgerAccount.normalBalance === 'DEBIT'
            ? rows[0].debit - rows[0].credit
            : rows[0].credit - rows[0].debit)
        : running;

    return { openingBalance, rows };
  }, [journals, selectedLedgerAccount, startDate, endDate, unitId]);

  const totalFertilizerBags = products.reduce((sum, p) => sum + p.currentStock, 0);
  const totalFertilizerValue = products.reduce((sum, p) => sum + p.inventoryValue, 0);

  return (
    <div className="space-y-6">
      {/* Page Title & Export Actions */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 no-print">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
            Laporan Keuangan (Kepmendesa 136/2022)
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Pelaporan resmi standar SAK EMKM untuk unit usaha terpisah maupun konsolidasi BUMDes
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => exportReportsToExcel(reports, profile, journals)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" />
            <span>Ekspor Excel (.xlsx)</span>
          </button>

          <button
            type="button"
            onClick={() => exportReportsToPdf(reports, profile)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Ekspor PDF</span>
          </button>

          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Cetak</span>
          </button>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="p-4 rounded-xl bg-white dark:bg-[#0E1A15] border border-emerald-950/10 dark:border-emerald-900/40 grid grid-cols-1 sm:grid-cols-3 gap-4 no-print">
        <div>
          <label htmlFor="rep-start" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
            Dari Tanggal
          </label>
          <input
            id="rep-start"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
          />
        </div>
        <div>
          <label htmlFor="rep-end" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
            Sampai Tanggal
          </label>
          <input
            id="rep-end"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
          />
        </div>
        <div>
          <label htmlFor="rep-unit" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
            Cakupan Unit Usaha
          </label>
          <select
            id="rep-unit"
            value={unitId ?? ''}
            onChange={(e) => setUnitId(e.target.value ? Number(e.target.value) : null)}
            className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
          >
            <option value="">Konsolidasi Seluruh BUMDes</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.code} — {u.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 7 Statement Tabs */}
      <div className="flex flex-wrap gap-1 p-1 bg-slate-100 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 no-print">
        {REPORT_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`px-3 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
              activeTab === tab.id
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Formal Report Card */}
      <section className="rounded-xl bg-white dark:bg-[#0E1A15] border border-emerald-950/10 dark:border-emerald-900/40 p-6 sm:p-8 print-card">
        {/* Kop Surat BUMDes */}
        <div className="pb-4 mb-6 border-b border-slate-200 dark:border-slate-800 text-center">
          <p className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wide">
            {profile.name}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {profile.villageName}, {profile.subDistrict}, {profile.district} · SK Kemenkumham:{' '}
            {profile.ahuNumber}
          </p>
          <h2 className="text-base font-bold text-slate-900 dark:text-white mt-3">
            {REPORT_TABS.find((t) => t.id === activeTab)?.label.replace(/^\d+\.\s*/, '').toUpperCase()}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {unitLabel} · Periode {formatDateId(startDate)} s/d {formatDateId(endDate)}
          </p>
        </div>

        {/* 1. BUKU BESAR */}
        {activeTab === 'ledger' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 no-print">
              <div className="flex items-center gap-2">
                <label htmlFor="gl-account" className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Pilih Akun Buku Besar:
                </label>
                <select
                  id="gl-account"
                  value={ledgerAccountId}
                  onChange={(e) => setLedgerAccountId(Number(e.target.value))}
                  className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.code} — {a.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="text-xs text-slate-600 dark:text-slate-300 font-mono">
                Saldo Awal Akun: <strong>{formatRupiah(ledgerRows.openingBalance)}</strong>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs sm:text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                    <th className="py-2.5 px-3 font-medium">Tanggal</th>
                    <th className="py-2.5 px-3 font-medium">No. Jurnal</th>
                    <th className="py-2.5 px-3 font-medium">Keterangan</th>
                    <th className="py-2.5 px-3 font-medium text-right">Debit</th>
                    <th className="py-2.5 px-3 font-medium text-right">Kredit</th>
                    <th className="py-2.5 px-3 font-medium text-right">Saldo Berjalan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {ledgerRows.rows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-xs text-slate-500">
                        Tidak ada mutasi akun pada periode dan unit ini.
                      </td>
                    </tr>
                  ) : (
                    ledgerRows.rows.map((r, i) => (
                      <tr key={i}>
                        <td className="py-2.5 px-3 font-mono text-xs whitespace-nowrap">
                          {formatDateId(r.date)}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-xs whitespace-nowrap">
                          {r.journalNumber}
                        </td>
                        <td className="py-2.5 px-3 text-xs">{r.description}</td>
                        <td className="py-2.5 px-3 font-mono text-xs text-right whitespace-nowrap">
                          {formatRupiah(r.debit, false)}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-xs text-right whitespace-nowrap">
                          {formatRupiah(r.credit, false)}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-xs font-semibold text-right whitespace-nowrap">
                          {formatRupiah(r.balance)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 2. NERACA SALDO */}
        {activeTab === 'trial_balance' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                  <th className="py-2.5 px-3 font-medium">Kode</th>
                  <th className="py-2.5 px-3 font-medium">Nama Akun</th>
                  <th className="py-2.5 px-3 font-medium text-right">Saldo Awal (D)</th>
                  <th className="py-2.5 px-3 font-medium text-right">Saldo Awal (K)</th>
                  <th className="py-2.5 px-3 font-medium text-right">Mutasi (D)</th>
                  <th className="py-2.5 px-3 font-medium text-right">Mutasi (K)</th>
                  <th className="py-2.5 px-3 font-medium text-right">Saldo Akhir (D)</th>
                  <th className="py-2.5 px-3 font-medium text-right">Saldo Akhir (K)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {reports.trialBalance.map((row) => (
                  <tr key={row.accountId}>
                    <td className="py-2.5 px-3 font-mono text-xs text-slate-600 dark:text-slate-400">
                      {row.code}
                    </td>
                    <td className="py-2.5 px-3 text-xs font-medium text-slate-900 dark:text-white">
                      {row.name}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-xs text-right whitespace-nowrap">
                      {formatRupiah(row.openingDebit, false)}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-xs text-right whitespace-nowrap">
                      {formatRupiah(row.openingCredit, false)}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-xs text-right whitespace-nowrap">
                      {formatRupiah(row.periodDebit, false)}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-xs text-right whitespace-nowrap">
                      {formatRupiah(row.periodCredit, false)}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-xs font-semibold text-right whitespace-nowrap">
                      {formatRupiah(row.endingDebit, false)}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-xs font-semibold text-right whitespace-nowrap">
                      {formatRupiah(row.endingCredit, false)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-300 dark:border-slate-700 font-bold text-xs bg-slate-50 dark:bg-slate-950">
                  <td colSpan={2} className="py-3 px-3">
                    TOTAL NERACA SALDO
                  </td>
                  <td className="py-3 px-3 font-mono text-right">
                    {formatRupiah(reports.trialBalanceTotals.openingDebit)}
                  </td>
                  <td className="py-3 px-3 font-mono text-right">
                    {formatRupiah(reports.trialBalanceTotals.openingCredit)}
                  </td>
                  <td className="py-3 px-3 font-mono text-right">
                    {formatRupiah(reports.trialBalanceTotals.periodDebit)}
                  </td>
                  <td className="py-3 px-3 font-mono text-right">
                    {formatRupiah(reports.trialBalanceTotals.periodCredit)}
                  </td>
                  <td className="py-3 px-3 font-mono text-right text-emerald-700 dark:text-emerald-400">
                    {formatRupiah(reports.trialBalanceTotals.endingDebit)}
                  </td>
                  <td className="py-3 px-3 font-mono text-right text-emerald-700 dark:text-emerald-400">
                    {formatRupiah(reports.trialBalanceTotals.endingCredit)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {/* 3. LAPORAN LABA RUGI */}
        {activeTab === 'income' && (
          <div className="max-w-3xl mx-auto space-y-6 text-sm">
            <div>
              <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-2">
                Pendapatan Usaha
              </h3>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {reports.incomeStatement.revenues.map((r) => (
                  <div key={r.accountId} className="py-2 flex justify-between gap-4">
                    <span>
                      <span className="font-mono text-xs text-slate-500 mr-2">{r.code}</span>
                      {r.name}
                    </span>
                    <span className="font-mono tabular-nums">{formatRupiah(r.amount)}</span>
                  </div>
                ))}
                <div className="py-2.5 flex justify-between font-bold border-t border-slate-300 dark:border-slate-700">
                  <span>Total Pendapatan Usaha</span>
                  <span className="font-mono tabular-nums">
                    {formatRupiah(reports.incomeStatement.totalRevenue)}
                  </span>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-2">
                Harga Pokok Penjualan (HPP)
              </h3>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {reports.incomeStatement.cogs.length === 0 ? (
                  <div className="py-2 text-xs text-slate-500">Tidak ada beban HPP pada unit ini.</div>
                ) : (
                  reports.incomeStatement.cogs.map((r) => (
                    <div key={r.accountId} className="py-2 flex justify-between gap-4">
                      <span>
                        <span className="font-mono text-xs text-slate-500 mr-2">{r.code}</span>
                        {r.name}
                      </span>
                      <span className="font-mono tabular-nums text-red-600 dark:text-red-400">
                        {formatRupiah(-r.amount)}
                      </span>
                    </div>
                  ))
                )}
                <div className="py-2.5 flex justify-between font-bold bg-slate-50 dark:bg-slate-950 px-3 rounded-lg">
                  <span>Laba Kotor (Gross Profit)</span>
                  <span className="font-mono tabular-nums">
                    {formatRupiah(reports.incomeStatement.grossProfit)}
                  </span>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-2">
                Beban Operasional
              </h3>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {reports.incomeStatement.operatingExpenses.map((r) => (
                  <div key={r.accountId} className="py-2 flex justify-between gap-4">
                    <span>
                      <span className="font-mono text-xs text-slate-500 mr-2">{r.code}</span>
                      {r.name}
                    </span>
                    <span className="font-mono tabular-nums">{formatRupiah(r.amount)}</span>
                  </div>
                ))}
                <div className="py-2.5 flex justify-between font-bold border-t border-slate-300 dark:border-slate-700">
                  <span>Total Beban Operasional</span>
                  <span className="font-mono tabular-nums">
                    {formatRupiah(reports.incomeStatement.totalOperatingExpenses)}
                  </span>
                </div>
              </div>
            </div>

            {reports.incomeStatement.otherIncomeAndExpenses.length > 0 && (
              <div>
                <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-2">
                  Pendapatan &amp; Beban Lain-lain
                </h3>
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {reports.incomeStatement.otherIncomeAndExpenses.map((r) => (
                    <div key={r.accountId} className="py-2 flex justify-between gap-4">
                      <span>
                        <span className="font-mono text-xs text-slate-500 mr-2">{r.code}</span>
                        {r.name}
                      </span>
                      <span className="font-mono tabular-nums">{formatRupiah(r.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 flex justify-between items-center font-bold text-base">
              <span className="text-emerald-950 dark:text-emerald-200">
                Laba (Rugi) Bersih Periode Berjalan
              </span>
              <span className="font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                {formatRupiah(reports.incomeStatement.netProfit)}
              </span>
            </div>
          </div>
        )}

        {/* 4. LAPORAN PERUBAHAN EKUITAS */}
        {activeTab === 'equity' && (
          <div className="max-w-3xl mx-auto space-y-6 text-sm">
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              <div className="py-3 flex justify-between">
                <span>Penyertaan Modal Desa (3-1101)</span>
                <span className="font-mono font-semibold">
                  {formatRupiah(reports.equityStatement.villageCapital)}
                </span>
              </div>
              <div className="py-3 flex justify-between">
                <span>Penyertaan Modal Masyarakat (3-1102)</span>
                <span className="font-mono font-semibold">
                  {formatRupiah(reports.equityStatement.communityCapital)}
                </span>
              </div>
              <div className="py-3 flex justify-between">
                <span>Saldo Laba Ditahan Awal Periode</span>
                <span className="font-mono font-semibold">
                  {formatRupiah(reports.equityStatement.beginningRetainedEarnings)}
                </span>
              </div>
              <div className="py-3 flex justify-between text-emerald-700 dark:text-emerald-400">
                <span>Laba Bersih Periode Berjalan</span>
                <span className="font-mono font-semibold">
                  {formatRupiah(reports.equityStatement.currentNetProfit)}
                </span>
              </div>
              <div className="py-3 flex justify-between">
                <span>Pembagian Hasil Usaha / PADes Tercatat</span>
                <span className="font-mono font-semibold">
                  {formatRupiah(-reports.equityStatement.recordedDividendsOrPades)}
                </span>
              </div>
              <div className="py-4 flex justify-between font-bold text-base bg-slate-50 dark:bg-slate-950 px-3 rounded-lg">
                <span>Total Ekuitas Akhir</span>
                <span className="font-mono">
                  {formatRupiah(reports.equityStatement.endingEquity)}
                </span>
              </div>
            </div>

            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 space-y-2 text-xs">
              <p className="font-bold text-slate-900 dark:text-white">
                Proyeksi Alokasi Pembagian Hasil Usaha (Sesuai AD/ART BUMDes)
              </p>
              <div className="flex justify-between">
                <span>Pendapatan Asli Desa / PADes ({profile.padesSharePercent}% dari Laba Bersih)</span>
                <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400">
                  {formatRupiah(reports.equityStatement.projectedPadesAllocation)}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Penambahan Pemupukan Modal BUMDes ({profile.capitalReservePercent}%)</span>
                <span className="font-mono font-semibold">
                  {formatRupiah(reports.equityStatement.projectedReserveAllocation)}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* 5. NERACA / LAPORAN POSISI KEUANGAN */}
        {activeTab === 'balance_sheet' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 text-sm">
              {/* ASET */}
              <div className="space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wide text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800 pb-2">
                  ASET
                </h3>
                <div>
                  <p className="text-xs font-semibold text-slate-500 mb-1">Aset Lancar</p>
                  {reports.balanceSheet.currentAssets.map((r) => (
                    <div key={r.accountId} className="py-1.5 flex justify-between">
                      <span>
                        <span className="font-mono text-xs text-slate-500 mr-2">{r.code}</span>
                        {r.name}
                      </span>
                      <span className="font-mono">{formatRupiah(r.amount)}</span>
                    </div>
                  ))}
                  <div className="py-2 flex justify-between font-semibold border-t border-slate-200 dark:border-slate-800 mt-1">
                    <span>Jumlah Aset Lancar</span>
                    <span className="font-mono">
                      {formatRupiah(reports.balanceSheet.totalCurrentAssets)}
                    </span>
                  </div>
                </div>

                <div>
                  <p className="text-xs font-semibold text-slate-500 mb-1">Aset Tetap (Neto)</p>
                  {reports.balanceSheet.fixedAssets.map((r) => (
                    <div key={r.accountId} className="py-1.5 flex justify-between">
                      <span>
                        <span className="font-mono text-xs text-slate-500 mr-2">{r.code}</span>
                        {r.name}
                      </span>
                      <span className="font-mono">{formatRupiah(r.amount)}</span>
                    </div>
                  ))}
                  <div className="py-2 flex justify-between font-semibold border-t border-slate-200 dark:border-slate-800 mt-1">
                    <span>Jumlah Aset Tetap</span>
                    <span className="font-mono">
                      {formatRupiah(reports.balanceSheet.totalFixedAssets)}
                    </span>
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-slate-100 dark:bg-slate-950 font-bold flex justify-between">
                  <span>TOTAL ASET</span>
                  <span className="font-mono">{formatRupiah(reports.balanceSheet.totalAssets)}</span>
                </div>
              </div>

              {/* KEWAJIBAN & EKUITAS */}
              <div className="space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wide text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800 pb-2">
                  KEWAJIBAN &amp; EKUITAS
                </h3>
                <div>
                  <p className="text-xs font-semibold text-slate-500 mb-1">Kewajiban</p>
                  {reports.balanceSheet.liabilities.length === 0 ? (
                    <p className="text-xs text-slate-500 py-1.5">Tidak ada saldo kewajiban.</p>
                  ) : (
                    reports.balanceSheet.liabilities.map((r) => (
                      <div key={r.accountId} className="py-1.5 flex justify-between">
                        <span>
                          <span className="font-mono text-xs text-slate-500 mr-2">{r.code}</span>
                          {r.name}
                        </span>
                        <span className="font-mono">{formatRupiah(r.amount)}</span>
                      </div>
                    ))
                  )}
                  <div className="py-2 flex justify-between font-semibold border-t border-slate-200 dark:border-slate-800 mt-1">
                    <span>Jumlah Kewajiban</span>
                    <span className="font-mono">
                      {formatRupiah(reports.balanceSheet.totalLiabilities)}
                    </span>
                  </div>
                </div>

                <div>
                  <p className="text-xs font-semibold text-slate-500 mb-1">Ekuitas</p>
                  {reports.balanceSheet.equityItems.map((r) => (
                    <div key={r.accountId} className="py-1.5 flex justify-between">
                      <span>
                        <span className="font-mono text-xs text-slate-500 mr-2">{r.code}</span>
                        {r.name}
                      </span>
                      <span className="font-mono">{formatRupiah(r.amount)}</span>
                    </div>
                  ))}
                  {reports.balanceSheet.priorRetainedEarnings !== 0 && (
                    <div className="py-1.5 flex justify-between">
                      <span>Akumulasi Laba Sebelum Periode</span>
                      <span className="font-mono">
                        {formatRupiah(reports.balanceSheet.priorRetainedEarnings)}
                      </span>
                    </div>
                  )}
                  <div className="py-1.5 flex justify-between text-emerald-700 dark:text-emerald-400">
                    <span>Laba (Rugi) Periode Berjalan</span>
                    <span className="font-mono">
                      {formatRupiah(reports.balanceSheet.currentPeriodProfit)}
                    </span>
                  </div>
                  <div className="py-2 flex justify-between font-semibold border-t border-slate-200 dark:border-slate-800 mt-1">
                    <span>Jumlah Ekuitas</span>
                    <span className="font-mono">
                      {formatRupiah(reports.balanceSheet.totalEquity)}
                    </span>
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-slate-100 dark:bg-slate-950 font-bold flex justify-between">
                  <span>TOTAL KEWAJIBAN &amp; EKUITAS</span>
                  <span className="font-mono">
                    {formatRupiah(reports.balanceSheet.totalLiabilitiesAndEquity)}
                  </span>
                </div>
              </div>
            </div>

            <div className="text-xs text-center text-slate-600 dark:text-slate-400 pt-2">
              Status Persamaan Akuntansi:{' '}
              <strong
                className={
                  reports.balanceSheet.isBalanced
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : 'text-red-600'
                }
              >
                {reports.balanceSheet.isBalanced
                  ? 'SEIMBANG (Total Aset = Total Kewajiban + Ekuitas)'
                  : 'TIDAK SEIMBANG'}
              </strong>
            </div>
          </div>
        )}

        {/* 6. LAPORAN ARUS KAS */}
        {activeTab === 'cash_flow' && (
          <div className="max-w-3xl mx-auto space-y-6 text-sm">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wide text-slate-700 dark:text-slate-300 mb-2">
                Arus Kas dari Aktivitas Operasi
              </h3>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {reports.cashFlow.operatingDetails.map((d, i) => (
                  <div key={i} className="py-2 flex justify-between gap-4">
                    <span>{d.label}</span>
                    <span className="font-mono">{formatRupiah(d.amount)}</span>
                  </div>
                ))}
                <div className="py-2.5 flex justify-between font-bold border-t border-slate-300 dark:border-slate-700">
                  <span>Arus Kas Bersih Aktivitas Operasi</span>
                  <span className="font-mono">
                    {formatRupiah(reports.cashFlow.netOperatingCash)}
                  </span>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-xs font-bold uppercase tracking-wide text-slate-700 dark:text-slate-300 mb-2">
                Arus Kas dari Aktivitas Investasi
              </h3>
              {reports.cashFlow.investingDetails.length === 0 ? (
                <p className="text-xs text-slate-500">Tidak ada transaksi kas investasi pada periode ini.</p>
              ) : (
                reports.cashFlow.investingDetails.map((d, i) => (
                  <div key={i} className="py-2 flex justify-between gap-4">
                    <span>{d.label}</span>
                    <span className="font-mono">{formatRupiah(d.amount)}</span>
                  </div>
                ))
              )}
              <div className="py-2 flex justify-between font-bold border-t border-slate-200 dark:border-slate-800">
                <span>Arus Kas Bersih Aktivitas Investasi</span>
                <span className="font-mono">{formatRupiah(reports.cashFlow.investingCashNet)}</span>
              </div>
            </div>

            <div>
              <h3 className="text-xs font-bold uppercase tracking-wide text-slate-700 dark:text-slate-300 mb-2">
                Arus Kas dari Aktivitas Pendanaan
              </h3>
              {reports.cashFlow.financingDetails.length === 0 ? (
                <p className="text-xs text-slate-500">Tidak ada transaksi kas pendanaan pada periode ini.</p>
              ) : (
                reports.cashFlow.financingDetails.map((d, i) => (
                  <div key={i} className="py-2 flex justify-between gap-4">
                    <span>{d.label}</span>
                    <span className="font-mono">{formatRupiah(d.amount)}</span>
                  </div>
                ))
              )}
              <div className="py-2 flex justify-between font-bold border-t border-slate-200 dark:border-slate-800">
                <span>Arus Kas Bersih Aktivitas Pendanaan</span>
                <span className="font-mono">{formatRupiah(reports.cashFlow.financingCashNet)}</span>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
              <div className="flex justify-between">
                <span>Kenaikan (Penurunan) Bersih Kas &amp; Bank</span>
                <span className="font-mono font-semibold">
                  {formatRupiah(reports.cashFlow.netCashChange)}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Saldo Kas &amp; Bank Awal Periode</span>
                <span className="font-mono font-semibold">
                  {formatRupiah(reports.cashFlow.beginningCash)}
                </span>
              </div>
              <div className="flex justify-between font-bold text-base pt-2 border-t border-slate-200 dark:border-slate-800 text-emerald-700 dark:text-emerald-400">
                <span>Saldo Kas &amp; Bank Akhir Periode</span>
                <span className="font-mono">{formatRupiah(reports.cashFlow.endingCash)}</span>
              </div>
            </div>
          </div>
        )}

        {/* 7. CATATAN ATAS LAPORAN KEUANGAN (CaLK) */}
        {activeTab === 'calk' && (
          <div className="max-w-3xl mx-auto space-y-6 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white mb-1">
                1. Gambaran Umum Entitas BUMDes
              </h3>
              <p>
                {profile.name} berkedudukan di {profile.address}, {profile.villageName},{' '}
                {profile.subDistrict}, {profile.district}, {profile.province}. Telah memperoleh status
                badan hukum dari Kementerian Hukum dan HAM RI dengan Nomor Sertifikat{' '}
                <strong className="font-mono">{profile.ahuNumber}</strong>. Susunan pengelola saat
                ini terdiri dari Direktur ({profile.directorName}), Bendahara ({profile.treasurerName}
                ), Sekretaris ({profile.secretaryName}), dan Pengawas ({profile.supervisorName}).
              </p>
            </div>

            <div>
              <h3 className="font-bold text-slate-900 dark:text-white mb-1">
                2. Ikhtisar Kebijakan Akuntansi Penting
              </h3>
              <ul className="list-disc pl-5 space-y-1">
                <li>
                  <strong>Kerangka Pelaporan:</strong> Disusun sesuai Pedoman Penyusunan Laporan
                  Keuangan BUM Desa berdasarkan Kepmendesa PDTT Nomor 136 Tahun 2022 dan SAK EMKM
                  dengan dasar akrual.
                </li>
                <li>
                  <strong>Penilaian Persediaan Pupuk Bersubsidi:</strong> Persediaan barang dagangan
                  pupuk dinilai menggunakan metode{' '}
                  <strong>
                    {profile.inventoryMethod === 'FIFO'
                      ? 'Masuk Pertama Keluar Pertama (FIFO)'
                      : 'Rata-rata Bergerak (Moving Average)'}
                  </strong>{' '}
                  berdasarkan harga tebus distributor resmi.
                </li>
                <li>
                  <strong>Aset Tetap &amp; Penyusutan:</strong> Aset tetap dicatat sebesar biaya
                  perolehan dan disusutkan dengan metode garis lurus.
                </li>
              </ul>
            </div>

            <div>
              <h3 className="font-bold text-slate-900 dark:text-white mb-1">
                3. Rincian Persediaan Pupuk Bersubsidi (Akhir Periode)
              </h3>
              <p className="mb-2">
                Total persediaan fisik pupuk bersubsidi saat ini berjumlah{' '}
                <strong className="font-mono">{formatNumber(totalFertilizerBags)} Sak</strong> dengan
                nilai tercatat sebesar{' '}
                <strong className="font-mono">{formatRupiah(totalFertilizerValue)}</strong>:
              </p>
              <ul className="list-disc pl-5 space-y-1 font-mono text-xs">
                {products.map((p) => (
                  <li key={p.id}>
                    {p.name}: {formatNumber(p.currentStock)} {p.unitLabel} · HET{' '}
                    {formatRupiah(p.hetPrice)} · Nilai {formatRupiah(p.inventoryValue)}
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="font-bold text-slate-900 dark:text-white mb-1">
                4. Rincian Permodalan &amp; Bagi Hasil Pendapatan Asli Desa (PADes)
              </h3>
              <p>
                Total penyertaan modal desa tercatat sebesar{' '}
                <strong className="font-mono">
                  {formatRupiah(reports.equityStatement.villageCapital)}
                </strong>
                . Berdasarkan AD/ART BUMDes, alokasi bagian hasil usaha untuk PADes ditetapkan
                sebesar <strong>{profile.padesSharePercent}%</strong> dari laba bersih, sehingga
                proyeksi kontribusi PADes periode ini sebesar{' '}
                <strong className="font-mono">
                  {formatRupiah(reports.equityStatement.projectedPadesAllocation)}
                </strong>
                .
              </p>
            </div>
          </div>
        )}

        {/* Signature Footer for Official Village Reports */}
        <div className="mt-10 pt-6 border-t border-slate-200 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-2 gap-8 text-xs text-center text-slate-700 dark:text-slate-300">
          <div>
            <p>Mengetahui, Direktur BUMDes</p>
            <p className="mt-14 font-bold underline text-slate-900 dark:text-white">
              {profile.directorName}
            </p>
          </div>
          <div>
            <p>Disusun oleh, Bendahara BUMDes</p>
            <p className="mt-14 font-bold underline text-slate-900 dark:text-white">
              {profile.treasurerName}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
};
