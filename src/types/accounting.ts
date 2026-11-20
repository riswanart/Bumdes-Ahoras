export type UserRole = 'ADMIN' | 'BENDAHARA' | 'OPERATOR_KIOS' | 'PENGAWAS';

export type AccountCategory =
  | 'ASET'
  | 'KEWAJIBAN'
  | 'EKUITAS'
  | 'PENDAPATAN'
  | 'HPP'
  | 'BEBAN'
  | 'LAIN_LAIN';

export type NormalBalance = 'DEBIT' | 'KREDIT';

export type JournalType =
  | 'KAS_MASUK'
  | 'KAS_KELUAR'
  | 'PEMBELIAN_KREDIT'
  | 'PENJUALAN_KREDIT'
  | 'JURNAL_UMUM'
  | 'SALDO_AWAL'
  | 'PUPUK_MASUK'
  | 'PUPUK_JUAL'
  | 'PENYESUAIAN_STOK';

export type CostingMethod = 'FIFO' | 'MOVING_AVG';

export interface UserAccount {
  id: number;
  username: string;
  fullName: string;
  role: UserRole;
  active: boolean;
  createdAt: string;
}

export interface BumdesProfile {
  id: number;
  name: string;
  villageName: string;
  subDistrict: string;
  district: string;
  province: string;
  ahuNumber: string;
  npwp: string;
  address: string;
  directorName: string;
  treasurerName: string;
  secretaryName: string;
  supervisorName: string;
  fiscalYear: number;
  padesSharePercent: number;
  capitalReservePercent: number;
  inventoryMethod: CostingMethod;
}

export interface BusinessUnit {
  id: number;
  code: string;
  name: string;
  sector: string;
  isFertilizerUnit: boolean;
  active: boolean;
}

export interface Account {
  id: number;
  code: string;
  name: string;
  category: AccountCategory;
  subCategory: string;
  normalBalance: NormalBalance;
  isCashAccount: boolean;
  isSystem: boolean;
}

export interface JournalLineInput {
  accountId: number;
  debit: number;
  credit: number;
  memo?: string;
}

export interface JournalLineRecord extends JournalLineInput {
  id: number;
  journalId: number;
  accountCode: string;
  accountName: string;
  category: AccountCategory;
  normalBalance: NormalBalance;
  isCashAccount: boolean;
}

export interface JournalEntryRecord {
  id: number;
  journalNumber: string;
  entryDate: string;
  unitId: number;
  unitName: string;
  entryType: JournalType;
  description: string;
  referenceNo: string;
  attachmentName?: string | null;
  attachmentData?: string | null;
  createdBy: string;
  createdAt: string;
  lines: JournalLineRecord[];
}

export interface BudgetPlanRecord {
  id: number;
  fiscalYear: number;
  unitId: number;
  unitName: string;
  accountId: number;
  accountCode: string;
  accountName: string;
  category: AccountCategory;
  targetAmount: number;
  notes: string;
}

export interface FertilizerProduct {
  id: number;
  code: string;
  name: string;
  unitLabel: string;
  weightKg: number;
  purchasePrice: number;
  hetPrice: number;
  minStock: number;
  priceNote?: string;
  priceUpdatedAt?: string;
  currentStock: number;
  inventoryValue: number;
}

export interface FertilizerLot {
  id: number;
  productId: number;
  purchaseDate: string;
  doNumber: string;
  qtyInitial: number;
  qtyRemaining: number;
  unitCost: number;
}

export interface FertilizerMovement {
  id: number;
  productId: number;
  productName: string;
  productCode: string;
  movementDate: string;
  movementType: 'MASUK_DO' | 'JUAL_IPUBERS' | 'OPNAME_PLUS' | 'OPNAME_MINUS';
  referenceNo: string;
  partyName: string;
  qty: number;
  unitPrice: number;
  totalPrice: number;
  cogsAmount: number;
  costingMethod: CostingMethod;
  journalId: number | null;
  notes: string;
}

export interface TrialBalanceRow {
  accountId: number;
  code: string;
  name: string;
  category: AccountCategory;
  subCategory: string;
  normalBalance: NormalBalance;
  openingDebit: number;
  openingCredit: number;
  periodDebit: number;
  periodCredit: number;
  endingDebit: number;
  endingCredit: number;
  endingSigned: number;
}

export interface ReportLineItem {
  accountId: number;
  code: string;
  name: string;
  subCategory: string;
  amount: number;
}

export interface FinancialStatements {
  startDate: string;
  endDate: string;
  unitId: number | null;
  unitLabel: string;
  trialBalance: TrialBalanceRow[];
  trialBalanceTotals: {
    openingDebit: number;
    openingCredit: number;
    periodDebit: number;
    periodCredit: number;
    endingDebit: number;
    endingCredit: number;
  };
  incomeStatement: {
    revenues: ReportLineItem[];
    totalRevenue: number;
    cogs: ReportLineItem[];
    totalCogs: number;
    grossProfit: number;
    operatingExpenses: ReportLineItem[];
    totalOperatingExpenses: number;
    operatingProfit: number;
    otherIncomeAndExpenses: ReportLineItem[];
    totalOtherNet: number;
    netProfit: number;
  };
  equityStatement: {
    villageCapital: number;
    communityCapital: number;
    beginningRetainedEarnings: number;
    currentNetProfit: number;
    recordedDividendsOrPades: number;
    projectedPadesAllocation: number;
    projectedReserveAllocation: number;
    endingEquity: number;
  };
  balanceSheet: {
    currentAssets: ReportLineItem[];
    totalCurrentAssets: number;
    fixedAssets: ReportLineItem[];
    totalFixedAssets: number;
    totalAssets: number;
    liabilities: ReportLineItem[];
    totalLiabilities: number;
    equityItems: ReportLineItem[];
    priorRetainedEarnings: number;
    currentPeriodProfit: number;
    totalEquity: number;
    totalLiabilitiesAndEquity: number;
    isBalanced: boolean;
  };
  cashFlow: {
    beginningCash: number;
    operatingCashIn: number;
    operatingCashOut: number;
    netOperatingCash: number;
    investingCashNet: number;
    financingCashNet: number;
    netCashChange: number;
    endingCash: number;
    operatingDetails: { label: string; amount: number }[];
    investingDetails: { label: string; amount: number }[];
    financingDetails: { label: string; amount: number }[];
  };
  rpkComparison: {
    accountId: number;
    code: string;
    name: string;
    category: AccountCategory;
    unitId: number;
    unitName: string;
    targetAmount: number;
    actualAmount: number;
    variance: number;
    realizationPercent: number;
  }[];
}
