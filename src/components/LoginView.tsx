import React, { useState } from 'react';
import { Lock, LogIn, Moon, ShieldCheck, Sun, User } from 'lucide-react';
import { apiRequest, setAuthToken } from '../lib/api';
import { AgroLogoMark, AgroPaddyScene } from './AgroArt';
import type { UserAccount } from '../types/accounting';

interface LoginViewProps {
  darkMode: boolean;
  onToggleDarkMode: () => void;
  onLoginSuccess: (user: UserAccount) => void;
  sessionError?: string | null;
}

const DEMO_ACCOUNTS = [
  {
    username: 'direktur',
    label: 'Direktur BUMDes',
    desc: 'Akses penuh profil, unit usaha, pengguna & persetujuan',
  },
  {
    username: 'bendahara',
    label: 'Bendahara',
    desc: 'Jurnal keuangan, RPK anggaran & laporan Kepmendesa 136/2022',
  },
  {
    username: 'operator',
    label: 'Operator Kios Pupuk',
    desc: 'Penebusan DO distributor, rekap i-Pubers & stock opname',
  },
  {
    username: 'pengawas',
    label: 'Pengawas / Kepala Desa',
    desc: 'Monitoring ringkasan eksekutif & audit laporan keuangan',
  },
];

export const LoginView: React.FC<LoginViewProps> = ({
  darkMode,
  onToggleDarkMode,
  onLoginSuccess,
  sessionError,
}) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!username.trim() || !password) {
      setError('Masukkan username dan password Anda.');
      return;
    }
    setLoading(true);
    try {
      const data = await apiRequest<{ user: UserAccount; token?: string }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username: username.trim(), password }),
      });
      if (data.token) {
        setAuthToken(data.token);
      }
      onLoginSuccess(data.user);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Gagal masuk ke sistem.');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickFill = (uname: string) => {
    setUsername(uname);
    setPassword('bumdes123');
    setError(null);
  };

  return (
    <div className="min-h-screen flex flex-col justify-between bg-[#F4F7F4] dark:bg-[#08110D] text-slate-900 dark:text-slate-100 px-4 py-6 sm:px-8">
      <div className="flex items-center justify-between max-w-6xl w-full mx-auto">
        <div className="flex items-center gap-3">
          <AgroLogoMark className="w-10 h-10" />
          <div>
            <span className="font-display font-bold text-base tracking-tight block text-slate-900 dark:text-white">
              BUMDesa Ahoras
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Kios Pupuk Bersubsidi · Kepmendesa PDTT No. 136/2022
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={onToggleDarkMode}
          aria-label={darkMode ? 'Aktifkan mode terang' : 'Aktifkan mode gelap'}
          className="inline-flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg border border-emerald-950/15 dark:border-emerald-900/50 bg-white dark:bg-[#0E1A15] text-slate-700 dark:text-slate-200 hover:bg-emerald-50 dark:hover:bg-emerald-950/60 transition-colors whitespace-nowrap shrink-0"
        >
          {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          <span>{darkMode ? 'Mode Terang' : 'Mode Gelap'}</span>
        </button>
      </div>

      <main className="max-w-6xl w-full mx-auto my-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
        <section className="lg:col-span-7 flex flex-col justify-between rounded-xl bg-white dark:bg-[#0E1A15] border border-emerald-950/10 dark:border-emerald-900/40 overflow-hidden">
          {/* Agrarian Subsidized Fertilizer Visual Showcase */}
          <div className="relative overflow-hidden bg-emerald-950 text-white p-6 sm:p-8">
            <AgroPaddyScene className="absolute inset-0 w-full h-full object-cover" />
            <div
              className="absolute inset-0 bg-gradient-to-r from-[#032218]/95 via-[#043627]/80 to-[#043627]/45"
              aria-hidden="true"
            />
            <div className="relative z-10 max-w-xl">
              <p className="text-xs font-semibold text-amber-300 tracking-wide mb-2">
                Unit Usaha Kios Resmi Pupuk Bersubsidi &amp; Pembukuan Desa
              </p>
              <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-white leading-snug text-balance">
                Sistem Akuntansi BUMDes &amp; Distribusi Pupuk Bersubsidi
              </h1>
              <p className="mt-3 text-sm text-emerald-100/90 leading-relaxed">
                Kendalikan penebusan DO distributor, rekap penyaluran i-Pubers sesuai HET Kementan, kartu stok FIFO/Rata-rata Bergerak, hingga laporan keuangan konsolidasi siap Musyawarah Desa.
              </p>
              <div className="mt-5 pt-4 border-t border-white/15 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-emerald-100/85">
                <span className="font-semibold text-amber-200">Urea 50 kg</span>
                <span aria-hidden="true">·</span>
                <span className="font-semibold text-amber-200">NPK Phonska</span>
                <span aria-hidden="true">·</span>
                <span className="font-semibold text-amber-200">Organik Petroganik</span>
                <span aria-hidden="true">·</span>
                <span>SAK EMKM</span>
              </div>
            </div>
          </div>

          <div className="p-6 sm:p-7">
            <h2 className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-3">
              Akses Peran Pengguna (Klik untuk isi otomatis)
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {DEMO_ACCOUNTS.map((acc) => (
                <button
                  key={acc.username}
                  type="button"
                  onClick={() => handleQuickFill(acc.username)}
                  className="text-left p-3 rounded-lg border border-emerald-950/10 dark:border-emerald-900/50 hover:border-emerald-700 dark:hover:border-emerald-500 bg-[#F4F7F4] dark:bg-[#08110D]/80 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                      {acc.label}
                    </span>
                    <span className="text-[11px] font-mono text-emerald-700 dark:text-emerald-400">
                      {acc.username}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                    {acc.desc}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="lg:col-span-5 p-6 sm:p-8 rounded-xl bg-white dark:bg-[#0E1A15] border border-emerald-950/10 dark:border-emerald-900/40 flex flex-col justify-center">
          <div className="mb-6">
            <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 mb-1">
              Otentikasi Pengurus &amp; Operator Kios
            </p>
            <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
              Masuk ke Sistem Pembukuan
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Gunakan username dan password yang telah terdaftar oleh Direktur BUMDes.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {(error || sessionError) && (
              <div
                role="alert"
                className="p-3 rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 text-xs text-red-700 dark:text-red-300"
              >
                {error || sessionError}
              </div>
            )}

            <div>
              <label
                htmlFor="login-username"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
              >
                Username
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  id="login-username"
                  type="text"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Contoh: bendahara"
                  className="w-full pl-9 pr-3 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-emerald-900/60 bg-white dark:bg-[#08110D] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-700"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="login-password"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
              >
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  id="login-password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Masukkan password"
                  className="w-full pl-9 pr-3 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-emerald-900/60 bg-white dark:bg-[#08110D] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-700"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white text-sm font-semibold transition-colors whitespace-nowrap shrink-0"
            >
              <LogIn className="w-4 h-4" />
              <span>{loading ? 'Memeriksa Akun...' : 'Masuk ke Aplikasi'}</span>
            </button>
          </form>

          <div className="mt-6 pt-4 border-t border-emerald-950/10 dark:border-emerald-900/40 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <ShieldCheck className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0" />
            <span>Password bawaan seluruh akun demo:</span>
            <code className="font-mono text-slate-800 dark:text-slate-200 font-semibold">
              bumdes123
            </code>
          </div>
        </section>
      </main>

      <footer className="max-w-6xl w-full mx-auto text-center text-xs text-slate-500 dark:text-slate-400">
        BUMDesa Ahoras · Penyimpanan SQLite Permanen · Standar Pelaporan Kepmendesa PDTT No. 136 Tahun 2022
      </footer>
    </div>
  );
};
