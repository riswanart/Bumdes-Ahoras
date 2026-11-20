import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeFertilizerSaleCogs,
  generateFinancialStatements,
  validateAndComputeFertilizerPrices,
  validateJournalBalance,
} from './accountingEngine';
import type { Account, BumdesProfile, FertilizerLot, JournalEntryRecord } from '../types/accounting';

test('validateAndComputeFertilizerPrices computes per-kg, margin, and validates inputs', () => {
  const valid = validateAndComputeFertilizerPrices({
    purchasePrice: 102000,
    hetPrice: 112500,
    weightKg: 50,
  });
  assert.equal(valid.valid, true);
  assert.equal(valid.distributorPricePerKg, 2040);
  assert.equal(valid.sellingPricePerKg, 2250);
  assert.equal(valid.marginPerUnit, 10500);
  assert.equal(valid.marginPercent, 10.29);
  assert.equal(valid.isBelowCost, false);

  const belowCost = validateAndComputeFertilizerPrices({
    purchasePrice: 120000,
    hetPrice: 112500,
    weightKg: 50,
  });
  assert.equal(belowCost.valid, true);
  assert.equal(belowCost.isBelowCost, true);
  assert.equal(belowCost.marginPerUnit, -7500);

  const invalidPurchase = validateAndComputeFertilizerPrices({
    purchasePrice: 0,
    hetPrice: 112500,
    weightKg: 50,
  });
  assert.equal(invalidPurchase.valid, false);
  assert.match(invalidPurchase.error || '', /penebusan/i);

  const invalidHet = validateAndComputeFertilizerPrices({
    purchasePrice: 102000,
    hetPrice: -500,
    weightKg: 50,
  });
  assert.equal(invalidHet.valid, false);
  assert.match(invalidHet.error || '', /penjualan/i);
});

test('validateJournalBalance enforces debit equals credit and valid lines', () => {
  const valid = validateJournalBalance([
    { accountId: 1, debit: 500000, credit: 0 },
    { accountId: 2, debit: 0, credit: 500000 },
  ]);
  assert.equal(valid.valid, true);
  assert.equal(valid.totalDebit, 500000);

  const unbalanced = validateJournalBalance([
    { accountId: 1, debit: 500000, credit: 0 },
    { accountId: 2, debit: 0, credit: 450000 },
  ]);
  assert.equal(unbalanced.valid, false);
  assert.match(unbalanced.error || '', /tidak seimbang/i);

  const singleLine = validateJournalBalance([{ accountId: 1, debit: 100000, credit: 0 }]);
  assert.equal(singleLine.valid, false);
});

test('computeFertilizerSaleCogs calculates FIFO vs Moving Average across multiple DO batches', () => {
  const lots: FertilizerLot[] = [
    {
      id: 1,
      productId: 1,
      purchaseDate: '2026-01-10',
      doNumber: 'DO-001',
      qtyInitial: 10,
      qtyRemaining: 10,
      unitCost: 100000,
    },
    {
      id: 2,
      productId: 1,
      purchaseDate: '2026-02-10',
      doNumber: 'DO-002',
      qtyInitial: 10,
      qtyRemaining: 10,
      unitCost: 110000,
    },
  ];

  // FIFO selling 15 units = 10 * 100,000 + 5 * 110,000 = 1,550,000
  const fifo = computeFertilizerSaleCogs(lots, 15, 'FIFO');
  assert.equal(fifo.totalCogs, 1550000);
  assert.equal(fifo.remainingQty, 5);
  assert.equal(fifo.remainingValue, 550000);
  assert.equal(fifo.consumedLayers.length, 2);

  // Moving Average selling 15 units = 15 * 105,000 = 1,575,000
  const avg = computeFertilizerSaleCogs(lots, 15, 'MOVING_AVG');
  assert.equal(avg.averageUnitCost, 105000);
  assert.equal(avg.totalCogs, 1575000);
  assert.equal(avg.remainingQty, 5);
  assert.equal(avg.remainingValue, 525000);
});

test('generateFinancialStatements maintains Accounting Equation and Cash Reconciliation', () => {
  const accounts: Account[] = [
    {
      id: 1,
      code: '1-1101',
      name: 'Kas BUMDes',
      category: 'ASET',
      subCategory: 'Aset Lancar',
      normalBalance: 'DEBIT',
      isCashAccount: true,
      isSystem: true,
    },
    {
      id: 2,
      code: '1-1401',
      name: 'Persediaan Pupuk Bersubsidi',
      category: 'ASET',
      subCategory: 'Aset Lancar',
      normalBalance: 'DEBIT',
      isCashAccount: false,
      isSystem: true,
    },
    {
      id: 3,
      code: '3-1101',
      name: 'Penyertaan Modal Desa',
      category: 'EKUITAS',
      subCategory: 'Modal',
      normalBalance: 'KREDIT',
      isCashAccount: false,
      isSystem: true,
    },
    {
      id: 4,
      code: '4-1101',
      name: 'Penjualan Pupuk Bersubsidi',
      category: 'PENDAPATAN',
      subCategory: 'Pendapatan Usaha',
      normalBalance: 'KREDIT',
      isCashAccount: false,
      isSystem: true,
    },
    {
      id: 5,
      code: '5-1101',
      name: 'HPP Pupuk Bersubsidi',
      category: 'HPP',
      subCategory: 'Harga Pokok Penjualan',
      normalBalance: 'DEBIT',
      isCashAccount: false,
      isSystem: true,
    },
    {
      id: 6,
      code: '6-1101',
      name: 'Beban Operasional Kios',
      category: 'BEBAN',
      subCategory: 'Beban Operasional',
      normalBalance: 'DEBIT',
      isCashAccount: false,
      isSystem: true,
    },
  ];

  const entries: JournalEntryRecord[] = [
    {
      id: 1,
      journalNumber: 'JU-2026-0001',
      entryDate: '2026-01-01',
      unitId: 1,
      unitName: 'Unit Kios Pupuk',
      entryType: 'SALDO_AWAL',
      description: 'Modal Awal Desa',
      referenceNo: 'PERDES-01',
      createdBy: 'direktur',
      createdAt: '2026-01-01T00:00:00Z',
      lines: [
        {
          id: 1,
          journalId: 1,
          accountId: 1,
          accountCode: '1-1101',
          accountName: 'Kas BUMDes',
          category: 'ASET',
          normalBalance: 'DEBIT',
          isCashAccount: true,
          debit: 10000000,
          credit: 0,
        },
        {
          id: 2,
          journalId: 1,
          accountId: 3,
          accountCode: '3-1101',
          accountName: 'Penyertaan Modal Desa',
          category: 'EKUITAS',
          normalBalance: 'KREDIT',
          isCashAccount: false,
          debit: 0,
          credit: 10000000,
        },
      ],
    },
    {
      id: 2,
      journalNumber: 'JU-2026-0002',
      entryDate: '2026-02-05',
      unitId: 1,
      unitName: 'Unit Kios Pupuk',
      entryType: 'PUPUK_MASUK',
      description: 'Tebus Pupuk Urea',
      referenceNo: 'DO-01',
      createdBy: 'operator',
      createdAt: '2026-02-05T00:00:00Z',
      lines: [
        {
          id: 3,
          journalId: 2,
          accountId: 2,
          accountCode: '1-1401',
          accountName: 'Persediaan Pupuk Bersubsidi',
          category: 'ASET',
          normalBalance: 'DEBIT',
          isCashAccount: false,
          debit: 4000000,
          credit: 0,
        },
        {
          id: 4,
          journalId: 2,
          accountId: 1,
          accountCode: '1-1101',
          accountName: 'Kas BUMDes',
          category: 'ASET',
          normalBalance: 'DEBIT',
          isCashAccount: true,
          debit: 0,
          credit: 4000000,
        },
      ],
    },
    {
      id: 3,
      journalNumber: 'JU-2026-0003',
      entryDate: '2026-02-15',
      unitId: 1,
      unitName: 'Unit Kios Pupuk',
      entryType: 'PUPUK_JUAL',
      description: 'Penjualan i-Pubers',
      referenceNo: 'IPB-01',
      createdBy: 'operator',
      createdAt: '2026-02-15T00:00:00Z',
      lines: [
        {
          id: 5,
          journalId: 3,
          accountId: 1,
          accountCode: '1-1101',
          accountName: 'Kas BUMDes',
          category: 'ASET',
          normalBalance: 'DEBIT',
          isCashAccount: true,
          debit: 2500000,
          credit: 0,
        },
        {
          id: 6,
          journalId: 3,
          accountId: 4,
          accountCode: '4-1101',
          accountName: 'Penjualan Pupuk Bersubsidi',
          category: 'PENDAPATAN',
          normalBalance: 'KREDIT',
          isCashAccount: false,
          debit: 0,
          credit: 2500000,
        },
        {
          id: 7,
          journalId: 3,
          accountId: 5,
          accountCode: '5-1101',
          accountName: 'HPP Pupuk Bersubsidi',
          category: 'HPP',
          normalBalance: 'DEBIT',
          isCashAccount: false,
          debit: 2000000,
          credit: 0,
        },
        {
          id: 8,
          journalId: 3,
          accountId: 2,
          accountCode: '1-1401',
          accountName: 'Persediaan Pupuk Bersubsidi',
          category: 'ASET',
          normalBalance: 'DEBIT',
          isCashAccount: false,
          debit: 0,
          credit: 2000000,
        },
      ],
    },
    {
      id: 4,
      journalNumber: 'JU-2026-0004',
      entryDate: '2026-02-20',
      unitId: 1,
      unitName: 'Unit Kios Pupuk',
      entryType: 'KAS_KELUAR',
      description: 'Honor Operator Kios',
      referenceNo: 'BKK-01',
      createdBy: 'bendahara',
      createdAt: '2026-02-20T00:00:00Z',
      lines: [
        {
          id: 9,
          journalId: 4,
          accountId: 6,
          accountCode: '6-1101',
          accountName: 'Beban Operasional Kios',
          category: 'BEBAN',
          normalBalance: 'DEBIT',
          isCashAccount: false,
          debit: 200000,
          credit: 0,
        },
        {
          id: 10,
          journalId: 4,
          accountId: 1,
          accountCode: '1-1101',
          accountName: 'Kas BUMDes',
          category: 'ASET',
          normalBalance: 'DEBIT',
          isCashAccount: true,
          debit: 0,
          credit: 200000,
        },
      ],
    },
  ];

  const profile: BumdesProfile = {
    id: 1,
    name: 'BUMDes Sumber Makmur',
    villageName: 'Desa Sukamaju',
    subDistrict: 'Kecamatan Sukasari',
    district: 'Kabupaten Subang',
    province: 'Jawa Barat',
    ahuNumber: 'AHU-001.AH.01.33',
    npwp: '01.234.567.8-439.000',
    address: 'Jl. Balai Desa No. 1',
    directorName: 'Hendra Wijaya',
    treasurerName: 'Siti Aminah',
    secretaryName: 'Budi Santoso',
    supervisorName: 'Kepala Desa',
    fiscalYear: 2026,
    padesSharePercent: 30,
    capitalReservePercent: 25,
    inventoryMethod: 'FIFO',
  };

  const reports = generateFinancialStatements({
    accounts,
    entries,
    budgets: [],
    profile,
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    unitId: null,
    unitLabel: 'Konsolidasi BUMDes',
  });

  // Trial balance equality
  assert.equal(reports.trialBalanceTotals.endingDebit, reports.trialBalanceTotals.endingCredit);
  // Gross profit = 2,500,000 - 2,000,000 = 500,000; Net profit = 500,000 - 200,000 = 300,000
  assert.equal(reports.incomeStatement.grossProfit, 500000);
  assert.equal(reports.incomeStatement.netProfit, 300000);
  // Balance sheet balanced
  assert.equal(reports.balanceSheet.isBalanced, true);
  assert.equal(reports.balanceSheet.totalAssets, 10300000);
  assert.equal(reports.balanceSheet.totalLiabilitiesAndEquity, 10300000);
  // PADes 30% of 300,000 = 90,000
  assert.equal(reports.equityStatement.projectedPadesAllocation, 90000);
  // Cash Flow reconciliation: 0 + (10,000,000 + 2,500,000 - 4,000,000 - 200,000) = 8,300,000
  assert.equal(reports.cashFlow.endingCash, 8300000);
  assert.equal(
    reports.cashFlow.beginningCash + reports.cashFlow.netCashChange,
    reports.cashFlow.endingCash
  );
});
