import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { hashPassword } from './auth.ts';
import { computeFertilizerSaleCogs, roundMoney } from '../src/lib/accountingEngine.ts';
import type {
  Account,
  BudgetPlanRecord,
  BumdesProfile,
  BusinessUnit,
  CostingMethod,
  FertilizerLot,
  FertilizerMovement,
  FertilizerProduct,
  JournalEntryRecord,
  JournalLineRecord,
  JournalType,
  UserAccount,
  UserRole,
} from '../src/types/accounting.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = path.join(DATA_DIR, 'bumdes.db');

export const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA journal_mode = WAL;');

export function runInTransaction<T>(fn: () => T): T {
  db.exec('BEGIN IMMEDIATE;');
  try {
    const result = fn();
    db.exec('COMMIT;');
    return result;
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }
}

export function initializeDatabase(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS bumdes_profile (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      name TEXT NOT NULL,
      village_name TEXT NOT NULL,
      sub_district TEXT NOT NULL,
      district TEXT NOT NULL,
      province TEXT NOT NULL,
      ahu_number TEXT NOT NULL,
      npwp TEXT NOT NULL DEFAULT '',
      address TEXT NOT NULL DEFAULT '',
      director_name TEXT NOT NULL,
      treasurer_name TEXT NOT NULL,
      secretary_name TEXT NOT NULL DEFAULT '',
      supervisor_name TEXT NOT NULL,
      fiscal_year INTEGER NOT NULL DEFAULT 2026,
      pades_share_percent REAL NOT NULL DEFAULT 30,
      capital_reserve_percent REAL NOT NULL DEFAULT 25,
      inventory_method TEXT NOT NULL DEFAULT 'FIFO'
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('ADMIN', 'BENDAHARA', 'OPERATOR_KIOS', 'PENGAWAS')),
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS business_units (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      sector TEXT NOT NULL,
      is_fertilizer_unit INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      category TEXT NOT NULL CHECK (category IN ('ASET','KEWAJIBAN','EKUITAS','PENDAPATAN','HPP','BEBAN','LAIN_LAIN')),
      sub_category TEXT NOT NULL,
      normal_balance TEXT NOT NULL CHECK (normal_balance IN ('DEBIT','KREDIT')),
      is_cash_account INTEGER NOT NULL DEFAULT 0,
      is_system INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS budget_plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fiscal_year INTEGER NOT NULL,
      unit_id INTEGER NOT NULL REFERENCES business_units(id),
      account_id INTEGER NOT NULL REFERENCES accounts(id),
      target_amount REAL NOT NULL DEFAULT 0,
      notes TEXT NOT NULL DEFAULT '',
      UNIQUE (fiscal_year, unit_id, account_id)
    );

    CREATE TABLE IF NOT EXISTS journal_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      journal_number TEXT NOT NULL UNIQUE,
      entry_date TEXT NOT NULL,
      unit_id INTEGER NOT NULL REFERENCES business_units(id),
      entry_type TEXT NOT NULL,
      description TEXT NOT NULL,
      reference_no TEXT NOT NULL DEFAULT '',
      attachment_name TEXT,
      attachment_data TEXT,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS journal_lines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      journal_id INTEGER NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
      account_id INTEGER NOT NULL REFERENCES accounts(id),
      debit REAL NOT NULL DEFAULT 0,
      credit REAL NOT NULL DEFAULT 0,
      memo TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS fertilizer_products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      unit_label TEXT NOT NULL DEFAULT 'Sak',
      weight_kg REAL NOT NULL DEFAULT 50,
      purchase_price REAL NOT NULL,
      het_price REAL NOT NULL,
      min_stock REAL NOT NULL DEFAULT 20,
      price_note TEXT NOT NULL DEFAULT '',
      price_updated_at TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS fertilizer_lots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL REFERENCES fertilizer_products(id),
      purchase_date TEXT NOT NULL,
      do_number TEXT NOT NULL,
      qty_initial REAL NOT NULL,
      qty_remaining REAL NOT NULL,
      unit_cost REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS fertilizer_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL REFERENCES fertilizer_products(id),
      movement_date TEXT NOT NULL,
      movement_type TEXT NOT NULL CHECK (movement_type IN ('MASUK_DO','JUAL_IPUBERS','OPNAME_PLUS','OPNAME_MINUS')),
      reference_no TEXT NOT NULL,
      party_name TEXT NOT NULL DEFAULT '',
      qty REAL NOT NULL,
      unit_price REAL NOT NULL,
      total_price REAL NOT NULL,
      cogs_amount REAL NOT NULL DEFAULT 0,
      costing_method TEXT NOT NULL DEFAULT 'FIFO',
      journal_id INTEGER REFERENCES journal_entries(id) ON DELETE SET NULL,
      notes TEXT NOT NULL DEFAULT ''
    );
  `);

  const fertCols = db.prepare('PRAGMA table_info(fertilizer_products)').all() as { name: string }[];
  if (!fertCols.some((c) => c.name === 'price_note')) {
    db.exec("ALTER TABLE fertilizer_products ADD COLUMN price_note TEXT NOT NULL DEFAULT '';");
  }
  if (!fertCols.some((c) => c.name === 'price_updated_at')) {
    db.exec("ALTER TABLE fertilizer_products ADD COLUMN price_updated_at TEXT NOT NULL DEFAULT '';");
  }

  const userCountRow = db.prepare('SELECT COUNT(*) AS cnt FROM users').get() as { cnt: number };
  if (userCountRow.cnt === 0) {
    seedInitialData();
  }
}

function nextJournalNumber(year: number): string {
  const prefix = `JU-${year}-`;
  const row = db
    .prepare('SELECT COUNT(*) AS cnt FROM journal_entries WHERE journal_number LIKE ?')
    .get(`${prefix}%`) as { cnt: number };
  const seq = String(row.cnt + 1).padStart(4, '0');
  return `${prefix}${seq}`;
}

export function createJournalInternal(params: {
  entryDate: string;
  unitId: number;
  entryType: JournalType;
  description: string;
  referenceNo: string;
  attachmentName?: string | null;
  attachmentData?: string | null;
  createdBy: string;
  lines: { accountId: number; debit: number; credit: number; memo?: string }[];
}): number {
  const year = Number(params.entryDate.slice(0, 4)) || 2026;
  const journalNumber = nextJournalNumber(year);
  const res = db
    .prepare(
      `INSERT INTO journal_entries
      (journal_number, entry_date, unit_id, entry_type, description, reference_no, attachment_name, attachment_data, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      journalNumber,
      params.entryDate,
      params.unitId,
      params.entryType,
      params.description,
      params.referenceNo || '',
      params.attachmentName || null,
      params.attachmentData || null,
      params.createdBy
    );

  const journalId = Number(res.lastInsertRowid);
  const insertLine = db.prepare(
    'INSERT INTO journal_lines (journal_id, account_id, debit, credit, memo) VALUES (?, ?, ?, ?, ?)'
  );
  for (const line of params.lines) {
    insertLine.run(
      journalId,
      line.accountId,
      roundMoney(line.debit),
      roundMoney(line.credit),
      line.memo || ''
    );
  }
  return journalId;
}

function seedInitialData(): void {
  runInTransaction(() => {
    // 1. BUMDes Profile
    db.prepare(
      `INSERT INTO bumdes_profile
      (id, name, village_name, sub_district, district, province, ahu_number, npwp, address, director_name, treasurer_name, secretary_name, supervisor_name, fiscal_year, pades_share_percent, capital_reserve_percent, inventory_method)
      VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 2026, 30, 25, 'FIFO')`
    ).run(
      'BUMDes Sumber Makmur Sejahtera',
      'Desa Sukamaju',
      'Kecamatan Sukasari',
      'Kabupaten Subang',
      'Jawa Barat',
      'AHU-00412.AH.01.33.TAHUN 2023',
      '91.482.110.5-439.000',
      'Jl. Raya Balai Desa Sukamaju No. 14',
      'H. Hendra Wijaya, S.E.',
      'Siti Aminah, S.Ak.',
      'Budi Santoso',
      'Kades Dedi Kurniawan'
    );

    // 2. Default RBAC Users
    const insertUser = db.prepare(
      'INSERT INTO users (username, password_hash, full_name, role, active) VALUES (?, ?, ?, ?, 1)'
    );
    insertUser.run('direktur', hashPassword('bumdes123'), 'H. Hendra Wijaya, S.E.', 'ADMIN');
    insertUser.run('bendahara', hashPassword('bumdes123'), 'Siti Aminah, S.Ak.', 'BENDAHARA');
    insertUser.run('operator', hashPassword('bumdes123'), 'Rizky Pratama', 'OPERATOR_KIOS');
    insertUser.run('pengawas', hashPassword('bumdes123'), 'Dedi Kurniawan (Kepala Desa)', 'PENGAWAS');

    // 3. Business Units
    const unitKiosId = Number(
      db
        .prepare(
          'INSERT INTO business_units (code, name, sector, is_fertilizer_unit, active) VALUES (?, ?, ?, 1, 1)'
        )
        .run('KPB-01', 'Unit Kios Pupuk Bersubsidi Tani Mulia', 'Perdagangan Sarana Pertanian')
        .lastInsertRowid
    );
    const unitJasaId = Number(
      db
        .prepare(
          'INSERT INTO business_units (code, name, sector, is_fertilizer_unit, active) VALUES (?, ?, ?, 0, 1)'
        )
        .run('JSA-02', 'Unit Jasa & Sewa Alsintan', 'Jasa Pertanian & Penyewaan')
        .lastInsertRowid
    );

    // 4. Standard CoA Kepmendesa PDTT No. 136/2022 & SAK EMKM
    const coaSeed: [string, string, string, string, 'DEBIT' | 'KREDIT', number][] = [
      ['1-1101', 'Kas Tunai BUMDes', 'ASET', 'Aset Lancar', 'DEBIT', 1],
      ['1-1102', 'Bank BRI Simpedes BUMDes', 'ASET', 'Aset Lancar', 'DEBIT', 1],
      ['1-1201', 'Piutang Usaha / Kelompok Tani', 'ASET', 'Aset Lancar', 'DEBIT', 0],
      ['1-1301', 'Uang Muka Penebusan Distributor', 'ASET', 'Aset Lancar', 'DEBIT', 0],
      ['1-1401', 'Persediaan Pupuk Bersubsidi', 'ASET', 'Aset Lancar', 'DEBIT', 0],
      ['1-1501', 'Perlengkapan Administrasi Kios', 'ASET', 'Aset Lancar', 'DEBIT', 0],
      ['1-2101', 'Peralatan & Inventaris Kios', 'ASET', 'Aset Tetap', 'DEBIT', 0],
      ['1-2102', 'Mesin & Alat Pertanian (Alsintan)', 'ASET', 'Aset Tetap', 'DEBIT', 0],
      ['1-2201', 'Akumulasi Penyusutan Peralatan Kios', 'ASET', 'Aset Tetap', 'KREDIT', 0],
      ['1-2202', 'Akumulasi Penyusutan Alsintan', 'ASET', 'Aset Tetap', 'KREDIT', 0],
      ['2-1101', 'Utang Usaha Distributor Pupuk', 'KEWAJIBAN', 'Kewajiban Jangka Pendek', 'KREDIT', 0],
      ['2-1201', 'Utang Biaya & Honorarium', 'KEWAJIBAN', 'Kewajiban Jangka Pendek', 'KREDIT', 0],
      ['2-1301', 'Utang Pajak (PPN/PPh)', 'KEWAJIBAN', 'Kewajiban Jangka Pendek', 'KREDIT', 0],
      ['2-2101', 'Utang Bank / Pembiayaan Jangka Panjang', 'KEWAJIBAN', 'Kewajiban Jangka Panjang', 'KREDIT', 0],
      ['3-1101', 'Penyertaan Modal Desa', 'EKUITAS', 'Modal Disetor', 'KREDIT', 0],
      ['3-1102', 'Penyertaan Modal Masyarakat', 'EKUITAS', 'Modal Disetor', 'KREDIT', 0],
      ['3-2101', 'Saldo Laba Ditahan', 'EKUITAS', 'Laba Ditahan', 'KREDIT', 0],
      ['3-3101', 'Pembagian Hasil Usaha / PADes', 'EKUITAS', 'Distribusi Laba', 'DEBIT', 0],
      ['4-1101', 'Pendapatan Penjualan Pupuk Bersubsidi', 'PENDAPATAN', 'Pendapatan Usaha Dagang', 'KREDIT', 0],
      ['4-1201', 'Pendapatan Jasa & Sewa Alsintan', 'PENDAPATAN', 'Pendapatan Usaha Jasa', 'KREDIT', 0],
      ['5-1101', 'Harga Pokok Penjualan (HPP) Pupuk Bersubsidi', 'HPP', 'Harga Pokok Penjualan', 'DEBIT', 0],
      ['5-1102', 'Selisih Persediaan & Susut Gudang Pupuk', 'HPP', 'Penyesuaian Persediaan', 'DEBIT', 0],
      ['6-1101', 'Beban Gaji & Honor Pengurus/Operator', 'BEBAN', 'Beban Personalia', 'DEBIT', 0],
      ['6-1102', 'Beban Bongkar Muat & Transportasi Pupuk', 'BEBAN', 'Beban Distribusi', 'DEBIT', 0],
      ['6-1103', 'Beban Listrik, Air & Internet Kios', 'BEBAN', 'Beban Utilitas', 'DEBIT', 0],
      ['6-1104', 'Beban Pemeliharaan Alsintan & Gudang', 'BEBAN', 'Beban Pemeliharaan', 'DEBIT', 0],
      ['6-1105', 'Beban Penyusutan Aset Tetap', 'BEBAN', 'Beban Penyusutan', 'DEBIT', 0],
      ['6-1106', 'Beban Administrasi, ATK & Pelaporan', 'BEBAN', 'Beban Administrasi', 'DEBIT', 0],
      ['7-1101', 'Pendapatan Bunga Bank & Lain-lain', 'LAIN_LAIN', 'Pendapatan Lain-lain', 'KREDIT', 0],
      ['7-2101', 'Beban Administrasi Bank & Lain-lain', 'LAIN_LAIN', 'Beban Lain-lain', 'DEBIT', 0],
    ];

    const accIdByCode = new Map<string, number>();
    const insertAcc = db.prepare(
      `INSERT INTO accounts (code, name, category, sub_category, normal_balance, is_cash_account, is_system)
       VALUES (?, ?, ?, ?, ?, ?, 1)`
    );
    for (const [code, name, cat, sub, norm, isCash] of coaSeed) {
      const id = Number(insertAcc.run(code, name, cat, sub, norm, isCash).lastInsertRowid);
      accIdByCode.set(code, id);
    }

    const acc = (code: string) => accIdByCode.get(code)!;

    // 5. Fertilizer Products (HET Kementan)
    const insertFert = db.prepare(
      `INSERT INTO fertilizer_products (code, name, unit_label, weight_kg, purchase_price, het_price, min_stock, price_note, price_updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const ureaId = Number(
      insertFert.run(
        'PPK-UREA',
        'Pupuk Urea Bersubsidi (50 kg)',
        'Sak',
        50,
        102000,
        112500,
        30,
        'Kepmentan HET Rp 2.250/kg · Tebus Distributor Resmi',
        '2026-01-01T08:00:00Z'
      ).lastInsertRowid
    );
    const npkId = Number(
      insertFert.run(
        'PPK-NPK',
        'Pupuk NPK Phonska Bersubsidi (50 kg)',
        'Sak',
        50,
        104500,
        115000,
        30,
        'Kepmentan HET Rp 2.300/kg · Tebus Distributor Resmi',
        '2026-01-01T08:00:00Z'
      ).lastInsertRowid
    );
    const organikId = Number(
      insertFert.run(
        'PPK-ORG',
        'Pupuk Organik Petroganik (40 kg)',
        'Sak',
        40,
        27500,
        32000,
        25,
        'Kepmentan HET Rp 800/kg · Tebus Distributor Resmi',
        '2026-01-01T08:00:00Z'
      ).lastInsertRowid
    );

    // 6. RPK Budget Targets (2026)
    const insertBudget = db.prepare(
      'INSERT INTO budget_plans (fiscal_year, unit_id, account_id, target_amount, notes) VALUES (2026, ?, ?, ?, ?)'
    );
    insertBudget.run(unitKiosId, acc('4-1101'), 120000000, 'Target alokasi RDKK & i-Pubers tahun 2026');
    insertBudget.run(unitKiosId, acc('5-1101'), 108000000, 'Estimasi HPP tebus distributor tahun 2026');
    insertBudget.run(unitKiosId, acc('6-1101'), 7200000, 'Honor operator kios & administrasi 12 bulan');
    insertBudget.run(unitKiosId, acc('6-1102'), 2400000, 'Pagu biaya bongkar muat gudang');
    insertBudget.run(unitJasaId, acc('4-1201'), 36000000, 'Target sewa traktor & combine harvester');
    insertBudget.run(unitJasaId, acc('6-1104'), 6000000, 'Pagu perawatan berkala alsintan');

    // 7. Opening Balances (2026-01-01)
    createJournalInternal({
      entryDate: '2026-01-01',
      unitId: unitKiosId,
      entryType: 'SALDO_AWAL',
      description: 'Saldo Awal Neraca Unit Kios Pupuk Bersubsidi per 1 Jan 2026',
      referenceNo: 'BA-SA-2026-01',
      createdBy: 'direktur',
      lines: [
        { accountId: acc('1-1101'), debit: 12000000, credit: 0 },
        { accountId: acc('1-1102'), debit: 68000000, credit: 0 },
        { accountId: acc('1-2101'), debit: 20000000, credit: 0 },
        { accountId: acc('1-2201'), debit: 0, credit: 2000000 },
        { accountId: acc('3-1101'), debit: 0, credit: 85000000 },
        { accountId: acc('3-2101'), debit: 0, credit: 13000000 },
      ],
    });

    createJournalInternal({
      entryDate: '2026-01-01',
      unitId: unitJasaId,
      entryType: 'SALDO_AWAL',
      description: 'Saldo Awal Neraca Unit Jasa & Sewa Alsintan per 1 Jan 2026',
      referenceNo: 'BA-SA-2026-02',
      createdBy: 'direktur',
      lines: [
        { accountId: acc('1-1102'), debit: 18000000, credit: 0 },
        { accountId: acc('1-2102'), debit: 45000000, credit: 0 },
        { accountId: acc('1-2202'), debit: 0, credit: 5000000 },
        { accountId: acc('3-1101'), debit: 0, credit: 50000000 },
        { accountId: acc('3-2101'), debit: 0, credit: 8000000 },
      ],
    });

    // Helper to seed DO purchase
    const seedPurchase = (
      date: string,
      productId: number,
      productName: string,
      doNo: string,
      qty: number,
      unitCost: number,
      paidByCash: boolean
    ) => {
      const total = roundMoney(qty * unitCost);
      const jId = createJournalInternal({
        entryDate: date,
        unitId: unitKiosId,
        entryType: 'PUPUK_MASUK',
        description: `Penebusan ${productName} (${qty} Sak @ Rp ${unitCost.toLocaleString('id-ID')})`,
        referenceNo: doNo,
        createdBy: 'operator',
        lines: [
          { accountId: acc('1-1401'), debit: total, credit: 0 },
          {
            accountId: paidByCash ? acc('1-1102') : acc('2-1101'),
            debit: 0,
            credit: total,
          },
        ],
      });
      db.prepare(
        `INSERT INTO fertilizer_lots (product_id, purchase_date, do_number, qty_initial, qty_remaining, unit_cost)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(productId, date, doNo, qty, qty, unitCost);
      db.prepare(
        `INSERT INTO fertilizer_movements
         (product_id, movement_date, movement_type, reference_no, party_name, qty, unit_price, total_price, cogs_amount, costing_method, journal_id, notes)
         VALUES (?, ?, 'MASUK_DO', ?, 'PT Pupuk Indonesia (Distributor Resmi)', ?, ?, ?, 0, 'FIFO', ?, ?)`
      ).run(productId, date, doNo, qty, unitCost, total, jId, 'Penerimaan DO Distributor');
    };

    // Helper to seed i-Pubers sale using exact FIFO engine
    const seedSale = (
      date: string,
      productId: number,
      productName: string,
      refNo: string,
      buyerName: string,
      qty: number,
      hetPrice: number
    ) => {
      const lotRows = db
        .prepare(
          'SELECT id, product_id AS productId, purchase_date AS purchaseDate, do_number AS doNumber, qty_initial AS qtyInitial, qty_remaining AS qtyRemaining, unit_cost AS unitCost FROM fertilizer_lots WHERE product_id = ?'
        )
        .all(productId) as unknown as FertilizerLot[];

      const cogs = computeFertilizerSaleCogs(lotRows, qty, 'FIFO');
      const totalRev = roundMoney(qty * hetPrice);

      const jId = createJournalInternal({
        entryDate: date,
        unitId: unitKiosId,
        entryType: 'PUPUK_JUAL',
        description: `Penjualan i-Pubers ${productName} (${qty} Sak) - ${buyerName}`,
        referenceNo: refNo,
        createdBy: 'operator',
        lines: [
          { accountId: acc('1-1101'), debit: totalRev, credit: 0 },
          { accountId: acc('4-1101'), debit: 0, credit: totalRev },
          { accountId: acc('5-1101'), debit: cogs.totalCogs, credit: 0 },
          { accountId: acc('1-1401'), debit: 0, credit: cogs.totalCogs },
        ],
      });

      const updLot = db.prepare('UPDATE fertilizer_lots SET qty_remaining = ? WHERE id = ?');
      for (const l of cogs.updatedLots) {
        updLot.run(l.qtyRemaining, l.id);
      }

      db.prepare(
        `INSERT INTO fertilizer_movements
         (product_id, movement_date, movement_type, reference_no, party_name, qty, unit_price, total_price, cogs_amount, costing_method, journal_id, notes)
         VALUES (?, ?, 'JUAL_IPUBERS', ?, ?, ?, ?, ?, ?, 'FIFO', ?, ?)`
      ).run(
        productId,
        date,
        refNo,
        buyerName,
        qty,
        hetPrice,
        totalRev,
        cogs.totalCogs,
        jId,
        'Rekap penebusan aplikasi i-Pubers'
      );
    };

    // 8. Seed Realistic Multi-Month Transactions (Aug - Nov 2026)
    seedPurchase('2026-08-05', ureaId, 'Pupuk Urea Bersubsidi', 'DO-2608-001', 120, 101500, true);
    seedPurchase('2026-08-05', npkId, 'Pupuk NPK Phonska', 'DO-2608-002', 100, 104000, true);
    seedPurchase('2026-08-12', organikId, 'Pupuk Organik Petroganik', 'DO-2608-003', 60, 27000, true);

    seedSale('2026-08-18', ureaId, 'Pupuk Urea Bersubsidi', 'IPB-2608-01', 'Poktan Harapan Jaya', 65, 112500);
    seedSale('2026-08-22', npkId, 'Pupuk NPK Phonska', 'IPB-2608-02', 'Poktan Tani Makmur', 50, 115000);
    seedSale('2026-08-25', organikId, 'Pupuk Organik Petroganik', 'IPB-2608-03', 'Poktan Harapan Jaya', 30, 32000);

    seedPurchase('2026-09-07', ureaId, 'Pupuk Urea Bersubsidi', 'DO-2609-001', 100, 102000, true);
    seedPurchase('2026-09-07', npkId, 'Pupuk NPK Phonska', 'DO-2609-002', 90, 104500, true);
    seedSale('2026-09-16', ureaId, 'Pupuk Urea Bersubsidi', 'IPB-2609-01', 'Poktan Sri Rejeki', 90, 112500);
    seedSale('2026-09-24', npkId, 'Pupuk NPK Phonska', 'IPB-2609-02', 'Poktan Tani Makmur', 75, 115000);

    seedPurchase('2026-10-06', ureaId, 'Pupuk Urea Bersubsidi', 'DO-2610-001', 110, 102000, true);
    seedPurchase('2026-10-10', npkId, 'Pupuk NPK Phonska', 'DO-2610-002', 80, 104500, false); // credit purchase
    seedSale('2026-10-19', ureaId, 'Pupuk Urea Bersubsidi', 'IPB-2610-01', 'Poktan Subur Sentosa', 85, 112500);
    seedSale('2026-10-26', npkId, 'Pupuk NPK Phonska', 'IPB-2610-02', 'Poktan Harapan Jaya', 65, 115000);
    seedSale('2026-10-28', organikId, 'Pupuk Organik Petroganik', 'IPB-2610-03', 'Poktan Sri Rejeki', 12, 32000); // leaves 18 sak (< min 25!)

    // Current Month (Nov 2026)
    seedPurchase('2026-11-04', ureaId, 'Pupuk Urea Bersubsidi', 'DO-2611-001', 80, 102500, true);
    seedSale('2026-11-11', ureaId, 'Pupuk Urea Bersubsidi', 'IPB-2611-01', 'Poktan Tani Makmur', 75, 112500);
    seedSale('2026-11-16', npkId, 'Pupuk NPK Phonska', 'IPB-2611-02', 'Poktan Subur Sentosa', 35, 115000);

    // Operational Expenses & Unit Jasa Alsintan Revenues across Aug-Nov 2026
    const months = ['2026-08', '2026-09', '2026-10', '2026-11'];
    months.forEach((ym, idx) => {
      createJournalInternal({
        entryDate: `${ym}-27`,
        unitId: unitKiosId,
        entryType: 'KAS_KELUAR',
        description: `Honorarium Operator & Bongkar Muat Kios (${ym})`,
        referenceNo: `BKK-KPB-${idx + 1}`,
        createdBy: 'bendahara',
        lines: [
          { accountId: acc('6-1101'), debit: 600000, credit: 0 },
          { accountId: acc('6-1102'), debit: 200000, credit: 0 },
          { accountId: acc('6-1103'), debit: 125000, credit: 0 },
          { accountId: acc('1-1101'), debit: 0, credit: 925000 },
        ],
      });

      createJournalInternal({
        entryDate: `${ym}-28`,
        unitId: unitJasaId,
        entryType: 'KAS_MASUK',
        description: `Pendapatan Sewa Traktor & Alsintan (${ym})`,
        referenceNo: `BKM-JSA-${idx + 1}`,
        createdBy: 'bendahara',
        lines: [
          { accountId: acc('1-1102'), debit: 3400000 + idx * 350000, credit: 0 },
          { accountId: acc('4-1201'), debit: 0, credit: 3400000 + idx * 350000 },
        ],
      });

      createJournalInternal({
        entryDate: `${ym}-29`,
        unitId: unitJasaId,
        entryType: 'JURNAL_UMUM',
        description: `Penyusutan Bulanan Alsintan & Perawatan (${ym})`,
        referenceNo: `JU-PENY-${idx + 1}`,
        createdBy: 'bendahara',
        lines: [
          { accountId: acc('6-1105'), debit: 450000, credit: 0 },
          { accountId: acc('1-2202'), debit: 0, credit: 450000 },
          { accountId: acc('6-1104'), debit: 350000, credit: 0 },
          { accountId: acc('1-1102'), debit: 0, credit: 350000 },
        ],
      });
    });

    // One PADes / Bank interest entry in Nov 2026
    createJournalInternal({
      entryDate: '2026-11-18',
      unitId: unitKiosId,
      entryType: 'KAS_MASUK',
      description: 'Pendapatan Bunga Jasa Giro Bank BRI BUMDes',
      referenceNo: 'RK-BRI-1126',
      createdBy: 'bendahara',
      lines: [
        { accountId: acc('1-1102'), debit: 145000, credit: 0 },
        { accountId: acc('7-1101'), debit: 0, credit: 145000 },
      ],
    });
  });
}

// Query Helpers
export function getBumdesProfile(): BumdesProfile {
  const row = db
    .prepare(
      `SELECT id, name, village_name AS villageName, sub_district AS subDistrict, district, province,
              ahu_number AS ahuNumber, npwp, address, director_name AS directorName,
              treasurer_name AS treasurerName, secretary_name AS secretaryName,
              supervisor_name AS supervisorName, fiscal_year AS fiscalYear,
              pades_share_percent AS padesSharePercent,
              capital_reserve_percent AS capitalReservePercent,
              inventory_method AS inventoryMethod
       FROM bumdes_profile WHERE id = 1`
    )
    .get() as unknown as BumdesProfile;
  return row;
}

export function getBusinessUnits(): BusinessUnit[] {
  const rows = db
    .prepare(
      `SELECT id, code, name, sector, is_fertilizer_unit AS isFertilizerUnit, active
       FROM business_units ORDER BY id`
    )
    .all() as unknown as {
      id: number;
      code: string;
      name: string;
      sector: string;
      isFertilizerUnit: number;
      active: number;
    }[];
  return rows.map((r) => ({
    ...r,
    isFertilizerUnit: Boolean(r.isFertilizerUnit),
    active: Boolean(r.active),
  }));
}

export function getAccounts(): Account[] {
  const rows = db
    .prepare(
      `SELECT id, code, name, category, sub_category AS subCategory,
              normal_balance AS normalBalance, is_cash_account AS isCashAccount, is_system AS isSystem
       FROM accounts ORDER BY code`
    )
    .all() as unknown as {
      id: number;
      code: string;
      name: string;
      category: Account['category'];
      subCategory: string;
      normalBalance: Account['normalBalance'];
      isCashAccount: number;
      isSystem: number;
    }[];
  return rows.map((r) => ({
    ...r,
    isCashAccount: Boolean(r.isCashAccount),
    isSystem: Boolean(r.isSystem),
  }));
}

export function getJournalEntries(unitId?: number | null): JournalEntryRecord[] {
  const entriesSql = unitId
    ? `SELECT j.id, j.journal_number AS journalNumber, j.entry_date AS entryDate, j.unit_id AS unitId,
              u.name AS unitName, j.entry_type AS entryType, j.description, j.reference_no AS referenceNo,
              j.attachment_name AS attachmentName, j.attachment_data AS attachmentData,
              j.created_by AS createdBy, j.created_at AS createdAt
       FROM journal_entries j
       JOIN business_units u ON u.id = j.unit_id
       WHERE j.unit_id = ?
       ORDER BY j.entry_date DESC, j.id DESC`
    : `SELECT j.id, j.journal_number AS journalNumber, j.entry_date AS entryDate, j.unit_id AS unitId,
              u.name AS unitName, j.entry_type AS entryType, j.description, j.reference_no AS referenceNo,
              j.attachment_name AS attachmentName, j.attachment_data AS attachmentData,
              j.created_by AS createdBy, j.created_at AS createdAt
       FROM journal_entries j
       JOIN business_units u ON u.id = j.unit_id
       ORDER BY j.entry_date DESC, j.id DESC`;

  const entries = (unitId
    ? db.prepare(entriesSql).all(unitId)
    : db.prepare(entriesSql).all()) as unknown as Omit<JournalEntryRecord, 'lines'>[];

  const linesRows = db
    .prepare(
      `SELECT l.id, l.journal_id AS journalId, l.account_id AS accountId,
              a.code AS accountCode, a.name AS accountName, a.category,
              a.normal_balance AS normalBalance, a.is_cash_account AS isCashAccount,
              l.debit, l.credit, l.memo
       FROM journal_lines l
       JOIN accounts a ON a.id = l.account_id
       ORDER BY l.id`
    )
    .all() as unknown as (Omit<JournalLineRecord, 'isCashAccount'> & { isCashAccount: number })[];

  const linesByJournal = new Map<number, JournalLineRecord[]>();
  for (const row of linesRows) {
    const arr = linesByJournal.get(row.journalId) || [];
    arr.push({ ...row, isCashAccount: Boolean(row.isCashAccount) });
    linesByJournal.set(row.journalId, arr);
  }

  return entries.map((e) => ({
    ...e,
    lines: linesByJournal.get(e.id) || [],
  }));
}

export function getBudgets(fiscalYear = 2026): BudgetPlanRecord[] {
  return db
    .prepare(
      `SELECT b.id, b.fiscal_year AS fiscalYear, b.unit_id AS unitId, u.name AS unitName,
              b.account_id AS accountId, a.code AS accountCode, a.name AS accountName,
              a.category, b.target_amount AS targetAmount, b.notes
       FROM budget_plans b
       JOIN business_units u ON u.id = b.unit_id
       JOIN accounts a ON a.id = b.account_id
       WHERE b.fiscal_year = ?
       ORDER BY a.code`
    )
    .all(fiscalYear) as unknown as BudgetPlanRecord[];
}

export function getFertilizerProducts(): FertilizerProduct[] {
  const products = db
    .prepare(
      `SELECT id, code, name, unit_label AS unitLabel, weight_kg AS weightKg,
              purchase_price AS purchasePrice, het_price AS hetPrice, min_stock AS minStock,
              price_note AS priceNote, price_updated_at AS priceUpdatedAt
       FROM fertilizer_products ORDER BY id`
    )
    .all() as unknown as Omit<FertilizerProduct, 'currentStock' | 'inventoryValue'>[];

  const lotTotals = db
    .prepare(
      `SELECT product_id AS productId,
              COALESCE(SUM(qty_remaining), 0) AS currentStock,
              COALESCE(SUM(qty_remaining * unit_cost), 0) AS inventoryValue
       FROM fertilizer_lots
       GROUP BY product_id`
    )
    .all() as unknown as { productId: number; currentStock: number; inventoryValue: number }[];

  const map = new Map(lotTotals.map((l) => [l.productId, l]));
  return products.map((p) => {
    const t = map.get(p.id);
    return {
      ...p,
      currentStock: roundMoney(t?.currentStock || 0),
      inventoryValue: roundMoney(t?.inventoryValue || 0),
    };
  });
}

export function getFertilizerMovements(): FertilizerMovement[] {
  return db
    .prepare(
      `SELECT m.id, m.product_id AS productId, p.name AS productName, p.code AS productCode,
              m.movement_date AS movementDate, m.movement_type AS movementType,
              m.reference_no AS referenceNo, m.party_name AS partyName,
              m.qty, m.unit_price AS unitPrice, m.total_price AS totalPrice,
              m.cogs_amount AS cogsAmount, m.costing_method AS costingMethod,
              m.journal_id AS journalId, m.notes
       FROM fertilizer_movements m
       JOIN fertilizer_products p ON p.id = m.product_id
       ORDER BY m.movement_date DESC, m.id DESC`
    )
    .all() as unknown as FertilizerMovement[];
}

export function getUsersList(): UserAccount[] {
  const rows = db
    .prepare(
      `SELECT id, username, full_name AS fullName, role, active, created_at AS createdAt
       FROM users ORDER BY id`
    )
    .all() as unknown as {
      id: number;
      username: string;
      fullName: string;
      role: UserRole;
      active: number;
      createdAt: string;
    }[];
  return rows.map((r) => ({ ...r, active: Boolean(r.active) }));
}
