import React, { useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, Building2, Coins, Package, TrendingUp, Wallet } from 'lucide-react';
import { formatDateId, formatMonthYearId, formatNumber, formatRupiah } from '../lib/formatters';
import { generateFinancialStatements, roundMoney } from '../lib/accountingEngine';
import type {
  Account,
  BudgetPlanRecord,
  BumdesProfile,
  BusinessUnit,
  FertilizerProduct,
  JournalEntryRecord,
} from '../types/accounting';
import type { NavSection } from './Sidebar';
import type { KiosTab } from './FertilizerView';

interface DashboardViewProps {
  profile: BumdesProfile;
  units: BusinessUnit[];
  accounts: Account[];
  budgets: BudgetPlanRecord[];
  journals: JournalEntryRecord[];
  products: FertilizerProduct[];
  onNavigate: (section: NavSection) => void;
  onNavigateFertilizerTab?: (tab: KiosTab) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  profile,
  units,
  accounts,
  budgets,
  journals,
  products,
  onNavigate,
  onNavigateFertilizerTab,
}) => {
  const [selectedUnitId, setSelectedUnitId] = useState<number | null>(null);
  const [hoveredMonth, setHoveredMonth] = useState<string | null>(null);

  const unitLabel = selectedUnitId
    ? units.find((u) => u.id === selectedUnitId)?.name || 'Unit Usaha'
    : 'Konsolidasi BUMDes';

  // Full fiscal year consolidated/unit statements
  const yearStatements = useMemo(() => {
    return generateFinancialStatements({
      accounts,
      entries: journals,
      budgets,
      profile,
      startDate: `${profile.fiscalYear}-01-01`,
      endDate: `${profile.fiscalYear}-12-31`,
      unitId: selectedUnitId,
      unitLabel,
    });
  }, [accounts, journals, budgets, profile, selectedUnitId, unitLabel]);

  // Determine current/latest active month in journal entries (defaults to 2026-11)
  const activeMonth = useMemo(() => {
    const nonOpening = journals.filter((j) => j.entryType !== 'SALDO_AWAL');
    if (nonOpening.length === 0) return `${profile.fiscalYear}-11`;
    const latest = nonOpening.reduce((max, j) => (j.entryDate > max ? j.entryDate : max), nonOpening[0].entryDate);
    return latest.slice(0, 7);
  }, [journals, profile.fiscalYear]);

  const monthStatements = useMemo(() => {
    const [y, m] = activeMonth.split('-').map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    return generateFinancialStatements({
      accounts,
      entries: journals,
      budgets,
      profile,
      startDate: `${activeMonth}-01`,
      endDate: `${activeMonth}-${String(lastDay).padStart(2, '0')}`,
      unitId: selectedUnitId,
      unitLabel,
    });
  }, [accounts, journals, budgets, profile, activeMonth, selectedUnitId, unitLabel]);

  // Monthly Revenue vs Expense (HPP + Operating Expenses) chart data
  const monthlySeries = useMemo(() => {
    const monthBuckets = new Map<string, { revenue: number; expense: number }>();
    const scoped = journals.filter((j) => (selectedUnitId ? j.unitId === selectedUnitId : true));

    for (const j of scoped) {
      if (j.entryType === 'SALDO_AWAL') continue;
      const ym = j.entryDate.slice(0, 7);
      const bucket = monthBuckets.get(ym) || { revenue: 0, expense: 0 };
      for (const l of j.lines) {
        if (l.category === 'PENDAPATAN') {
          bucket.revenue += l.credit - l.debit;
        } else if (l.category === 'HPP' || l.category === 'BEBAN') {
          bucket.expense += l.debit - l.credit;
        }
      }
      monthBuckets.set(ym, bucket);
    }

    const sortedKeys = Array.from(monthBuckets.keys()).sort();
    return sortedKeys.map((ym) => {
      const b = monthBuckets.get(ym)!;
      return {
        ym,
        label: formatMonthYearId(ym),
        revenue: roundMoney(Math.max(0, b.revenue)),
        expense: roundMoney(Math.max(0, b.expense)),
        profit: roundMoney(b.revenue - b.expense),
      };
    });
  }, [journals, selectedUnitId]);

  const totalCashAndBank = yearStatements.cashFlow.endingCash;
  const totalFertilizerStockValue = roundMoney(
    products.reduce((sum, p) => sum + p.inventoryValue, 0)
  );
  const totalFertilizerBags = roundMoney(
    products.reduce((sum, p) => sum + p.currentStock, 0)
  );
  const lowStockProducts = products.filter((p) => p.currentStock <= p.minStock);

  const maxChartVal = Math.max(
    1000000,
    ...monthlySeries.map((d) => Math.max(d.revenue, d.expense))
  );

  const recentJournals = journals
    .filter((j) => (selectedUnitId ? j.unitId === selectedUnitId : true))
    .slice(0, 6);

  return (
    <div className="space-y-6">
      {/* Header & Unit Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
            Ringkasan Eksekutif Keuangan
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {profile.name} · {profile.villageName} · Tahun Buku {profile.fiscalYear}
          </p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
          <Building2 className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0" />
          <label htmlFor="dashboard-unit-select" className="sr-only">
            Filter Unit Usaha
          </label>
          <select
            id="dashboard-unit-select"
            value={selectedUnitId ?? ''}
            onChange={(e) => setSelectedUnitId(e.target.value ? Number(e.target.value) : null)}
            className="w-full sm:w-auto px-3 py-2 text-sm rounded-lg border border-emerald-950/15 dark:border-emerald-900/50 bg-white dark:bg-[#0E1A15] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-700"
          >
            <option value="">Konsolidasi Seluruh Unit</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.code} — {u.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Low Stock Alert Banner (only if triggered) */}
      {lowStockProducts.length > 0 && (
        <div
          role="status"
          className="p-4 rounded-xl border border-amber-300 dark:border-amber-800/70 bg-amber-50 dark:bg-amber-950/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-950 dark:text-amber-200">
                Peringatan Batas Minimum Stok Pupuk Bersubsidi
              </p>
              <p className="text-xs text-amber-800 dark:text-amber-300 mt-0.5">
                {lowStockProducts
                  .map((p) => `${p.name} tersisa ${formatNumber(p.currentStock)} ${p.unitLabel} (min. ${p.minStock})`)
                  .join(' · ')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('fertilizer')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-amber-700 hover:bg-amber-800 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
          >
            <span>Tebus DO Pupuk</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 4 Primary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="p-5 rounded-xl bg-white dark:bg-[#0E1A15] border border-emerald-950/10 dark:border-emerald-900/40">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Posisi Kas &amp; Bank
            </span>
            <div className="w-7 h-7 rounded-md bg-emerald-50 dark:bg-emerald-950/80 flex items-center justify-center">
              <Wallet className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
            </div>
          </div>
          <p className="mt-3 text-2xl font-bold tabular-nums tracking-tight text-slate-900 dark:text-white whitespace-nowrap">
            {formatRupiah(totalCashAndBank)}
          </p>
          <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 truncate">
            Saldo likuid {unitLabel}
          </p>
        </div>

        <div className="p-5 rounded-xl bg-white dark:bg-[#0E1A15] border border-emerald-950/10 dark:border-emerald-900/40">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Nilai Persediaan Pupuk
            </span>
            <div className="w-7 h-7 rounded-md bg-amber-50 dark:bg-amber-950/70 flex items-center justify-center">
              <Package className="w-4 h-4 text-amber-700 dark:text-amber-400" />
            </div>
          </div>
          <p className="mt-3 text-2xl font-bold tabular-nums tracking-tight text-slate-900 dark:text-white whitespace-nowrap">
            {formatRupiah(totalFertilizerStockValue)}
          </p>
          <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
            Stok fisik gudang:{' '}
            <span className="font-mono font-medium whitespace-nowrap text-amber-800 dark:text-amber-300">
              {formatNumber(totalFertilizerBags)} Sak
            </span>
          </p>
        </div>

        <div className="p-5 rounded-xl bg-white dark:bg-[#0E1A15] border border-emerald-950/10 dark:border-emerald-900/40">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Pendapatan ({formatMonthYearId(activeMonth)})
            </span>
            <div className="w-7 h-7 rounded-md bg-emerald-50 dark:bg-emerald-950/80 flex items-center justify-center">
              <Coins className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
            </div>
          </div>
          <p className="mt-3 text-2xl font-bold tabular-nums tracking-tight text-slate-900 dark:text-white whitespace-nowrap">
            {formatRupiah(monthStatements.incomeStatement.totalRevenue)}
          </p>
          <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
            Akumulasi YTD:{' '}
            <span className="font-mono whitespace-nowrap">
              {formatRupiah(yearStatements.incomeStatement.totalRevenue)}
            </span>
          </p>
        </div>

        <div className="p-5 rounded-xl bg-white dark:bg-[#0E1A15] border border-emerald-950/10 dark:border-emerald-900/40">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Laba Rugi ({formatMonthYearId(activeMonth)})
            </span>
            <div className="w-7 h-7 rounded-md bg-emerald-50 dark:bg-emerald-950/80 flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
            </div>
          </div>
          <p
            className={`mt-3 text-2xl font-bold tabular-nums tracking-tight whitespace-nowrap ${
              monthStatements.incomeStatement.netProfit >= 0
                ? 'text-emerald-700 dark:text-emerald-400'
                : 'text-red-600 dark:text-red-400'
            }`}
          >
            {formatRupiah(monthStatements.incomeStatement.netProfit)}
          </p>
          <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
            Proyeksi PADes ({profile.padesSharePercent}%):{' '}
            <span className="font-mono whitespace-nowrap">
              {formatRupiah(yearStatements.equityStatement.projectedPadesAllocation)}
            </span>
          </p>
        </div>
      </div>

      {/* Main Chart + Fertilizer Summary Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Monthly Revenue vs Expense Chart */}
        <section className="lg:col-span-7 p-5 sm:p-6 rounded-xl bg-white dark:bg-[#0E1A15] border border-emerald-950/10 dark:border-emerald-900/40 flex flex-col justify-between">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Grafik Pendapatan vs Beban Bulanan
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Perbandingan omzet usaha terhadap HPP &amp; beban operasional ({unitLabel})
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs text-slate-600 dark:text-slate-300">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm bg-emerald-600 inline-block" />
                Pendapatan
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm bg-amber-600/75 dark:bg-amber-500/75 inline-block" />
                HPP &amp; Beban
              </span>
            </div>
          </div>

          {monthlySeries.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">
              Belum ada transaksi pendapatan atau beban untuk periode ini.
            </div>
          ) : (
            <div className="w-full overflow-x-auto">
              <svg
                viewBox={`0 0 ${Math.max(480, monthlySeries.length * 100)} 220`}
                className="w-full h-56 select-none"
                role="img"
                aria-label="Grafik batang perbandingan pendapatan dan beban bulanan BUMDes"
              >
                {/* Grid lines */}
                {[0, 0.25, 0.5, 0.75, 1].map((ratio, idx) => {
                  const y = 180 - ratio * 150;
                  return (
                    <g key={idx}>
                      <line
                        x1="16"
                        y1={y}
                        x2={Math.max(464, monthlySeries.length * 100 - 16)}
                        y2={y}
                        stroke="currentColor"
                        className="text-slate-200 dark:text-slate-800"
                        strokeDasharray="3 3"
                      />
                    </g>
                  );
                })}

                {monthlySeries.map((d, idx) => {
                  const groupWidth = (Math.max(440, monthlySeries.length * 100 - 32)) / monthlySeries.length;
                  const centerX = 24 + idx * groupWidth + groupWidth / 2;
                  const revH = Math.max(4, (d.revenue / maxChartVal) * 150);
                  const expH = Math.max(4, (d.expense / maxChartVal) * 150);
                  const isHovered = hoveredMonth === d.ym;

                  return (
                    <g
                      key={d.ym}
                      onMouseEnter={() => setHoveredMonth(d.ym)}
                      onMouseLeave={() => setHoveredMonth(null)}
                      className="cursor-pointer"
                    >
                      <rect
                        x={centerX - 24}
                        y={180 - revH}
                        width={20}
                        height={revH}
                        rx={3}
                        className={
                          isHovered
                            ? 'fill-emerald-500 transition-colors'
                            : 'fill-emerald-600 transition-colors'
                        }
                      />
                      <rect
                        x={centerX + 4}
                        y={180 - expH}
                        width={20}
                        height={expH}
                        rx={3}
                        className={
                          isHovered
                            ? 'fill-amber-500 transition-colors'
                            : 'fill-amber-600/75 dark:fill-amber-500/70 transition-colors'
                        }
                      />
                      <text
                        x={centerX}
                        y={202}
                        textAnchor="middle"
                        className="text-[11px] fill-slate-600 dark:fill-slate-400 font-medium"
                      >
                        {d.label}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
          )}

          {/* Monthly breakdown strip */}
          <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            {(hoveredMonth
              ? monthlySeries.filter((s) => s.ym === hoveredMonth)
              : monthlySeries.slice(-4)
            ).map((item) => (
              <div key={item.ym}>
                <p className="font-semibold text-slate-700 dark:text-slate-200">{item.label}</p>
                <p className="font-mono text-[11px] text-emerald-700 dark:text-emerald-400">
                  + {formatRupiah(item.revenue)}
                </p>
                <p className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                  - {formatRupiah(item.expense)}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Fertilizer Inventory Quick Status */}
        <section className="lg:col-span-5 p-5 sm:p-6 rounded-xl bg-white dark:bg-[#0E1A15] border border-emerald-950/10 dark:border-emerald-900/40 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 mb-4">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  Stok Kios Pupuk Bersubsidi
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Metode persediaan aktif: <span className="font-semibold text-emerald-700 dark:text-emerald-400">{profile.inventoryMethod === 'FIFO' ? 'FIFO' : 'Rata-rata Bergerak'}</span>
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() =>
                    onNavigateFertilizerTab
                      ? onNavigateFertilizerTab('prices')
                      : onNavigate('fertilizer')
                  }
                  className="text-xs font-semibold text-amber-700 dark:text-amber-400 hover:underline whitespace-nowrap shrink-0"
                >
                  Master Harga HET
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('fertilizer')}
                  className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:underline whitespace-nowrap shrink-0"
                >
                  Kelola Kios
                </button>
              </div>
            </div>

            <div className="divide-y divide-emerald-950/10 dark:divide-emerald-900/40">
              {products.map((p) => {
                const isLow = p.currentStock <= p.minStock;
                const fillRatio = Math.min(100, Math.max(8, Math.round((p.currentStock / Math.max(1, p.minStock * 3.5)) * 100)));
                return (
                  <div key={p.id} className="py-3 space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                          {p.name}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                          Tebus {formatRupiah(p.purchasePrice)} · Jual {formatRupiah(p.hetPrice)} · Min {p.minStock}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p
                          className={`text-sm font-bold font-mono tabular-nums ${
                            isLow
                              ? 'text-amber-700 dark:text-amber-400'
                              : 'text-slate-900 dark:text-white'
                          }`}
                        >
                          {formatNumber(p.currentStock)} {p.unitLabel}
                        </p>
                        <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                          {isLow ? 'Stok Menipis' : formatRupiah(p.inventoryValue)}
                        </p>
                      </div>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-emerald-950/10 dark:bg-emerald-900/40 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${isLow ? 'bg-amber-600' : 'bg-emerald-600'}`}
                        style={{ width: `${fillRatio}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-emerald-950/10 dark:border-emerald-900/40 flex items-center justify-between text-xs">
            <span className="text-slate-500 dark:text-slate-400">Total Nilai Persediaan</span>
            <span className="font-mono font-bold text-slate-900 dark:text-white">
              {formatRupiah(totalFertilizerStockValue)}
            </span>
          </div>
        </section>
      </div>

      {/* Recent Journals Table */}
      <section className="rounded-xl bg-white dark:bg-[#0E1A15] border border-emerald-950/10 dark:border-emerald-900/40 overflow-hidden">
        <div className="px-5 py-4 border-b border-emerald-950/10 dark:border-emerald-900/40 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Aktivitas Jurnal Terbaru
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Catatan pencatatan otomatis dan manual yang memengaruhi laporan keuangan
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('journals')}
            className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:underline whitespace-nowrap shrink-0"
          >
            Lihat Semua Jurnal
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-emerald-950/10 dark:border-emerald-900/40 text-xs text-slate-500 dark:text-slate-400 bg-[#F4F7F4]/80 dark:bg-[#08110D]/60">
                <th className="py-2.5 px-4 font-medium">Tanggal</th>
                <th className="py-2.5 px-4 font-medium">No. Jurnal</th>
                <th className="py-2.5 px-4 font-medium">Unit Usaha</th>
                <th className="py-2.5 px-4 font-medium">Uraian Transaksi</th>
                <th className="py-2.5 px-4 font-medium text-right">Total Mutasi (D)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {recentJournals.map((j) => {
                const total = j.lines.reduce((sum, l) => sum + l.debit, 0);
                return (
                  <tr key={j.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-3 px-4 font-mono text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap">
                      {formatDateId(j.entryDate)}
                    </td>
                    <td className="py-3 px-4 font-mono text-xs font-semibold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                      {j.journalNumber}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-300 max-w-[200px] truncate">
                      {j.unitName}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-900 dark:text-slate-100">
                      {j.description}
                    </td>
                    <td className="py-3 px-4 font-mono text-xs font-semibold text-right text-slate-900 dark:text-white whitespace-nowrap">
                      {formatRupiah(total)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
