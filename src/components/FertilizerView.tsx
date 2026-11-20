import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  BadgeDollarSign,
  Check,
  ClipboardCheck,
  Edit3,
  Plus,
  RotateCcw,
  Save,
  Sprout,
  Upload,
} from 'lucide-react';
import { apiRequest } from '../lib/api';
import { roundMoney, validateAndComputeFertilizerPrices } from '../lib/accountingEngine';
import { formatDateId, formatNumber, formatRupiah } from '../lib/formatters';
import { AgroPaddyScene } from './AgroArt';
import type {
  BumdesProfile,
  CostingMethod,
  FertilizerMovement,
  FertilizerProduct,
  JournalEntryRecord,
  UserRole,
} from '../types/accounting';

export type KiosTab = 'stock' | 'prices' | 'purchase' | 'sale' | 'opname';

interface FertilizerViewProps {
  userRole: UserRole;
  profile: BumdesProfile;
  products: FertilizerProduct[];
  movements: FertilizerMovement[];
  initialTab?: KiosTab;
  onDataUpdated: (payload: {
    products: FertilizerProduct[];
    movements?: FertilizerMovement[];
    journals?: JournalEntryRecord[];
  }) => void;
}

interface PriceDraft {
  purchasePrice: string;
  hetPrice: string;
  priceNote: string;
}

export const FertilizerView: React.FC<FertilizerViewProps> = ({
  userRole,
  profile,
  products,
  movements,
  initialTab = 'stock',
  onDataUpdated,
}) => {
  const canEdit = userRole === 'ADMIN' || userRole === 'BENDAHARA' || userRole === 'OPERATOR_KIOS';
  const [activeTab, setActiveTab] = useState<KiosTab>(initialTab);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Master Product Modal / Inline Form
  const [showProductForm, setShowProductForm] = useState(false);
  const [editingProductId, setEditingProductId] = useState<number | null>(null);
  const [pCode, setPCode] = useState('');
  const [pName, setPName] = useState('');
  const [pUnitLabel, setPUnitLabel] = useState('Sak');
  const [pWeightKg, setPWeightKg] = useState('50');
  const [pPurchasePrice, setPPurchasePrice] = useState('');
  const [pHetPrice, setPHetPrice] = useState('');
  const [pMinStock, setPMinStock] = useState('25');
  const [pPriceNote, setPPriceNote] = useState('');

  // Inline Master Harga HET Drafts
  const [priceDrafts, setPriceDrafts] = useState<Record<number, PriceDraft>>({});
  const [savingPriceId, setSavingPriceId] = useState<number | null>(null);
  const [savingAllPrices, setSavingAllPrices] = useState(false);

  // DO Purchase Form
  const [buyProductId, setBuyProductId] = useState<number>(products[0]?.id || 0);
  const [buyDate, setBuyDate] = useState('2026-11-19');
  const [buyDoNo, setBuyDoNo] = useState('');
  const [buyDistributor, setBuyDistributor] = useState('PT Pupuk Indonesia (Distributor Resmi)');
  const [buyQty, setBuyQty] = useState('50');
  const [buyUnitCost, setBuyUnitCost] = useState(String(products[0]?.purchasePrice || 102000));
  const [buyPayment, setBuyPayment] = useState<'BANK' | 'KAS' | 'UTANG'>('BANK');
  const [buyNotes, setBuyNotes] = useState('');

  // i-Pubers Sale Form
  const [saleProductId, setSaleProductId] = useState<number>(products[0]?.id || 0);
  const [saleDate, setSaleDate] = useState('2026-11-19');
  const [saleRefNo, setSaleRefNo] = useState('');
  const [saleBuyer, setSaleBuyer] = useState('Poktan Tani Makmur (Rekap i-Pubers)');
  const [saleQty, setSaleQty] = useState('10');
  const [salePrice, setSalePrice] = useState(String(products[0]?.hetPrice || 112500));
  const [salePayment, setSalePayment] = useState<'KAS' | 'BANK' | 'PIUTANG'>('KAS');
  const [saleMethod, setSaleMethod] = useState<CostingMethod>(profile.inventoryMethod);
  const [saleNotes, setSaleNotes] = useState('');
  const [saleAttachmentName, setSaleAttachmentName] = useState<string | null>(null);
  const [saleAttachmentData, setSaleAttachmentData] = useState<string | null>(null);

  // Stock Opname & Kartu Stok Filter
  const [filterProductId, setFilterProductId] = useState<string>('');
  const [opnameProductId, setOpnameProductId] = useState<number>(products[0]?.id || 0);
  const [opnameDate, setOpnameDate] = useState('2026-11-19');
  const [opnamePhysical, setOpnamePhysical] = useState('');
  const [opnameNotes, setOpnameNotes] = useState('');

  const lowStockList = products.filter((p) => p.currentStock <= p.minStock);
  const totalValue = products.reduce((sum, p) => sum + p.inventoryValue, 0);

  const selectedBuyProduct = products.find((p) => p.id === buyProductId);
  const selectedSaleProduct = products.find((p) => p.id === saleProductId);
  const selectedOpnameProduct = products.find((p) => p.id === opnameProductId);

  const filteredMovements = useMemo(() => {
    if (!filterProductId) return movements;
    return movements.filter((m) => m.productId === Number(filterProductId));
  }, [movements, filterProductId]);

  const resetAlerts = () => {
    setStatusMessage(null);
    setErrorMessage(null);
  };

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  // Sync Master Harga drafts whenever products list changes from server
  useEffect(() => {
    const next: Record<number, PriceDraft> = {};
    for (const p of products) {
      next[p.id] = {
        purchasePrice: String(p.purchasePrice),
        hetPrice: String(p.hetPrice),
        priceNote: p.priceNote || '',
      };
    }
    setPriceDrafts(next);
  }, [products]);

  // Keep DO purchase unit cost & i-Pubers sale price aligned with updated Master Harga HET
  useEffect(() => {
    const prod = products.find((p) => p.id === buyProductId);
    if (prod) setBuyUnitCost(String(prod.purchasePrice));
  }, [buyProductId, products]);

  useEffect(() => {
    const prod = products.find((p) => p.id === saleProductId);
    if (prod) setSalePrice(String(prod.hetPrice));
  }, [saleProductId, products]);

  const dirtyPriceProducts = useMemo(() => {
    return products.filter((p) => {
      const draft = priceDrafts[p.id];
      if (!draft) return false;
      return (
        Number(draft.purchasePrice) !== p.purchasePrice ||
        Number(draft.hetPrice) !== p.hetPrice ||
        (draft.priceNote || '') !== (p.priceNote || '')
      );
    });
  }, [products, priceDrafts]);

  const updatePriceDraft = (productId: number, field: keyof PriceDraft, value: string) => {
    setPriceDrafts((prev) => {
      const base = prev[productId] || { purchasePrice: '', hetPrice: '', priceNote: '' };
      return {
        ...prev,
        [productId]: {
          ...base,
          [field]: value,
        },
      };
    });
  };

  const resetAllPriceDrafts = () => {
    resetAlerts();
    const next: Record<number, PriceDraft> = {};
    for (const p of products) {
      next[p.id] = {
        purchasePrice: String(p.purchasePrice),
        hetPrice: String(p.hetPrice),
        priceNote: p.priceNote || '',
      };
    }
    setPriceDrafts(next);
  };

  const handleSaveSinglePrice = async (p: FertilizerProduct) => {
    resetAlerts();
    const draft = priceDrafts[p.id];
    if (!draft) return;

    const check = validateAndComputeFertilizerPrices({
      purchasePrice: Number(draft.purchasePrice),
      hetPrice: Number(draft.hetPrice),
      weightKg: p.weightKg,
    });
    if (!check.valid) {
      setErrorMessage(`${p.name}: ${check.error}`);
      return;
    }

    setSavingPriceId(p.id);
    try {
      const res = await apiRequest<{ products: FertilizerProduct[] }>(
        `/api/fertilizer/products/${p.id}/prices`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            purchasePrice: check.purchasePrice,
            hetPrice: check.hetPrice,
            priceNote: draft.priceNote,
          }),
        }
      );
      onDataUpdated({ products: res.products });
      setStatusMessage(
        `Master harga HET untuk ${p.name} (Tebus: ${formatRupiah(check.purchasePrice)}, Jual: ${formatRupiah(check.hetPrice)}) berhasil disimpan.`
      );
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Gagal menyimpan harga HET pupuk.');
    } finally {
      setSavingPriceId(null);
    }
  };

  const handleSaveAllPrices = async () => {
    resetAlerts();
    if (dirtyPriceProducts.length === 0) return;

    const items: { id: number; purchasePrice: number; hetPrice: number; priceNote: string }[] = [];
    for (const p of dirtyPriceProducts) {
      const draft = priceDrafts[p.id];
      const check = validateAndComputeFertilizerPrices({
        purchasePrice: Number(draft.purchasePrice),
        hetPrice: Number(draft.hetPrice),
        weightKg: p.weightKg,
      });
      if (!check.valid) {
        setErrorMessage(`${p.name}: ${check.error}`);
        return;
      }
      items.push({
        id: p.id,
        purchasePrice: check.purchasePrice,
        hetPrice: check.hetPrice,
        priceNote: draft.priceNote,
      });
    }

    setSavingAllPrices(true);
    try {
      const res = await apiRequest<{ products: FertilizerProduct[] }>('/api/fertilizer/prices', {
        method: 'PUT',
        body: JSON.stringify({ items }),
      });
      onDataUpdated({ products: res.products });
      setStatusMessage(
        `${items.length} pembaruan Master Harga HET Penebusan Distributor & Harga Penjualan berhasil disimpan permanen.`
      );
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Gagal menyimpan perubahan master harga HET.');
    } finally {
      setSavingAllPrices(false);
    }
  };

  const openEditProduct = (p: FertilizerProduct) => {
    resetAlerts();
    setEditingProductId(p.id);
    setPCode(p.code);
    setPName(p.name);
    setPUnitLabel(p.unitLabel);
    setPWeightKg(String(p.weightKg));
    setPPurchasePrice(String(p.purchasePrice));
    setPHetPrice(String(p.hetPrice));
    setPMinStock(String(p.minStock));
    setPPriceNote(p.priceNote || '');
    setShowProductForm(true);
  };

  const openNewProduct = () => {
    resetAlerts();
    setEditingProductId(null);
    setPCode('');
    setPName('');
    setPUnitLabel('Sak');
    setPWeightKg('50');
    setPPurchasePrice('');
    setPHetPrice('');
    setPMinStock('25');
    setPPriceNote('');
    setShowProductForm(true);
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    resetAlerts();
    setSubmitting(true);
    try {
      const payload = {
        code: pCode,
        name: pName,
        unitLabel: pUnitLabel,
        weightKg: Number(pWeightKg),
        purchasePrice: Number(pPurchasePrice),
        hetPrice: Number(pHetPrice),
        minStock: Number(pMinStock),
        priceNote: pPriceNote,
      };
      const res = editingProductId
        ? await apiRequest<{ products: FertilizerProduct[] }>(
            `/api/fertilizer/products/${editingProductId}`,
            { method: 'PUT', body: JSON.stringify(payload) }
          )
        : await apiRequest<{ products: FertilizerProduct[] }>('/api/fertilizer/products', {
            method: 'POST',
            body: JSON.stringify(payload),
          });
      onDataUpdated({ products: res.products });
      setShowProductForm(false);
      setStatusMessage(
        editingProductId
          ? 'Data pupuk dan harga HET berhasil diperbarui.'
          : 'Jenis pupuk bersubsidi baru berhasil ditambahkan.'
      );
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Gagal menyimpan data pupuk.');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePurchaseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    resetAlerts();
    setSubmitting(true);
    try {
      const res = await apiRequest<{
        products: FertilizerProduct[];
        movements: FertilizerMovement[];
        journals: JournalEntryRecord[];
      }>('/api/fertilizer/purchase', {
        method: 'POST',
        body: JSON.stringify({
          productId: buyProductId,
          purchaseDate: buyDate,
          doNumber: buyDoNo,
          distributorName: buyDistributor,
          qty: Number(buyQty),
          unitCost: Number(buyUnitCost),
          paymentMethod: buyPayment,
          notes: buyNotes,
        }),
      });
      onDataUpdated(res);
      setBuyDoNo('');
      setBuyNotes('');
      setStatusMessage(
        'Penerimaan DO Distributor berhasil dicatat. Stok bertambah dan jurnal akuntansi otomatis diposting.'
      );
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Gagal mencatat penebusan DO.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setErrorMessage('Ukuran file bukti maksimal 2 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setSaleAttachmentName(file.name);
      setSaleAttachmentData(String(reader.result));
    };
    reader.readAsDataURL(file);
  };

  const handleSaleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    resetAlerts();
    setSubmitting(true);
    try {
      const res = await apiRequest<{
        products: FertilizerProduct[];
        movements: FertilizerMovement[];
        journals: JournalEntryRecord[];
      }>('/api/fertilizer/sale', {
        method: 'POST',
        body: JSON.stringify({
          productId: saleProductId,
          saleDate,
          referenceNo: saleRefNo,
          buyerName: saleBuyer,
          qty: Number(saleQty),
          unitPrice: Number(salePrice),
          paymentMethod: salePayment,
          costingMethod: saleMethod,
          notes: saleNotes,
          attachmentName: saleAttachmentName,
          attachmentData: saleAttachmentData,
        }),
      });
      onDataUpdated(res);
      setSaleRefNo('');
      setSaleNotes('');
      setSaleAttachmentName(null);
      setSaleAttachmentData(null);
      setStatusMessage(
        `Penjualan i-Pubers berhasil disimpan. Stok terpotong otomatis dengan metode ${saleMethod === 'FIFO' ? 'FIFO' : 'Rata-rata Bergerak'} dan HPP tercatat di jurnal.`
      );
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Gagal mencatat penjualan pupuk.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpnameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    resetAlerts();
    setSubmitting(true);
    try {
      const res = await apiRequest<{
        message?: string;
        products: FertilizerProduct[];
        movements: FertilizerMovement[];
        journals: JournalEntryRecord[];
      }>('/api/fertilizer/opname', {
        method: 'POST',
        body: JSON.stringify({
          productId: opnameProductId,
          opnameDate,
          physicalQty: Number(opnamePhysical),
          notes: opnameNotes,
        }),
      });
      onDataUpdated(res);
      setOpnamePhysical('');
      setOpnameNotes('');
      setStatusMessage(
        res.message ||
          'Stock Opname berhasil dicatat. Selisih fisik vs sistem telah disesuaikan ke kartu stok dan jurnal.'
      );
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Gagal menyimpan stock opname.');
    } finally {
      setSubmitting(false);
    }
  };

  const totalBags = products.reduce((sum, p) => sum + p.currentStock, 0);

  return (
    <div className="space-y-6">
      {/* Agrarian Subsidized Fertilizer Header Banner */}
      <section className="relative rounded-xl overflow-hidden bg-emerald-950 text-white border border-emerald-900/50">
        <AgroPaddyScene className="absolute inset-0 w-full h-full object-cover" />
        <div
          className="absolute inset-0 bg-gradient-to-r from-[#032218]/95 via-[#043627]/80 to-[#043627]/50"
          aria-hidden="true"
        />
        <div className="relative z-10 p-6 sm:p-7 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold text-amber-300 tracking-wide mb-1.5">
              Kios Resmi Pupuk Bersubsidi · Integrasi i-Pubers &amp; HET Kementan
            </p>
            <h1 className="font-display text-xl sm:text-2xl font-bold text-white tracking-tight">
              Unit Usaha Kios Pupuk Bersubsidi
            </h1>
            <p className="text-xs sm:text-sm text-emerald-100/90 mt-1">
              Pengelolaan penebusan DO distributor, penjualan petani terdaftar RDKK sesuai HET, serta perhitungan HPP metode{' '}
              <span className="font-semibold text-amber-200">
                {profile.inventoryMethod === 'FIFO' ? 'FIFO' : 'Rata-rata Bergerak'}
              </span>
              .
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:gap-6 shrink-0 border-t lg:border-t-0 lg:border-l border-white/15 pt-4 lg:pt-0 lg:pl-6">
            <div>
              <p className="text-[11px] text-emerald-200/80">Total Stok Gudang</p>
              <p className="text-lg sm:text-xl font-bold font-mono tabular-nums text-white mt-0.5">
                {formatNumber(totalBags)} Sak
              </p>
            </div>
            <div>
              <p className="text-[11px] text-emerald-200/80">Nilai Persediaan</p>
              <p className="text-lg sm:text-xl font-bold font-mono tabular-nums text-amber-300 mt-0.5">
                {formatRupiah(totalValue)}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Segmented Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-1 p-1 bg-white dark:bg-[#0E1A15] rounded-lg border border-emerald-950/10 dark:border-emerald-900/40 w-fit">
        {[
          { id: 'stock', label: 'Stok & Gudang', icon: Sprout },
          { id: 'prices', label: 'Master Harga HET', icon: BadgeDollarSign },
          { id: 'purchase', label: 'Penebusan DO Masuk', icon: ArrowDownToLine },
          { id: 'sale', label: 'Penjualan i-Pubers', icon: ArrowUpFromLine },
          { id: 'opname', label: 'Kartu Stok & Opname', icon: ClipboardCheck },
        ].map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setActiveTab(tab.id as KiosTab);
                resetAlerts();
              }}
              className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                active
                  ? 'bg-emerald-700 text-white'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-emerald-50 dark:hover:bg-emerald-950/60'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
              {tab.id === 'prices' && dirtyPriceProducts.length > 0 && (
                <span className="px-1.5 py-0.5 text-[10px] rounded bg-amber-400 text-emerald-950 font-bold">
                  {dirtyPriceProducts.length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {statusMessage && (
        <div
          role="status"
          className="p-3.5 rounded-lg border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/50 text-xs font-medium text-emerald-800 dark:text-emerald-300"
        >
          {statusMessage}
        </div>
      )}

      {errorMessage && (
        <div
          role="alert"
          className="p-3.5 rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/50 text-xs font-medium text-red-700 dark:text-red-300"
        >
          {errorMessage}
        </div>
      )}

      {/* TAB 1: MASTER DATA & STOK */}
      {activeTab === 'stock' && (
        <div className="space-y-4">
          {lowStockList.length > 0 && (
            <div className="p-4 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 flex items-center gap-3 text-xs text-amber-900 dark:text-amber-200">
              <AlertTriangle className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0" />
              <span>
                <strong>Perhatian Stok Minimum:</strong>{' '}
                {lowStockList.map((p) => `${p.name} (${p.currentStock} ${p.unitLabel})`).join(', ')}{' '}
                berada di bawah batas aman stok.
              </span>
            </div>
          )}

          <div className="rounded-xl bg-white dark:bg-[#0E1A15] border border-emerald-950/10 dark:border-emerald-900/40 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  Master Data Pupuk Bersubsidi &amp; Stok Gudang
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Harga tebus distributor, harga penjualan (HET), margin kios, dan posisi stok gudang
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('prices');
                    resetAlerts();
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-emerald-700/30 dark:border-emerald-700/50 bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
                >
                  <BadgeDollarSign className="w-3.5 h-3.5" />
                  <span>Atur Master Harga HET</span>
                </button>
                {canEdit && (
                  <button
                    type="button"
                    onClick={openNewProduct}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Tambah Jenis Pupuk</span>
                  </button>
                )}
              </div>
            </div>

            {showProductForm && canEdit && (
              <form
                onSubmit={handleSaveProduct}
                className="p-5 bg-slate-50 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
              >
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Kode Pupuk
                  </label>
                  <input
                    type="text"
                    required
                    disabled={editingProductId !== null}
                    value={pCode}
                    onChange={(e) => setPCode(e.target.value)}
                    placeholder="PPK-ZA"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white disabled:opacity-60"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Nama Jenis Pupuk
                  </label>
                  <input
                    type="text"
                    required
                    value={pName}
                    onChange={(e) => setPName(e.target.value)}
                    placeholder="Contoh: Pupuk ZA Bersubsidi (50 kg)"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Satuan &amp; Berat (Kg)
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      required
                      value={pUnitLabel}
                      onChange={(e) => setPUnitLabel(e.target.value)}
                      className="w-1/2 px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                    />
                    <input
                      type="number"
                      required
                      value={pWeightKg}
                      onChange={(e) => setPWeightKg(e.target.value)}
                      className="w-1/2 px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Harga Tebus Distributor (Rp)
                  </label>
                  <input
                    type="number"
                    required
                    value={pPurchasePrice}
                    onChange={(e) => setPPurchasePrice(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Harga HET Kementan (Rp)
                  </label>
                  <input
                    type="number"
                    required
                    value={pHetPrice}
                    onChange={(e) => setPHetPrice(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Batas Minimum Stok
                  </label>
                  <input
                    type="number"
                    required
                    value={pMinStock}
                    onChange={(e) => setPMinStock(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                  />
                </div>
                <div className="sm:col-span-2 lg:col-span-3">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Dasar Aturan / Catatan Harga HET (Opsional)
                  </label>
                  <input
                    type="text"
                    value={pPriceNote}
                    onChange={(e) => setPPriceNote(e.target.value)}
                    placeholder="Contoh: Kepmentan HET Rp 2.250/kg · Tebus Distributor Resmi"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                  />
                </div>
                <div className="flex items-end gap-2">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold whitespace-nowrap shrink-0"
                  >
                    {submitting ? 'Menyimpan...' : 'Simpan Data'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowProductForm(false)}
                    className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300"
                  >
                    Batal
                  </button>
                </div>
              </form>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 bg-slate-50/70 dark:bg-slate-950/50">
                    <th className="py-2.5 px-4 font-medium">Kode</th>
                    <th className="py-2.5 px-4 font-medium">Jenis Pupuk</th>
                    <th className="py-2.5 px-4 font-medium text-right">Harga Tebus</th>
                    <th className="py-2.5 px-4 font-medium text-right">Harga Penjualan (HET)</th>
                    <th className="py-2.5 px-4 font-medium text-right">Margin / Sak</th>
                    <th className="py-2.5 px-4 font-medium text-right">Stok Sistem</th>
                    <th className="py-2.5 px-4 font-medium text-right">Nilai Persediaan</th>
                    <th className="py-2.5 px-4 font-medium">Status</th>
                    {canEdit && <th className="py-2.5 px-4 font-medium text-right">Aksi</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {products.map((p) => {
                    const isLow = p.currentStock <= p.minStock;
                    const margin = p.hetPrice - p.purchasePrice;
                    return (
                      <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="py-3 px-4 font-mono text-xs font-semibold text-slate-700 dark:text-slate-300">
                          {p.code}
                        </td>
                        <td className="py-3 px-4 font-medium text-slate-900 dark:text-white">
                          {p.name}
                          <span className="block text-[11px] text-slate-500 dark:text-slate-400 font-normal">
                            {p.weightKg} kg / {p.unitLabel} · Min. {p.minStock} {p.unitLabel}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono text-xs text-right text-slate-700 dark:text-slate-300">
                          {formatRupiah(p.purchasePrice)}
                        </td>
                        <td className="py-3 px-4 font-mono text-xs font-semibold text-right text-slate-900 dark:text-white">
                          {formatRupiah(p.hetPrice)}
                        </td>
                        <td className="py-3 px-4 font-mono text-xs text-right text-emerald-700 dark:text-emerald-400">
                          {formatRupiah(margin)}
                        </td>
                        <td className="py-3 px-4 font-mono text-xs font-bold text-right text-slate-900 dark:text-white">
                          {formatNumber(p.currentStock)} {p.unitLabel}
                        </td>
                        <td className="py-3 px-4 font-mono text-xs text-right text-slate-900 dark:text-white">
                          {formatRupiah(p.inventoryValue)}
                        </td>
                        <td className="py-3 px-4 text-xs">
                          <span
                            className={`font-semibold ${
                              isLow
                                ? 'text-amber-700 dark:text-amber-400'
                                : 'text-emerald-700 dark:text-emerald-400'
                            }`}
                          >
                            {isLow ? 'Stok Menipis' : 'Aman'}
                          </span>
                        </td>
                        {canEdit && (
                          <td className="py-3 px-4 text-right">
                            <button
                              type="button"
                              onClick={() => openEditProduct(p)}
                              aria-label={`Ubah harga ${p.name}`}
                              className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-emerald-700 dark:hover:text-emerald-400"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                              <span>Ubah</span>
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: MASTER HARGA HET PENEBUSAN DISTRIBUTOR & HARGA PENJUALAN */}
      {activeTab === 'prices' && (
        <div className="space-y-4">
          {/* Summary KPI Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-white dark:bg-[#0E1A15] border border-emerald-950/10 dark:border-emerald-900/40">
              <p className="text-xs text-slate-500 dark:text-slate-400">Jenis Pupuk Bersubsidi</p>
              <p className="mt-1.5 text-xl font-bold font-mono text-slate-900 dark:text-white">
                {products.length} Produk
              </p>
              <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                Terhubung otomatis ke form DO &amp; i-Pubers
              </p>
            </div>
            <div className="p-4 rounded-xl bg-white dark:bg-[#0E1A15] border border-emerald-950/10 dark:border-emerald-900/40">
              <p className="text-xs text-slate-500 dark:text-slate-400">Rata-rata Margin Kios / Sak</p>
              <p className="mt-1.5 text-xl font-bold font-mono text-emerald-700 dark:text-emerald-400">
                {formatRupiah(
                  products.length > 0
                    ? roundMoney(
                        products.reduce((s, p) => {
                          const d = priceDrafts[p.id];
                          const pur = d ? Number(d.purchasePrice) || 0 : p.purchasePrice;
                          const het = d ? Number(d.hetPrice) || 0 : p.hetPrice;
                          return s + (het - pur);
                        }, 0) / products.length
                      )
                    : 0
                )}
              </p>
              <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                Selisih Harga Penjualan dikurangi Tebus Distributor
              </p>
            </div>
            <div className="p-4 rounded-xl bg-white dark:bg-[#0E1A15] border border-emerald-950/10 dark:border-emerald-900/40">
              <p className="text-xs text-slate-500 dark:text-slate-400">Status Penyimpanan Harga</p>
              <p
                className={`mt-1.5 text-xl font-bold ${
                  dirtyPriceProducts.length > 0
                    ? 'text-amber-700 dark:text-amber-400'
                    : 'text-emerald-700 dark:text-emerald-400'
                }`}
              >
                {dirtyPriceProducts.length > 0
                  ? `${dirtyPriceProducts.length} Belum Disimpan`
                  : 'Semua Tersimpan'}
              </p>
              <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                {dirtyPriceProducts.length > 0
                  ? 'Klik Simpan per baris atau Simpan Semua'
                  : 'Harga acuan kios sesuai data permanen'}
              </p>
            </div>
          </div>

          <section className="rounded-xl bg-white dark:bg-[#0E1A15] border border-emerald-950/10 dark:border-emerald-900/40 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  Master Harga HET Penebusan ke Distributor &amp; Harga Penjualan
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {canEdit
                    ? 'Ubah nominal Harga Penebusan ke Distributor dan Harga Penjualan (HET) langsung pada tabel di bawah, lalu simpan per baris atau sekaligus.'
                    : 'Mode baca saja untuk Pengawas. Menampilkan daftar resmi Harga Penebusan Distributor dan Harga Penjualan (HET).'}
                </p>
              </div>
              {canEdit && (
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {dirtyPriceProducts.length > 0 && (
                    <button
                      type="button"
                      onClick={resetAllPriceDrafts}
                      disabled={savingAllPrices}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Reset Perubahan</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleSaveAllPrices}
                    disabled={dirtyPriceProducts.length === 0 || savingAllPrices}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>
                      {savingAllPrices
                        ? 'Menyimpan...'
                        : dirtyPriceProducts.length > 0
                        ? `Simpan Semua (${dirtyPriceProducts.length})`
                        : 'Simpan Semua Perubahan'}
                    </span>
                  </button>
                </div>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 bg-slate-50/70 dark:bg-slate-950/50">
                    <th className="py-3 px-4 font-medium">Kode &amp; Jenis Pupuk</th>
                    <th className="py-3 px-4 font-medium">Harga Penebusan ke Distributor (Rp)</th>
                    <th className="py-3 px-4 font-medium">Harga Penjualan / HET (Rp)</th>
                    <th className="py-3 px-4 font-medium text-right">Margin Kios</th>
                    <th className="py-3 px-4 font-medium">Dasar Aturan / Catatan Harga</th>
                    {canEdit && <th className="py-3 px-4 font-medium text-right">Aksi</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {products.map((p) => {
                    const draft = priceDrafts[p.id] || {
                      purchasePrice: String(p.purchasePrice),
                      hetPrice: String(p.hetPrice),
                      priceNote: p.priceNote || '',
                    };
                    const metrics = validateAndComputeFertilizerPrices({
                      purchasePrice: Number(draft.purchasePrice),
                      hetPrice: Number(draft.hetPrice),
                      weightKg: p.weightKg,
                    });
                    const isDirty =
                      Number(draft.purchasePrice) !== p.purchasePrice ||
                      Number(draft.hetPrice) !== p.hetPrice ||
                      (draft.priceNote || '') !== (p.priceNote || '');
                    const isSavingRow = savingPriceId === p.id;

                    return (
                      <tr
                        key={p.id}
                        className={
                          isDirty
                            ? 'bg-amber-50/60 dark:bg-amber-950/20'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                        }
                      >
                        <td className="py-3.5 px-4 align-top">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded bg-emerald-950/5 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300">
                              {p.code}
                            </span>
                            {isDirty && (
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300">
                                Diubah
                              </span>
                            )}
                          </div>
                          <p className="font-semibold text-slate-900 dark:text-white mt-1">
                            {p.name}
                          </p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400">
                            Kemasan {p.weightKg} kg / {p.unitLabel}
                          </p>
                        </td>

                        <td className="py-3.5 px-4 align-top min-w-[190px]">
                          {canEdit ? (
                            <div>
                              <input
                                type="number"
                                min="1"
                                step="100"
                                aria-label={`Harga penebusan distributor ${p.name}`}
                                value={draft.purchasePrice}
                                onChange={(e) =>
                                  updatePriceDraft(p.id, 'purchasePrice', e.target.value)
                                }
                                className="w-full px-3 py-2 text-sm font-mono font-semibold text-right rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-700"
                              />
                              <p className="mt-1 text-[11px] font-mono text-slate-500 dark:text-slate-400 text-right">
                                {metrics.valid
                                  ? `${formatRupiah(metrics.distributorPricePerKg)} / kg`
                                  : 'Nominal harus > Rp 0'}
                              </p>
                            </div>
                          ) : (
                            <div className="text-right">
                              <p className="font-mono text-sm font-semibold text-slate-900 dark:text-white">
                                {formatRupiah(p.purchasePrice)}
                              </p>
                              <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                                {formatRupiah(metrics.distributorPricePerKg)} / kg
                              </p>
                            </div>
                          )}
                        </td>

                        <td className="py-3.5 px-4 align-top min-w-[190px]">
                          {canEdit ? (
                            <div>
                              <input
                                type="number"
                                min="1"
                                step="100"
                                aria-label={`Harga penjualan HET ${p.name}`}
                                value={draft.hetPrice}
                                onChange={(e) =>
                                  updatePriceDraft(p.id, 'hetPrice', e.target.value)
                                }
                                className="w-full px-3 py-2 text-sm font-mono font-semibold text-right rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-700"
                              />
                              <p className="mt-1 text-[11px] font-mono text-slate-500 dark:text-slate-400 text-right">
                                {metrics.valid
                                  ? `${formatRupiah(metrics.sellingPricePerKg)} / kg`
                                  : 'Nominal harus > Rp 0'}
                              </p>
                            </div>
                          ) : (
                            <div className="text-right">
                              <p className="font-mono text-sm font-semibold text-slate-900 dark:text-white">
                                {formatRupiah(p.hetPrice)}
                              </p>
                              <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                                {formatRupiah(metrics.sellingPricePerKg)} / kg
                              </p>
                            </div>
                          )}
                        </td>

                        <td className="py-3.5 px-4 align-top text-right whitespace-nowrap">
                          {metrics.valid ? (
                            <div>
                              <p
                                className={`font-mono text-sm font-bold ${
                                  metrics.isBelowCost
                                    ? 'text-red-600 dark:text-red-400'
                                    : 'text-emerald-700 dark:text-emerald-400'
                                }`}
                              >
                                {metrics.marginPerUnit >= 0 ? '+' : ''}
                                {formatRupiah(metrics.marginPerUnit)}
                              </p>
                              <p
                                className={`text-[11px] font-mono ${
                                  metrics.isBelowCost
                                    ? 'text-red-600 dark:text-red-400 font-semibold'
                                    : 'text-slate-500 dark:text-slate-400'
                                }`}
                              >
                                {metrics.isBelowCost
                                  ? 'Jual di bawah tebus!'
                                  : `Margin ${metrics.marginPercent}%`}
                              </p>
                            </div>
                          ) : (
                            <span className="text-xs text-red-600 dark:text-red-400">
                              Harga tidak valid
                            </span>
                          )}
                        </td>

                        <td className="py-3.5 px-4 align-top min-w-[220px]">
                          {canEdit ? (
                            <div>
                              <input
                                type="text"
                                aria-label={`Catatan dasar harga ${p.name}`}
                                value={draft.priceNote}
                                onChange={(e) =>
                                  updatePriceDraft(p.id, 'priceNote', e.target.value)
                                }
                                placeholder="Contoh: Permentan HET / SK Distributor"
                                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-700"
                              />
                              {p.priceUpdatedAt && (
                                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                                  Update terakhir: {formatDateId(p.priceUpdatedAt.slice(0, 10))}
                                </p>
                              )}
                            </div>
                          ) : (
                            <div>
                              <p className="text-xs text-slate-700 dark:text-slate-300">
                                {p.priceNote || '-'}
                              </p>
                              {p.priceUpdatedAt && (
                                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                                  Update: {formatDateId(p.priceUpdatedAt.slice(0, 10))}
                                </p>
                              )}
                            </div>
                          )}
                        </td>

                        {canEdit && (
                          <td className="py-3.5 px-4 align-top text-right whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => handleSaveSinglePrice(p)}
                              disabled={!isDirty || isSavingRow || savingAllPrices}
                              aria-label={`Simpan harga ${p.name}`}
                              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                                isDirty
                                  ? 'bg-emerald-700 hover:bg-emerald-800 text-white'
                                  : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 cursor-default'
                              }`}
                            >
                              {isDirty ? (
                                <Save className="w-3.5 h-3.5" />
                              ) : (
                                <Check className="w-3.5 h-3.5" />
                              )}
                              <span>
                                {isSavingRow
                                  ? 'Menyimpan...'
                                  : isDirty
                                  ? 'Simpan'
                                  : 'Tersimpan'}
                              </span>
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {/* TAB 2: PENEBUSAN DO DISTRIBUTOR */}
      {activeTab === 'purchase' && (
        <section className="p-6 rounded-xl bg-white dark:bg-[#0E1A15] border border-emerald-950/10 dark:border-emerald-900/40 max-w-3xl">
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            Catat Penebusan Stok Masuk dari Distributor (DO / Faktur)
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 mb-5">
            Otomatis menambah lapisan persediaan pupuk (FIFO) dan memposting jurnal Debit 1-1401 Persediaan Pupuk.
          </p>

          {!canEdit ? (
            <p className="text-sm text-slate-500">Akun Pengawas memiliki akses baca saja.</p>
          ) : (
            <form onSubmit={handlePurchaseSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="buy-product" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Jenis Pupuk Bersubsidi
                  </label>
                  <select
                    id="buy-product"
                    value={buyProductId}
                    onChange={(e) => {
                      const id = Number(e.target.value);
                      setBuyProductId(id);
                      const prod = products.find((p) => p.id === id);
                      if (prod) setBuyUnitCost(String(prod.purchasePrice));
                    }}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                  >
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} (Stok: {p.currentStock} {p.unitLabel})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="buy-date" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Tanggal Penerimaan DO
                  </label>
                  <input
                    id="buy-date"
                    type="date"
                    required
                    value={buyDate}
                    onChange={(e) => setBuyDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label htmlFor="buy-do" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Nomor DO / Faktur Distributor
                  </label>
                  <input
                    id="buy-do"
                    type="text"
                    required
                    value={buyDoNo}
                    onChange={(e) => setBuyDoNo(e.target.value)}
                    placeholder="Contoh: DO-2611-002"
                    className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label htmlFor="buy-dist" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Nama Distributor Resmi
                  </label>
                  <input
                    id="buy-dist"
                    type="text"
                    required
                    value={buyDistributor}
                    onChange={(e) => setBuyDistributor(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label htmlFor="buy-qty" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Jumlah Masuk ({selectedBuyProduct?.unitLabel || 'Sak'})
                  </label>
                  <input
                    id="buy-qty"
                    type="number"
                    min="1"
                    step="1"
                    required
                    value={buyQty}
                    onChange={(e) => setBuyQty(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label htmlFor="buy-cost" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Harga Tebus per Sak (Rp)
                  </label>
                  <input
                    id="buy-cost"
                    type="number"
                    min="1"
                    required
                    value={buyUnitCost}
                    onChange={(e) => setBuyUnitCost(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                  />
                  {selectedBuyProduct && (
                    <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                      Acuan Master Harga Tebus: {formatRupiah(selectedBuyProduct.purchasePrice)}
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor="buy-pay" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Sumber Pembayaran
                  </label>
                  <select
                    id="buy-pay"
                    value={buyPayment}
                    onChange={(e) => setBuyPayment(e.target.value as 'BANK' | 'KAS' | 'UTANG')}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                  >
                    <option value="BANK">Transfer Bank BRI BUMDes (1-1102)</option>
                    <option value="KAS">Kas Tunai BUMDes (1-1101)</option>
                    <option value="UTANG">Pembelian Kredit / Utang Distributor (2-1101)</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="buy-notes" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Catatan Pengiriman
                  </label>
                  <input
                    id="buy-notes"
                    type="text"
                    value={buyNotes}
                    onChange={(e) => setBuyNotes(e.target.value)}
                    placeholder="Opsional (mis. Angkutan Truk Nopol...)"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                  Total Nilai Penebusan DO
                </span>
                <span className="text-base font-bold font-mono text-slate-900 dark:text-white">
                  {formatRupiah((Number(buyQty) || 0) * (Number(buyUnitCost) || 0))}
                </span>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white text-sm font-semibold transition-colors whitespace-nowrap shrink-0"
              >
                <ArrowDownToLine className="w-4 h-4" />
                <span>{submitting ? 'Memproses...' : 'Simpan Penerimaan DO & Posting Jurnal'}</span>
              </button>
            </form>
          )}
        </section>
      )}

      {/* TAB 3: PENJUALAN & REKAP I-PUBERS */}
      {activeTab === 'sale' && (
        <section className="p-6 rounded-xl bg-white dark:bg-[#0E1A15] border border-emerald-950/10 dark:border-emerald-900/40 max-w-3xl">
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            Catat Penjualan Harian / Rekapitulasi Penebusan i-Pubers
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 mb-5">
            Memotong stok gudang secara otomatis, menghitung HPP (FIFO atau Rata-rata Bergerak), dan memposting jurnal Penjualan + HPP.
          </p>

          {!canEdit ? (
            <p className="text-sm text-slate-500">Akun Pengawas memiliki akses baca saja.</p>
          ) : (
            <form onSubmit={handleSaleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="sale-product" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Jenis Pupuk Bersubsidi
                  </label>
                  <select
                    id="sale-product"
                    value={saleProductId}
                    onChange={(e) => {
                      const id = Number(e.target.value);
                      setSaleProductId(id);
                      const prod = products.find((p) => p.id === id);
                      if (prod) setSalePrice(String(prod.hetPrice));
                    }}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                  >
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} (Tersedia: {p.currentStock} {p.unitLabel})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="sale-date" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Tanggal Penjualan / Rekap
                  </label>
                  <input
                    id="sale-date"
                    type="date"
                    required
                    value={saleDate}
                    onChange={(e) => setSaleDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label htmlFor="sale-ref" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    No. Transaksi / Rekap i-Pubers
                  </label>
                  <input
                    id="sale-ref"
                    type="text"
                    required
                    value={saleRefNo}
                    onChange={(e) => setSaleRefNo(e.target.value)}
                    placeholder="Contoh: IPB-2611-03"
                    className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label htmlFor="sale-buyer" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Kelompok Tani / Nama Petani RDKK
                  </label>
                  <input
                    id="sale-buyer"
                    type="text"
                    required
                    value={saleBuyer}
                    onChange={(e) => setSaleBuyer(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label htmlFor="sale-qty" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Jumlah Terjual (Maks. {selectedSaleProduct?.currentStock || 0} Sak)
                  </label>
                  <input
                    id="sale-qty"
                    type="number"
                    min="1"
                    step="1"
                    required
                    value={saleQty}
                    onChange={(e) => setSaleQty(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label htmlFor="sale-price" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Harga Jual per Sak (Sesuai HET)
                  </label>
                  <input
                    id="sale-price"
                    type="number"
                    min="1"
                    required
                    value={salePrice}
                    onChange={(e) => setSalePrice(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                  />
                  {selectedSaleProduct && (
                    <p
                      className={`mt-1 text-[11px] ${
                        Number(salePrice) > selectedSaleProduct.hetPrice
                          ? 'text-amber-700 dark:text-amber-400 font-medium'
                          : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {Number(salePrice) > selectedSaleProduct.hetPrice
                        ? `Melebihi Master HET (${formatRupiah(selectedSaleProduct.hetPrice)})`
                        : `Acuan Master Penjualan (HET): ${formatRupiah(selectedSaleProduct.hetPrice)}`}
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor="sale-pay" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Metode Pembayaran
                  </label>
                  <select
                    id="sale-pay"
                    value={salePayment}
                    onChange={(e) => setSalePayment(e.target.value as 'KAS' | 'BANK' | 'PIUTANG')}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                  >
                    <option value="KAS">Kas Tunai Kios (1-1101)</option>
                    <option value="BANK">Transfer / QRIS Bank BUMDes (1-1102)</option>
                    <option value="PIUTANG">Piutang Kelompok Tani (1-1201)</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="sale-method" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Metode Penilaian HPP
                  </label>
                  <select
                    id="sale-method"
                    value={saleMethod}
                    onChange={(e) => setSaleMethod(e.target.value as CostingMethod)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                  >
                    <option value="FIFO">FIFO (Masuk Pertama Keluar Pertama)</option>
                    <option value="MOVING_AVG">Rata-rata Bergerak (Moving Average)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Unggah Bukti Struk / Rekap i-Pubers (Opsional)
                </label>
                <div className="flex items-center gap-3">
                  <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800">
                    <Upload className="w-3.5 h-3.5" />
                    <span>Pilih Foto / PDF</span>
                    <input
                      type="file"
                      accept="image/*,.pdf"
                      onChange={handleSaleFileChange}
                      className="sr-only"
                    />
                  </label>
                  <span className="text-xs text-slate-500 dark:text-slate-400 truncate">
                    {saleAttachmentName || 'Belum ada lampiran dipilih'}
                  </span>
                </div>
              </div>

              <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                  Total Pendapatan Penjualan
                </span>
                <span className="text-base font-bold font-mono text-emerald-700 dark:text-emerald-400">
                  {formatRupiah((Number(saleQty) || 0) * (Number(salePrice) || 0))}
                </span>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white text-sm font-semibold transition-colors whitespace-nowrap shrink-0"
              >
                <ArrowUpFromLine className="w-4 h-4" />
                <span>{submitting ? 'Memproses...' : 'Simpan Penjualan & Hitung HPP'}</span>
              </button>
            </form>
          )}
        </section>
      )}

      {/* TAB 4: KARTU STOK & STOCK OPNAME */}
      {activeTab === 'opname' && (
        <div className="space-y-6">
          {canEdit && (
            <section className="p-6 rounded-xl bg-white dark:bg-[#0E1A15] border border-emerald-950/10 dark:border-emerald-900/40">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Input Stock Opname (Pemeriksaan Fisik Gudang vs Sistem)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 mb-4">
                Jika terdapat selisih fisik (susut/kurang atau lebih), sistem otomatis menyesuaikan kartu stok dan mencatat jurnal ke akun 5-1102 Selisih Persediaan.
              </p>

              <form onSubmit={handleOpnameSubmit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
                <div>
                  <label htmlFor="opn-product" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Jenis Pupuk
                  </label>
                  <select
                    id="opn-product"
                    value={opnameProductId}
                    onChange={(e) => setOpnameProductId(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                  >
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} (Sistem: {p.currentStock})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="opn-date" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Tanggal Opname
                  </label>
                  <input
                    id="opn-date"
                    type="date"
                    required
                    value={opnameDate}
                    onChange={(e) => setOpnameDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label htmlFor="opn-qty" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Stok Fisik Hasil Hitung ({selectedOpnameProduct?.unitLabel || 'Sak'})
                  </label>
                  <input
                    id="opn-qty"
                    type="number"
                    min="0"
                    step="1"
                    required
                    value={opnamePhysical}
                    onChange={(e) => setOpnamePhysical(e.target.value)}
                    placeholder={`Sistem: ${selectedOpnameProduct?.currentStock ?? 0}`}
                    className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label htmlFor="opn-notes" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Keterangan Selisih
                  </label>
                  <input
                    id="opn-notes"
                    type="text"
                    value={opnameNotes}
                    onChange={(e) => setOpnameNotes(e.target.value)}
                    placeholder="Contoh: Sak sobek / susut timbang"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold whitespace-nowrap shrink-0"
                >
                  {submitting ? 'Memproses...' : 'Simpan Stock Opname'}
                </button>
              </form>
            </section>
          )}

          <section className="rounded-xl bg-white dark:bg-[#0E1A15] border border-emerald-950/10 dark:border-emerald-900/40 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  Kartu Stok &amp; Riwayat Mutasi Pupuk
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Seluruh pergerakan DO masuk, penjualan i-Pubers, dan penyesuaian stok fisik
                </p>
              </div>
              <select
                aria-label="Filter kartu stok berdasarkan jenis pupuk"
                value={filterProductId}
                onChange={(e) => setFilterProductId(e.target.value)}
                className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
              >
                <option value="">Semua Jenis Pupuk</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 bg-slate-50/70 dark:bg-slate-950/50">
                    <th className="py-2.5 px-4 font-medium">Tanggal</th>
                    <th className="py-2.5 px-4 font-medium">Jenis Mutasi</th>
                    <th className="py-2.5 px-4 font-medium">No. Referensi</th>
                    <th className="py-2.5 px-4 font-medium">Pupuk</th>
                    <th className="py-2.5 px-4 font-medium">Pihak / Poktan</th>
                    <th className="py-2.5 px-4 font-medium text-right">Qty</th>
                    <th className="py-2.5 px-4 font-medium text-right">Nilai Transaksi</th>
                    <th className="py-2.5 px-4 font-medium text-right">HPP Tercatat</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredMovements.map((m) => {
                    const isOut = m.movementType === 'JUAL_IPUBERS' || m.movementType === 'OPNAME_MINUS';
                    return (
                      <tr key={m.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="py-3 px-4 font-mono text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap">
                          {formatDateId(m.movementDate)}
                        </td>
                        <td className="py-3 px-4 text-xs font-medium">
                          <span
                            className={
                              m.movementType === 'MASUK_DO'
                                ? 'text-emerald-700 dark:text-emerald-400'
                                : m.movementType === 'JUAL_IPUBERS'
                                ? 'text-slate-900 dark:text-slate-100'
                                : 'text-amber-700 dark:text-amber-400'
                            }
                          >
                            {m.movementType === 'MASUK_DO'
                              ? 'Masuk (DO)'
                              : m.movementType === 'JUAL_IPUBERS'
                              ? 'Keluar (i-Pubers)'
                              : m.movementType === 'OPNAME_PLUS'
                              ? 'Opname (+)'
                              : 'Opname (-)'}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono text-xs text-slate-700 dark:text-slate-300">
                          {m.referenceNo}
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-900 dark:text-white">
                          {m.productName}
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-400">
                          {m.partyName}
                        </td>
                        <td
                          className={`py-3 px-4 font-mono text-xs font-semibold text-right whitespace-nowrap ${
                            isOut
                              ? 'text-red-600 dark:text-red-400'
                              : 'text-emerald-700 dark:text-emerald-400'
                          }`}
                        >
                          {isOut ? '-' : '+'}
                          {formatNumber(m.qty)} Sak
                        </td>
                        <td className="py-3 px-4 font-mono text-xs text-right text-slate-900 dark:text-white whitespace-nowrap">
                          {formatRupiah(m.totalPrice)}
                        </td>
                        <td className="py-3 px-4 font-mono text-xs text-right text-slate-600 dark:text-slate-400 whitespace-nowrap">
                          {m.cogsAmount > 0 ? `${formatRupiah(m.cogsAmount)} (${m.costingMethod})` : '-'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </div>
  );
};
