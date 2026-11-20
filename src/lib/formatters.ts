import type { AccountCategory, JournalType, UserRole } from '../types/accounting';

export function formatRupiah(amount: number, showZero = true): string {
  const num = Number(amount) || 0;
  if (!showZero && Math.abs(num) < 0.01) return '-';
  const formatted = new Intl.NumberFormat('id-ID', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.abs(Math.round(num)));
  return num < 0 ? `(Rp ${formatted})` : `Rp ${formatted}`;
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('id-ID', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
}

export function formatDateId(dateStr: string): string {
  if (!dateStr) return '-';
  const parsed = new Date(`${dateStr.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return dateStr;
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(parsed);
}

export function formatMonthYearId(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  if (!y || !m) return ym;
  const d = new Date(y, m - 1, 1);
  return new Intl.DateTimeFormat('id-ID', {
    month: 'short',
    year: '2-digit',
  }).format(d);
}

export const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: 'Admin / Direktur BUMDes',
  BENDAHARA: 'Bendahara BUMDes',
  OPERATOR_KIOS: 'Operator Kios Pupuk',
  PENGAWAS: 'Pengawas / Kepala Desa',
};

export const CATEGORY_LABELS: Record<AccountCategory, string> = {
  ASET: '1 · Aset',
  KEWAJIBAN: '2 · Kewajiban',
  EKUITAS: '3 · Ekuitas',
  PENDAPATAN: '4 · Pendapatan Usaha',
  HPP: '5 · Harga Pokok Penjualan',
  BEBAN: '6 · Beban Operasional',
  LAIN_LAIN: '7 · Pendapatan & Beban Lain-lain',
};

export const JOURNAL_TYPE_LABELS: Record<JournalType, string> = {
  KAS_MASUK: 'Kas Masuk',
  KAS_KELUAR: 'Kas Keluar',
  PEMBELIAN_KREDIT: 'Pembelian Kredit',
  PENJUALAN_KREDIT: 'Penjualan Kredit',
  JURNAL_UMUM: 'Jurnal Umum / Penyesuaian',
  SALDO_AWAL: 'Saldo Awal (Neraca Awal)',
  PUPUK_MASUK: 'Penebusan DO Pupuk',
  PUPUK_JUAL: 'Penjualan Pupuk (i-Pubers)',
  PENYESUAIAN_STOK: 'Penyesuaian Selisih Stok',
};
