import { useCallback, useEffect, useState } from 'react';
import { apiRequest, setAuthToken } from './lib/api';
import { BudgetRpkView } from './components/BudgetRpkView';
import { CoaView } from './components/CoaView';
import { DashboardView } from './components/DashboardView';
import { FertilizerView, type KiosTab } from './components/FertilizerView';
import { JournalView } from './components/JournalView';
import { LoginView } from './components/LoginView';
import { ProfileSetupView } from './components/ProfileSetupView';
import { ReportsView } from './components/ReportsView';
import { Sidebar, type NavSection } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import type {
  Account,
  BudgetPlanRecord,
  BumdesProfile,
  BusinessUnit,
  FertilizerMovement,
  FertilizerProduct,
  JournalEntryRecord,
  UserAccount,
} from './types/accounting';

interface BootstrapPayload {
  user: UserAccount;
  profile: BumdesProfile;
  units: BusinessUnit[];
  accounts: Account[];
  budgets: BudgetPlanRecord[];
  products: FertilizerProduct[];
  movements: FertilizerMovement[];
  journals: JournalEntryRecord[];
  users: UserAccount[];
}

const SECTION_TITLES: Record<NavSection, string> = {
  dashboard: 'Ringkasan Eksekutif',
  fertilizer: 'Kios Pupuk Bersubsidi',
  journals: 'Transaksi & Jurnal Harian',
  rpk: 'RPK & Anggaran',
  reports: 'Laporan Keuangan Kepmendesa 136/2022',
  coa: 'Bagan Akun Standar (CoA)',
  profile: 'Profil & Setup BUMDes',
};

export default function App() {
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem('bumdes_theme') === 'dark';
    } catch {
      return false;
    }
  });

  const [authChecked, setAuthChecked] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [data, setData] = useState<BootstrapPayload | null>(null);
  const [activeSection, setActiveSection] = useState<NavSection>('dashboard');
  const [fertilizerTab, setFertilizerTab] = useState<KiosTab>('stock');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      localStorage.setItem('bumdes_theme', darkMode ? 'dark' : 'light');
    } catch {
      // ignore storage failure
    }
  }, [darkMode]);

  const loadBootstrap = useCallback(async (fromLogin = false) => {
    try {
      const session = await apiRequest<{ authenticated: boolean }>('/api/auth/session');
      if (!session.authenticated) {
        setAuthToken(null);
        setData(null);
        if (fromLogin) {
          setSessionError('Sesi login tidak dapat diverifikasi oleh server. Silakan coba masuk kembali.');
        }
        return;
      }
      const payload = await apiRequest<BootstrapPayload>('/api/bootstrap');
      setSessionError(null);
      setData(payload);
    } catch (err: unknown) {
      setData(null);
      if (fromLogin) {
        setSessionError(err instanceof Error ? err.message : 'Gagal memuat data sesi.');
      }
    } finally {
      setAuthChecked(true);
    }
  }, []);

  useEffect(() => {
    loadBootstrap(false);
  }, [loadBootstrap]);

  const handleLogout = async () => {
    await apiRequest('/api/auth/logout', { method: 'POST' }).catch(() => null);
    setAuthToken(null);
    setSessionError(null);
    setData(null);
    setActiveSection('dashboard');
  };

  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F4F7F4] dark:bg-[#08110D] text-slate-600 dark:text-slate-400 text-sm">
        Memuat sistem pembukuan BUMDes...
      </div>
    );
  }

  if (!data) {
    return (
      <LoginView
        darkMode={darkMode}
        onToggleDarkMode={() => setDarkMode((d) => !d)}
        sessionError={sessionError}
        onLoginSuccess={() => {
          setSessionError(null);
          setAuthChecked(false);
          loadBootstrap(true);
        }}
      />
    );
  }

  return (
    <div className="min-h-screen flex bg-[#F4F7F4] dark:bg-[#08110D] text-slate-900 dark:text-slate-100">
      <Sidebar
        activeSection={activeSection}
        onSelectSection={setActiveSection}
        userRole={data.user.role}
        profile={data.profile}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <TopBar
          sectionTitle={SECTION_TITLES[activeSection]}
          user={data.user}
          profile={data.profile}
          darkMode={darkMode}
          onToggleDarkMode={() => setDarkMode((d) => !d)}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
          onLogout={handleLogout}
        />

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {activeSection === 'dashboard' && (
            <DashboardView
              profile={data.profile}
              units={data.units}
              accounts={data.accounts}
              budgets={data.budgets}
              journals={data.journals}
              products={data.products}
              onNavigate={(section) => {
                if (section === 'fertilizer') setFertilizerTab('stock');
                setActiveSection(section);
              }}
              onNavigateFertilizerTab={(tab) => {
                setFertilizerTab(tab);
                setActiveSection('fertilizer');
              }}
            />
          )}

          {activeSection === 'fertilizer' && (
            <FertilizerView
              userRole={data.user.role}
              profile={data.profile}
              products={data.products}
              movements={data.movements}
              initialTab={fertilizerTab}
              onDataUpdated={(patch) =>
                setData((prev) =>
                  prev
                    ? {
                        ...prev,
                        products: patch.products,
                        movements: patch.movements ?? prev.movements,
                        journals: patch.journals ?? prev.journals,
                      }
                    : prev
                )
              }
            />
          )}

          {activeSection === 'journals' && (
            <JournalView
              userRole={data.user.role}
              units={data.units}
              accounts={data.accounts}
              journals={data.journals}
              onJournalsUpdated={(journals) =>
                setData((prev) => (prev ? { ...prev, journals } : prev))
              }
            />
          )}

          {activeSection === 'rpk' && (
            <BudgetRpkView
              userRole={data.user.role}
              profile={data.profile}
              units={data.units}
              accounts={data.accounts}
              budgets={data.budgets}
              journals={data.journals}
              onBudgetsUpdated={(budgets) =>
                setData((prev) => (prev ? { ...prev, budgets } : prev))
              }
            />
          )}

          {activeSection === 'reports' && (
            <ReportsView
              profile={data.profile}
              units={data.units}
              accounts={data.accounts}
              budgets={data.budgets}
              journals={data.journals}
              products={data.products}
            />
          )}

          {activeSection === 'coa' && (
            <CoaView
              userRole={data.user.role}
              accounts={data.accounts}
              onAccountsUpdated={(accounts) =>
                setData((prev) => (prev ? { ...prev, accounts } : prev))
              }
            />
          )}

          {activeSection === 'profile' && (
            <ProfileSetupView
              currentUser={data.user}
              userRole={data.user.role}
              profile={data.profile}
              units={data.units}
              accounts={data.accounts}
              users={data.users}
              onCurrentUserUpdated={(user) =>
                setData((prev) =>
                  prev
                    ? {
                        ...prev,
                        user,
                        users: prev.users.map((u) => (u.id === user.id ? { ...u, ...user } : u)),
                      }
                    : prev
                )
              }
              onProfileUpdated={(profile) =>
                setData((prev) => (prev ? { ...prev, profile } : prev))
              }
              onUnitsUpdated={(units) =>
                setData((prev) => (prev ? { ...prev, units } : prev))
              }
              onUsersUpdated={(users) =>
                setData((prev) => (prev ? { ...prev, users } : prev))
              }
              onJournalsUpdated={(journals) =>
                setData((prev) => (prev ? { ...prev, journals } : prev))
              }
            />
          )}
        </main>
      </div>
    </div>
  );
}
