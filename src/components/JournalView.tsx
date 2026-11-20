import React, { useMemo, useState } from 'react';
import { CheckCircle2, Eye, Plus, Search, Trash2, Upload, X } from 'lucide-react';
import { apiRequest } from '../lib/api';
import { validateJournalBalance } from '../lib/accountingEngine';
import { formatDateId, formatRupiah, JOURNAL_TYPE_LABELS } from '../lib/formatters';
import type {
  Account,
  BusinessUnit,
  JournalEntryRecord,
  JournalLineInput,
  JournalType,
  UserRole,
} from '../types/accounting';

interface JournalViewProps {
  userRole: UserRole;
  units: BusinessUnit[];
  accounts: Account[];
  journals: JournalEntryRecord[];
  onJournalsUpdated: (journals: JournalEntryRecord[]) => void;
}

const TRANSACTION_MODES: { id: JournalType; label: string; hint: string }[] = [
  { id: 'KAS_MASUK', label: 'Kas Masuk', hint: 'Penerimaan kas/bank atas pendapatan atau modal' },
  { id: 'KAS_KELUAR', label: 'Kas Keluar', hint: 'Pengeluaran kas/bank untuk beban atau pelunasan utang' },
  { id: 'PEMBELIAN_KREDIT', label: 'Pembelian Kredit', hint: 'Pembelian aset/perlengkapan secara kredit (Utang)' },
  { id: 'PENJUALAN_KREDIT', label: 'Penjualan Kredit', hint: 'Pendapatan jasa/dagang yang belum dibayar (Piutang)' },
  { id: 'JURNAL_UMUM', label: 'Jurnal Umum / Penyesuaian', hint: 'Penyusutan aset tetap, koreksi, atau pindah buku' },
];

export const JournalView: React.FC<JournalViewProps> = ({
  userRole,
  units,
  accounts,
  journals,
  onJournalsUpdated,
}) => {
  const canCreate = userRole === 'ADMIN' || userRole === 'BENDAHARA' || userRole === 'OPERATOR_KIOS';
  const canDelete = userRole === 'ADMIN' || userRole === 'BENDAHARA';

  const [entryType, setEntryType] = useState<JournalType>('KAS_KELUAR');
  const [entryDate, setEntryDate] = useState('2026-11-19');
  const [unitId, setUnitId] = useState<number>(units[0]?.id || 1);
  const [referenceNo, setReferenceNo] = useState('');
  const [description, setDescription] = useState('');
  const [attachmentName, setAttachmentName] = useState<string | null>(null);
  const [attachmentData, setAttachmentData] = useState<string | null>(null);

  const findAccId = (codePrefix: string) =>
    accounts.find((a) => a.code.startsWith(codePrefix))?.id || accounts[0]?.id || 1;

  const [lines, setLines] = useState<JournalLineInput[]>([
    { accountId: findAccId('6-1103'), debit: 0, credit: 0 },
    { accountId: findAccId('1-1101'), debit: 0, credit: 0 },
  ]);

  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // History filters & attachment viewer
  const [searchTerm, setSearchTerm] = useState('');
  const [filterUnitId, setFilterUnitId] = useState<string>('');
  const [previewAttachment, setPreviewAttachment] = useState<{
    name: string;
    data: string;
  } | null>(null);

  const applyModeTemplate = (mode: JournalType) => {
    setEntryType(mode);
    setErrorMessage(null);
    if (mode === 'KAS_MASUK') {
      setLines([
        { accountId: findAccId('1-1101'), debit: 0, credit: 0 },
        { accountId: findAccId('4-1201'), debit: 0, credit: 0 },
      ]);
    } else if (mode === 'KAS_KELUAR') {
      setLines([
        { accountId: findAccId('6-1103'), debit: 0, credit: 0 },
        { accountId: findAccId('1-1101'), debit: 0, credit: 0 },
      ]);
    } else if (mode === 'PEMBELIAN_KREDIT') {
      setLines([
        { accountId: findAccId('1-2101'), debit: 0, credit: 0 },
        { accountId: findAccId('2-1101'), debit: 0, credit: 0 },
      ]);
    } else if (mode === 'PENJUALAN_KREDIT') {
      setLines([
        { accountId: findAccId('1-1201'), debit: 0, credit: 0 },
        { accountId: findAccId('4-1201'), debit: 0, credit: 0 },
      ]);
    } else {
      setLines([
        { accountId: findAccId('6-1105'), debit: 0, credit: 0 },
        { accountId: findAccId('1-2201'), debit: 0, credit: 0 },
      ]);
    }
  };

  const validation = useMemo(() => validateJournalBalance(lines), [lines]);

  const updateLine = (idx: number, patch: Partial<JournalLineInput>) => {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  };

  const addLine = () => {
    setLines((prev) => [...prev, { accountId: accounts[0]?.id || 1, debit: 0, credit: 0 }]);
  };

  const removeLine = (idx: number) => {
    if (lines.length <= 2) return;
    setLines((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setErrorMessage('Ukuran file bukti transaksi maksimal 2 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setAttachmentName(file.name);
      setAttachmentData(String(reader.result));
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setStatusMessage(null);

    if (!validation.valid) {
      setErrorMessage(validation.error || 'Jurnal tidak seimbang.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiRequest<{ journals: JournalEntryRecord[] }>('/api/journals', {
        method: 'POST',
        body: JSON.stringify({
          entryDate,
          unitId,
          entryType,
          description,
          referenceNo,
          attachmentName,
          attachmentData,
          lines,
        }),
      });
      onJournalsUpdated(res.journals);
      setDescription('');
      setReferenceNo('');
      setAttachmentName(null);
      setAttachmentData(null);
      setLines(lines.map((l) => ({ ...l, debit: 0, credit: 0 })));
      setStatusMessage('Transaksi berhasil diposting ke Jurnal Umum dan Buku Besar.');
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Gagal menyimpan jurnal.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteJournal = async (id: number) => {
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const res = await apiRequest<{ journals: JournalEntryRecord[] }>(`/api/journals/${id}`, {
        method: 'DELETE',
      });
      onJournalsUpdated(res.journals);
      setStatusMessage('Entri jurnal berhasil dihapus.');
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Gagal menghapus entri jurnal.');
    }
  };

  const filteredJournals = useMemo(() => {
    const q = searchTerm.toLowerCase().trim();
    return journals.filter((j) => {
      if (filterUnitId && j.unitId !== Number(filterUnitId)) return false;
      if (!q) return true;
      return (
        j.journalNumber.toLowerCase().includes(q) ||
        j.description.toLowerCase().includes(q) ||
        j.referenceNo.toLowerCase().includes(q) ||
        j.lines.some((l) => l.accountName.toLowerCase().includes(q) || l.accountCode.includes(q))
      );
    });
  }, [journals, searchTerm, filterUnitId]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
          Transaksi &amp; Jurnal Harian
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          Pencatatan kas masuk, kas keluar, pembelian/penjualan kredit, dan jurnal penyesuaian dengan validasi Debit = Kredit
        </p>
      </div>

      {statusMessage && (
        <div
          role="status"
          className="p-3.5 rounded-lg border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/50 text-xs font-medium text-emerald-800 dark:text-emerald-300"
        >
          {statusMessage}
        </div>
      )}

      {errorMessage && (
        <div
          role="alert"
          className="p-3.5 rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/50 text-xs font-medium text-red-700 dark:text-red-300"
        >
          {errorMessage}
        </div>
      )}

      {canCreate && (
        <section className="p-5 sm:p-6 rounded-xl bg-white dark:bg-[#0E1A15] border border-emerald-950/10 dark:border-emerald-900/40">
          {/* Quick Mode Selector */}
          <div className="flex flex-wrap gap-1.5 p-1 bg-slate-100 dark:bg-slate-950 rounded-lg border border-slate-200 dark:border-slate-800 w-fit mb-5">
            {TRANSACTION_MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => applyModeTemplate(m.id)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  entryType === m.id
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label htmlFor="j-date" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Tanggal Transaksi
                </label>
                <input
                  id="j-date"
                  type="date"
                  required
                  value={entryDate}
                  onChange={(e) => setEntryDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label htmlFor="j-unit" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Unit Usaha
                </label>
                <select
                  id="j-unit"
                  value={unitId}
                  onChange={(e) => setUnitId(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                >
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.code} — {u.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="j-ref" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  No. Bukti / Kwitansi
                </label>
                <input
                  id="j-ref"
                  type="text"
                  value={referenceNo}
                  onChange={(e) => setReferenceNo(e.target.value)}
                  placeholder="Contoh: BKK-1126-04"
                  className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Upload Bukti Struk / Nota
                </label>
                <label className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 truncate">
                  <Upload className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{attachmentName || 'Pilih File Nota / PDF'}</span>
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    onChange={handleFileChange}
                    className="sr-only"
                  />
                </label>
              </div>
            </div>

            <div>
              <label htmlFor="j-desc" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Uraian / Keterangan Transaksi
              </label>
              <input
                id="j-desc"
                type="text"
                required
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Contoh: Pembayaran tagihan listrik dan internet Kios Pupuk bulan November 2026"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
              />
            </div>

            {/* Journal Lines Builder */}
            <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
              <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Rincian Akun (Debit &amp; Kredit)
                </span>
                <button
                  type="button"
                  onClick={addLine}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:underline"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Tambah Baris</span>
                </button>
              </div>

              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {lines.map((line, idx) => (
                  <div
                    key={idx}
                    className="p-3 grid grid-cols-1 sm:grid-cols-12 gap-3 items-center"
                  >
                    <div className="sm:col-span-6">
                      <select
                        aria-label={`Akun baris ${idx + 1}`}
                        value={line.accountId}
                        onChange={(e) => updateLine(idx, { accountId: Number(e.target.value) })}
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                      >
                        {accounts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.code} — {a.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="sm:col-span-2">
                      <input
                        type="number"
                        min="0"
                        step="100"
                        aria-label={`Nominal Debit baris ${idx + 1}`}
                        value={line.debit || ''}
                        onChange={(e) =>
                          updateLine(idx, {
                            debit: Number(e.target.value) || 0,
                            credit: Number(e.target.value) > 0 ? 0 : line.credit,
                          })
                        }
                        placeholder="Debit (Rp)"
                        className="w-full px-3 py-2 text-xs font-mono text-right rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <input
                        type="number"
                        min="0"
                        step="100"
                        aria-label={`Nominal Kredit baris ${idx + 1}`}
                        value={line.credit || ''}
                        onChange={(e) =>
                          updateLine(idx, {
                            credit: Number(e.target.value) || 0,
                            debit: Number(e.target.value) > 0 ? 0 : line.debit,
                          })
                        }
                        placeholder="Kredit (Rp)"
                        className="w-full px-3 py-2 text-xs font-mono text-right rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                      />
                    </div>
                    <div className="sm:col-span-2 flex justify-end">
                      <button
                        type="button"
                        onClick={() => removeLine(idx)}
                        disabled={lines.length <= 2}
                        aria-label={`Hapus baris ${idx + 1}`}
                        className="p-2 rounded-lg text-slate-400 hover:text-red-600 disabled:opacity-30"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="px-4 py-3 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4 text-xs">
                <div className="flex items-center gap-2">
                  {validation.valid ? (
                    <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-700 dark:text-emerald-400">
                      <CheckCircle2 className="w-4 h-4" />
                      Seimbang (Debit = Kredit)
                    </span>
                  ) : (
                    <span className="font-medium text-amber-700 dark:text-amber-400">
                      {validation.error}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-6 font-mono font-bold text-slate-900 dark:text-white">
                  <span>Total Debit: {formatRupiah(validation.totalDebit)}</span>
                  <span>Total Kredit: {formatRupiah(validation.totalCredit)}</span>
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={submitting || !validation.valid}
                className="px-5 py-2.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white text-sm font-semibold transition-colors whitespace-nowrap shrink-0"
              >
                {submitting ? 'Menyimpan Jurnal...' : 'Posting Jurnal Transaksi'}
              </button>
            </div>
          </form>
        </section>
      )}

      {/* Journal History Table */}
      <section className="rounded-xl bg-white dark:bg-[#0E1A15] border border-emerald-950/10 dark:border-emerald-900/40 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Daftar Jurnal Umum ({filteredJournals.length} Entri)
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Cari uraian / nomor / akun..."
                className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
              />
            </div>

            <select
              aria-label="Filter unit usaha pada jurnal"
              value={filterUnitId}
              onChange={(e) => setFilterUnitId(e.target.value)}
              className="px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
            >
              <option value="">Semua Unit Usaha</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.code} — {u.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="divide-y divide-slate-200 dark:divide-slate-800">
          {filteredJournals.map((j) => (
            <div key={j.id} className="p-4 hover:bg-slate-50/70 dark:hover:bg-slate-800/30">
              <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                <div>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-mono font-bold text-slate-900 dark:text-white">
                      {j.journalNumber}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono text-slate-600 dark:text-slate-400">
                      {formatDateId(j.entryDate)}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="font-medium text-emerald-700 dark:text-emerald-400">
                      {JOURNAL_TYPE_LABELS[j.entryType]}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="text-slate-500 dark:text-slate-400">{j.unitName}</span>
                  </div>
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100 mt-1">
                    {j.description}{' '}
                    {j.referenceNo && (
                      <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
                        (Ref: {j.referenceNo})
                      </span>
                    )}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {j.attachmentData && (
                    <button
                      type="button"
                      onClick={() =>
                        setPreviewAttachment({
                          name: j.attachmentName || 'Bukti Transaksi',
                          data: j.attachmentData!,
                        })
                      }
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Lihat Bukti</span>
                    </button>
                  )}
                  {canDelete &&
                    j.entryType !== 'PUPUK_MASUK' &&
                    j.entryType !== 'PUPUK_JUAL' &&
                    j.entryType !== 'PENYESUAIAN_STOK' && (
                      <button
                        type="button"
                        onClick={() => handleDeleteJournal(j.id)}
                        aria-label={`Hapus jurnal ${j.journalNumber}`}
                        className="p-1.5 rounded text-slate-400 hover:text-red-600"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <tbody>
                    {j.lines.map((l) => (
                      <tr key={l.id} className="border-t border-slate-100 dark:border-slate-800/70">
                        <td className="py-1.5 pr-3 font-mono text-slate-600 dark:text-slate-400 w-24">
                          {l.accountCode}
                        </td>
                        <td
                          className={`py-1.5 pr-3 ${
                            l.credit > 0
                              ? 'pl-6 text-slate-600 dark:text-slate-400'
                              : 'text-slate-900 dark:text-slate-100 font-medium'
                          }`}
                        >
                          {l.accountName}
                        </td>
                        <td className="py-1.5 px-3 font-mono text-right text-slate-900 dark:text-slate-100 w-36">
                          {l.debit > 0 ? formatRupiah(l.debit) : '-'}
                        </td>
                        <td className="py-1.5 pl-3 font-mono text-right text-slate-900 dark:text-slate-100 w-36">
                          {l.credit > 0 ? formatRupiah(l.credit) : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Attachment Preview Modal */}
      {previewAttachment && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/70 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Pratinjau Bukti Transaksi"
        >
          <div className="bg-white dark:bg-[#0E1A15] border border-emerald-950/10 dark:border-emerald-900/40 rounded-xl max-w-2xl w-full overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                {previewAttachment.name}
              </span>
              <button
                type="button"
                onClick={() => setPreviewAttachment(null)}
                aria-label="Tutup pratinjau"
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 max-h-[75vh] overflow-auto flex justify-center bg-slate-100 dark:bg-slate-950">
              {previewAttachment.data.startsWith('data:image') ? (
                <img
                  src={previewAttachment.data}
                  alt={previewAttachment.name}
                  className="max-w-full max-h-[65vh] object-contain rounded"
                />
              ) : (
                <iframe
                  src={previewAttachment.data}
                  title={previewAttachment.name}
                  className="w-full h-[65vh] rounded border border-slate-200 dark:border-slate-800"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
