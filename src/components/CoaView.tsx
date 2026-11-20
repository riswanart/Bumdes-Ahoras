import React, { useMemo, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { apiRequest } from '../lib/api';
import { CATEGORY_LABELS } from '../lib/formatters';
import type { Account, AccountCategory, NormalBalance, UserRole } from '../types/accounting';

interface CoaViewProps {
  userRole: UserRole;
  accounts: Account[];
  onAccountsUpdated: (accounts: Account[]) => void;
}

const CATEGORIES: ('ALL' | AccountCategory)[] = [
  'ALL',
  'ASET',
  'KEWAJIBAN',
  'EKUITAS',
  'PENDAPATAN',
  'HPP',
  'BEBAN',
  'LAIN_LAIN',
];

export const CoaView: React.FC<CoaViewProps> = ({ userRole, accounts, onAccountsUpdated }) => {
  const canEdit = userRole === 'ADMIN' || userRole === 'BENDAHARA';
  const [selectedCat, setSelectedCat] = useState<'ALL' | AccountCategory>('ALL');
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);

  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState<AccountCategory>('BEBAN');
  const [subCategory, setSubCategory] = useState('Beban Operasional');
  const [normalBalance, setNormalBalance] = useState<NormalBalance>('DEBIT');
  const [isCashAccount, setIsCashAccount] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return accounts.filter((a) => {
      if (selectedCat !== 'ALL' && a.category !== selectedCat) return false;
      if (!q) return true;
      return a.code.toLowerCase().includes(q) || a.name.toLowerCase().includes(q);
    });
  }, [accounts, selectedCat, search]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    try {
      const res = await apiRequest<{ accounts: Account[] }>('/api/accounts', {
        method: 'POST',
        body: JSON.stringify({
          code,
          name,
          category,
          subCategory,
          normalBalance,
          isCashAccount,
        }),
      });
      onAccountsUpdated(res.accounts);
      setCode('');
      setName('');
      setShowAdd(false);
      setMessage('Akun baru berhasil ditambahkan ke Bagan Akun Standar.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Gagal menambah akun.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
            Bagan Akun Standar (Chart of Accounts)
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Struktur kode akun 1–7 sesuai Kepmendesa PDTT No. 136 Tahun 2022 &amp; SAK EMKM
          </p>
        </div>

        {canEdit && (
          <button
            type="button"
            onClick={() => setShowAdd((v) => !v)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold whitespace-nowrap shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Tambah Sub-Akun</span>
          </button>
        )}
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

      {showAdd && canEdit && (
        <form
          onSubmit={handleAdd}
          className="p-5 rounded-xl bg-white dark:bg-[#0E1A15] border border-emerald-950/10 dark:border-emerald-900/40 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 items-end"
        >
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Kode Akun
            </label>
            <input
              type="text"
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="6-1107"
              className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Nama Akun
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Contoh: Beban Promosi & Sosialisasi Poktan"
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Kategori &amp; Saldo Normal
            </label>
            <div className="flex gap-2">
              <select
                value={category}
                onChange={(e) => {
                  const cat = e.target.value as AccountCategory;
                  setCategory(cat);
                  setNormalBalance(
                    cat === 'ASET' || cat === 'HPP' || cat === 'BEBAN' ? 'DEBIT' : 'KREDIT'
                  );
                }}
                className="w-1/2 px-2 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
              >
                <option value="ASET">1-Aset</option>
                <option value="KEWAJIBAN">2-Kewajiban</option>
                <option value="EKUITAS">3-Ekuitas</option>
                <option value="PENDAPATAN">4-Pendapatan</option>
                <option value="HPP">5-HPP</option>
                <option value="BEBAN">6-Beban</option>
                <option value="LAIN_LAIN">7-Lainnya</option>
              </select>
              <select
                value={normalBalance}
                onChange={(e) => setNormalBalance(e.target.value as NormalBalance)}
                className="w-1/2 px-2 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
              >
                <option value="DEBIT">Debit</option>
                <option value="KREDIT">Kredit</option>
              </select>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold whitespace-nowrap shrink-0"
            >
              Simpan Akun
            </button>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Sub-Kategori Laporan
            </label>
            <input
              type="text"
              required
              value={subCategory}
              onChange={(e) => setSubCategory(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              id="coa-iscash"
              type="checkbox"
              checked={isCashAccount}
              onChange={(e) => setIsCashAccount(e.target.checked)}
              className="rounded border-slate-300"
            />
            <label htmlFor="coa-iscash" className="text-xs text-slate-700 dark:text-slate-300">
              Termasuk Akun Kas / Setara Kas
            </label>
          </div>
        </form>
      )}

      {/* Filter Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1 p-1 bg-slate-100 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCat(cat)}
              className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                selectedCat === cat
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {cat === 'ALL' ? 'Semua Akun' : CATEGORY_LABELS[cat]}
            </button>
          ))}
        </div>

        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari kode atau nama akun..."
            className="pl-8 pr-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white w-full sm:w-64"
          />
        </div>
      </div>

      {/* CoA Table */}
      <div className="rounded-xl bg-white dark:bg-[#0E1A15] border border-emerald-950/10 dark:border-emerald-900/40 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 bg-slate-50/70 dark:bg-slate-950/50">
                <th className="py-2.5 px-4 font-medium">Kode Akun</th>
                <th className="py-2.5 px-4 font-medium">Nama Akun</th>
                <th className="py-2.5 px-4 font-medium">Kelompok</th>
                <th className="py-2.5 px-4 font-medium">Sub-Kategori</th>
                <th className="py-2.5 px-4 font-medium">Saldo Normal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.map((acc) => (
                <tr key={acc.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="py-2.5 px-4 font-mono text-xs font-semibold text-slate-900 dark:text-white">
                    {acc.code}
                  </td>
                  <td className="py-2.5 px-4 text-xs font-medium text-slate-900 dark:text-slate-100">
                    {acc.name}
                    {acc.isCashAccount && (
                      <span className="ml-2 text-[11px] text-emerald-700 dark:text-emerald-400">
                        · Kas/Bank
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 px-4 text-xs text-slate-600 dark:text-slate-400">
                    {CATEGORY_LABELS[acc.category]}
                  </td>
                  <td className="py-2.5 px-4 text-xs text-slate-600 dark:text-slate-400">
                    {acc.subCategory}
                  </td>
                  <td className="py-2.5 px-4 font-mono text-xs text-slate-700 dark:text-slate-300">
                    {acc.normalBalance}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
