import React from 'react';
import { LogOut, Menu, Moon, Sun } from 'lucide-react';
import { ROLE_LABELS } from '../lib/formatters';
import type { BumdesProfile, UserAccount } from '../types/accounting';

interface TopBarProps {
  sectionTitle: string;
  user: UserAccount;
  profile: BumdesProfile;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  onOpenMobileMenu: () => void;
  onLogout: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  sectionTitle,
  user,
  profile,
  darkMode,
  onToggleDarkMode,
  onOpenMobileMenu,
  onLogout,
}) => {
  return (
    <header className="sticky top-0 z-30 bg-white/95 dark:bg-[#0E1A15]/95 backdrop-blur border-b border-emerald-950/10 dark:border-emerald-900/40 px-4 sm:px-6 py-3">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onOpenMobileMenu}
            aria-label="Buka menu navigasi"
            className="lg:hidden p-2 rounded-lg border border-emerald-950/15 dark:border-emerald-900/50 text-slate-700 dark:text-slate-200 hover:bg-emerald-50 dark:hover:bg-emerald-950/60 shrink-0"
          >
            <Menu className="w-4 h-4" />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="truncate">{profile.name}</span>
              <span aria-hidden="true">/</span>
              <span className="font-semibold text-emerald-900 dark:text-emerald-200 truncate">
                {sectionTitle}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div className="hidden sm:block text-right">
            <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 leading-tight">
              {user.fullName}
            </p>
            <p className="text-[11px] text-emerald-700 dark:text-emerald-400 leading-tight font-medium">
              {ROLE_LABELS[user.role]}
            </p>
          </div>

          <button
            type="button"
            onClick={onToggleDarkMode}
            aria-label={darkMode ? 'Beralih ke mode terang' : 'Beralih ke mode gelap'}
            className="p-2 rounded-lg border border-emerald-950/15 dark:border-emerald-900/50 bg-white dark:bg-[#091510] text-slate-700 dark:text-slate-200 hover:bg-emerald-50 dark:hover:bg-emerald-950/60 transition-colors shrink-0"
          >
            {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          <button
            type="button"
            onClick={onLogout}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-emerald-950/15 dark:border-emerald-900/50 bg-white dark:bg-[#091510] text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-emerald-50 dark:hover:bg-emerald-950/60 transition-colors whitespace-nowrap shrink-0"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Keluar</span>
          </button>
        </div>
      </div>
    </header>
  );
};
