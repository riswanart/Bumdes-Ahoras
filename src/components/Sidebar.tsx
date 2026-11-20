import React from 'react';
import {
  BarChart3,
  BookOpen,
  Building2,
  ClipboardList,
  FileSpreadsheet,
  LayoutDashboard,
  Sprout,
  Target,
  X,
} from 'lucide-react';
import { AgroLogoMark } from './AgroArt';
import type { BumdesProfile, UserRole } from '../types/accounting';

export type NavSection =
  | 'dashboard'
  | 'fertilizer'
  | 'journals'
  | 'rpk'
  | 'reports'
  | 'coa'
  | 'profile';

interface SidebarProps {
  activeSection: NavSection;
  onSelectSection: (section: NavSection) => void;
  userRole: UserRole;
  profile: BumdesProfile;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

interface NavItem {
  id: NavSection;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  allowedRoles: UserRole[];
}

const NAV_ITEMS: NavItem[] = [
  {
    id: 'dashboard',
    label: 'Ringkasan Eksekutif',
    icon: LayoutDashboard,
    allowedRoles: ['ADMIN', 'BENDAHARA', 'OPERATOR_KIOS', 'PENGAWAS'],
  },
  {
    id: 'fertilizer',
    label: 'Kios Pupuk Bersubsidi',
    icon: Sprout,
    allowedRoles: ['ADMIN', 'BENDAHARA', 'OPERATOR_KIOS', 'PENGAWAS'],
  },
  {
    id: 'journals',
    label: 'Transaksi & Jurnal',
    icon: ClipboardList,
    allowedRoles: ['ADMIN', 'BENDAHARA', 'OPERATOR_KIOS', 'PENGAWAS'],
  },
  {
    id: 'rpk',
    label: 'RPK & Anggaran',
    icon: Target,
    allowedRoles: ['ADMIN', 'BENDAHARA', 'PENGAWAS'],
  },
  {
    id: 'reports',
    label: 'Laporan Keuangan',
    icon: FileSpreadsheet,
    allowedRoles: ['ADMIN', 'BENDAHARA', 'OPERATOR_KIOS', 'PENGAWAS'],
  },
  {
    id: 'coa',
    label: 'Bagan Akun (CoA)',
    icon: BookOpen,
    allowedRoles: ['ADMIN', 'BENDAHARA', 'PENGAWAS'],
  },
  {
    id: 'profile',
    label: 'Profil & Setup BUMDes',
    icon: Building2,
    allowedRoles: ['ADMIN', 'BENDAHARA', 'OPERATOR_KIOS', 'PENGAWAS'],
  },
];

export const Sidebar: React.FC<SidebarProps> = ({
  activeSection,
  onSelectSection,
  userRole,
  profile,
  mobileOpen,
  onCloseMobile,
}) => {
  const visibleItems = NAV_ITEMS.filter((item) => item.allowedRoles.includes(userRole));

  const navContent = (
    <div className="flex flex-col h-full bg-[#06281E] dark:bg-[#091611] text-emerald-50 border-r border-emerald-950/60 dark:border-emerald-900/40">
      <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <AgroLogoMark className="w-8 h-8" />
          <div className="min-w-0">
            <p className="font-display text-sm font-bold text-white truncate">
              BUMDesa Ahoras
            </p>
            <p className="text-[11px] text-emerald-200/75 truncate">
              {profile.villageName}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Tutup menu navigasi"
          className="lg:hidden p-1.5 rounded-lg text-emerald-200 hover:bg-white/10"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <nav aria-label="Menu Utama" className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {visibleItems.map((item) => {
          const Icon = item.icon;
          const active = activeSection === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onSelectSection(item.id);
                onCloseMobile();
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                active
                  ? 'bg-emerald-800/85 text-white ring-1 ring-amber-400/35'
                  : 'text-emerald-100/80 hover:bg-white/10 hover:text-white'
              }`}
            >
              <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-amber-300' : 'text-emerald-300/80'}`} />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="p-4 border-t border-white/10 text-xs text-emerald-200/75">
        <div className="flex items-center gap-2 font-medium text-white">
          <BarChart3 className="w-3.5 h-3.5 text-amber-300 shrink-0" />
          <span className="truncate">Tahun Buku {profile.fiscalYear}</span>
        </div>
        <p className="mt-1 text-[11px] text-emerald-200/70 truncate">
          Kios Pupuk Bersubsidi · Kepmendesa 136/2022
        </p>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden lg:block w-64 shrink-0 h-screen sticky top-0">{navContent}</aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/60"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <aside className="relative w-72 max-w-[85vw] h-full z-10">{navContent}</aside>
        </div>
      )}
    </>
  );
};
