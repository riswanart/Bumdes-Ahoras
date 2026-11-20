import type {
  Account,
  AccountCategory,
  BudgetPlanRecord,
  BumdesProfile,
  CostingMethod,
  FertilizerLot,
  FinancialStatements,
  JournalEntryRecord,
  NormalBalance,
  ReportLineItem,
  TrialBalanceRow,
} from '../types/accounting';

export interface JournalValidationResult {
  valid: boolean;
  totalDebit: number;
  totalCredit: number;
  error?: string;
}

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function validateJournalBalance(
  lines: { accountId: number; debit: number; credit: number }[]
): JournalValidationResult {
  if (!lines || lines.length < 2) {
    return {
      valid: false,
      totalDebit: 0,
      totalCredit: 0,
      error: 'Minimal harus terdapat 2 baris akun (Debit dan Kredit).',
    };
  }

  let totalDebit = 0;
  let totalCredit = 0;

  for (const line of lines) {
    if (!line.accountId || line.accountId <= 0) {
      return {
        valid: false,
        totalDebit: roundMoney(totalDebit),
        totalCredit: roundMoney(totalCredit),
        error: 'Setiap baris jurnal harus memilih akun CoA yang valid.',
      };
    }
    const debit = Number(line.debit) || 0;
    const credit = Number(line.credit) || 0;
    if (debit < 0 || credit < 0) {
      return {
        valid: false,
        totalDebit: roundMoney(totalDebit),
        totalCredit: roundMoney(totalCredit),
        error: 'Nominal debit maupun kredit tidak boleh bernilai negatif.',
      };
    }
    if (debit > 0 && credit > 0) {
      return {
        valid: false,
        totalDebit: roundMoney(totalDebit),
        totalCredit: roundMoney(totalCredit),
        error: 'Satu baris akun tidak boleh mengisi Debit dan Kredit sekaligus.',
      };
    }
    if (debit === 0 && credit === 0) {
      return {
        valid: false,
        totalDebit: roundMoney(totalDebit),
        totalCredit: roundMoney(totalCredit),
        error: 'Setiap baris harus memiliki nilai Debit atau Kredit lebih dari Rp 0.',
      };
    }
    totalDebit += debit;
    totalCredit += credit;
  }

  totalDebit = roundMoney(totalDebit);
  totalCredit = roundMoney(totalCredit);

  if (totalDebit <= 0) {
    return {
      valid: false,
      totalDebit,
      totalCredit,
      error: 'Total transaksi harus lebih besar dari Rp 0.',
    };
  }

  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    return {
      valid: false,
      totalDebit,
      totalCredit,
      error: `Jurnal tidak seimbang: Total Debit (${totalDebit.toLocaleString('id-ID')}) ≠ Total Kredit (${totalCredit.toLocaleString('id-ID')}).`,
    };
  }

  return {
    valid: true,
    totalDebit,
    totalCredit,
  };
}

export interface FertilizerPriceMetrics {
  valid: boolean;
  error?: string;
  purchasePrice: number;
  hetPrice: number;
  distributorPricePerKg: number;
  sellingPricePerKg: number;
  marginPerUnit: number;
  marginPercent: number;
  isBelowCost: boolean;
}

export function validateAndComputeFertilizerPrices(input: {
  purchasePrice: number;
  hetPrice: number;
  weightKg: number;
}): FertilizerPriceMetrics {
  const purchasePrice = roundMoney(Number(input.purchasePrice));
  const hetPrice = roundMoney(Number(input.hetPrice));
  const weightKg = Number(input.weightKg);

  if (!Number.isFinite(purchasePrice) || purchasePrice <= 0) {
    return {
      valid: false,
      error: 'Harga penebusan distributor harus lebih besar dari Rp 0.',
      purchasePrice: 0,
      hetPrice: Number.isFinite(hetPrice) ? hetPrice : 0,
      distributorPricePerKg: 0,
      sellingPricePerKg: 0,
      marginPerUnit: 0,
      marginPercent: 0,
      isBelowCost: false,
    };
  }

  if (!Number.isFinite(hetPrice) || hetPrice <= 0) {
    return {
      valid: false,
      error: 'Harga penjualan (HET) harus lebih besar dari Rp 0.',
      purchasePrice,
      hetPrice: 0,
      distributorPricePerKg: 0,
      sellingPricePerKg: 0,
      marginPerUnit: 0,
      marginPercent: 0,
      isBelowCost: false,
    };
  }

  const safeWeight = Number.isFinite(weightKg) && weightKg > 0 ? weightKg : 1;
  const marginPerUnit = roundMoney(hetPrice - purchasePrice);
  const marginPercent = roundMoney((marginPerUnit / purchasePrice) * 100);

  return {
    valid: true,
    purchasePrice,
    hetPrice,
    distributorPricePerKg: roundMoney(purchasePrice / safeWeight),
    sellingPricePerKg: roundMoney(hetPrice / safeWeight),
    marginPerUnit,
    marginPercent,
    isBelowCost: hetPrice < purchasePrice,
  };
}

export interface ConsumedLotLayer {
  lotId: number;
  qtyUsed: number;
  unitCost: number;
  subtotalCost: number;
}

export interface FertilizerCogsResult {
  totalCogs: number;
  averageUnitCost: number;
  consumedLayers: ConsumedLotLayer[];
  updatedLots: FertilizerLot[];
  remainingQty: number;
  remainingValue: number;
}

export function computeFertilizerSaleCogs(
  lots: FertilizerLot[],
  qtySold: number,
  method: CostingMethod
): FertilizerCogsResult {
  if (qtySold <= 0) {
    throw new Error('Jumlah penjualan harus lebih dari 0.');
  }

  const orderedLots = [...lots]
    .filter((l) => l.qtyRemaining > 0)
    .sort((a, b) => a.purchaseDate.localeCompare(b.purchaseDate) || a.id - b.id);

  const totalAvailable = orderedLots.reduce((sum, lot) => sum + lot.qtyRemaining, 0);
  if (qtySold > totalAvailable + 1e-6) {
    throw new Error(
      `Stok tidak mencukupi. Tersedia ${totalAvailable} unit, diminta ${qtySold} unit.`
    );
  }

  const totalValueBefore = orderedLots.reduce(
    (sum, lot) => sum + lot.qtyRemaining * lot.unitCost,
    0
  );

  if (method === 'MOVING_AVG') {
    const movingAvgUnitCost = totalAvailable > 0 ? totalValueBefore / totalAvailable : 0;
    const totalCogs = roundMoney(qtySold * movingAvgUnitCost);
    let remainingToDeduct = qtySold;
    const consumedLayers: ConsumedLotLayer[] = [];
    const updatedLots: FertilizerLot[] = [];

    for (const lot of orderedLots) {
      if (remainingToDeduct <= 0) {
        updatedLots.push({ ...lot });
        continue;
      }
      const take = Math.min(lot.qtyRemaining, remainingToDeduct);
      consumedLayers.push({
        lotId: lot.id,
        qtyUsed: take,
        unitCost: roundMoney(movingAvgUnitCost),
        subtotalCost: roundMoney(take * movingAvgUnitCost),
      });
      remainingToDeduct = roundMoney(remainingToDeduct - take);
      updatedLots.push({
        ...lot,
        qtyRemaining: roundMoney(lot.qtyRemaining - take),
      });
    }

    const remainingQty = roundMoney(totalAvailable - qtySold);
    const remainingValue = Math.max(0, roundMoney(totalValueBefore - totalCogs));

    return {
      totalCogs,
      averageUnitCost: roundMoney(movingAvgUnitCost),
      consumedLayers,
      updatedLots,
      remainingQty,
      remainingValue,
    };
  }

  // FIFO: consume oldest purchase lots first
  let remainingToDeduct = qtySold;
  let totalCogs = 0;
  const consumedLayers: ConsumedLotLayer[] = [];
  const updatedLots: FertilizerLot[] = [];

  for (const lot of orderedLots) {
    if (remainingToDeduct <= 0) {
      updatedLots.push({ ...lot });
      continue;
    }
    const take = Math.min(lot.qtyRemaining, remainingToDeduct);
    const layerCost = roundMoney(take * lot.unitCost);
    totalCogs += layerCost;
    consumedLayers.push({
      lotId: lot.id,
      qtyUsed: take,
      unitCost: lot.unitCost,
      subtotalCost: layerCost,
    });
    remainingToDeduct = roundMoney(remainingToDeduct - take);
    updatedLots.push({
      ...lot,
      qtyRemaining: roundMoney(lot.qtyRemaining - take),
    });
  }

  totalCogs = roundMoney(totalCogs);
  const remainingQty = roundMoney(totalAvailable - qtySold);
  const remainingValue = roundMoney(
    updatedLots.reduce((sum, lot) => sum + lot.qtyRemaining * lot.unitCost, 0)
  );

  return {
    totalCogs,
    averageUnitCost: roundMoney(totalCogs / qtySold),
    consumedLayers,
    updatedLots,
    remainingQty,
    remainingValue,
  };
}

function signedBalance(debit: number, credit: number, normalBalance: NormalBalance): number {
  return normalBalance === 'DEBIT' ? roundMoney(debit - credit) : roundMoney(credit - debit);
}

function isNominalCategory(category: AccountCategory): boolean {
  return (
    category === 'PENDAPATAN' ||
    category === 'HPP' ||
    category === 'BEBAN' ||
    category === 'LAIN_LAIN'
  );
}

export function generateFinancialStatements(params: {
  accounts: Account[];
  entries: JournalEntryRecord[];
  budgets: BudgetPlanRecord[];
  profile: BumdesProfile;
  startDate: string;
  endDate: string;
  unitId: number | null;
  unitLabel: string;
}): FinancialStatements {
  const { accounts, entries, budgets, profile, startDate, endDate, unitId, unitLabel } = params;

  const scopedEntries = entries.filter((e) => (unitId ? e.unitId === unitId : true));

  const sortedAccounts = [...accounts].sort((a, b) => a.code.localeCompare(b.code));
  const stats = new Map<
    number,
    {
      openingDebit: number;
      openingCredit: number;
      periodDebit: number;
      periodCredit: number;
    }
  >();

  for (const acc of sortedAccounts) {
    stats.set(acc.id, {
      openingDebit: 0,
      openingCredit: 0,
      periodDebit: 0,
      periodCredit: 0,
    });
  }

  for (const entry of scopedEntries) {
    if (entry.entryDate > endDate) continue;
    const isBeforeStart = entry.entryDate < startDate;
    for (const line of entry.lines) {
      const bucket = stats.get(line.accountId);
      if (!bucket) continue;
      if (isBeforeStart) {
        bucket.openingDebit += line.debit;
        bucket.openingCredit += line.credit;
      } else {
        bucket.periodDebit += line.debit;
        bucket.periodCredit += line.credit;
      }
    }
  }

  const trialBalance: TrialBalanceRow[] = [];
  const totals = {
    openingDebit: 0,
    openingCredit: 0,
    periodDebit: 0,
    periodCredit: 0,
    endingDebit: 0,
    endingCredit: 0,
  };

  for (const acc of sortedAccounts) {
    const s = stats.get(acc.id)!;
    const openNet = s.openingDebit - s.openingCredit;
    const openingDebit = openNet > 0 ? roundMoney(openNet) : 0;
    const openingCredit = openNet < 0 ? roundMoney(Math.abs(openNet)) : 0;

    const totalD = roundMoney(s.openingDebit + s.periodDebit);
    const totalC = roundMoney(s.openingCredit + s.periodCredit);
    const endNet = totalD - totalC;
    const endingDebit = endNet > 0 ? roundMoney(endNet) : 0;
    const endingCredit = endNet < 0 ? roundMoney(Math.abs(endNet)) : 0;
    const endingSigned = signedBalance(totalD, totalC, acc.normalBalance);

    if (
      openingDebit === 0 &&
      openingCredit === 0 &&
      s.periodDebit === 0 &&
      s.periodCredit === 0
    ) {
      continue;
    }

    const row: TrialBalanceRow = {
      accountId: acc.id,
      code: acc.code,
      name: acc.name,
      category: acc.category,
      subCategory: acc.subCategory,
      normalBalance: acc.normalBalance,
      openingDebit,
      openingCredit,
      periodDebit: roundMoney(s.periodDebit),
      periodCredit: roundMoney(s.periodCredit),
      endingDebit,
      endingCredit,
      endingSigned,
    };

    trialBalance.push(row);
    totals.openingDebit = roundMoney(totals.openingDebit + openingDebit);
    totals.openingCredit = roundMoney(totals.openingCredit + openingCredit);
    totals.periodDebit = roundMoney(totals.periodDebit + row.periodDebit);
    totals.periodCredit = roundMoney(totals.periodCredit + row.periodCredit);
    totals.endingDebit = roundMoney(totals.endingDebit + endingDebit);
    totals.endingCredit = roundMoney(totals.endingCredit + endingCredit);
  }

  // Income Statement uses period activity [startDate, endDate]
  const revenues: ReportLineItem[] = [];
  const cogs: ReportLineItem[] = [];
  const operatingExpenses: ReportLineItem[] = [];
  const otherIncomeAndExpenses: ReportLineItem[] = [];

  let priorRetainedEarnings = 0;

  for (const acc of sortedAccounts) {
    const s = stats.get(acc.id)!;
    if (!isNominalCategory(acc.category)) continue;

    // Prior period nominal net profit feeds retained earnings for Balance Sheet & Equity Statement
    const priorAmount = signedBalance(s.openingDebit, s.openingCredit, acc.normalBalance);
    if (acc.category === 'PENDAPATAN') {
      priorRetainedEarnings += priorAmount;
    } else if (acc.category === 'HPP' || acc.category === 'BEBAN') {
      priorRetainedEarnings -= priorAmount;
    } else if (acc.category === 'LAIN_LAIN') {
      if (acc.normalBalance === 'KREDIT') {
        priorRetainedEarnings += priorAmount;
      } else {
        priorRetainedEarnings -= priorAmount;
      }
    }

    const periodAmount = signedBalance(s.periodDebit, s.periodCredit, acc.normalBalance);
    if (periodAmount === 0) continue;

    if (acc.category === 'PENDAPATAN') {
      revenues.push({
        accountId: acc.id,
        code: acc.code,
        name: acc.name,
        subCategory: acc.subCategory,
        amount: periodAmount,
      });
    } else if (acc.category === 'HPP') {
      cogs.push({
        accountId: acc.id,
        code: acc.code,
        name: acc.name,
        subCategory: acc.subCategory,
        amount: periodAmount,
      });
    } else if (acc.category === 'BEBAN') {
      operatingExpenses.push({
        accountId: acc.id,
        code: acc.code,
        name: acc.name,
        subCategory: acc.subCategory,
        amount: periodAmount,
      });
    } else if (acc.category === 'LAIN_LAIN') {
      const signedNet = acc.normalBalance === 'KREDIT' ? periodAmount : -periodAmount;
      otherIncomeAndExpenses.push({
        accountId: acc.id,
        code: acc.code,
        name: acc.name,
        subCategory: acc.subCategory,
        amount: signedNet,
      });
    }
  }

  priorRetainedEarnings = roundMoney(priorRetainedEarnings);
  const totalRevenue = roundMoney(revenues.reduce((sum, r) => sum + r.amount, 0));
  const totalCogs = roundMoney(cogs.reduce((sum, r) => sum + r.amount, 0));
  const grossProfit = roundMoney(totalRevenue - totalCogs);
  const totalOperatingExpenses = roundMoney(
    operatingExpenses.reduce((sum, r) => sum + r.amount, 0)
  );
  const operatingProfit = roundMoney(grossProfit - totalOperatingExpenses);
  const totalOtherNet = roundMoney(
    otherIncomeAndExpenses.reduce((sum, r) => sum + r.amount, 0)
  );
  const netProfit = roundMoney(operatingProfit + totalOtherNet);

  // Balance Sheet (Aset = Kewajiban + Ekuitas) using cumulative balances <= endDate
  const currentAssets: ReportLineItem[] = [];
  const fixedAssets: ReportLineItem[] = [];
  const liabilities: ReportLineItem[] = [];
  const equityItems: ReportLineItem[] = [];

  let villageCapital = 0;
  let communityCapital = 0;
  let retainedEarningsAccountBalance = 0;
  let recordedDividendsOrPades = 0;

  for (const row of trialBalance) {
    if (row.category === 'ASET') {
      // Contra-asset (e.g. Akumulasi Penyusutan) has normalBalance === 'KREDIT' -> subtract from asset total
      const assetSigned = row.normalBalance === 'DEBIT' ? row.endingSigned : -row.endingSigned;
      const item: ReportLineItem = {
        accountId: row.accountId,
        code: row.code,
        name: row.name,
        subCategory: row.subCategory,
        amount: assetSigned,
      };
      if (row.code.startsWith('1-2')) {
        fixedAssets.push(item);
      } else {
        currentAssets.push(item);
      }
    } else if (row.category === 'KEWAJIBAN') {
      liabilities.push({
        accountId: row.accountId,
        code: row.code,
        name: row.name,
        subCategory: row.subCategory,
        amount: row.endingSigned,
      });
    } else if (row.category === 'EKUITAS') {
      const eqSigned = row.normalBalance === 'KREDIT' ? row.endingSigned : -row.endingSigned;
      equityItems.push({
        accountId: row.accountId,
        code: row.code,
        name: row.name,
        subCategory: row.subCategory,
        amount: eqSigned,
      });
      if (row.code === '3-1101') villageCapital += eqSigned;
      else if (row.code === '3-1102') communityCapital += eqSigned;
      else if (row.code === '3-2101') retainedEarningsAccountBalance += eqSigned;
      else if (row.code.startsWith('3-3')) recordedDividendsOrPades += Math.abs(eqSigned);
    }
  }

  const totalCurrentAssets = roundMoney(currentAssets.reduce((sum, r) => sum + r.amount, 0));
  const totalFixedAssets = roundMoney(fixedAssets.reduce((sum, r) => sum + r.amount, 0));
  const totalAssets = roundMoney(totalCurrentAssets + totalFixedAssets);
  const totalLiabilities = roundMoney(liabilities.reduce((sum, r) => sum + r.amount, 0));
  const totalEquityAccounts = roundMoney(equityItems.reduce((sum, r) => sum + r.amount, 0));
  const totalEquity = roundMoney(totalEquityAccounts + priorRetainedEarnings + netProfit);
  const totalLiabilitiesAndEquity = roundMoney(totalLiabilities + totalEquity);

  const positiveProfit = Math.max(0, netProfit);
  const projectedPadesAllocation = roundMoney(
    (positiveProfit * (profile.padesSharePercent || 0)) / 100
  );
  const projectedReserveAllocation = roundMoney(
    (positiveProfit * (profile.capitalReservePercent || 0)) / 100
  );

  // Cash Flow Statement (Direct / Counterpart Classification on Cash & Bank Accounts)
  let beginningCash = 0;
  let endingCash = 0;
  for (const row of trialBalance) {
    const acc = sortedAccounts.find((a) => a.id === row.accountId);
    if (acc?.isCashAccount) {
      beginningCash += roundMoney(row.openingDebit - row.openingCredit);
      endingCash += roundMoney(row.endingDebit - row.endingCredit);
    }
  }
  beginningCash = roundMoney(beginningCash);
  endingCash = roundMoney(endingCash);

  let operatingCashIn = 0;
  let operatingCashOut = 0;
  let investingCashNet = 0;
  let financingCashNet = 0;

  const operatingMap = new Map<string, number>();
  const investingMap = new Map<string, number>();
  const financingMap = new Map<string, number>();

  for (const entry of scopedEntries) {
    if (entry.entryDate < startDate || entry.entryDate > endDate) continue;
    let cashDelta = 0;
    for (const l of entry.lines) {
      if (l.isCashAccount) {
        cashDelta += l.debit - l.credit;
      }
    }
    cashDelta = roundMoney(cashDelta);
    if (Math.abs(cashDelta) < 0.01) continue;

    const nonCashLines = entry.lines.filter((l) => !l.isCashAccount);
    const hasInvesting = nonCashLines.some((l) => l.accountCode.startsWith('1-2'));
    const hasFinancing = nonCashLines.some((l) => l.category === 'EKUITAS');

    if (hasInvesting) {
      investingCashNet = roundMoney(investingCashNet + cashDelta);
      const label = entry.description || 'Transaksi Aset Tetap';
      investingMap.set(label, roundMoney((investingMap.get(label) || 0) + cashDelta));
    } else if (hasFinancing) {
      financingCashNet = roundMoney(financingCashNet + cashDelta);
      const label = entry.description || 'Transaksi Modal / PADes';
      financingMap.set(label, roundMoney((financingMap.get(label) || 0) + cashDelta));
    } else {
      if (cashDelta > 0) {
        operatingCashIn = roundMoney(operatingCashIn + cashDelta);
      } else {
        operatingCashOut = roundMoney(operatingCashOut + Math.abs(cashDelta));
      }
      const primaryCounterpart =
        nonCashLines[0]?.accountName || entry.description || 'Aktivitas Operasional';
      operatingMap.set(
        primaryCounterpart,
        roundMoney((operatingMap.get(primaryCounterpart) || 0) + cashDelta)
      );
    }
  }

  const netOperatingCash = roundMoney(operatingCashIn - operatingCashOut);
  const netCashChange = roundMoney(netOperatingCash + investingCashNet + financingCashNet);

  // RPK Budget vs Realization
  const rpkComparison = budgets
    .filter((b) => (unitId ? b.unitId === unitId : true))
    .map((b) => {
      const s = stats.get(b.accountId);
      const actualAmount = s
        ? signedBalance(
            s.periodDebit,
            s.periodCredit,
            accounts.find((a) => a.id === b.accountId)?.normalBalance || 'DEBIT'
          )
        : 0;
      const variance = roundMoney(actualAmount - b.targetAmount);
      const realizationPercent =
        b.targetAmount > 0 ? roundMoney((actualAmount / b.targetAmount) * 100) : 0;
      return {
        accountId: b.accountId,
        code: b.accountCode,
        name: b.accountName,
        category: b.category,
        unitId: b.unitId,
        unitName: b.unitName,
        targetAmount: b.targetAmount,
        actualAmount,
        variance,
        realizationPercent,
      };
    });

  return {
    startDate,
    endDate,
    unitId,
    unitLabel,
    trialBalance,
    trialBalanceTotals: totals,
    incomeStatement: {
      revenues,
      totalRevenue,
      cogs,
      totalCogs,
      grossProfit,
      operatingExpenses,
      totalOperatingExpenses,
      operatingProfit,
      otherIncomeAndExpenses,
      totalOtherNet,
      netProfit,
    },
    equityStatement: {
      villageCapital: roundMoney(villageCapital),
      communityCapital: roundMoney(communityCapital),
      beginningRetainedEarnings: roundMoney(retainedEarningsAccountBalance + priorRetainedEarnings),
      currentNetProfit: netProfit,
      recordedDividendsOrPades: roundMoney(recordedDividendsOrPades),
      projectedPadesAllocation,
      projectedReserveAllocation,
      endingEquity: totalEquity,
    },
    balanceSheet: {
      currentAssets,
      totalCurrentAssets,
      fixedAssets,
      totalFixedAssets,
      totalAssets,
      liabilities,
      totalLiabilities,
      equityItems,
      priorRetainedEarnings,
      currentPeriodProfit: netProfit,
      totalEquity,
      totalLiabilitiesAndEquity,
      isBalanced: Math.abs(totalAssets - totalLiabilitiesAndEquity) < 0.05,
    },
    cashFlow: {
      beginningCash,
      operatingCashIn,
      operatingCashOut,
      netOperatingCash,
      investingCashNet,
      financingCashNet,
      netCashChange,
      endingCash,
      operatingDetails: Array.from(operatingMap.entries()).map(([label, amount]) => ({
        label,
        amount,
      })),
      investingDetails: Array.from(investingMap.entries()).map(([label, amount]) => ({
        label,
        amount,
      })),
      financingDetails: Array.from(financingMap.entries()).map(([label, amount]) => ({
        label,
        amount,
      })),
    },
    rpkComparison,
  };
}
