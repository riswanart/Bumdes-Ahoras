import React, { useEffect, useState } from 'react';
import { Building2, CheckCircle2, Edit3, Plus, Save, Shield, UserCheck, UserPlus, X } from 'lucide-react';
import { apiRequest, setAuthToken } from '../lib/api';
import { ROLE_LABELS } from '../lib/formatters';
import type {
  Account,
  BumdesProfile,
  BusinessUnit,
  CostingMethod,
  JournalEntryRecord,
  UserAccount,
  UserRole,
} from '../types/accounting';

interface ProfileSetupViewProps {
  currentUser: UserAccount;
  userRole: UserRole;
  profile: BumdesProfile;
  units: BusinessUnit[];
  accounts: Account[];
  users: UserAccount[];
  onCurrentUserUpdated: (user: UserAccount) => void;
  onProfileUpdated: (profile: BumdesProfile) => void;
  onUnitsUpdated: (units: BusinessUnit[]) => void;
  onUsersUpdated: (users: UserAccount[]) => void;
  onJournalsUpdated: (journals: JournalEntryRecord[]) => void;
}

export const ProfileSetupView: React.FC<ProfileSetupViewProps> = ({
  currentUser,
  userRole,
  profile,
  units,
  accounts,
  users,
  onCurrentUserUpdated,
  onProfileUpdated,
  onUnitsUpdated,
  onUsersUpdated,
  onJournalsUpdated,
}) => {
  const canEditProfile = userRole === 'ADMIN' || userRole === 'BENDAHARA';
  const isAdmin = userRole === 'ADMIN';

  // Personal Account Profile State
  const [myFullName, setMyFullName] = useState(currentUser.fullName);
  const [myUsername, setMyUsername] = useState(currentUser.username);
  const [myNewPassword, setMyNewPassword] = useState('');
  const [savingAccount, setSavingAccount] = useState(false);
  const [accountMessage, setAccountMessage] = useState<string | null>(null);

  // BUMDes Entity Profile State
  const [form, setForm] = useState<BumdesProfile>({ ...profile });
  const [fiscalYearInput, setFiscalYearInput] = useState(String(profile.fiscalYear));
  const [padesInput, setPadesInput] = useState(String(profile.padesSharePercent));
  const [reserveInput, setReserveInput] = useState(String(profile.capitalReservePercent));
  const [saving, setSaving] = useState(false);
  const [profileSavedNotice, setProfileSavedNotice] = useState<string | null>(null);

  // Business Unit States (Add + Inline Edit)
  const [unitCode, setUnitCode] = useState('');
  const [unitName, setUnitName] = useState('');
  const [unitSector, setUnitSector] = useState('');
  const [unitIsFert, setUnitIsFert] = useState(false);
  const [editingUnitId, setEditingUnitId] = useState<number | null>(null);
  const [editUnitName, setEditUnitName] = useState('');
  const [editUnitSector, setEditUnitSector] = useState('');
  const [editUnitIsFert, setEditUnitIsFert] = useState(false);

  // User Management States (Add + Inline Edit)
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newFullName, setNewFullName] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('OPERATOR_KIOS');
  const [editingUserId, setEditingUserId] = useState<number | null>(null);
  const [editUserFullName, setEditUserFullName] = useState('');
  const [editUserRole, setEditUserRole] = useState<UserRole>('OPERATOR_KIOS');
  const [editUserPassword, setEditUserPassword] = useState('');

  // Alerts
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Opening Balance States
  const [openingUnitId, setOpeningUnitId] = useState<number>(units[0]?.id || 1);
  const [openingDate, setOpeningDate] = useState(`${profile.fiscalYear}-01-01`);
  const [openingDebitAccId, setOpeningDebitAccId] = useState<number>(
    accounts.find((a) => a.code === '1-1102')?.id || accounts[0]?.id || 1
  );
  const [openingCreditAccId, setOpeningCreditAccId] = useState<number>(
    accounts.find((a) => a.code === '3-1101')?.id || accounts[0]?.id || 1
  );
  const [openingAmount, setOpeningAmount] = useState('');
  const [openingDesc, setOpeningDesc] = useState('Penambahan Saldo Awal / Penyertaan Modal Desa');

  useEffect(() => {
    setMyFullName(currentUser.fullName);
    setMyUsername(currentUser.username);
  }, [currentUser]);

  useEffect(() => {
    setForm({ ...profile });
    setFiscalYearInput(String(profile.fiscalYear));
    setPadesInput(String(profile.padesSharePercent));
    setReserveInput(String(profile.capitalReservePercent));
  }, [profile]);

  const handleSaveMyAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setError(null);
    setAccountMessage(null);
    setSavingAccount(true);
    try {
      const res = await apiRequest<{ user: UserAccount; token?: string }>('/api/auth/me', {
        method: 'PUT',
        body: JSON.stringify({
          fullName: myFullName,
          username: myUsername,
          newPassword: myNewPassword || undefined,
        }),
      });
      if (res.token) {
        setAuthToken(res.token);
      }
      onCurrentUserUpdated(res.user);
      setMyNewPassword('');
      setAccountMessage('Profil akun Anda berhasil disimpan.');
      setMessage('Profil akun pengguna berhasil diperbarui.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan profil akun.');
    } finally {
      setSavingAccount(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setError(null);
    setProfileSavedNotice(null);
    setSaving(true);
    try {
      const payload: BumdesProfile = {
        ...form,
        fiscalYear: Number(fiscalYearInput) || 2026,
        padesSharePercent: Number(padesInput),
        capitalReservePercent: Number(reserveInput),
      };
      const res = await apiRequest<{ profile: BumdesProfile }>('/api/profile', {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      onProfileUpdated(res.profile);
      setProfileSavedNotice('Perubahan profil BUMDes tersimpan');
      setMessage('Identitas BUMDes, struktur pengurus, dan kebijakan akuntansi berhasil disimpan.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Gagal memperbarui profil.');
    } finally {
      setSaving(false);
    }
  };

  const handleAddUnit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setError(null);
    try {
      const res = await apiRequest<{ units: BusinessUnit[] }>('/api/units', {
        method: 'POST',
        body: JSON.stringify({
          code: unitCode,
          name: unitName,
          sector: unitSector,
          isFertilizerUnit: unitIsFert,
        }),
      });
      onUnitsUpdated(res.units);
      setUnitCode('');
      setUnitName('');
      setUnitSector('');
      setUnitIsFert(false);
      setMessage('Unit usaha baru berhasil ditambahkan.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Gagal menambah unit usaha.');
    }
  };

  const startEditUnit = (u: BusinessUnit) => {
    setEditingUnitId(u.id);
    setEditUnitName(u.name);
    setEditUnitSector(u.sector);
    setEditUnitIsFert(u.isFertilizerUnit);
    setError(null);
  };

  const handleSaveEditUnit = async (id: number) => {
    setMessage(null);
    setError(null);
    try {
      const res = await apiRequest<{ units: BusinessUnit[] }>(`/api/units/${id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: editUnitName,
          sector: editUnitSector,
          isFertilizerUnit: editUnitIsFert,
          active: true,
        }),
      });
      onUnitsUpdated(res.units);
      setEditingUnitId(null);
      setMessage('Data unit usaha berhasil diperbarui.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Gagal memperbarui unit usaha.');
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setError(null);
    try {
      const res = await apiRequest<{ users: UserAccount[] }>('/api/users', {
        method: 'POST',
        body: JSON.stringify({
          username: newUsername,
          password: newPassword,
          fullName: newFullName,
          role: newRole,
        }),
      });
      onUsersUpdated(res.users);
      setNewUsername('');
      setNewPassword('');
      setNewFullName('');
      setMessage('Akun pengguna baru berhasil dibuat.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Gagal membuat akun pengguna.');
    }
  };

  const startEditUser = (u: UserAccount) => {
    setEditingUserId(u.id);
    setEditUserFullName(u.fullName);
    setEditUserRole(u.role);
    setEditUserPassword('');
    setError(null);
  };

  const handleSaveEditUser = async (id: number) => {
    setMessage(null);
    setError(null);
    try {
      const res = await apiRequest<{ users: UserAccount[] }>(`/api/users/${id}`, {
        method: 'PUT',
        body: JSON.stringify({
          fullName: editUserFullName,
          role: editUserRole,
          password: editUserPassword || undefined,
        }),
      });
      onUsersUpdated(res.users);
      if (id === currentUser.id) {
        onCurrentUserUpdated({
          ...currentUser,
          fullName: editUserFullName.trim(),
          role: editUserRole,
        });
      }
      setEditingUserId(null);
      setMessage('Data pengguna berhasil diperbarui.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Gagal memperbarui akun pengguna.');
    }
  };

  const handleToggleUser = async (id: number) => {
    setError(null);
    try {
      const res = await apiRequest<{ users: UserAccount[] }>(`/api/users/${id}/toggle`, {
        method: 'PATCH',
      });
      onUsersUpdated(res.users);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Gagal mengubah status pengguna.');
    }
  };

  const handleSaveOpeningBalance = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setError(null);
    const amt = Number(openingAmount);
    if (!amt || amt <= 0) {
      setError('Nominal saldo awal harus lebih dari Rp 0.');
      return;
    }
    try {
      const res = await apiRequest<{ journals: JournalEntryRecord[] }>('/api/journals', {
        method: 'POST',
        body: JSON.stringify({
          entryDate: openingDate,
          unitId: openingUnitId,
          entryType: 'SALDO_AWAL',
          description: openingDesc.trim() || 'Saldo Awal Neraca BUMDes',
          referenceNo: `SA-${openingDate.replaceAll('-', '')}`,
          lines: [
            { accountId: openingDebitAccId, debit: amt, credit: 0 },
            { accountId: openingCreditAccId, debit: 0, credit: amt },
          ],
        }),
      });
      onJournalsUpdated(res.journals);
      setOpeningAmount('');
      setMessage('Saldo Awal (Neraca Awal) berhasil diposting ke pembukuan unit usaha.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan saldo awal.');
    }
  };

  const inputClass =
    'w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-emerald-900/60 bg-white dark:bg-[#08110D] text-slate-900 dark:text-white disabled:opacity-70 focus:outline-none focus:ring-2 focus:ring-emerald-700';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
          Profil BUMDes, Pengaturan Akun &amp; Unit Usaha
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          Edit profil akun pribadi, legalitas Kemenkumham, struktur pengurus, saldo awal neraca, kebijakan persediaan/PADes, dan unit usaha
        </p>
      </div>

      {message && (
        <div
          role="status"
          className="p-3.5 rounded-lg border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/50 text-xs font-medium text-emerald-800 dark:text-emerald-300"
        >
          {message}
        </div>
      )}
      {error && (
        <div
          role="alert"
          className="p-3.5 rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/50 text-xs font-medium text-red-700 dark:text-red-300"
        >
          {error}
        </div>
      )}

      {/* Personal User Account Profile (Editable by any logged-in user) */}
      <section className="p-6 rounded-xl bg-white dark:bg-[#0E1A15] border border-emerald-950/10 dark:border-emerald-900/40">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
            <span>Profil Akun Pengguna Saya</span>
          </h2>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Peran aktif:{' '}
            <strong className="text-emerald-700 dark:text-emerald-400">
              {ROLE_LABELS[currentUser.role]}
            </strong>
          </span>
        </div>

        <form onSubmit={handleSaveMyAccount} className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
          <div>
            <label htmlFor="my-fullname" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Nama Lengkap
            </label>
            <input
              id="my-fullname"
              type="text"
              required
              value={myFullName}
              onChange={(e) => {
                setMyFullName(e.target.value);
                setAccountMessage(null);
              }}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="my-username" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Username Login
            </label>
            <input
              id="my-username"
              type="text"
              required
              value={myUsername}
              onChange={(e) => {
                setMyUsername(e.target.value);
                setAccountMessage(null);
              }}
              className={`${inputClass} font-mono`}
            />
          </div>
          <div>
            <label htmlFor="my-password" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Password Baru (Opsional, min. 6 karakter)
            </label>
            <input
              id="my-password"
              type="password"
              value={myNewPassword}
              onChange={(e) => {
                setMyNewPassword(e.target.value);
                setAccountMessage(null);
              }}
              placeholder="Kosongkan jika tidak diubah"
              className={inputClass}
            />
          </div>

          <div className="sm:col-span-3 flex flex-wrap items-center justify-end gap-3 pt-1">
            {accountMessage && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="w-4 h-4" />
                <span>{accountMessage}</span>
              </span>
            )}
            <button
              type="submit"
              disabled={savingAccount}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white text-sm font-semibold transition-colors whitespace-nowrap shrink-0"
            >
              <Save className="w-4 h-4" />
              <span>{savingAccount ? 'Menyimpan...' : 'Simpan Profil Saya'}</span>
            </button>
          </div>
        </form>
      </section>

      {/* BUMDes Entity Profile Form */}
      <section className="p-6 rounded-xl bg-white dark:bg-[#0E1A15] border border-emerald-950/10 dark:border-emerald-900/40">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Building2 className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
            <span>Identitas &amp; Struktur Pengurus BUMDes</span>
          </h2>
          {!canEditProfile && (
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Hanya Direktur atau Bendahara yang dapat mengubah identitas BUMDes
            </span>
          )}
        </div>

        <form onSubmit={handleSaveProfile} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label htmlFor="prof-name" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Nama Resmi BUMDes
              </label>
              <input
                id="prof-name"
                type="text"
                required
                disabled={!canEditProfile}
                value={form.name}
                onChange={(e) => {
                  setForm({ ...form, name: e.target.value });
                  setProfileSavedNotice(null);
                }}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="prof-ahu" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Nomor Sertifikat Kemenkumham (AHU)
              </label>
              <input
                id="prof-ahu"
                type="text"
                required
                disabled={!canEditProfile}
                value={form.ahuNumber}
                onChange={(e) => {
                  setForm({ ...form, ahuNumber: e.target.value });
                  setProfileSavedNotice(null);
                }}
                className={`${inputClass} font-mono`}
              />
            </div>
            <div>
              <label htmlFor="prof-npwp" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                NPWP BUMDes
              </label>
              <input
                id="prof-npwp"
                type="text"
                disabled={!canEditProfile}
                value={form.npwp}
                onChange={(e) => {
                  setForm({ ...form, npwp: e.target.value });
                  setProfileSavedNotice(null);
                }}
                className={`${inputClass} font-mono`}
              />
            </div>

            <div>
              <label htmlFor="prof-village" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Desa
              </label>
              <input
                id="prof-village"
                type="text"
                required
                disabled={!canEditProfile}
                value={form.villageName}
                onChange={(e) => {
                  setForm({ ...form, villageName: e.target.value });
                  setProfileSavedNotice(null);
                }}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="prof-subdistrict" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Kecamatan
              </label>
              <input
                id="prof-subdistrict"
                type="text"
                disabled={!canEditProfile}
                value={form.subDistrict}
                onChange={(e) => {
                  setForm({ ...form, subDistrict: e.target.value });
                  setProfileSavedNotice(null);
                }}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="prof-district" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Kabupaten / Kota
              </label>
              <input
                id="prof-district"
                type="text"
                disabled={!canEditProfile}
                value={form.district}
                onChange={(e) => {
                  setForm({ ...form, district: e.target.value });
                  setProfileSavedNotice(null);
                }}
                className={inputClass}
              />
            </div>

            <div>
              <label htmlFor="prof-province" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Provinsi
              </label>
              <input
                id="prof-province"
                type="text"
                disabled={!canEditProfile}
                value={form.province}
                onChange={(e) => {
                  setForm({ ...form, province: e.target.value });
                  setProfileSavedNotice(null);
                }}
                className={inputClass}
              />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="prof-address" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Alamat Kantor BUMDes &amp; Kios Pupuk
              </label>
              <input
                id="prof-address"
                type="text"
                disabled={!canEditProfile}
                value={form.address}
                onChange={(e) => {
                  setForm({ ...form, address: e.target.value });
                  setProfileSavedNotice(null);
                }}
                className={inputClass}
              />
            </div>

            <div>
              <label htmlFor="prof-director" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Direktur BUMDes
              </label>
              <input
                id="prof-director"
                type="text"
                disabled={!canEditProfile}
                value={form.directorName}
                onChange={(e) => {
                  setForm({ ...form, directorName: e.target.value });
                  setProfileSavedNotice(null);
                }}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="prof-treasurer" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Bendahara BUMDes
              </label>
              <input
                id="prof-treasurer"
                type="text"
                disabled={!canEditProfile}
                value={form.treasurerName}
                onChange={(e) => {
                  setForm({ ...form, treasurerName: e.target.value });
                  setProfileSavedNotice(null);
                }}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="prof-secretary" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Sekretaris BUMDes
              </label>
              <input
                id="prof-secretary"
                type="text"
                disabled={!canEditProfile}
                value={form.secretaryName}
                onChange={(e) => {
                  setForm({ ...form, secretaryName: e.target.value });
                  setProfileSavedNotice(null);
                }}
                className={inputClass}
              />
            </div>

            <div>
              <label htmlFor="prof-supervisor" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Pengawas / Kepala Desa
              </label>
              <input
                id="prof-supervisor"
                type="text"
                disabled={!canEditProfile}
                value={form.supervisorName}
                onChange={(e) => {
                  setForm({ ...form, supervisorName: e.target.value });
                  setProfileSavedNotice(null);
                }}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="prof-year" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Periode Tahun Buku
              </label>
              <input
                id="prof-year"
                type="number"
                min="2000"
                max="2100"
                disabled={!canEditProfile}
                value={fiscalYearInput}
                onChange={(e) => {
                  setFiscalYearInput(e.target.value);
                  setProfileSavedNotice(null);
                }}
                className={`${inputClass} font-mono`}
              />
            </div>
            <div>
              <label htmlFor="prof-pades" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Persentase Bagi Hasil PADes (%)
              </label>
              <input
                id="prof-pades"
                type="number"
                min="0"
                max="100"
                step="0.5"
                disabled={!canEditProfile}
                value={padesInput}
                onChange={(e) => {
                  setPadesInput(e.target.value);
                  setProfileSavedNotice(null);
                }}
                className={`${inputClass} font-mono`}
              />
            </div>

            <div>
              <label htmlFor="prof-reserve" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Cadangan Penambahan Modal (%)
              </label>
              <input
                id="prof-reserve"
                type="number"
                min="0"
                max="100"
                step="0.5"
                disabled={!canEditProfile}
                value={reserveInput}
                onChange={(e) => {
                  setReserveInput(e.target.value);
                  setProfileSavedNotice(null);
                }}
                className={`${inputClass} font-mono`}
              />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="prof-method" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Metode HPP Persediaan Pupuk Default
              </label>
              <select
                id="prof-method"
                disabled={!canEditProfile}
                value={form.inventoryMethod}
                onChange={(e) => {
                  setForm({ ...form, inventoryMethod: e.target.value as CostingMethod });
                  setProfileSavedNotice(null);
                }}
                className={inputClass}
              >
                <option value="FIFO">FIFO (Masuk Pertama Keluar Pertama)</option>
                <option value="MOVING_AVG">Rata-rata Bergerak (Moving Average)</option>
              </select>
            </div>
          </div>

          {canEditProfile && (
            <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
              {profileSavedNotice && (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{profileSavedNotice}</span>
                </span>
              )}
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white text-sm font-semibold transition-colors whitespace-nowrap shrink-0"
              >
                <Save className="w-4 h-4" />
                <span>{saving ? 'Menyimpan...' : 'Simpan Profil BUMDes'}</span>
              </button>
            </div>
          )}
        </form>
      </section>

      {/* Input Saldo Awal (Neraca Awal) */}
      {canEditProfile && (
        <section className="p-6 rounded-xl bg-white dark:bg-[#0E1A15] border border-emerald-950/10 dark:border-emerald-900/40 space-y-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Setup Saldo Awal (Neraca Awal) &amp; Penyertaan Modal
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Catat saldo awal kas, bank, aset tetap, atau tambahan penyertaan modal desa/masyarakat per unit usaha.
            </p>
          </div>

          <form onSubmit={handleSaveOpeningBalance} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 items-end">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Unit Usaha
              </label>
              <select
                value={openingUnitId}
                onChange={(e) => setOpeningUnitId(Number(e.target.value))}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-emerald-900/60 bg-white dark:bg-[#08110D] text-slate-900 dark:text-white"
              >
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.code} — {u.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Tanggal Saldo Awal
              </label>
              <input
                type="date"
                required
                value={openingDate}
                onChange={(e) => setOpeningDate(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-emerald-900/60 bg-white dark:bg-[#08110D] text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Akun Debit (Aset)
              </label>
              <select
                value={openingDebitAccId}
                onChange={(e) => setOpeningDebitAccId(Number(e.target.value))}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-emerald-900/60 bg-white dark:bg-[#08110D] text-slate-900 dark:text-white"
              >
                {accounts
                  .filter((a) => a.category === 'ASET')
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.code} — {a.name}
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Akun Kredit (Modal / Utang)
              </label>
              <select
                value={openingCreditAccId}
                onChange={(e) => setOpeningCreditAccId(Number(e.target.value))}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-emerald-900/60 bg-white dark:bg-[#08110D] text-slate-900 dark:text-white"
              >
                {accounts
                  .filter((a) => a.category === 'EKUITAS' || a.category === 'KEWAJIBAN')
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.code} — {a.name}
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Nominal (Rp)
              </label>
              <input
                type="number"
                min="1"
                required
                value={openingAmount}
                onChange={(e) => setOpeningAmount(e.target.value)}
                placeholder="10000000"
                className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-emerald-900/60 bg-white dark:bg-[#08110D] text-slate-900 dark:text-white"
              />
            </div>

            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold whitespace-nowrap shrink-0"
            >
              Simpan Saldo Awal
            </button>

            <div className="sm:col-span-2 lg:col-span-6">
              <input
                type="text"
                value={openingDesc}
                onChange={(e) => setOpeningDesc(e.target.value)}
                placeholder="Keterangan saldo awal / nomor Perdes penyertaan modal"
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-emerald-900/60 bg-white dark:bg-[#08110D] text-slate-900 dark:text-white"
              />
            </div>
          </form>
        </section>
      )}

      {/* Business Units */}
      <section className="p-6 rounded-xl bg-white dark:bg-[#0E1A15] border border-emerald-950/10 dark:border-emerald-900/40 space-y-4">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            Manajemen Multi-Unit Usaha
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Setiap unit usaha memiliki pembukuan terpisah yang dikonsolidasikan secara otomatis ke laporan BUMDes.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-emerald-950/10 dark:border-emerald-900/40 text-xs text-slate-500 dark:text-slate-400">
                <th className="py-2 px-3 font-medium">Kode Unit</th>
                <th className="py-2 px-3 font-medium">Nama Unit Usaha</th>
                <th className="py-2 px-3 font-medium">Sektor Usaha</th>
                <th className="py-2 px-3 font-medium">Kios Pupuk</th>
                {canEditProfile && <th className="py-2 px-3 font-medium text-right">Aksi</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-emerald-950/10 dark:divide-emerald-900/40">
              {units.map((u) => {
                const isEditing = editingUnitId === u.id;
                return (
                  <tr key={u.id}>
                    <td className="py-2.5 px-3 font-mono text-xs font-semibold">{u.code}</td>
                    <td className="py-2.5 px-3 text-xs font-medium text-slate-900 dark:text-white">
                      {isEditing ? (
                        <input
                          type="text"
                          value={editUnitName}
                          onChange={(e) => setEditUnitName(e.target.value)}
                          className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 dark:border-emerald-900/60 bg-white dark:bg-[#08110D]"
                        />
                      ) : (
                        u.name
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-xs text-slate-600 dark:text-slate-400">
                      {isEditing ? (
                        <input
                          type="text"
                          value={editUnitSector}
                          onChange={(e) => setEditUnitSector(e.target.value)}
                          className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 dark:border-emerald-900/60 bg-white dark:bg-[#08110D]"
                        />
                      ) : (
                        u.sector
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-xs">
                      {isEditing ? (
                        <label className="inline-flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={editUnitIsFert}
                            onChange={(e) => setEditUnitIsFert(e.target.checked)}
                            className="rounded border-slate-300 text-emerald-700"
                          />
                          <span>Kios Pupuk</span>
                        </label>
                      ) : u.isFertilizerUnit ? (
                        'Ya (Modul i-Pubers)'
                      ) : (
                        'Unit Umum'
                      )}
                    </td>
                    {canEditProfile && (
                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        {isEditing ? (
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleSaveEditUnit(u.id)}
                              className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:underline"
                            >
                              Simpan
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingUnitId(null)}
                              className="text-xs text-slate-500 hover:underline"
                            >
                              Batal
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => startEditUnit(u)}
                            className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-emerald-700 dark:hover:text-emerald-400"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            <span>Ubah</span>
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {canEditProfile && (
          <form onSubmit={handleAddUnit} className="pt-4 border-t border-emerald-950/10 dark:border-emerald-900/40 grid grid-cols-1 sm:grid-cols-5 gap-3 items-end">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Kode Unit
              </label>
              <input
                type="text"
                required
                value={unitCode}
                onChange={(e) => setUnitCode(e.target.value)}
                placeholder="WST-03"
                className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-emerald-900/60 bg-white dark:bg-[#08110D] text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Nama Unit Usaha
              </label>
              <input
                type="text"
                required
                value={unitName}
                onChange={(e) => setUnitName(e.target.value)}
                placeholder="Unit Wisata Desa"
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-emerald-900/60 bg-white dark:bg-[#08110D] text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Bidang / Sektor
              </label>
              <input
                type="text"
                required
                value={unitSector}
                onChange={(e) => setUnitSector(e.target.value)}
                placeholder="Pariwisata & Kuliner"
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-emerald-900/60 bg-white dark:bg-[#08110D] text-slate-900 dark:text-white"
              />
            </div>
            <label className="inline-flex items-center gap-2 py-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={unitIsFert}
                onChange={(e) => setUnitIsFert(e.target.checked)}
                className="rounded border-slate-300 text-emerald-700"
              />
              <span>Unit Kios Pupuk</span>
            </label>
            <button
              type="submit"
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Tambah Unit</span>
            </button>
          </form>
        )}
      </section>

      {/* RBAC User Management (Admin Only) */}
      {isAdmin && (
        <section className="p-6 rounded-xl bg-white dark:bg-[#0E1A15] border border-emerald-950/10 dark:border-emerald-900/40 space-y-4">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Manajemen Akun Pengguna &amp; Hak Akses (RBAC)
            </h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-emerald-950/10 dark:border-emerald-900/40 text-xs text-slate-500 dark:text-slate-400">
                  <th className="py-2 px-3 font-medium">Username</th>
                  <th className="py-2 px-3 font-medium">Nama Lengkap</th>
                  <th className="py-2 px-3 font-medium">Peran</th>
                  <th className="py-2 px-3 font-medium">Status</th>
                  <th className="py-2 px-3 font-medium text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-emerald-950/10 dark:divide-emerald-900/40">
                {users.map((u) => {
                  const isEditing = editingUserId === u.id;
                  return (
                    <tr key={u.id}>
                      <td className="py-2.5 px-3 font-mono text-xs font-semibold">{u.username}</td>
                      <td className="py-2.5 px-3 text-xs">
                        {isEditing ? (
                          <div className="space-y-1.5">
                            <input
                              type="text"
                              value={editUserFullName}
                              onChange={(e) => setEditUserFullName(e.target.value)}
                              placeholder="Nama Lengkap"
                              className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 dark:border-emerald-900/60 bg-white dark:bg-[#08110D]"
                            />
                            <input
                              type="password"
                              value={editUserPassword}
                              onChange={(e) => setEditUserPassword(e.target.value)}
                              placeholder="Password baru (opsional, min. 6)"
                              className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 dark:border-emerald-900/60 bg-white dark:bg-[#08110D]"
                            />
                          </div>
                        ) : (
                          u.fullName
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-xs">
                        {isEditing ? (
                          <select
                            value={editUserRole}
                            onChange={(e) => setEditUserRole(e.target.value as UserRole)}
                            className="px-2.5 py-1.5 text-xs rounded border border-slate-300 dark:border-emerald-900/60 bg-white dark:bg-[#08110D]"
                          >
                            <option value="OPERATOR_KIOS">Operator Kios Pupuk</option>
                            <option value="BENDAHARA">Bendahara BUMDes</option>
                            <option value="PENGAWAS">Pengawas / Kepala Desa</option>
                            <option value="ADMIN">Admin / Direktur BUMDes</option>
                          </select>
                        ) : (
                          ROLE_LABELS[u.role]
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-xs">
                        <span className={u.active ? 'text-emerald-700 dark:text-emerald-400 font-semibold' : 'text-slate-400'}>
                          {u.active ? 'Aktif' : 'Nonaktif'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        {isEditing ? (
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleSaveEditUser(u.id)}
                              className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:underline"
                            >
                              Simpan
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingUserId(null)}
                              className="inline-flex items-center gap-0.5 text-xs text-slate-500 hover:underline"
                            >
                              <X className="w-3 h-3" />
                              <span>Batal</span>
                            </button>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => startEditUser(u)}
                              className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-emerald-700 dark:hover:text-emerald-400"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                              <span>Ubah</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleToggleUser(u.id)}
                              className="text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-amber-700 dark:hover:text-amber-400"
                            >
                              {u.active ? 'Nonaktifkan' : 'Aktifkan'}
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <form onSubmit={handleAddUser} className="pt-4 border-t border-emerald-950/10 dark:border-emerald-900/40 grid grid-cols-1 sm:grid-cols-5 gap-3 items-end">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Username
              </label>
              <input
                type="text"
                required
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                placeholder="kasir_kios"
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-emerald-900/60 bg-white dark:bg-[#08110D] text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Password
              </label>
              <input
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Minimal 6 karakter"
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-emerald-900/60 bg-white dark:bg-[#08110D] text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Nama Lengkap
              </label>
              <input
                type="text"
                required
                value={newFullName}
                onChange={(e) => setNewFullName(e.target.value)}
                placeholder="Nama Pengurus"
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-emerald-900/60 bg-white dark:bg-[#08110D] text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Peran Akses
              </label>
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as UserRole)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-emerald-900/60 bg-white dark:bg-[#08110D] text-slate-900 dark:text-white"
              >
                <option value="OPERATOR_KIOS">Operator Kios Pupuk</option>
                <option value="BENDAHARA">Bendahara BUMDes</option>
                <option value="PENGAWAS">Pengawas / Kepala Desa</option>
                <option value="ADMIN">Admin / Direktur BUMDes</option>
              </select>
            </div>
            <button
              type="submit"
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold whitespace-nowrap shrink-0"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Buat Akun</span>
            </button>
          </form>
        </section>
      )}
    </div>
  );
};
