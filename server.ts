import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import {
  clearSessionCookie,
  extractSessionToken,
  hashPassword,
  requireAuth,
  requireRole,
  setSessionCookie,
  signSessionToken,
  verifyPassword,
  verifySessionToken,
  type AuthenticatedRequest,
} from './server/auth.ts';
import {
  createJournalInternal,
  db,
  getAccounts,
  getBudgets,
  getBumdesProfile,
  getBusinessUnits,
  getFertilizerMovements,
  getFertilizerProducts,
  getJournalEntries,
  getUsersList,
  initializeDatabase,
  runInTransaction,
} from './server/db.ts';
import {
  computeFertilizerSaleCogs,
  generateFinancialStatements,
  roundMoney,
  validateAndComputeFertilizerPrices,
  validateJournalBalance,
} from './src/lib/accountingEngine.ts';
import type { CostingMethod, FertilizerLot, JournalType, UserRole } from './src/types/accounting.ts';

initializeDatabase();

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '8mb' }));

function getAccountIdByCode(code: string): number {
  const row = db.prepare('SELECT id FROM accounts WHERE code = ?').get(code) as
    | { id: number }
    | undefined;
  if (!row) {
    throw new Error(`Akun CoA standar ${code} tidak ditemukan.`);
  }
  return row.id;
}

function getFertilizerUnitId(): number {
  const row = db
    .prepare('SELECT id FROM business_units WHERE is_fertilizer_unit = 1 AND active = 1 ORDER BY id LIMIT 1')
    .get() as { id: number } | undefined;
  if (row) return row.id;
  const fallback = db.prepare('SELECT id FROM business_units ORDER BY id LIMIT 1').get() as
    | { id: number }
    | undefined;
  if (!fallback) throw new Error('Unit usaha belum dikonfigurasi.');
  return fallback.id;
}

// --- AUTH ROUTES ---
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    res.status(400).json({ error: 'Username dan password wajib diisi.' });
    return;
  }

  const user = db
    .prepare(
      'SELECT id, username, password_hash AS passwordHash, full_name AS fullName, role, active FROM users WHERE LOWER(username) = LOWER(?)'
    )
    .get(String(username).trim()) as
    | {
        id: number;
        username: string;
        passwordHash: string;
        fullName: string;
        role: UserRole;
        active: number;
      }
    | undefined;

  if (!user || !verifyPassword(String(password), user.passwordHash)) {
    res.status(401).json({ error: 'Username atau password tidak sesuai.' });
    return;
  }

  if (!user.active) {
    res.status(403).json({ error: 'Akun pengguna ini sedang dinonaktifkan oleh Direktur.' });
    return;
  }

  const token = signSessionToken({
    userId: user.id,
    username: user.username,
    fullName: user.fullName,
    role: user.role,
  });
  setSessionCookie(req, res, token);

  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      role: user.role,
    },
  });
});

app.post('/api/auth/logout', (req, res) => {
  clearSessionCookie(req, res);
  res.json({ ok: true });
});

app.get('/api/auth/session', (req, res) => {
  const token = extractSessionToken(req);
  if (!token) {
    res.json({ authenticated: false, user: null });
    return;
  }
  const payload = verifySessionToken(token);
  if (!payload) {
    res.json({ authenticated: false, user: null });
    return;
  }
  const dbUser = db
    .prepare('SELECT id, username, full_name AS fullName, role, active FROM users WHERE id = ?')
    .get(payload.userId) as
    | { id: number; username: string; fullName: string; role: UserRole; active: number }
    | undefined;

  if (!dbUser || !dbUser.active) {
    res.json({ authenticated: false, user: null });
    return;
  }

  res.json({
    authenticated: true,
    user: {
      id: dbUser.id,
      username: dbUser.username,
      fullName: dbUser.fullName,
      role: dbUser.role,
    },
  });
});

app.get('/api/auth/me', requireAuth, (req: AuthenticatedRequest, res) => {
  const dbUser = db
    .prepare('SELECT id, username, full_name AS fullName, role FROM users WHERE id = ?')
    .get(req.authUser!.userId) as
    | { id: number; username: string; fullName: string; role: UserRole }
    | undefined;
  res.json({ user: dbUser || req.authUser });
});

app.put('/api/auth/me', requireAuth, (req: AuthenticatedRequest, res) => {
  const userId = req.authUser!.userId;
  const { fullName, username, newPassword } = req.body || {};
  if (!fullName || !String(fullName).trim()) {
    res.status(400).json({ error: 'Nama lengkap wajib diisi.' });
    return;
  }

  const current = db
    .prepare('SELECT id, username, full_name AS fullName, role FROM users WHERE id = ?')
    .get(userId) as { id: number; username: string; fullName: string; role: UserRole } | undefined;

  if (!current) {
    res.status(404).json({ error: 'Akun pengguna tidak ditemukan.' });
    return;
  }

  const nextUsername = username ? String(username).trim() : current.username;
  if (!nextUsername) {
    res.status(400).json({ error: 'Username tidak boleh kosong.' });
    return;
  }

  if (newPassword && String(newPassword).length < 6) {
    res.status(400).json({ error: 'Password baru minimal 6 karakter.' });
    return;
  }

  try {
    if (newPassword && String(newPassword).trim().length >= 6) {
      db.prepare('UPDATE users SET full_name = ?, username = ?, password_hash = ? WHERE id = ?').run(
        String(fullName).trim(),
        nextUsername,
        hashPassword(String(newPassword)),
        userId
      );
    } else {
      db.prepare('UPDATE users SET full_name = ?, username = ? WHERE id = ?').run(
        String(fullName).trim(),
        nextUsername,
        userId
      );
    }
  } catch {
    res.status(409).json({ error: 'Username tersebut sudah digunakan akun lain.' });
    return;
  }

  const updatedUser = db
    .prepare('SELECT id, username, full_name AS fullName, role FROM users WHERE id = ?')
    .get(userId) as { id: number; username: string; fullName: string; role: UserRole };

  const token = signSessionToken({
    userId: updatedUser.id,
    username: updatedUser.username,
    fullName: updatedUser.fullName,
    role: updatedUser.role,
  });
  setSessionCookie(req, res, token);

  res.json({ user: updatedUser, token });
});

// --- BOOTSTRAP DATA ---
app.get('/api/bootstrap', requireAuth, (req: AuthenticatedRequest, res) => {
  const profile = getBumdesProfile();
  const units = getBusinessUnits();
  const accounts = getAccounts();
  const budgets = getBudgets(profile.fiscalYear);
  const products = getFertilizerProducts();
  const movements = getFertilizerMovements();
  const journals = getJournalEntries();

  const startDate = `${profile.fiscalYear}-01-01`;
  const endDate = `${profile.fiscalYear}-12-31`;
  const reports = generateFinancialStatements({
    accounts,
    entries: journals,
    budgets,
    profile,
    startDate,
    endDate,
    unitId: null,
    unitLabel: 'Konsolidasi BUMDes',
  });

  const currentUser = db
    .prepare('SELECT id, username, full_name AS fullName, role FROM users WHERE id = ?')
    .get(req.authUser!.userId) as
    | { id: number; username: string; fullName: string; role: UserRole }
    | undefined;

  const users = req.authUser?.role === 'ADMIN' ? getUsersList() : [];

  res.json({
    user: currentUser || {
      id: req.authUser!.userId,
      username: req.authUser!.username,
      fullName: req.authUser!.fullName,
      role: req.authUser!.role,
    },
    profile,
    units,
    accounts,
    budgets,
    products,
    movements,
    journals,
    reports,
    users,
  });
});

// --- PROFILE & SETUP ROUTES ---
app.put('/api/profile', requireAuth, requireRole(['ADMIN', 'BENDAHARA']), (req, res) => {
  const b = req.body || {};
  if (!b.name || !b.villageName || !b.ahuNumber) {
    res.status(400).json({ error: 'Nama BUMDes, Nama Desa, dan Nomor AHU wajib diisi.' });
    return;
  }
  const fiscalYearNum = Number(b.fiscalYear);
  const padesNum = Number(b.padesSharePercent);
  const reserveNum = Number(b.capitalReservePercent);

  db.prepare(
    `UPDATE bumdes_profile SET
      name = ?, village_name = ?, sub_district = ?, district = ?, province = ?,
      ahu_number = ?, npwp = ?, address = ?, director_name = ?, treasurer_name = ?,
      secretary_name = ?, supervisor_name = ?, fiscal_year = ?,
      pades_share_percent = ?, capital_reserve_percent = ?, inventory_method = ?
     WHERE id = 1`
  ).run(
    String(b.name).trim(),
    String(b.villageName).trim(),
    String(b.subDistrict || '').trim(),
    String(b.district || '').trim(),
    String(b.province || '').trim(),
    String(b.ahuNumber).trim(),
    String(b.npwp || '').trim(),
    String(b.address || '').trim(),
    String(b.directorName || '').trim(),
    String(b.treasurerName || '').trim(),
    String(b.secretaryName || '').trim(),
    String(b.supervisorName || '').trim(),
    Number.isFinite(fiscalYearNum) && fiscalYearNum >= 2000 ? fiscalYearNum : 2026,
    Number.isFinite(padesNum) && padesNum >= 0 ? padesNum : 30,
    Number.isFinite(reserveNum) && reserveNum >= 0 ? reserveNum : 25,
    b.inventoryMethod === 'MOVING_AVG' ? 'MOVING_AVG' : 'FIFO'
  );
  res.json({ profile: getBumdesProfile() });
});

app.post('/api/units', requireAuth, requireRole(['ADMIN', 'BENDAHARA']), (req, res) => {
  const { code, name, sector, isFertilizerUnit } = req.body || {};
  if (!code || !name || !sector) {
    res.status(400).json({ error: 'Kode, nama unit usaha, dan sektor wajib diisi.' });
    return;
  }
  try {
    db.prepare(
      'INSERT INTO business_units (code, name, sector, is_fertilizer_unit, active) VALUES (?, ?, ?, ?, 1)'
    ).run(String(code).trim().toUpperCase(), String(name).trim(), String(sector).trim(), isFertilizerUnit ? 1 : 0);
    res.json({ units: getBusinessUnits() });
  } catch {
    res.status(409).json({ error: 'Kode unit usaha sudah terdaftar.' });
  }
});

app.put('/api/units/:id', requireAuth, requireRole(['ADMIN', 'BENDAHARA']), (req, res) => {
  const id = Number(req.params.id);
  const { name, sector, isFertilizerUnit, active } = req.body || {};
  if (!name || !sector) {
    res.status(400).json({ error: 'Nama unit usaha dan sektor wajib diisi.' });
    return;
  }
  db.prepare(
    'UPDATE business_units SET name = ?, sector = ?, is_fertilizer_unit = ?, active = ? WHERE id = ?'
  ).run(String(name).trim(), String(sector).trim(), isFertilizerUnit ? 1 : 0, active === false ? 0 : 1, id);
  res.json({ units: getBusinessUnits() });
});

// --- USER MANAGEMENT (ADMIN ONLY) ---
app.get('/api/users', requireAuth, requireRole(['ADMIN']), (_req, res) => {
  res.json({ users: getUsersList() });
});

app.post('/api/users', requireAuth, requireRole(['ADMIN']), (req, res) => {
  const { username, password, fullName, role } = req.body || {};
  if (!username || !password || !fullName || !role) {
    res.status(400).json({ error: 'Semua data pengguna (username, password, nama, peran) wajib diisi.' });
    return;
  }
  if (!['ADMIN', 'BENDAHARA', 'OPERATOR_KIOS', 'PENGAWAS'].includes(role)) {
    res.status(400).json({ error: 'Peran pengguna tidak valid.' });
    return;
  }
  try {
    db.prepare(
      'INSERT INTO users (username, password_hash, full_name, role, active) VALUES (?, ?, ?, ?, 1)'
    ).run(String(username).trim(), hashPassword(String(password)), String(fullName).trim(), role);
    res.json({ users: getUsersList() });
  } catch {
    res.status(409).json({ error: 'Username sudah digunakan.' });
  }
});

app.put('/api/users/:id', requireAuth, requireRole(['ADMIN']), (req, res) => {
  const id = Number(req.params.id);
  const { fullName, role, password } = req.body || {};
  if (!fullName || !String(fullName).trim()) {
    res.status(400).json({ error: 'Nama lengkap pengguna wajib diisi.' });
    return;
  }
  if (!['ADMIN', 'BENDAHARA', 'OPERATOR_KIOS', 'PENGAWAS'].includes(role)) {
    res.status(400).json({ error: 'Peran pengguna tidak valid.' });
    return;
  }
  if (password && String(password).length < 6) {
    res.status(400).json({ error: 'Password baru minimal 6 karakter.' });
    return;
  }
  if (password && String(password).trim().length >= 6) {
    db.prepare('UPDATE users SET full_name = ?, role = ?, password_hash = ? WHERE id = ?').run(
      String(fullName).trim(),
      role,
      hashPassword(String(password)),
      id
    );
  } else {
    db.prepare('UPDATE users SET full_name = ?, role = ? WHERE id = ?').run(
      String(fullName).trim(),
      role,
      id
    );
  }
  res.json({ users: getUsersList() });
});

app.patch('/api/users/:id/toggle', requireAuth, requireRole(['ADMIN']), (req: AuthenticatedRequest, res) => {
  const id = Number(req.params.id);
  if (id === req.authUser?.userId) {
    res.status(400).json({ error: 'Tidak dapat menonaktifkan akun Anda sendiri yang sedang masuk.' });
    return;
  }
  db.prepare('UPDATE users SET active = CASE WHEN active = 1 THEN 0 ELSE 1 END WHERE id = ?').run(id);
  res.json({ users: getUsersList() });
});

// --- CHART OF ACCOUNTS ---
app.post('/api/accounts', requireAuth, requireRole(['ADMIN', 'BENDAHARA']), (req, res) => {
  const { code, name, category, subCategory, normalBalance, isCashAccount } = req.body || {};
  if (!code || !name || !category || !subCategory || !normalBalance) {
    res.status(400).json({ error: 'Kode akun, nama, kategori, sub-kategori, dan saldo normal wajib diisi.' });
    return;
  }
  try {
    db.prepare(
      `INSERT INTO accounts (code, name, category, sub_category, normal_balance, is_cash_account, is_system)
       VALUES (?, ?, ?, ?, ?, ?, 0)`
    ).run(
      String(code).trim(),
      String(name).trim(),
      category,
      String(subCategory).trim(),
      normalBalance,
      isCashAccount ? 1 : 0
    );
    res.json({ accounts: getAccounts() });
  } catch {
    res.status(409).json({ error: 'Kode akun sudah terdaftar di Bagan Akun.' });
  }
});

// --- BUDGET PLANS (RPK) ---
app.post('/api/budgets', requireAuth, requireRole(['ADMIN', 'BENDAHARA']), (req, res) => {
  const { fiscalYear, unitId, accountId, targetAmount, notes } = req.body || {};
  if (!unitId || !accountId || targetAmount === undefined) {
    res.status(400).json({ error: 'Unit usaha, akun, dan nilai anggaran wajib diisi.' });
    return;
  }
  const fy = Number(fiscalYear) || 2026;
  db.prepare(
    `INSERT INTO budget_plans (fiscal_year, unit_id, account_id, target_amount, notes)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (fiscal_year, unit_id, account_id)
     DO UPDATE SET target_amount = excluded.target_amount, notes = excluded.notes`
  ).run(fy, Number(unitId), Number(accountId), roundMoney(Number(targetAmount)), String(notes || ''));
  res.json({ budgets: getBudgets(fy) });
});

// --- JOURNALS & OPENING BALANCE ---
app.post(
  '/api/journals',
  requireAuth,
  requireRole(['ADMIN', 'BENDAHARA', 'OPERATOR_KIOS']),
  (req: AuthenticatedRequest, res) => {
    const { entryDate, unitId, entryType, description, referenceNo, attachmentName, attachmentData, lines } =
      req.body || {};

    if (!entryDate || !unitId || !description || !Array.isArray(lines)) {
      res.status(400).json({ error: 'Tanggal, unit usaha, uraian transaksi, dan baris jurnal wajib diisi.' });
      return;
    }

    const validation = validateJournalBalance(lines);
    if (!validation.valid) {
      res.status(400).json({ error: validation.error });
      return;
    }

    const journalId = runInTransaction(() =>
      createJournalInternal({
        entryDate: String(entryDate),
        unitId: Number(unitId),
        entryType: (entryType || 'JURNAL_UMUM') as JournalType,
        description: String(description).trim(),
        referenceNo: String(referenceNo || '').trim(),
        attachmentName: attachmentName || null,
        attachmentData: attachmentData || null,
        createdBy: req.authUser?.username || 'system',
        lines,
      })
    );

    res.json({
      journalId,
      journals: getJournalEntries(),
    });
  }
);

app.delete('/api/journals/:id', requireAuth, requireRole(['ADMIN', 'BENDAHARA']), (req, res) => {
  const id = Number(req.params.id);
  const linked = db
    .prepare('SELECT COUNT(*) AS cnt FROM fertilizer_movements WHERE journal_id = ?')
    .get(id) as { cnt: number };
  if (linked.cnt > 0) {
    res.status(400).json({
      error: 'Jurnal ini terhubung otomatis dengan mutasi stok pupuk dan tidak boleh dihapus langsung.',
    });
    return;
  }
  db.prepare('DELETE FROM journal_entries WHERE id = ?').run(id);
  res.json({ journals: getJournalEntries() });
});

// --- FERTILIZER MODULE ---
app.post(
  '/api/fertilizer/products',
  requireAuth,
  requireRole(['ADMIN', 'BENDAHARA', 'OPERATOR_KIOS']),
  (req, res) => {
    const { code, name, unitLabel, weightKg, purchasePrice, hetPrice, minStock, priceNote } =
      req.body || {};
    if (!code || !String(code).trim() || !name || !String(name).trim()) {
      res.status(400).json({ error: 'Kode dan nama jenis pupuk wajib diisi.' });
      return;
    }
    const priceCheck = validateAndComputeFertilizerPrices({
      purchasePrice: Number(purchasePrice),
      hetPrice: Number(hetPrice),
      weightKg: Number(weightKg) || 50,
    });
    if (!priceCheck.valid) {
      res.status(400).json({ error: priceCheck.error });
      return;
    }
    const nowIso = new Date().toISOString();
    try {
      db.prepare(
        `INSERT INTO fertilizer_products
         (code, name, unit_label, weight_kg, purchase_price, het_price, min_stock, price_note, price_updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        String(code).trim().toUpperCase(),
        String(name).trim(),
        String(unitLabel || 'Sak').trim(),
        Number(weightKg) || 50,
        priceCheck.purchasePrice,
        priceCheck.hetPrice,
        Math.max(0, Number(minStock) || 20),
        String(priceNote || '').trim(),
        nowIso
      );
      res.json({ products: getFertilizerProducts() });
    } catch {
      res.status(409).json({ error: 'Kode pupuk sudah terdaftar.' });
    }
  }
);

app.put(
  '/api/fertilizer/products/:id',
  requireAuth,
  requireRole(['ADMIN', 'BENDAHARA', 'OPERATOR_KIOS']),
  (req, res) => {
    const id = Number(req.params.id);
    const { name, unitLabel, weightKg, purchasePrice, hetPrice, minStock, priceNote } =
      req.body || {};
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'ID produk pupuk tidak valid.' });
      return;
    }
    const existing = db
      .prepare('SELECT id, price_note AS priceNote FROM fertilizer_products WHERE id = ?')
      .get(id) as { id: number; priceNote: string } | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Jenis pupuk tidak ditemukan.' });
      return;
    }
    if (!name || !String(name).trim()) {
      res.status(400).json({ error: 'Nama jenis pupuk wajib diisi.' });
      return;
    }
    const priceCheck = validateAndComputeFertilizerPrices({
      purchasePrice: Number(purchasePrice),
      hetPrice: Number(hetPrice),
      weightKg: Number(weightKg) || 50,
    });
    if (!priceCheck.valid) {
      res.status(400).json({ error: priceCheck.error });
      return;
    }
    const nowIso = new Date().toISOString();
    const nextMinStock = Number(minStock);
    db.prepare(
      `UPDATE fertilizer_products
       SET name = ?, unit_label = ?, weight_kg = ?, purchase_price = ?, het_price = ?, min_stock = ?, price_note = ?, price_updated_at = ?
       WHERE id = ?`
    ).run(
      String(name).trim(),
      String(unitLabel || 'Sak').trim(),
      Number(weightKg) || 50,
      priceCheck.purchasePrice,
      priceCheck.hetPrice,
      Number.isFinite(nextMinStock) && nextMinStock >= 0 ? nextMinStock : 20,
      priceNote !== undefined ? String(priceNote).trim() : existing.priceNote || '',
      nowIso,
      id
    );
    res.json({ products: getFertilizerProducts() });
  }
);

app.patch(
  '/api/fertilizer/products/:id/prices',
  requireAuth,
  requireRole(['ADMIN', 'BENDAHARA', 'OPERATOR_KIOS']),
  (req, res) => {
    const id = Number(req.params.id);
    const { purchasePrice, hetPrice, priceNote } = req.body || {};
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'ID produk pupuk tidak valid.' });
      return;
    }
    const existing = db
      .prepare('SELECT id, weight_kg AS weightKg, price_note AS priceNote FROM fertilizer_products WHERE id = ?')
      .get(id) as { id: number; weightKg: number; priceNote: string } | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Jenis pupuk tidak ditemukan.' });
      return;
    }
    const priceCheck = validateAndComputeFertilizerPrices({
      purchasePrice: Number(purchasePrice),
      hetPrice: Number(hetPrice),
      weightKg: existing.weightKg,
    });
    if (!priceCheck.valid) {
      res.status(400).json({ error: priceCheck.error });
      return;
    }
    const nowIso = new Date().toISOString();
    db.prepare(
      `UPDATE fertilizer_products
       SET purchase_price = ?, het_price = ?, price_note = ?, price_updated_at = ?
       WHERE id = ?`
    ).run(
      priceCheck.purchasePrice,
      priceCheck.hetPrice,
      priceNote !== undefined ? String(priceNote).trim() : existing.priceNote || '',
      nowIso,
      id
    );
    res.json({ products: getFertilizerProducts() });
  }
);

app.put(
  '/api/fertilizer/prices',
  requireAuth,
  requireRole(['ADMIN', 'BENDAHARA', 'OPERATOR_KIOS']),
  (req, res) => {
    const { items } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: 'Daftar perubahan harga master HET wajib diisi.' });
      return;
    }

    const nowIso = new Date().toISOString();
    try {
      runInTransaction(() => {
        const findStmt = db.prepare(
          'SELECT id, name, weight_kg AS weightKg, price_note AS priceNote FROM fertilizer_products WHERE id = ?'
        );
        const updateStmt = db.prepare(
          `UPDATE fertilizer_products
           SET purchase_price = ?, het_price = ?, price_note = ?, price_updated_at = ?
           WHERE id = ?`
        );

        for (const item of items) {
          const id = Number(item?.id);
          if (!Number.isInteger(id) || id <= 0) {
            throw new Error('Terdapat ID produk pupuk yang tidak valid.');
          }
          const existing = findStmt.get(id) as
            | { id: number; name: string; weightKg: number; priceNote: string }
            | undefined;
          if (!existing) {
            throw new Error(`Produk pupuk dengan ID ${id} tidak ditemukan.`);
          }
          const check = validateAndComputeFertilizerPrices({
            purchasePrice: Number(item.purchasePrice),
            hetPrice: Number(item.hetPrice),
            weightKg: existing.weightKg,
          });
          if (!check.valid) {
            throw new Error(`${existing.name}: ${check.error}`);
          }
          updateStmt.run(
            check.purchasePrice,
            check.hetPrice,
            item.priceNote !== undefined ? String(item.priceNote).trim() : existing.priceNote || '',
            nowIso,
            id
          );
        }
      });

      res.json({ products: getFertilizerProducts() });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal menyimpan master harga HET.';
      res.status(400).json({ error: msg });
    }
  }
);

app.post(
  '/api/fertilizer/purchase',
  requireAuth,
  requireRole(['ADMIN', 'BENDAHARA', 'OPERATOR_KIOS']),
  (req: AuthenticatedRequest, res) => {
    const { productId, purchaseDate, doNumber, distributorName, qty, unitCost, paymentMethod, notes } =
      req.body || {};

    const numQty = Number(qty);
    const numCost = Number(unitCost);
    if (!productId || !purchaseDate || !doNumber || numQty <= 0 || numCost <= 0) {
      res.status(400).json({ error: 'Produk pupuk, tanggal, nomor DO, kuantitas, dan harga tebus wajib diisi.' });
      return;
    }

    const product = db
      .prepare('SELECT id, name FROM fertilizer_products WHERE id = ?')
      .get(Number(productId)) as { id: number; name: string } | undefined;
    if (!product) {
      res.status(404).json({ error: 'Jenis pupuk tidak ditemukan.' });
      return;
    }

    const totalCost = roundMoney(numQty * numCost);
    const creditAccCode =
      paymentMethod === 'KAS' ? '1-1101' : paymentMethod === 'UTANG' ? '2-1101' : '1-1102';

    runInTransaction(() => {
      const unitId = getFertilizerUnitId();
      const invAccId = getAccountIdByCode('1-1401');
      const payAccId = getAccountIdByCode(creditAccCode);

      const journalId = createJournalInternal({
        entryDate: String(purchaseDate),
        unitId,
        entryType: 'PUPUK_MASUK',
        description: `Penebusan DO ${product.name} (${numQty} Sak @ Rp ${numCost.toLocaleString('id-ID')})`,
        referenceNo: String(doNumber).trim(),
        createdBy: req.authUser?.username || 'operator',
        lines: [
          { accountId: invAccId, debit: totalCost, credit: 0 },
          { accountId: payAccId, debit: 0, credit: totalCost },
        ],
      });

      db.prepare(
        `INSERT INTO fertilizer_lots (product_id, purchase_date, do_number, qty_initial, qty_remaining, unit_cost)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(product.id, String(purchaseDate), String(doNumber).trim(), numQty, numQty, roundMoney(numCost));

      db.prepare(
        `INSERT INTO fertilizer_movements
         (product_id, movement_date, movement_type, reference_no, party_name, qty, unit_price, total_price, cogs_amount, costing_method, journal_id, notes)
         VALUES (?, ?, 'MASUK_DO', ?, ?, ?, ?, ?, 0, 'FIFO', ?, ?)`
      ).run(
        product.id,
        String(purchaseDate),
        String(doNumber).trim(),
        String(distributorName || 'Distributor Pupuk Bersubsidi').trim(),
        numQty,
        roundMoney(numCost),
        totalCost,
        journalId,
        String(notes || 'Penerimaan DO Distributor').trim()
      );
    });

    res.json({
      products: getFertilizerProducts(),
      movements: getFertilizerMovements(),
      journals: getJournalEntries(),
    });
  }
);

app.post(
  '/api/fertilizer/sale',
  requireAuth,
  requireRole(['ADMIN', 'BENDAHARA', 'OPERATOR_KIOS']),
  (req: AuthenticatedRequest, res) => {
    const {
      productId,
      saleDate,
      referenceNo,
      buyerName,
      qty,
      unitPrice,
      paymentMethod,
      costingMethod,
      notes,
      attachmentName,
      attachmentData,
    } = req.body || {};

    const numQty = Number(qty);
    const numPrice = Number(unitPrice);
    if (!productId || !saleDate || !referenceNo || numQty <= 0 || numPrice <= 0) {
      res.status(400).json({ error: 'Produk, tanggal, nomor rekap i-Pubers, jumlah, dan harga jual wajib diisi.' });
      return;
    }

    const product = db
      .prepare('SELECT id, name FROM fertilizer_products WHERE id = ?')
      .get(Number(productId)) as { id: number; name: string } | undefined;
    if (!product) {
      res.status(404).json({ error: 'Jenis pupuk tidak ditemukan.' });
      return;
    }

    const profile = getBumdesProfile();
    const method: CostingMethod =
      costingMethod === 'MOVING_AVG' || costingMethod === 'FIFO'
        ? costingMethod
        : profile.inventoryMethod;

    try {
      runInTransaction(() => {
        const lots = db
          .prepare(
            `SELECT id, product_id AS productId, purchase_date AS purchaseDate, do_number AS doNumber,
                    qty_initial AS qtyInitial, qty_remaining AS qtyRemaining, unit_cost AS unitCost
             FROM fertilizer_lots WHERE product_id = ?`
          )
          .all(product.id) as unknown as FertilizerLot[];

        const cogs = computeFertilizerSaleCogs(lots, numQty, method);
        const totalRevenue = roundMoney(numQty * numPrice);
        const debitAccCode =
          paymentMethod === 'BANK' ? '1-1102' : paymentMethod === 'PIUTANG' ? '1-1201' : '1-1101';

        const unitId = getFertilizerUnitId();
        const debitAccId = getAccountIdByCode(debitAccCode);
        const revAccId = getAccountIdByCode('4-1101');
        const hppAccId = getAccountIdByCode('5-1101');
        const invAccId = getAccountIdByCode('1-1401');

        const journalId = createJournalInternal({
          entryDate: String(saleDate),
          unitId,
          entryType: 'PUPUK_JUAL',
          description: `Penjualan i-Pubers ${product.name} (${numQty} Sak) - ${String(buyerName || 'Petani RDKK')}`,
          referenceNo: String(referenceNo).trim(),
          attachmentName: attachmentName || null,
          attachmentData: attachmentData || null,
          createdBy: req.authUser?.username || 'operator',
          lines: [
            { accountId: debitAccId, debit: totalRevenue, credit: 0 },
            { accountId: revAccId, debit: 0, credit: totalRevenue },
            { accountId: hppAccId, debit: cogs.totalCogs, credit: 0 },
            { accountId: invAccId, debit: 0, credit: cogs.totalCogs },
          ],
        });

        const updLot = db.prepare('UPDATE fertilizer_lots SET qty_remaining = ? WHERE id = ?');
        for (const l of cogs.updatedLots) {
          updLot.run(l.qtyRemaining, l.id);
        }

        db.prepare(
          `INSERT INTO fertilizer_movements
           (product_id, movement_date, movement_type, reference_no, party_name, qty, unit_price, total_price, cogs_amount, costing_method, journal_id, notes)
           VALUES (?, ?, 'JUAL_IPUBERS', ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          product.id,
          String(saleDate),
          String(referenceNo).trim(),
          String(buyerName || 'Petani Terdaftar RDKK').trim(),
          numQty,
          roundMoney(numPrice),
          totalRevenue,
          cogs.totalCogs,
          method,
          journalId,
          String(notes || 'Rekap penebusan i-Pubers').trim()
        );
      });

      res.json({
        products: getFertilizerProducts(),
        movements: getFertilizerMovements(),
        journals: getJournalEntries(),
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal memproses penjualan pupuk.';
      res.status(400).json({ error: msg });
    }
  }
);

app.post(
  '/api/fertilizer/opname',
  requireAuth,
  requireRole(['ADMIN', 'BENDAHARA', 'OPERATOR_KIOS']),
  (req: AuthenticatedRequest, res) => {
    const { productId, opnameDate, physicalQty, notes } = req.body || {};
    const numPhysical = Number(physicalQty);
    if (!productId || !opnameDate || Number.isNaN(numPhysical) || numPhysical < 0) {
      res.status(400).json({ error: 'Produk, tanggal opname, dan stok fisik valid wajib diisi.' });
      return;
    }

    const product = db
      .prepare('SELECT id, name, purchase_price AS purchasePrice FROM fertilizer_products WHERE id = ?')
      .get(Number(productId)) as { id: number; name: string; purchasePrice: number } | undefined;
    if (!product) {
      res.status(404).json({ error: 'Produk tidak ditemukan.' });
      return;
    }

    const lots = db
      .prepare(
        `SELECT id, product_id AS productId, purchase_date AS purchaseDate, do_number AS doNumber,
                qty_initial AS qtyInitial, qty_remaining AS qtyRemaining, unit_cost AS unitCost
         FROM fertilizer_lots WHERE product_id = ?`
      )
      .all(product.id) as unknown as FertilizerLot[];

    const systemStock = roundMoney(lots.reduce((sum, l) => sum + l.qtyRemaining, 0));
    const diff = roundMoney(numPhysical - systemStock);

    if (Math.abs(diff) < 0.001) {
      res.json({
        message: 'Stok fisik sesuai dengan stok sistem (selisih 0).',
        products: getFertilizerProducts(),
        movements: getFertilizerMovements(),
        journals: getJournalEntries(),
      });
      return;
    }

    const profile = getBumdesProfile();
    runInTransaction(() => {
      const unitId = getFertilizerUnitId();
      const invAccId = getAccountIdByCode('1-1401');
      const diffAccId = getAccountIdByCode('5-1102');
      const refNo = `OPN-${opnameDate.replaceAll('-', '')}`;

      if (diff < 0) {
        const lossQty = Math.abs(diff);
        const cogs = computeFertilizerSaleCogs(lots, lossQty, profile.inventoryMethod);
        const journalId = createJournalInternal({
          entryDate: String(opnameDate),
          unitId,
          entryType: 'PENYESUAIAN_STOK',
          description: `Stock Opname Susut ${product.name} (Selisih -${lossQty} Sak)`,
          referenceNo: refNo,
          createdBy: req.authUser?.username || 'operator',
          lines: [
            { accountId: diffAccId, debit: cogs.totalCogs, credit: 0 },
            { accountId: invAccId, debit: 0, credit: cogs.totalCogs },
          ],
        });
        const updLot = db.prepare('UPDATE fertilizer_lots SET qty_remaining = ? WHERE id = ?');
        for (const l of cogs.updatedLots) {
          updLot.run(l.qtyRemaining, l.id);
        }
        db.prepare(
          `INSERT INTO fertilizer_movements
           (product_id, movement_date, movement_type, reference_no, party_name, qty, unit_price, total_price, cogs_amount, costing_method, journal_id, notes)
           VALUES (?, ?, 'OPNAME_MINUS', ?, 'Pemeriksaan Fisik Gudang', ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          product.id,
          String(opnameDate),
          refNo,
          lossQty,
          cogs.averageUnitCost,
          cogs.totalCogs,
          cogs.totalCogs,
          profile.inventoryMethod,
          journalId,
          String(notes || `Selisih kurang fisik vs sistem (${systemStock} -> ${numPhysical})`).trim()
        );
      } else {
        const gainQty = diff;
        const unitCost = lots.length > 0 ? lots[lots.length - 1].unitCost : product.purchasePrice;
        const gainValue = roundMoney(gainQty * unitCost);
        const journalId = createJournalInternal({
          entryDate: String(opnameDate),
          unitId,
          entryType: 'PENYESUAIAN_STOK',
          description: `Stock Opname Lebih ${product.name} (Selisih +${gainQty} Sak)`,
          referenceNo: refNo,
          createdBy: req.authUser?.username || 'operator',
          lines: [
            { accountId: invAccId, debit: gainValue, credit: 0 },
            { accountId: diffAccId, debit: 0, credit: gainValue },
          ],
        });
        db.prepare(
          `INSERT INTO fertilizer_lots (product_id, purchase_date, do_number, qty_initial, qty_remaining, unit_cost)
           VALUES (?, ?, ?, ?, ?, ?)`
        ).run(product.id, String(opnameDate), refNo, gainQty, gainQty, unitCost);
        db.prepare(
          `INSERT INTO fertilizer_movements
           (product_id, movement_date, movement_type, reference_no, party_name, qty, unit_price, total_price, cogs_amount, costing_method, journal_id, notes)
           VALUES (?, ?, 'OPNAME_PLUS', ?, 'Pemeriksaan Fisik Gudang', ?, ?, ?, 0, ?, ?, ?)`
        ).run(
          product.id,
          String(opnameDate),
          refNo,
          gainQty,
          unitCost,
          gainValue,
          profile.inventoryMethod,
          journalId,
          String(notes || `Selisih lebih fisik vs sistem (${systemStock} -> ${numPhysical})`).trim()
        );
      }
    });

    res.json({
      products: getFertilizerProducts(),
      movements: getFertilizerMovements(),
      journals: getJournalEntries(),
    });
  }
);

// --- FINANCIAL REPORTS ---
app.get('/api/reports', requireAuth, (req, res) => {
  const profile = getBumdesProfile();
  const startDate = String(req.query.startDate || `${profile.fiscalYear}-01-01`);
  const endDate = String(req.query.endDate || `${profile.fiscalYear}-12-31`);
  const unitId = req.query.unitId ? Number(req.query.unitId) : null;

  const units = getBusinessUnits();
  const unitLabel = unitId
    ? units.find((u) => u.id === unitId)?.name || 'Unit Usaha'
    : 'Konsolidasi BUMDes';

  const reports = generateFinancialStatements({
    accounts: getAccounts(),
    entries: getJournalEntries(),
    budgets: getBudgets(profile.fiscalYear),
    profile,
    startDate,
    endDate,
    unitId,
    unitLabel,
  });

  res.json({ reports });
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const PORT = Number(process.env.PORT) || 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`BUMDesa Ahoras server running at http://localhost:${PORT}`);
  });
}

startServer();
