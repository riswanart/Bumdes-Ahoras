import React, { useMemo, useState } from 'react';
import { Target } from 'lucide-react';
import { apiRequest } from '../lib/api';
import { generateFinancialStatements } from '../lib/accountingEngine';
import { formatRupiah } from '../lib/formatters';
import type {
  Account,
  BudgetPlanRecord,
  BumdesProfile,
  BusinessUnit,
  JournalEntryRecord,
  UserRole,
} from '../types/accounting';

interface BudgetRpkViewProps {
  userRole: UserRole;
  profile: BumdesProfile;
  units: BusinessUnit[];
  accounts: Account[];
  budgets: BudgetPlanRecord[];
  journals: JournalEntryRecord[];
  onBudgetsUpdated: (budgets: BudgetPlanRecord[]) => void;
}

export const BudgetRpkView: React.FC<BudgetRpkViewProps> = ({
  userRole,
  profile,
  units,
  accounts,
  budgets,
  journals,
  onBudgetsUpdated,
}) => {
  const canEdit = userRole === 'ADMIN' || userRole === 'BENDAHARA';
  const eligibleAccounts = accounts.filter(
    (a) => a.category === 'PENDAPATAN' || a.category === 'HPP' || a.category === 'BEBAN'
  );

  const [unitId, setUnitId] = useState<number>(units[0]?.id || 1);
  const [accountId, setAccountId] = useState<number>(eligibleAccounts[0]?.id || 1);
  const [targetAmount, setTargetAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reports = useMemo(
    () =>
      generateFinancialStatements({
        accounts,
        entries: journals,
        budgets,
        profile,
        startDate: `${profile.fiscalYear}-01-01`,
        endDate: `${profile.fiscalYear}-12-31`,
        unitId: null,
        unitLabel: 'Konsolidasi BUMDes',
      }),
    [accounts, journals, budgets, profile]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setError(null);
    setSubmitting(true);
    try {
      const res = await apiRequest<{ budgets: BudgetPlanRecord[] }>('/api/budgets', {
        method: 'POST',
        body: JSON.stringify({
          fiscalYear: profile.fiscalYear,
          unitId,
          accountId,
          targetAmount: Number(targetAmount),
          notes,
        }),
      });
      onBudgetsUpdated(res.budgets);
      setTargetAmount('');
      setNotes('');
      setMessage('Target RPK / pagu anggaran berhasil disimpan.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan anggaran.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
          Rencana Program Kerja (RPK) &amp; Anggaran
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          Perbandingan target pendapatan dan pagu belanja per unit usaha terhadap realisasi Tahun Buku {profile.fiscalYear}
        </p>
      </div>

      {message && (
        <div className="p-3.5 rounded-lg border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/50 text-xs font-medium text-emerald-800 dark:text-emerald-300">
          {message}
        </div>
      )}
      {error && (
        <div className="p-3.5 rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/50 text-xs font-medium text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {canEdit && (
        <section className="p-5 sm:p-6 rounded-xl bg-white dark:bg-[#0E1A15] border border-emerald-950/10 dark:border-emerald-900/40">
          <h2 className="text-base font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
            <Target className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
            <span>Tetapkan / Perbarui Target RPK</span>
          </h2>

          <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
            <div>
              <label htmlFor="rpk-unit" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Unit Usaha
              </label>
              <select
                id="rpk-unit"
                value={unitId}
                onChange={(e) => setUnitId(Number(e.target.value))}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
              >
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.code} — {u.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="rpk-acc" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Akun Pendapatan / Beban
              </label>
              <select
                id="rpk-acc"
                value={accountId}
                onChange={(e) => setAccountId(Number(e.target.value))}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
              >
                {eligibleAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} — {a.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="rpk-amt" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Target / Pagu Tahunan (Rp)
              </label>
              <input
                id="rpk-amt"
                type="number"
                required
                min="0"
                value={targetAmount}
                onChange={(e) => setTargetAmount(e.target.value)}
                placeholder="10000000"
                className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label htmlFor="rpk-notes" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Keterangan Program
              </label>
              <input
                id="rpk-notes"
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Catatan RPK..."
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold whitespace-nowrap shrink-0"
            >
              {submitting ? 'Menyimpan...' : 'Simpan Target RPK'}
            </button>
          </form>
        </section>
      )}

      <section className="rounded-xl bg-white dark:bg-[#0E1A15] border border-emerald-950/10 dark:border-emerald-900/40 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            Monitoring Anggaran vs Realisasi
          </h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 bg-slate-50/70 dark:bg-slate-950/50">
                <th className="py-2.5 px-4 font-medium">Unit Usaha</th>
                <th className="py-2.5 px-4 font-medium">Akun</th>
                <th className="py-2.5 px-4 font-medium text-right">Anggaran (RPK)</th>
                <th className="py-2.5 px-4 font-medium text-right">Realisasi</th>
                <th className="py-2.5 px-4 font-medium text-right">Selisih</th>
                <th className="py-2.5 px-4 font-medium text-right">Capaian</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {reports.rpkComparison.map((row, idx) => (
                <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="py-3 px-4 text-xs text-slate-700 dark:text-slate-300">
                    {row.unitName}
                  </td>
                  <td className="py-3 px-4 text-xs font-medium text-slate-900 dark:text-white">
                    <span className="font-mono text-slate-500 mr-1.5">{row.code}</span>
                    {row.name}
                  </td>
                  <td className="py-3 px-4 font-mono text-xs text-right">
                    {formatRupiah(row.targetAmount)}
                  </td>
                  <td className="py-3 px-4 font-mono text-xs font-semibold text-right">
                    {formatRupiah(row.actualAmount)}
                  </td>
                  <td className="py-3 px-4 font-mono text-xs text-right">
                    {formatRupiah(row.variance)}
                  </td>
                  <td className="py-3 px-4 text-right w-40">
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-20 h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-600"
                          style={{ width: `${Math.min(100, Math.max(0, row.realizationPercent))}%` }}
                        />
                      </div>
                      <span className="font-mono text-xs font-semibold w-12 text-right">
                        {row.realizationPercent.toFixed(1)}%
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
