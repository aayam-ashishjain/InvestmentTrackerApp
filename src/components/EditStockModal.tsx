import React, { useState, useEffect } from 'react';
import { 
  Edit3, 
  X, 
  CheckCircle2, 
  Sliders, 
  ShoppingCart, 
  TrendingDown, 
  Calendar, 
  DollarSign, 
  Layers, 
  ArrowUpRight,
  Clock,
  Inbox,
  BarChart3,
  Receipt,
  Lock,
  TrendingUp,
  Percent
} from 'lucide-react';
import { 
  Stock, 
  StockCapitalization,
  STOCK_CAPITALIZATIONS,
  Industry, 
  Purchase, 
  Sale, 
  Dividend,
  EnrichedPurchase, 
  EnrichedSale, 
  deriveExchangeFromMktSymbol, 
  formatINR,
  formatDateOnly,
  getTodayDateOnly 
} from '../types/database';
import { EditPurchaseModal } from './EditPurchaseModal';
import { EditSaleModal } from './EditSaleModal';
import { FinancialYearTree } from './FinancialYearTree';
import { CsvExportButton } from './CsvExportButton';

interface EditStockModalProps {
  isOpen: boolean;
  onClose: () => void;
  stock: Stock | null;
  industries: Industry[];
  purchases?: (Purchase | EnrichedPurchase)[];
  sales?: (Sale | EnrichedSale)[];
  dividends?: Dividend[];
  stocks?: Stock[];
  onSave: (updatedStock: Stock) => Promise<void>;
  onUpdatePurchase?: (updatedPurchase: Purchase) => Promise<void>;
  onUpdateSale?: (updatedSale: Sale) => Promise<void>;
}

export const EditStockModal: React.FC<EditStockModalProps> = ({
  isOpen,
  onClose,
  stock,
  industries,
  purchases = [],
  sales = [],
  dividends = [],
  stocks = [],
  onSave,
  onUpdatePurchase,
  onUpdateSale,
}) => {
  const [activeTab, setActiveTab] = useState<'details' | 'analytics' | 'purchases' | 'sales' | 'dividends'>('details');

  // Stock edit fields
  const [symbol, setSymbol] = useState('');
  const [mktSymbol, setMktSymbol] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [industryId, setIndustryId] = useState('');
  const [dividendYield, setDividendYield] = useState('');
  const [suggestedInvestment, setSuggestedInvestment] = useState('0');
  const [capitalization, setCapitalization] = useState<StockCapitalization | ''>('');
  const [isSaving, setIsSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Sub-modal states for editing purchase and sale
  const [editingPurchase, setEditingPurchase] = useState<Purchase | null>(null);
  const [isEditPurchaseOpen, setIsEditPurchaseOpen] = useState(false);

  const [editingSale, setEditingSale] = useState<(Sale & Partial<EnrichedSale>) | null>(null);
  const [isEditSaleOpen, setIsEditSaleOpen] = useState(false);

  useEffect(() => {
    if (stock) {
      setSymbol(stock.Symbol);
      setMktSymbol(stock.MktSymbol || `${stock.Symbol}.${stock.Exchange || 'NSE'}`);
      setCompanyName(stock.CompanyName);
      setIndustryId(stock.IndustryId || industries[0]?.IndustryId || 'IND0002');
      setDividendYield((stock.DividendYield || 0).toString());
      setSuggestedInvestment((stock.SuggestedInvestment || 0).toString());
      setCapitalization(stock.Capitalization || '');
      setEditError(null);
    }
  }, [stock, industries, isOpen]);

  // Reset tab to details when opening new stock
  useEffect(() => {
    if (isOpen) {
      setActiveTab('details');
      setEditError(null);
    }
  }, [isOpen, stock?.StockId]);

  if (!isOpen || !stock) return null;

  // Filter purchases for this stock
  const stockPurchases = purchases.filter(
    p => p.StockId.trim().toUpperCase() === stock.StockId.trim().toUpperCase()
  );
  const sortedPurchases = [...stockPurchases].sort(
    (a, b) => new Date(b.PurchaseDate).getTime() - new Date(a.PurchaseDate).getTime()
  );

  // Filter sales for this stock (either by StockId directly or by matching PurchaseId of this stock)
  const stockSales = sales.filter(s => {
    if (s.StockId && s.StockId.trim().toUpperCase() === stock.StockId.trim().toUpperCase()) {
      return true;
    }
    const linkedP = purchases.find(
      p => p.PurchaseId.trim().toUpperCase() === (s.PurchaseId || '').trim().toUpperCase()
    );
    return linkedP && linkedP.StockId.trim().toUpperCase() === stock.StockId.trim().toUpperCase();
  });
  const sortedSales = [...stockSales].sort(
    (a, b) => new Date(b.SaleDate).getTime() - new Date(a.SaleDate).getTime()
  );
  const stockDividends = dividends
    .filter(dividend => dividend.StockId.trim().toUpperCase() === stock.StockId.trim().toUpperCase())
    .sort((left, right) => right.Date.localeCompare(left.Date));
  const totalDividendIncome = stockDividends.reduce((sum, dividend) => sum + dividend.TotalDividend, 0);

  // Purchase summary metrics
  const totalPurchasedQty = sortedPurchases.reduce((acc, p) => acc + (Number(p.Quantity) || 0), 0);
  const totalInvested = sortedPurchases.reduce(
    (acc, p) => acc + (Number(p.TotalAmount) || (Number(p.Quantity) * Number(p.PurchasePrice))),
    0
  );
  const avgBuyPrice = totalPurchasedQty > 0 ? totalInvested / totalPurchasedQty : 0;

  // Sales summary metrics
  const totalSoldQty = sortedSales.reduce((acc, s) => acc + (Number(s.Quantity) || 0), 0);
  const totalSaleProceeds = sortedSales.reduce(
    (acc, s) => acc + (Number(s.TotalAmount) || (Number(s.Quantity) * Number(s.Rate || 0))),
    0
  );

  // Dynamically compute derived exchange as user edits MktSymbol or Symbol
  const derivedExchange = deriveExchangeFromMktSymbol(mktSymbol, symbol);

  const handleSymbolChange = (newSym: string) => {
    const upper = newSym.toUpperCase();
    setSymbol(upper);
    if (!mktSymbol || mktSymbol.startsWith(symbol)) {
      setMktSymbol(`${upper}.${derivedExchange || 'NSE'}`);
    }
  };

  const handleSaveStock = async (e: React.FormEvent) => {
    e.preventDefault();
    setEditError(null);
    const trimmedMkt = mktSymbol.trim().toUpperCase();
    if (!symbol.trim()) {
      setEditError('Stock Symbol is required.');
      return;
    }
    if (!trimmedMkt) {
      setEditError('Market Ticker (MktSymbol) is required and must be unique.');
      return;
    }
    if (!companyName.trim()) {
      setEditError('Company Name is required.');
      return;
    }
    if (Number(suggestedInvestment) < 0 || !Number.isFinite(Number(suggestedInvestment))) {
      setEditError('Suggested Investment must be a valid non-negative amount.');
      return;
    }
    if (!STOCK_CAPITALIZATIONS.includes(capitalization as StockCapitalization)) {
      setEditError('Select a capitalization category.');
      return;
    }

    // Check MktSymbol uniqueness across all other stocks
    const duplicateMkt = stocks.find(s => 
      s.StockId.trim().toUpperCase() !== stock.StockId.trim().toUpperCase() && 
      (s.MktSymbol || '').trim().toUpperCase() === trimmedMkt
    );
    if (duplicateMkt) {
      setEditError(`Market Ticker "${trimmedMkt}" is already in use by ${duplicateMkt.Symbol} (${duplicateMkt.StockId}). Market Ticker must be unique.`);
      return;
    }

    if (isSaving) return;
    setIsSaving(true);
    try {
      const updatedStock: Stock = {
        ...stock,
        Symbol: symbol.toUpperCase().trim(),
        MktSymbol: trimmedMkt,
        CompanyName: companyName.trim(),
        IndustryId: industryId || 'IND0002',
        Exchange: derivedExchange,
        Liverate: stock.Liverate,
        CurrentPrice: stock.Liverate || stock.CurrentPrice,
        DividendYield: parseFloat(dividendYield) || 0,
        SuggestedInvestment: Number(suggestedInvestment) || 0,
        Capitalization: capitalization,
        LastUpdated: getTodayDateOnly(),
      };

      await onSave(updatedStock);
      onClose();
    } catch (err: any) {
      console.error('Error saving stock:', err);
      setEditError(err?.message || 'Failed to update stock. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  // Open edit purchase modal on click of date or edit button
  const handleOpenPurchaseEdit = (purchase: Purchase) => {
    setEditingPurchase(purchase);
    setIsEditPurchaseOpen(true);
  };

  // Open edit sale modal on click of date or edit button
  const handleOpenSaleEdit = (sale: Sale) => {
    setEditingSale(sale);
    setIsEditSaleOpen(true);
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-150">
        <div className="w-full max-w-3xl bg-slate-900 border border-slate-700/80 rounded-t-3xl sm:rounded-2xl shadow-2xl p-0 relative max-h-[92vh] flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between p-4 sm:p-6 pb-3 border-b border-slate-800 shrink-0 bg-slate-900/60">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 rounded-xl shrink-0">
                <Edit3 className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">
                    Edit Stock: {stock.Symbol}
                  </h2>
                  <span className="font-mono text-xs font-bold text-cyan-400 bg-cyan-500/10 border border-cyan-500/30 px-2 py-0.5 rounded-lg">
                    {stock.StockId}
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  {stock.CompanyName}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              disabled={isSaving}
              className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-slate-800 disabled:opacity-50 min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center gap-1.5 border-b border-slate-800 px-4 sm:px-6 pt-2 shrink-0 bg-slate-950/40 overflow-x-auto">
            <button
              type="button"
              onClick={() => setActiveTab('details')}
              className={`px-3.5 py-2.5 text-xs font-semibold rounded-t-xl transition flex items-center gap-2 border-b-2 cursor-pointer touch-manipulation min-h-[40px] whitespace-nowrap ${
                activeTab === 'details'
                  ? 'text-cyan-400 border-cyan-400 bg-slate-900'
                  : 'text-slate-400 border-transparent hover:text-slate-200 hover:bg-slate-800/40'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Stock Details</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('analytics')}
              className={`px-3.5 py-2.5 text-xs font-semibold rounded-t-xl transition flex items-center gap-2 border-b-2 cursor-pointer touch-manipulation min-h-[40px] whitespace-nowrap ${
                activeTab === 'analytics'
                  ? 'text-cyan-400 border-cyan-400 bg-slate-900'
                  : 'text-slate-400 border-transparent hover:text-slate-200 hover:bg-slate-800/40'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>Analytics</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('purchases')}
              className={`px-3.5 py-2.5 text-xs font-semibold rounded-t-xl transition flex items-center gap-2 border-b-2 cursor-pointer touch-manipulation min-h-[40px] whitespace-nowrap ${
                activeTab === 'purchases'
                  ? 'text-amber-400 border-amber-400 bg-slate-900'
                  : 'text-slate-400 border-transparent hover:text-slate-200 hover:bg-slate-800/40'
              }`}
            >
              <ShoppingCart className="w-3.5 h-3.5" />
              <span>Purchases</span>
              <span
                className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full font-bold ${
                  activeTab === 'purchases'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                {sortedPurchases.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('sales')}
              className={`px-3.5 py-2.5 text-xs font-semibold rounded-t-xl transition flex items-center gap-2 border-b-2 cursor-pointer touch-manipulation min-h-[40px] whitespace-nowrap ${
                activeTab === 'sales'
                  ? 'text-emerald-400 border-emerald-400 bg-slate-900'
                  : 'text-slate-400 border-transparent hover:text-slate-200 hover:bg-slate-800/40'
              }`}
            >
              <TrendingDown className="w-3.5 h-3.5" />
              <span>Sales</span>
              <span
                className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full font-bold ${
                  activeTab === 'sales'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                {sortedSales.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('dividends')}
              className={`px-3.5 py-2.5 text-xs font-semibold rounded-t-xl transition flex items-center gap-2 border-b-2 cursor-pointer touch-manipulation min-h-[40px] whitespace-nowrap ${
                activeTab === 'dividends'
                  ? 'text-emerald-300 border-emerald-300 bg-slate-900'
                  : 'text-slate-400 border-transparent hover:text-slate-200 hover:bg-slate-800/40'
              }`}
            >
              <Receipt className="w-3.5 h-3.5" />
              <span>Dividends</span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full font-bold bg-slate-800 text-slate-400">
                {stockDividends.length}
              </span>
            </button>
          </div>

          {/* TAB 1: Stock Details */}
          {activeTab === 'details' && (
            <form onSubmit={handleSaveStock} className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1">
              {editError && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300 font-medium">
                  {editError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center justify-between">
                    <span>Stock ID</span>
                    <span className="text-[10px] text-slate-500 font-normal uppercase tracking-wider">Disabled (Unique)</span>
                  </label>
                  <input
                    type="text"
                    disabled
                    readOnly
                    value={stock.StockId}
                    className="w-full min-h-[44px] bg-slate-950/70 border border-slate-800 rounded-xl px-3.5 py-2.5 text-base sm:text-sm text-cyan-400 font-bold font-mono cursor-not-allowed select-none opacity-80"
                    title="Stock ID is read-only and cannot be changed"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Symbol <span className="text-cyan-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={symbol}
                    onChange={e => {
                      setEditError(null);
                      handleSymbolChange(e.target.value);
                    }}
                    placeholder="e.g. RELIANCE"
                    className="w-full min-h-[44px] bg-slate-950 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-base sm:text-sm text-white font-bold uppercase focus:outline-none focus:border-cyan-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center justify-between">
                    <span>Market Ticker <span className="text-cyan-400">*</span></span>
                    <span className="text-[10px] text-cyan-400 font-mono">Unique</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={mktSymbol}
                    onChange={e => {
                      setEditError(null);
                      setMktSymbol(e.target.value.toUpperCase().trim());
                    }}
                    placeholder="e.g. RELIANCE.NSE"
                    className="w-full min-h-[44px] bg-slate-950 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-base sm:text-sm text-white font-mono uppercase focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Company Name
                </label>
                <input
                  type="text"
                  required
                  value={companyName}
                  onChange={e => setCompanyName(e.target.value)}
                  placeholder="e.g. Reliance Industries Ltd."
                  className="w-full min-h-[44px] bg-slate-950 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-base sm:text-sm text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              {/* Industry dropdown */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Industry Sector
                </label>
                <select
                  value={industryId}
                  onChange={e => setIndustryId(e.target.value)}
                  className="w-full min-h-[44px] bg-slate-950 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-base sm:text-xs text-white focus:outline-none focus:border-cyan-500"
                >
                  {industries.map((ind, idx) => (
                    <option key={`${ind.IndustryId}_${idx}`} value={ind.IndustryId}>
                      {ind.Name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Live Price display */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Live Market Price (₹ INR)
                </label>
                <div className="w-full min-h-[44px] bg-slate-950/80 border border-slate-800 rounded-xl px-3.5 py-2.5 flex items-center justify-between cursor-not-allowed">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-base font-mono font-bold text-emerald-400">
                      {formatINR(stock.Liverate > 0 ? stock.Liverate : stock.CurrentPrice)}
                    </span>
                  </div>
                  <span className="text-xs text-slate-400 font-normal">
                    Live Rate
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Dividend Yield (%)
                </label>
                <input
                  type="number"
                  step="any"
                  value={dividendYield}
                  onChange={e => setDividendYield(e.target.value)}
                  placeholder="0.35"
                  className="w-full min-h-[44px] bg-slate-950 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-base sm:text-sm text-white font-mono focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Suggested Investment (₹ INR)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={suggestedInvestment}
                    onChange={e => setSuggestedInvestment(e.target.value)}
                    placeholder="0.00"
                    className="w-full min-h-[44px] bg-slate-950 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-base sm:text-sm text-white font-mono focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Capitalization <span className="text-cyan-400">*</span>
                  </label>
                  <select
                    required
                    value={capitalization}
                    onChange={e => setCapitalization(e.target.value as StockCapitalization | '')}
                    className="w-full min-h-[44px] bg-slate-950 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-base sm:text-sm text-white focus:outline-none focus:border-cyan-500"
                  >
                    <option value="">Select capitalization</option>
                    {STOCK_CAPITALIZATIONS.map(category => (
                      <option key={category} value={category}>{category}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isSaving}
                  className="px-4 py-2.5 min-h-[44px] text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition cursor-pointer touch-manipulation"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2.5 min-h-[44px] text-xs font-bold rounded-xl text-white bg-cyan-600 hover:bg-cyan-500 shadow-lg shadow-cyan-950/40 transition flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer touch-manipulation"
                >
                  {isSaving ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-cyan-200" />
                      <span>Save Changes</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}

          {/* TAB 2: Analytics (Read-only formulas from Google Sheets & Market data) */}
          {activeTab === 'analytics' && (
            <div className="p-4 sm:p-6 space-y-5 overflow-y-auto flex-1">
              {/* Header notification */}
              <div className="flex items-center justify-between p-3.5 bg-slate-950/70 border border-slate-800 rounded-2xl">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                    <Lock className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white uppercase tracking-wider">Formula & Market Analytics</h4>
                    <p className="text-[11px] text-slate-400">
                      Live metrics calculated via Google Sheets formulas. All fields are strictly read-only.
                    </p>
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold bg-slate-800 text-slate-400 border border-slate-700/80 uppercase">
                  Read Only
                </span>
              </div>

              {/* Read-only Form Fields Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
                {/* 1. volume */}
                <div className="bg-slate-950/80 p-3.5 rounded-xl border border-slate-800">
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5 flex items-center justify-between">
                    <span>Volume</span>
                    <span className="text-[10px] text-slate-500 font-mono">volume</span>
                  </label>
                  <input
                    type="text"
                    disabled
                    readOnly
                    value={stock.Volume !== undefined && stock.Volume !== null ? Number(stock.Volume).toLocaleString() : '—'}
                    className="w-full min-h-[42px] bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100 font-mono font-bold cursor-not-allowed select-none opacity-90"
                    title="Trading volume (read-only)"
                  />
                  <span className="text-[10px] text-slate-500 mt-1 block">Live market trading volume</span>
                </div>

                {/* 2. 52WkHigh */}
                <div className="bg-slate-950/80 p-3.5 rounded-xl border border-slate-800">
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5 flex items-center justify-between">
                    <span>52-Week High (₹)</span>
                    <span className="text-[10px] text-emerald-400/80 font-mono">52WkHigh</span>
                  </label>
                  <input
                    type="text"
                    disabled
                    readOnly
                    value={stock.High52 !== undefined && stock.High52 !== null ? formatINR(stock.High52) : '—'}
                    className="w-full min-h-[42px] bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-sm text-emerald-400 font-mono font-bold cursor-not-allowed select-none opacity-90"
                    title="52-Week High price (read-only)"
                  />
                  <span className="text-[10px] text-slate-500 mt-1 block">52-week peak trading price</span>
                </div>

                {/* 3. 52WkLow */}
                <div className="bg-slate-950/80 p-3.5 rounded-xl border border-slate-800">
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5 flex items-center justify-between">
                    <span>52-Week Low (₹)</span>
                    <span className="text-[10px] text-rose-400/80 font-mono">52WkLow</span>
                  </label>
                  <input
                    type="text"
                    disabled
                    readOnly
                    value={stock.Low52 !== undefined && stock.Low52 !== null ? formatINR(stock.Low52) : '—'}
                    className="w-full min-h-[42px] bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-sm text-rose-400 font-mono font-bold cursor-not-allowed select-none opacity-90"
                    title="52-Week Low price (read-only)"
                  />
                  <span className="text-[10px] text-slate-500 mt-1 block">52-week trough trading price</span>
                </div>

                {/* 4. shares */}
                <div className="bg-slate-950/80 p-3.5 rounded-xl border border-slate-800">
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5 flex items-center justify-between">
                    <span>Shares</span>
                    <span className="text-[10px] text-cyan-400/80 font-mono">shares</span>
                  </label>
                  <input
                    type="text"
                    disabled
                    readOnly
                    value={(stock.SharesFormula ?? (stock as any).totalQuantity ?? 0).toLocaleString()}
                    className="w-full min-h-[42px] bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white font-mono font-bold cursor-not-allowed select-none opacity-90"
                    title="Aggregated shares formula (read-only)"
                  />
                  <span className="text-[10px] text-slate-500 mt-1 block">Calculated from Purchases sheet</span>
                </div>

                {/* 5. changepct */}
                <div className="bg-slate-950/80 p-3.5 rounded-xl border border-slate-800">
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5 flex items-center justify-between">
                    <span>Change %</span>
                    <span className="text-[10px] text-slate-500 font-mono">changepct</span>
                  </label>
                  <input
                    type="text"
                    disabled
                    readOnly
                    value={
                      stock.ChangePct !== undefined && stock.ChangePct !== null
                        ? `${stock.ChangePct >= 0 ? '+' : ''}${Number(stock.ChangePct).toFixed(2)}%`
                        : '—'
                    }
                    className={`w-full min-h-[42px] bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-sm font-mono font-bold cursor-not-allowed select-none opacity-90 ${
                      (stock.ChangePct ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                    title="Daily change percentage (read-only)"
                  />
                  <span className="text-[10px] text-slate-500 mt-1 block">Day market percentage movement</span>
                </div>

                {/* 6. eps */}
                <div className="bg-slate-950/80 p-3.5 rounded-xl border border-slate-800">
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5 flex items-center justify-between">
                    <span>EPS (Earnings Per Share)</span>
                    <span className="text-[10px] text-slate-500 font-mono">eps</span>
                  </label>
                  <input
                    type="text"
                    disabled
                    readOnly
                    value={stock.Eps !== undefined && stock.Eps !== null ? Number(stock.Eps).toFixed(2) : '—'}
                    className="w-full min-h-[42px] bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-sm text-cyan-300 font-mono font-bold cursor-not-allowed select-none opacity-90"
                    title="Earnings per share (read-only)"
                  />
                  <span className="text-[10px] text-slate-500 mt-1 block">Trailing 12-month EPS</span>
                </div>

                {/* 7. pe */}
                <div className="bg-slate-950/80 p-3.5 rounded-xl border border-slate-800">
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5 flex items-center justify-between">
                    <span>P/E Ratio</span>
                    <span className="text-[10px] text-slate-500 font-mono">pe</span>
                  </label>
                  <input
                    type="text"
                    disabled
                    readOnly
                    value={stock.Pe !== undefined && stock.Pe !== null ? Number(stock.Pe).toFixed(2) : '—'}
                    className="w-full min-h-[42px] bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-sm text-amber-300 font-mono font-bold cursor-not-allowed select-none opacity-90"
                    title="Price-to-Earnings ratio (read-only)"
                  />
                  <span className="text-[10px] text-slate-500 mt-1 block">Valuation price-to-earnings ratio</span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: Purchases List with Date, Price, Quantity */}
          {activeTab === 'purchases' && (
            <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4">
              {/* Purchases Metric Bar */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 p-3 bg-slate-950/60 rounded-xl border border-slate-800/80 text-xs">
                <div>
                  <div className="text-[10px] text-slate-400">Total Purchased</div>
                  <div className="font-mono font-bold text-white text-sm mt-0.5">
                    {totalPurchasedQty.toLocaleString()} shares
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-400">Total Invested</div>
                  <div className="font-mono font-bold text-amber-400 text-sm mt-0.5">
                    {formatINR(totalInvested)}
                  </div>
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <div className="text-[10px] text-slate-400">Avg. Purchase Price</div>
                  <div className="font-mono font-bold text-slate-200 text-sm mt-0.5">
                    {formatINR(avgBuyPrice)}
                  </div>
                </div>
              </div>

              {/* Informational notice */}
              <div className="text-xs text-slate-400 flex items-center justify-between">
                <span>All purchases for <strong className="text-white font-mono">{stock.Symbol}</strong></span>
                <span className="text-[11px] text-cyan-400">💡 Click any date to edit purchase</span>
              </div>

              {sortedPurchases.length === 0 ? (
                <div className="p-8 text-center bg-slate-950/40 rounded-2xl border border-dashed border-slate-800 space-y-2">
                  <Inbox className="w-8 h-8 text-slate-500 mx-auto" />
                  <p className="text-sm font-semibold text-slate-300">No purchases recorded yet</p>
                  <p className="text-xs text-slate-500">
                    There are no buy transactions for {stock.Symbol} in the portfolio.
                  </p>
                </div>
              ) : (
                <>
                  <FinancialYearTree
                    records={sortedPurchases}
                    getKey={purchase => purchase.PurchaseId}
                    getDate={purchase => purchase.PurchaseDate}
                    getAmount={purchase => purchase.TotalAmount || purchase.Quantity * purchase.PurchasePrice}
                    totalLabel="Total purchases"
                    emptyMessage="No purchase records in a valid date range."
                    exportFileName={`${stock.Symbol}-purchases`}
                    exportColumns={[
                      { header: 'Purchase ID', value: purchase => purchase.PurchaseId },
                      { header: 'Stock ID', value: purchase => purchase.StockId },
                      { header: 'Symbol', value: purchase => (purchase as EnrichedPurchase).symbol || stock.Symbol },
                      { header: 'Date', value: purchase => purchase.PurchaseDate },
                      { header: 'Quantity', value: purchase => purchase.Quantity },
                      { header: 'Purchase Price', value: purchase => purchase.PurchasePrice },
                      { header: 'Total Amount', value: purchase => purchase.TotalAmount },
                      { header: 'Fees', value: purchase => purchase.Fees },
                    ]}
                    renderRecord={purchase => {
                      const enriched = purchase as EnrichedPurchase;
                      return (
                        <div className="grid grid-cols-2 items-center gap-x-3 gap-y-2 px-3 py-3 sm:grid-cols-[minmax(115px,1fr)_repeat(3,minmax(90px,0.8fr))_auto] sm:px-4">
                          <button type="button" onClick={() => handleOpenPurchaseEdit(purchase)} className="text-left text-xs font-semibold text-cyan-300 hover:underline">
                            {purchase.PurchaseId}
                          </button>
                          <span className="text-right font-mono text-[11px] text-slate-300">Qty {purchase.Quantity}</span>
                          <span className="text-right font-mono text-[11px] text-slate-300">Price {formatINR(purchase.PurchasePrice)}</span>
                          <span className="text-right font-mono text-[11px] font-semibold text-emerald-300">{formatINR(purchase.TotalAmount || purchase.Quantity * purchase.PurchasePrice)}</span>
                          <button type="button" onClick={() => handleOpenPurchaseEdit(purchase)} className="col-span-2 justify-self-end rounded-md border border-cyan-800/60 bg-cyan-950/60 px-2.5 py-1.5 text-[11px] font-semibold text-cyan-300 hover:bg-cyan-900/60 sm:col-span-1">
                            Edit
                          </button>
                          {enriched.remainingQuantity !== undefined && (
                            <span className="col-span-2 text-[10px] text-slate-500 sm:col-span-full">
                              Remaining {enriched.remainingQuantity} of {purchase.Quantity}
                            </span>
                          )}
                        </div>
                      );
                    }}
                  />
                  {/* Desktop Table View */}
                  <div className="hidden sm:hidden overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/40">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-slate-900/90 text-slate-400 border-b border-slate-800 font-semibold uppercase text-[10px] tracking-wider">
                        <tr>
                          <th className="py-3 px-4">Date</th>
                          <th className="py-3 px-4">Price</th>
                          <th className="py-3 px-4">Quantity</th>
                          <th className="py-3 px-4">Total Amount</th>
                          <th className="py-3 px-4 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 font-sans">
                        {sortedPurchases.map((p, idx) => {
                          const dateObj = new Date(p.PurchaseDate);
                          const dateStr = !isNaN(dateObj.getTime())
                            ? dateObj.toLocaleDateString(undefined, {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                              })
                            : p.PurchaseDate;

                          return (
                            <tr
                              key={`${p.PurchaseId}_${idx}`}
                              className="hover:bg-slate-800/40 transition group"
                            >
                              {/* Clickable Date Column - Opens Purchase in Edit Mode */}
                              <td className="py-3 px-4">
                                <button
                                  type="button"
                                  onClick={() => handleOpenPurchaseEdit(p)}
                                  className="text-cyan-400 hover:text-cyan-300 font-semibold underline underline-offset-4 decoration-cyan-500/40 hover:decoration-cyan-400 flex items-center gap-1.5 cursor-pointer text-left transition group-hover:text-cyan-300"
                                  title="Click to edit purchase"
                                >
                                  <Calendar className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                                  <span>{dateStr}</span>
                                </button>
                              </td>

                              {/* Price */}
                              <td className="py-3 px-4 font-mono font-semibold text-slate-200 text-sm">
                                {formatINR(p.PurchasePrice)}
                              </td>

                              {/* Quantity */}
                              <td className="py-3 px-4 font-mono font-bold text-white text-sm">
                                {p.Quantity.toLocaleString()}
                              </td>

                              {/* Total Amount */}
                              <td className="py-3 px-4 font-mono font-semibold text-emerald-400">
                                {formatINR(p.TotalAmount || p.Quantity * p.PurchasePrice)}
                              </td>

                              {/* Edit Action Button */}
                              <td className="py-3 px-4 text-right">
                                <button
                                  type="button"
                                  onClick={() => handleOpenPurchaseEdit(p)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-cyan-300 bg-cyan-950/60 border border-cyan-800/60 hover:bg-cyan-900/60 hover:border-cyan-600 transition cursor-pointer"
                                  title="Edit purchase record"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                  <span>Edit</span>
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile Card View */}
                  <div className="hidden sm:hidden space-y-2.5">
                    {sortedPurchases.map((p, idx) => {
                      const dateObj = new Date(p.PurchaseDate);
                      const dateStr = !isNaN(dateObj.getTime())
                        ? dateObj.toLocaleDateString(undefined, {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          })
                        : p.PurchaseDate;

                      return (
                        <div
                          key={`m_purchase_${p.PurchaseId}_${idx}`}
                          className="p-3.5 bg-slate-950/60 border border-slate-800 rounded-xl space-y-2.5"
                        >
                          <div className="flex items-center justify-between">
                            {/* Clickable Date Button */}
                            <button
                              type="button"
                              onClick={() => handleOpenPurchaseEdit(p)}
                              className="text-cyan-400 hover:text-cyan-300 font-semibold underline underline-offset-4 decoration-cyan-500/40 flex items-center gap-1.5 cursor-pointer text-sm text-left"
                            >
                              <Calendar className="w-4 h-4 text-cyan-400" />
                              <span>{dateStr}</span>
                            </button>
                          </div>

                          <div className="grid grid-cols-3 gap-2 text-xs pt-1 border-t border-slate-900">
                            <div>
                              <div className="text-[10px] text-slate-400">Price</div>
                              <div className="font-mono font-semibold text-slate-200 mt-0.5">
                                {formatINR(p.PurchasePrice)}
                              </div>
                            </div>
                            <div>
                              <div className="text-[10px] text-slate-400">Quantity</div>
                              <div className="font-mono font-bold text-white mt-0.5">
                                {p.Quantity.toLocaleString()}
                              </div>
                            </div>
                            <div>
                              <div className="text-[10px] text-slate-400">Total</div>
                              <div className="font-mono font-semibold text-emerald-400 mt-0.5">
                                {formatINR(p.TotalAmount || p.Quantity * p.PurchasePrice)}
                              </div>
                            </div>
                          </div>

                          <div className="pt-1 flex justify-end">
                            <button
                              type="button"
                              onClick={() => handleOpenPurchaseEdit(p)}
                              className="w-full min-h-[40px] flex items-center justify-center gap-1.5 text-xs font-semibold text-cyan-300 bg-cyan-950/60 border border-cyan-800/60 rounded-lg hover:bg-cyan-900/60 cursor-pointer"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                              <span>Edit Purchase Lot</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}

          {/* TAB 3: Sales List with Date, Price, Quantity */}
          {activeTab === 'sales' && (
            <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4">
              {/* Sales Metric Bar */}
              <div className="grid grid-cols-2 gap-2.5 p-3 bg-slate-950/60 rounded-xl border border-slate-800/80 text-xs">
                <div>
                  <div className="text-[10px] text-slate-400">Total Shares Sold</div>
                  <div className="font-mono font-bold text-white text-sm mt-0.5">
                    {totalSoldQty.toLocaleString()} shares
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-400">Total Sales Proceeds</div>
                  <div className="font-mono font-bold text-emerald-400 text-sm mt-0.5">
                    {formatINR(totalSaleProceeds)}
                  </div>
                </div>
              </div>

              {/* Informational notice */}
              <div className="text-xs text-slate-400 flex items-center justify-between">
                <span>All sales for <strong className="text-white font-mono">{stock.Symbol}</strong></span>
                <span className="text-[11px] text-amber-400">💡 Click any date to edit sale</span>
              </div>

              {sortedSales.length === 0 ? (
                <div className="p-8 text-center bg-slate-950/40 rounded-2xl border border-dashed border-slate-800 space-y-2">
                  <Inbox className="w-8 h-8 text-slate-500 mx-auto" />
                  <p className="text-sm font-semibold text-slate-300">No sales recorded yet</p>
                  <p className="text-xs text-slate-500">
                    No shares have been sold from {stock.Symbol} lots yet.
                  </p>
                </div>
              ) : (
                <>
                  <FinancialYearTree
                    records={sortedSales}
                    getKey={sale => sale.SaleId || sale.SalesId}
                    getDate={sale => sale.SaleDate}
                    getAmount={sale => sale.TotalAmount || sale.Quantity * (sale.Rate ?? sale.SalePrice)}
                    totalLabel="Total sales"
                    emptyMessage="No sale records in a valid date range."
                    exportFileName={`${stock.Symbol}-sales`}
                    exportColumns={[
                      { header: 'Sale ID', value: sale => sale.SaleId || sale.SalesId },
                      { header: 'Purchase ID', value: sale => sale.PurchaseId },
                      { header: 'Stock ID', value: sale => sale.StockId || stock.StockId },
                      { header: 'Date', value: sale => sale.SaleDate },
                      { header: 'Quantity', value: sale => sale.Quantity },
                      { header: 'Sale Price', value: sale => sale.Rate ?? sale.SalePrice },
                      { header: 'Total Amount', value: sale => sale.TotalAmount },
                      { header: 'Fees', value: sale => sale.Fees },
                      { header: 'Notes', value: sale => sale.Notes },
                    ]}
                    renderRecord={sale => (
                      <div className="grid grid-cols-2 items-center gap-x-3 gap-y-2 px-3 py-3 sm:grid-cols-[minmax(115px,1fr)_repeat(3,minmax(90px,0.8fr))_auto] sm:px-4">
                        <button type="button" onClick={() => handleOpenSaleEdit(sale)} className="text-left text-xs font-semibold text-amber-300 hover:underline">
                          {sale.SaleId || sale.SalesId}
                        </button>
                        <span className="text-right font-mono text-[11px] text-slate-300">Qty {sale.Quantity}</span>
                        <span className="text-right font-mono text-[11px] text-slate-300">Rate {formatINR(sale.Rate ?? sale.SalePrice)}</span>
                        <span className="text-right font-mono text-[11px] font-semibold text-emerald-300">{formatINR(sale.TotalAmount || sale.Quantity * (sale.Rate ?? sale.SalePrice))}</span>
                        <button type="button" onClick={() => handleOpenSaleEdit(sale)} className="col-span-2 justify-self-end rounded-md border border-amber-800/60 bg-amber-950/60 px-2.5 py-1.5 text-[11px] font-semibold text-amber-300 hover:bg-amber-900/60 sm:col-span-1">
                          Edit
                        </button>
                      </div>
                    )}
                  />
                  {/* Desktop Table View */}
                  <div className="hidden sm:hidden overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/40">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-slate-900/90 text-slate-400 border-b border-slate-800 font-semibold uppercase text-[10px] tracking-wider">
                        <tr>
                          <th className="py-3 px-4">Date</th>
                          <th className="py-3 px-4">Price</th>
                          <th className="py-3 px-4">Quantity</th>
                          <th className="py-3 px-4">Total Amount</th>
                          <th className="py-3 px-4 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 font-sans">
                        {sortedSales.map((s, idx) => {
                          const dateObj = new Date(s.SaleDate);
                          const dateStr = !isNaN(dateObj.getTime())
                            ? dateObj.toLocaleDateString(undefined, {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                              })
                            : s.SaleDate;

                          const activeSaleId = s.SaleId || s.SalesId;
                          const saleRate =  s.Rate || 0;
                          const totalVal = s.TotalAmount || s.Quantity * saleRate;

                          return (
                            <tr
                              key={`${activeSaleId}_${idx}`}
                              className="hover:bg-slate-800/40 transition group"
                            >
                              {/* Clickable Date Column - Opens Sale in Edit Mode */}
                              <td className="py-3 px-4">
                                <button
                                  type="button"
                                  onClick={() => handleOpenSaleEdit(s)}
                                  className="text-amber-400 hover:text-amber-300 font-semibold underline underline-offset-4 decoration-amber-500/40 hover:decoration-amber-400 flex items-center gap-1.5 cursor-pointer text-left transition group-hover:text-amber-300"
                                  title="Click to edit sale"
                                >
                                  <Calendar className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                                  <span>{dateStr}</span>
                                </button>
                              </td>

                              {/* Price */}
                              <td className="py-3 px-4 font-mono font-semibold text-slate-200 text-sm">
                                {formatINR(saleRate)}
                              </td>

                              {/* Quantity */}
                              <td className="py-3 px-4 font-mono font-bold text-white text-sm">
                                {s.Quantity.toLocaleString()}
                              </td>

                              {/* Total Amount */}
                              <td className="py-3 px-4 font-mono font-semibold text-emerald-400">
                                {formatINR(totalVal)}
                              </td>

                              {/* Edit Action Button */}
                              <td className="py-3 px-4 text-right">
                                <button
                                  type="button"
                                  onClick={() => handleOpenSaleEdit(s)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-amber-300 bg-amber-950/60 border border-amber-800/60 hover:bg-amber-900/60 hover:border-amber-600 transition cursor-pointer"
                                  title="Edit sale record"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                  <span>Edit</span>
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile Card View */}
                  <div className="hidden sm:hidden space-y-2.5">
                    {sortedSales.map((s, idx) => {
                      const dateObj = new Date(s.SaleDate);
                      const dateStr = !isNaN(dateObj.getTime())
                        ? dateObj.toLocaleDateString(undefined, {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          })
                        : s.SaleDate;
                      const activeSaleId = s.SaleId || s.SalesId;
                      const saleRate =  s.Rate || 0;
                      const totalVal = s.TotalAmount || s.Quantity * saleRate;

                      return (
                        <div
                          key={`m_sale_${activeSaleId}_${idx}`}
                          className="p-3.5 bg-slate-950/60 border border-slate-800 rounded-xl space-y-2.5"
                        >
                          <div className="flex items-center justify-between">
                            {/* Clickable Date Button */}
                            <button
                              type="button"
                              onClick={() => handleOpenSaleEdit(s)}
                              className="text-amber-400 hover:text-amber-300 font-semibold underline underline-offset-4 decoration-amber-500/40 flex items-center gap-1.5 cursor-pointer text-sm text-left"
                            >
                              <Calendar className="w-4 h-4 text-amber-400" />
                              <span>{dateStr}</span>
                            </button>
                          </div>

                          <div className="grid grid-cols-3 gap-2 text-xs pt-1 border-t border-slate-900">
                            <div>
                              <div className="text-[10px] text-slate-400">Price</div>
                              <div className="font-mono font-semibold text-slate-200 mt-0.5">
                                {formatINR(saleRate)}
                              </div>
                            </div>
                            <div>
                              <div className="text-[10px] text-slate-400">Quantity</div>
                              <div className="font-mono font-bold text-white mt-0.5">
                                {s.Quantity.toLocaleString()}
                              </div>
                            </div>
                            <div>
                              <div className="text-[10px] text-slate-400">Total</div>
                              <div className="font-mono font-semibold text-emerald-400 mt-0.5">
                                {formatINR(totalVal)}
                              </div>
                            </div>
                          </div>

                          <div className="pt-1 flex justify-end">
                            <button
                              type="button"
                              onClick={() => handleOpenSaleEdit(s)}
                              className="w-full min-h-[40px] flex items-center justify-center gap-1.5 text-xs font-semibold text-amber-300 bg-amber-950/60 border border-amber-800/60 rounded-lg hover:bg-amber-900/60 cursor-pointer"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                              <span>Edit Sale Record</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}

          {activeTab === 'dividends' && (
            <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4">
              <div className="grid grid-cols-2 gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                <div>
                  <div className="text-[10px] text-slate-400">Dividend Records</div>
                  <div className="mt-0.5 font-mono text-sm font-bold text-white">{stockDividends.length}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-400">Total Dividend Income</div>
                  <div className="mt-0.5 font-mono text-sm font-bold text-emerald-300">{formatINR(totalDividendIncome)}</div>
                </div>
              </div>

              {stockDividends.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-950/40 p-8 text-center">
                  <Receipt className="mx-auto mb-3 h-8 w-8 text-slate-500" />
                  <p className="text-sm font-semibold text-slate-300">No dividends recorded</p>
                  <p className="mt-1 text-xs text-slate-500">Import a dividend CSV from the dashboard to see records for {stock.Symbol} here.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex justify-end">
                    <CsvExportButton
                      fileName={`${stock.Symbol}-dividends`}
                      records={stockDividends}
                      columns={[
                        { header: 'Dividend ID', value: dividend => dividend.DividendId },
                        { header: 'Stock ID', value: dividend => dividend.StockId },
                        { header: 'Date', value: dividend => dividend.Date },
                        { header: 'Quantity', value: dividend => dividend.Quantity },
                        { header: 'Per Share', value: dividend => dividend.PerStock },
                        { header: 'Total Dividend', value: dividend => dividend.TotalDividend },
                      ]}
                    />
                  </div>
                  <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/40">
                  <table className="w-full min-w-[560px] text-left text-xs">
                    <thead className="border-b border-slate-800 bg-slate-900/90 text-[10px] font-semibold uppercase text-slate-400">
                      <tr>
                        <th className="px-4 py-3">Date</th>
                        <th className="px-4 py-3 text-right">Quantity</th>
                        <th className="px-4 py-3 text-right">Per Share</th>
                        <th className="px-4 py-3 text-right">Total Dividend</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/70">
                      {stockDividends.map(dividend => (
                        <tr key={dividend.DividendId}>
                          <td className="px-4 py-3 text-slate-300">{dividend.Date}</td>
                          <td className="px-4 py-3 text-right font-mono text-slate-200">{dividend.Quantity.toLocaleString()}</td>
                          <td className="px-4 py-3 text-right font-mono text-slate-200">{formatINR(dividend.PerStock)}</td>
                          <td className="px-4 py-3 text-right font-mono font-semibold text-emerald-300">{formatINR(dividend.TotalDividend)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Sub-modal: Edit Purchase Form */}
      {isEditPurchaseOpen && editingPurchase && onUpdatePurchase && (
        <EditPurchaseModal
          isOpen={isEditPurchaseOpen}
          onClose={() => {
            setIsEditPurchaseOpen(false);
            setEditingPurchase(null);
          }}
          purchase={editingPurchase}
          stocks={stocks}
          sales={sales}
          onUpdatePurchase={onUpdatePurchase}
        />
      )}

      {/* Sub-modal: Edit Sale Form */}
      {isEditSaleOpen && editingSale && onUpdateSale && (
        <EditSaleModal
          isOpen={isEditSaleOpen}
          onClose={() => {
            setIsEditSaleOpen(false);
            setEditingSale(null);
          }}
          sale={editingSale}
          purchases={purchases}
          stocks={stocks}
          allSales={sales}
          onUpdateSale={onUpdateSale}
        />
      )}
    </>
  );
};
