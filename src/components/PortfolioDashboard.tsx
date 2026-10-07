import React, { useEffect, useRef, useState } from 'react';
import { 
  Database, 
  ShoppingCart, 
  Search, 
  TrendingUp, 
  TrendingDown,
  DollarSign, 
  RefreshCw, 
  KeyRound, 
  ExternalLink, 
  Activity, 
  Layers, 
  BarChart3,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ArrowUpRight, 
  ArrowDownRight, 
  Tag,
  PlusCircle,
  Hash,
  Zap,
  Building2,
  Edit3,
  Sparkles,
  Receipt,
  X,
  CheckCircle2,
  Calendar,
  Upload,
} from 'lucide-react';
import { 
  Stock, 
  Purchase, 
  Sale,
  Dividend,
  Industry,
  EnrichedPurchase, 
  EnrichedSale,
  EnrichedStock, 
  generateStockId, 
  deriveExchangeFromMktSymbol, 
  formatINR,
  getTodayDateOnly 
} from '../types/database';
import { PurchaseModal } from './PurchaseModal';
import { EditStockModal } from './EditStockModal';
import { AddSaleModal } from './AddSaleModal';
import { EditSaleModal } from './EditSaleModal';
import { EditPurchaseModal } from './EditPurchaseModal';
import { PortfolioSummary } from './PortfolioSummary';
import { FinancialYearTree } from './FinancialYearTree';
import { CsvExportButton } from './CsvExportButton';
import type { DividendCsvImportResult } from '../services/sheetsDatabase';

const PortfolioInfographics = React.lazy(() =>
  import('./PortfolioInfographics').then(module => ({ default: module.PortfolioInfographics }))
);

interface PortfolioDashboardProps {
  spreadsheetId: string;
  spreadsheetName: string;
  industries: Industry[];
  stocks: Stock[];
  purchases: Purchase[];
  sales: Sale[];
  dividends: Dividend[];
  enrichedStocks: EnrichedStock[];
  enrichedPurchases: EnrichedPurchase[];
  enrichedSales: EnrichedSale[];
  isLoading: boolean;
  onRefresh: () => void;
  onExecutePurchase: (purchaseData: any) => Promise<void>;
  onUpdatePurchase?: (purchaseData: Purchase) => Promise<void>;
  onExecuteSale: (saleData: any) => Promise<void>;
  onUpdateSale: (saleData: Sale) => Promise<void>;
  onSimulatePriceTick: () => void;
  onAddStock: (stock: Stock) => Promise<void>;
  onUpdateStock: (stock: Stock) => Promise<void>;
  onImportDividends: (csvText: string) => Promise<DividendCsvImportResult>;
}

type StockSortKey =
  | 'StockId'
  | 'Symbol'
  | 'CompanyName'
  | 'industryName'
  | 'Capitalization'
  | 'Liverate'
  | 'SuggestedInvestment'
  | 'totalQuantity'
  | 'cumulativeInvested'
  | 'totalSales'
  | 'averagePurchasePrice'
  | 'totalInvested'
  | 'currentHoldingValue'
  | 'unrealizedGainLoss';

function getStockSortValue(stock: EnrichedStock, key: StockSortKey): string | number {
  switch (key) {
    case 'StockId':
    case 'Symbol':
    case 'CompanyName':
    case 'industryName':
      return stock[key] || '';
    default:
      return stock[key];
  }
}

interface DashboardHorizontalScrollBarProps {
  targetRef: React.RefObject<HTMLDivElement | null>;
}

const DashboardHorizontalScrollBar: React.FC<DashboardHorizontalScrollBarProps> = ({ targetRef }) => {
  const railRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ contentWidth: 0, viewportWidth: 0 });

  useEffect(() => {
    const target = targetRef.current;
    const rail = railRef.current;
    if (!target || !rail) return;

    const updateDimensions = () => {
      setDimensions({ contentWidth: target.scrollWidth, viewportWidth: target.clientWidth });
    };
    const syncRailFromTarget = () => {
      if (Math.abs(rail.scrollLeft - target.scrollLeft) > 1) rail.scrollLeft = target.scrollLeft;
    };
    const syncTargetFromRail = () => {
      if (Math.abs(target.scrollLeft - rail.scrollLeft) > 1) target.scrollLeft = rail.scrollLeft;
    };

    const observer = new ResizeObserver(updateDimensions);
    observer.observe(target);
    if (target.firstElementChild) observer.observe(target.firstElementChild);
    target.addEventListener('scroll', syncRailFromTarget, { passive: true });
    rail.addEventListener('scroll', syncTargetFromRail, { passive: true });
    window.addEventListener('resize', updateDimensions);
    updateDimensions();

    return () => {
      observer.disconnect();
      target.removeEventListener('scroll', syncRailFromTarget);
      rail.removeEventListener('scroll', syncTargetFromRail);
      window.removeEventListener('resize', updateDimensions);
    };
  }, [targetRef]);

  if (dimensions.contentWidth <= dimensions.viewportWidth + 1) return null;

  return (
    <div
      ref={railRef}
      className="dashboard-horizontal-rail sticky bottom-0 z-20 overflow-x-auto overflow-y-hidden"
      role="region"
      aria-label="Horizontal table scroll"
      tabIndex={0}
    >
      <div style={{ width: dimensions.contentWidth, minWidth: '100%', height: 1 }} />
    </div>
  );
};

export const PortfolioDashboard: React.FC<PortfolioDashboardProps> = ({
  spreadsheetId,
  spreadsheetName,
  industries,
  stocks,
  purchases,
  sales,
  dividends,
  enrichedStocks,
  enrichedPurchases,
  enrichedSales,
  isLoading,
  onRefresh,
  onExecutePurchase,
  onUpdatePurchase,
  onExecuteSale,
  onUpdateSale,
  onSimulatePriceTick,
  onAddStock,
  onUpdateStock,
  onImportDividends,
}) => {
  const [activeTab, setActiveTab] = useState<'stocks' | 'purchases' | 'sales' | 'dividends' | 'schema' | 'infographics'>('stocks');
  const [selectedStockFilter, setSelectedStockFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const stocksTableScrollRef = useRef<HTMLDivElement>(null);
  const purchasesTableScrollRef = useRef<HTMLDivElement>(null);
  const salesTableScrollRef = useRef<HTMLDivElement>(null);
  const dividendFileInputRef = useRef<HTMLInputElement>(null);
  const [isImportingDividends, setIsImportingDividends] = useState(false);
  const [dividendImportMessage, setDividendImportMessage] = useState<string | null>(null);
  const [stockSort, setStockSort] = useState<{
    key: StockSortKey;
    direction: 'asc' | 'desc';
  } | null>(null);
  
  // Purchase Modal state
  const [isPurchaseModalOpen, setIsPurchaseModalOpen] = useState(false);
  const [preselectedStockId, setPreselectedStockId] = useState<string | undefined>(undefined);

  // Edit Purchase Modal state
  const [editingPurchase, setEditingPurchase] = useState<Purchase | null>(null);
  const [isEditPurchaseOpen, setIsEditPurchaseOpen] = useState(false);

  // Sale Modal state (Primary Key: SaleId, Foreign Key: PurchaseId, Display: Symbol)
  const [isSaleModalOpen, setIsSaleModalOpen] = useState(false);
  const [preselectedPurchaseId, setPreselectedPurchaseId] = useState<string | undefined>(undefined);

  // Edit Sale Modal state (Triggered when clicking SaleId in Sales Ledger)
  const [editingSale, setEditingSale] = useState<EnrichedSale | null>(null);
  const [isEditSaleOpen, setIsEditSaleOpen] = useState(false);

  // Edit Stock Modal state (Triggered when clicking on StockId or Symbol)
  const [editingStock, setEditingStock] = useState<Stock | null>(null);
  const [isEditStockOpen, setIsEditStockOpen] = useState(false);

  // Add Stock Dialog state
  const [isAddStockOpen, setIsAddStockOpen] = useState(false);
  const [isSavingStock, setIsSavingStock] = useState(false);
  const [addStockError, setAddStockError] = useState<string | null>(null);
  const [newStockData, setNewStockData] = useState({
    stockId: '',
    symbol: '',
    mktSymbol: '',
    name: '',
    industryId: industries[0]?.IndustryId || 'IND0002',
    price: '1500.00',
    dividendYield: '1.2',
  });

  const handleOpenAddStock = () => {
    const nextStockId = generateStockId(stocks);
    setAddStockError(null);
    setNewStockData({
      stockId: nextStockId,
      symbol: '',
      mktSymbol: '',
      name: '',
      industryId: industries[0]?.IndustryId || 'IND0002',
      price: '1500.00',
      dividendYield: '1.2',
    });
    setIsAddStockOpen(true);
  };

  // Dynamically compute exchange from MktSymbol by removing Symbol
  const derivedExchange = deriveExchangeFromMktSymbol(newStockData.mktSymbol, newStockData.symbol);

  const handleSymbolChange = (sym: string) => {
    const upperSym = sym.toUpperCase();
    setNewStockData(prev => ({
      ...prev,
      symbol: upperSym,
      mktSymbol: prev.mktSymbol ? prev.mktSymbol : `${upperSym}.NSE`,
    }));
  };

  // Click on StockId or Symbol on Main Dashboard opens the stock details in edit mode
  const handleOpenEditStock = (stock: Stock) => {
    setEditingStock(stock);
    setIsEditStockOpen(true);
  };

  // Filtering
  const filteredStocks = enrichedStocks.filter(s => {
    const matchesFilter = selectedStockFilter === 'ALL' || s.StockId === selectedStockFilter;
    const matchesSearch = !searchQuery || 
      s.Symbol.toLowerCase().includes(searchQuery.toLowerCase()) || 
      s.CompanyName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.StockId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.Exchange.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.industryName || '').toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const sortedStocks = stockSort
    ? [...filteredStocks].sort((left, right) => {
        const leftValue = getStockSortValue(left, stockSort.key);
        const rightValue = getStockSortValue(right, stockSort.key);
        const comparison = typeof leftValue === 'number' && typeof rightValue === 'number'
          ? leftValue - rightValue
          : String(leftValue).localeCompare(String(rightValue), undefined, { numeric: true, sensitivity: 'base' });
        return stockSort.direction === 'asc' ? comparison : -comparison;
      })
    : filteredStocks;

  const sortableHeader = (label: string, key: StockSortKey, alignRight = false) => {
    const isActive = stockSort?.key === key;
    return (
      <th
        className={`py-3 px-4 ${alignRight ? 'text-right' : 'text-left'}`}
        aria-sort={isActive ? (stockSort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
      >
        <button
          type="button"
          onClick={() => setStockSort(current =>
            current?.key === key
              ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
              : { key, direction: 'asc' }
          )}
          className={`inline-flex items-center gap-1.5 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400 ${alignRight ? 'ml-auto' : ''}`}
          aria-label={`Sort by ${label}${isActive ? `, ${stockSort.direction === 'asc' ? 'ascending' : 'descending'}` : ''}`}
        >
          <span>{label}</span>
          {isActive
            ? stockSort.direction === 'asc' ? <ArrowUp className="w-3.5 h-3.5" /> : <ArrowDown className="w-3.5 h-3.5" />
            : <ArrowUpDown className="w-3.5 h-3.5 opacity-50" />}
        </button>
      </th>
    );
  };

  const filteredPurchases = enrichedPurchases.filter(p => {
    const matchesFilter = selectedStockFilter === 'ALL' || p.StockId === selectedStockFilter;
    const matchesSearch = !searchQuery || 
      p.symbol.toLowerCase().includes(searchQuery.toLowerCase()) || 
      p.companyName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.PurchaseId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.StockId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.exchange.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const filteredSales = enrichedSales.filter(s => {
    const matchesFilter = selectedStockFilter === 'ALL' || s.StockId === selectedStockFilter;
    const matchesSearch = !searchQuery || 
      s.symbol.toLowerCase().includes(searchQuery.toLowerCase()) || 
      s.companyName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.SaleId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.PurchaseId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.StockId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.exchange.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const sortedDividends = [...dividends].sort((left, right) => right.Date.localeCompare(left.Date));
  const dividendGroups = new Map<number, {
    financialYear: string;
    total: number;
    months: Map<string, { label: string; total: number; records: Dividend[] }>;
  }>();
  sortedDividends.forEach(dividend => {
    const [yearValue, monthValue] = dividend.Date.split('-').map(Number);
    if (!yearValue || !monthValue || monthValue < 1 || monthValue > 12) return;
    const financialYearStart = monthValue >= 4 ? yearValue : yearValue - 1;
    const financialYear = `FY ${financialYearStart}-${String(financialYearStart + 1).slice(-2)}`;
    let yearGroup = dividendGroups.get(financialYearStart);
    if (!yearGroup) {
      yearGroup = { financialYear, total: 0, months: new Map() };
      dividendGroups.set(financialYearStart, yearGroup);
    }

    const monthKey = String(monthValue).padStart(2, '0');
    let monthGroup = yearGroup.months.get(monthKey);
    if (!monthGroup) {
      const monthDate = new Date(Date.UTC(yearValue, monthValue - 1, 1));
      monthGroup = {
        label: monthDate.toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
        total: 0,
        records: [],
      };
      yearGroup.months.set(monthKey, monthGroup);
    }
    yearGroup.total += dividend.TotalDividend;
    monthGroup.total += dividend.TotalDividend;
    monthGroup.records.push(dividend);
  });
  const financialYearGroups = [...dividendGroups.entries()].sort((left, right) => right[0] - left[0]);
  const totalDividendIncome = sortedDividends.reduce((sum, dividend) => sum + dividend.TotalDividend, 0);

  const handleDividendFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsImportingDividends(true);
    setDividendImportMessage(null);
    try {
      const result = await onImportDividends(await file.text());
      const unmatched = result.unmatchedStockIds.length > 0
        ? ` Unmatched tickers: ${result.unmatchedStockIds.join(', ')}.`
        : '';
      setDividendImportMessage(
        `Imported ${result.imported.length}; skipped ${result.duplicates} duplicates and ${result.invalidRows} invalid rows.${unmatched}`
      );
    } catch (error) {
      setDividendImportMessage(error instanceof Error ? error.message : 'Dividend CSV import failed.');
    } finally {
      setIsImportingDividends(false);
      event.target.value = '';
    }
  };

  // Overall Portfolio Aggregates in INR
  const totalInvested = enrichedStocks.reduce((sum, s) => sum + s.activeCostBasis, 0);
  const totalCurrentValue = enrichedStocks.reduce((sum, s) => sum + s.currentHoldingValue, 0);
  const totalUnrealizedGain = totalCurrentValue - totalInvested;
  const totalUnrealizedGainPercent = totalInvested > 0 ? (totalUnrealizedGain / totalInvested) * 100 : 0;
  const totalRealizedGain = enrichedSales.reduce((sum, s) => sum + s.realizedGainLoss, 0);
  const totalSharesOwned = enrichedStocks.reduce((sum, s) => sum + s.totalQuantity, 0);

  const handleOpenPurchaseForStock = (stockId: string) => {
    setPreselectedStockId(stockId);
    setIsPurchaseModalOpen(true);
  };

  const handleOpenSaleForPurchase = (purchaseId: string) => {
    setPreselectedPurchaseId(purchaseId);
    setIsSaleModalOpen(true);
  };

  const handleOpenEditSale = (sale: EnrichedSale) => {
    setEditingSale(sale);
    setIsEditSaleOpen(true);
  };

  // Fast direct save for new stock
  const handleCreateStock = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddStockError(null);
    const stockId = (newStockData.stockId || generateStockId(stocks)).trim().toUpperCase();
    const symbol = newStockData.symbol.toUpperCase().trim();
    const mktSymbol = (newStockData.mktSymbol || `${symbol}.NSE`).toUpperCase().trim();

    if (!stockId) {
      setAddStockError('Stock ID is required and must be unique.');
      return;
    }
    if (!mktSymbol) {
      setAddStockError('Market Ticker (MktSymbol) is required and must be unique.');
      return;
    }

    // Check individual uniqueness and combined uniqueness
    const existingById = stocks.find(s => s.StockId.trim().toUpperCase() === stockId);
    const existingByMkt = stocks.find(s => (s.MktSymbol || '').trim().toUpperCase() === mktSymbol);

    if (existingById && existingByMkt) {
      setAddStockError(`Both Stock ID "${stockId}" and Market Ticker "${mktSymbol}" already exist in the Stocks table. Both must be unique.`);
      return;
    }
    if (existingById) {
      setAddStockError(`Stock ID "${stockId}" is already used by ${existingById.Symbol} (${existingById.CompanyName}). Stock ID must be unique.`);
      return;
    }
    if (existingByMkt) {
      setAddStockError(`Market Ticker "${mktSymbol}" is already used by ${existingByMkt.Symbol} (${existingByMkt.StockId}). Market Ticker must be unique.`);
      return;
    }

    if (!symbol || !newStockData.name || isSavingStock) return;

    setIsSavingStock(true);
    try {
      const exchange = deriveExchangeFromMktSymbol(mktSymbol, symbol);
      const initialPrice = parseFloat(newStockData.price) || 0;

      const newStock: Stock = {
        StockId: stockId,
        Symbol: symbol,
        MktSymbol: mktSymbol,
        CompanyName: newStockData.name.trim(),
        IndustryId: newStockData.industryId || industries[0]?.IndustryId || 'IND0002',
        Exchange: exchange,
        Liverate: initialPrice,
        CurrentPrice: initialPrice,
        Currency: 'INR',
        DividendYield: parseFloat(newStockData.dividendYield) || 0,
        SuggestedInvestment: 0,
        Capitalization: 'Small cap',
        LastUpdated: getTodayDateOnly(),
      };

      await onAddStock(newStock);
      setIsAddStockOpen(false);
      setNewStockData({
        stockId: '',
        symbol: '',
        mktSymbol: '',
        name: '',
        industryId: industries[0]?.IndustryId || 'IND0002',
        price: '1500.00',
        dividendYield: '1.2',
      });
    } catch (err: any) {
      console.error('Save stock error:', err);
      setAddStockError(err?.message || 'Failed to save stock. Please try again.');
    } finally {
      setIsSavingStock(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="p-2.5 sm:p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl shrink-0">
            <Database className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base sm:text-lg font-bold text-white tracking-tight truncate">
                {spreadsheetName}
              </h2>
              <span className="text-[11px] font-medium text-emerald-400">
                Connected
              </span>
              <span className="text-slate-600">·</span>
              <span className="text-[11px] text-slate-400 font-mono">
                INR (₹)
              </span>
            </div>
            <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-400">
              <a
                href={`https://docs.google.com/spreadsheets/d/${spreadsheetId}`}
                target="_blank"
                rel="noreferrer"
                className="text-cyan-400 hover:text-cyan-300 inline-flex items-center gap-1 hover:underline font-medium text-[11px] sm:text-xs"
              >
                Open in Google Sheets <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        </div>

        {/* Action Buttons: Responsive grid on mobile, flex on tablet/desktop */}
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 w-full lg:w-auto">
          <button
            onClick={() => {
              setPreselectedStockId(undefined);
              setIsPurchaseModalOpen(true);
            }}
            className="px-3.5 py-2.5 sm:py-2 text-xs font-bold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 rounded-xl shadow-lg shadow-emerald-950/40 transition flex items-center justify-center gap-1.5 cursor-pointer touch-manipulation"
          >
            <ShoppingCart className="w-4 h-4" />
            <span>Buy Shares</span>
          </button>
          <button
            onClick={() => {
              setPreselectedPurchaseId(undefined);
              setIsSaleModalOpen(true);
            }}
            className="px-3.5 py-2.5 sm:py-2 text-xs font-bold text-slate-950 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 rounded-xl shadow-lg shadow-amber-950/40 transition flex items-center justify-center gap-1.5 cursor-pointer touch-manipulation"
          >
            <TrendingDown className="w-4 h-4" />
            <span>Record Sale</span>
          </button>
          <button
            onClick={onSimulatePriceTick}
            className="px-3 py-2.5 sm:py-2 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl border border-slate-700 transition flex items-center justify-center gap-1.5 cursor-pointer touch-manipulation"
            title="Tick Market Prices & Update Google Sheets Live"
          >
            <Activity className="w-3.5 h-3.5 text-amber-400" />
            <span>Price Tick</span>
          </button>
          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="px-3 py-2.5 sm:py-2 text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl border border-slate-700 transition disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer touch-manipulation"
            title="Reload from Google Sheets"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-cyan-400' : ''}`} />
            <span>Sync</span>
          </button>
        </div>
      </div>

      {/* Portfolio Summary Component at top of Dashboard */}
      <PortfolioSummary 
        enrichedStocks={enrichedStocks} 
        enrichedSales={enrichedSales} 
      />

      {/* Control Bar: Filters & Tabs */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
        {/* Navigation Tabs - Horizontally scrollable on mobile */}
        <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 p-1 rounded-xl text-xs font-semibold overflow-x-auto no-scrollbar scroll-smooth touch-pan-x">
          <button
            onClick={() => setActiveTab('stocks')}
            className={`px-3.5 py-2 rounded-lg transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeTab === 'stocks'
                ? 'bg-slate-800 text-cyan-400 shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Stocks ({stocks.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('purchases')}
            className={`px-3.5 py-2 rounded-lg transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeTab === 'purchases'
                ? 'bg-slate-800 text-cyan-400 shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <ShoppingCart className="w-3.5 h-3.5" />
            <span>Purchases ({purchases.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('sales')}
            className={`px-3.5 py-2 rounded-lg transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeTab === 'sales'
                ? 'bg-slate-800 text-cyan-400 shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <TrendingDown className="w-3.5 h-3.5 text-amber-400" />
            <span>Sales ({sales.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('dividends')}
            className={`px-3.5 py-2 rounded-lg transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeTab === 'dividends'
                ? 'bg-slate-800 text-emerald-300 shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Receipt className="w-3.5 h-3.5" />
            <span>Dividends ({dividends.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('schema')}
            className={`px-3.5 py-2 rounded-lg transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeTab === 'schema'
                ? 'bg-slate-800 text-cyan-400 shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Sectors ({industries.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('infographics')}
            className={`px-3.5 py-2 rounded-lg transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeTab === 'infographics'
                ? 'bg-slate-800 text-cyan-400 shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>Infographics</span>
          </button>
        </div>

        {/* Filter controls: Fluid on mobile phones and tablets */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          {/* Stock Symbol Filter */}
          <select
            value={selectedStockFilter}
            onChange={e => setSelectedStockFilter(e.target.value)}
            className="w-full sm:w-48 bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs font-medium text-white focus:outline-none focus:border-cyan-500"
          >
            <option value="ALL">All Stocks</option>
            {stocks.map((s, idx) => (
              <option key={`${s.StockId}_${idx}`} value={s.StockId}>
                {s.StockId} • {s.Symbol} — {s.CompanyName}
              </option>
            ))}
          </select>

          {/* Search Box */}
          <div className="relative w-full sm:w-52">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search stocks..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-8 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
            />
          </div>

          <button
            onClick={handleOpenAddStock}
            className="px-3.5 py-2 text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl shadow transition flex items-center justify-center gap-1 cursor-pointer shrink-0"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>Add Stock</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="dashboard-data-scroll bg-slate-900 border border-slate-800 rounded-2xl shadow-xl max-h-[58dvh] overflow-y-auto overscroll-contain">
        {/* TAB 1: MAIN TABLE - STOCKS */}
        {activeTab === 'stocks' && (
          <div>
            <div className="p-3.5 sm:p-4 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-sm sm:text-base font-bold text-white">
                Stocks
              </h3>
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-400">{filteredStocks.length} {filteredStocks.length === 1 ? 'stock' : 'stocks'}</span>
                <CsvExportButton
                  fileName="stocks"
                  records={sortedStocks}
                  columns={[
                    { header: 'Stock ID', value: stock => stock.StockId },
                    { header: 'Symbol', value: stock => stock.Symbol },
                    { header: 'Company Name', value: stock => stock.CompanyName },
                    { header: 'Industry', value: stock => stock.industryName },
                    { header: 'Capitalization', value: stock => stock.Capitalization },
                    { header: 'Price', value: stock => stock.Liverate },
                    { header: 'Quantity', value: stock => stock.totalQuantity },
                    { header: 'Market Value', value: stock => stock.currentHoldingValue },
                    { header: 'Suggested Investment', value: stock => stock.SuggestedInvestment },
                    { header: 'Total Invested', value: stock => stock.cumulativeInvested },
                    { header: 'Total Sales', value: stock => stock.totalSales },
                    { header: 'Average Cost', value: stock => stock.averagePurchasePrice },
                    { header: 'Open Invested', value: stock => stock.totalInvested },
                    { header: 'Unrealized P&L', value: stock => stock.unrealizedGainLoss },
                  ]}
                />
              </div>
            </div>

            {filteredStocks.length === 0 ? (
              <div className="p-12 text-center">
                <Tag className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                <h4 className="text-base font-semibold text-white">No Stocks Found</h4>
                <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                  Add your first stock to the Stocks table to begin tracking.
                </p>
                <button
                  onClick={handleOpenAddStock}
                  className="mt-4 px-4 py-2 text-xs font-semibold text-white bg-cyan-600 hover:bg-cyan-500 rounded-xl cursor-pointer"
                >
                  Add Stock
                </button>
              </div>
            ) : (
              <>
                {/* Mobile Card List (< md screens) */}
                <div className="md:hidden divide-y divide-slate-800">
                  {sortedStocks.map((stock, idx) => {
                    const isProfit = stock.unrealizedGainLoss >= 0;
                    const hasPurchases = stock.totalQuantity > 0;
                    return (
                      <div key={`m_stock_${stock.StockId}_${idx}`} className="p-4 space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-white text-base tracking-tight">{stock.Symbol}</span>
                              <span className="font-mono text-xs font-bold text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded-lg border border-cyan-500/30">
                                {stock.StockId}
                              </span>
                              <button
                                onClick={() => handleOpenEditStock(stock)}
                                className="text-cyan-400 hover:text-cyan-300 p-1 rounded hover:bg-slate-800 cursor-pointer"
                                title="Edit stock"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                            <div className="text-xs text-slate-400 truncate max-w-[200px]">{stock.CompanyName}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-base font-mono font-bold text-emerald-400">
                              {formatINR(stock.Liverate)}
                            </div>
                          </div>
                        </div>

                                        {hasPurchases && (
                                          <div className="grid grid-cols-3 gap-2 p-2.5 rounded-xl bg-slate-950/70 border border-slate-800/80 text-center text-xs">
                            <div>
                              <span className="text-[10px] text-slate-400 block uppercase">Quantity</span>
                              <span className="font-mono font-semibold text-white">{stock.totalQuantity.toLocaleString()}</span>
                            </div>
                            <div>
                              <span className="text-[10px] text-slate-400 block uppercase">Holding Value</span>
                              <span className="font-mono font-semibold text-slate-200">{formatINR(stock.currentHoldingValue)}</span>
                            </div>
                            <div>
                              <span className="text-[10px] text-slate-400 block uppercase">P&L</span>
                              <span className={`font-mono font-bold ${isProfit ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {isProfit ? '+' : ''}{stock.unrealizedGainLossPercent.toFixed(1)}%
                              </span>
                            </div>
                          </div>
                        )}

                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <span className="text-[10px] text-slate-500 block uppercase">Suggested</span>
                            <span className="font-mono font-semibold text-cyan-300">{formatINR(stock.SuggestedInvestment)}</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-500 block uppercase">Capitalization</span>
                            <span className="font-semibold text-slate-200">{stock.Capitalization || 'Unclassified'}</span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between pt-1">
                          <span className="text-[11px] text-slate-500 font-mono">
                            {stock.StockId} • {stock.industryName || 'General'}
                          </span>
                          <button
                            onClick={() => handleOpenPurchaseForStock(stock.StockId)}
                            className="px-3.5 py-1.5 min-h-[36px] text-xs font-bold text-emerald-300 hover:text-white bg-slate-800 hover:bg-emerald-600 rounded-xl border border-slate-700 transition flex items-center gap-1.5 touch-manipulation cursor-pointer"
                          >
                            <ShoppingCart className="w-3.5 h-3.5" />
                            <span>Buy</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Desktop & Tablet Table (>= md screens) */}
                <div ref={stocksTableScrollRef} className="hidden md:block overflow-x-auto -mx-3 sm:mx-0 px-3 sm:px-0">
                  <table className="w-full text-left text-xs whitespace-nowrap">
                  <thead className="bg-slate-950/60 text-slate-400 font-semibold border-b border-slate-800 uppercase tracking-wider">
                    <tr>
                      {sortableHeader('Stock ID', 'StockId')}
                      {sortableHeader('Symbol', 'Symbol')}
                      {sortableHeader('Company Name', 'CompanyName')}
                      {sortableHeader('Industry', 'industryName')}
                      {sortableHeader('Capitalization', 'Capitalization')}
                      {sortableHeader('Price (₹)', 'Liverate', true)}
                      {sortableHeader('Quantity', 'totalQuantity', true)}
                      {sortableHeader('Market Value (₹)', 'currentHoldingValue', true)}
                      {sortableHeader('Suggested Investment (₹)', 'SuggestedInvestment', true)}
                      {sortableHeader('Total Invested (₹)', 'cumulativeInvested', true)}
                      {sortableHeader('Total Sales (₹)', 'totalSales', true)}
                      {sortableHeader('Avg Cost (₹)', 'averagePurchasePrice', true)}
                      {sortableHeader('Open Invested (₹)', 'totalInvested', true)}
                      {sortableHeader('Profit / Loss', 'unrealizedGainLoss', true)}
                      <th className="py-3 px-4 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-medium">
                    {sortedStocks.map((stock, idx) => {
                      const isProfit = stock.unrealizedGainLoss >= 0;
                      const hasPurchases = stock.totalQuantity > 0;
                      const hasPurchaseHistory = stock.purchaseCount > 0;

                      return (
                        <tr key={`${stock.StockId}_${idx}`} className="hover:bg-slate-800/40 transition group">
                          {/* StockId Clickable Button -> opens Edit Mode */}
                          <td className="py-3 px-4">
                            <button
                              onClick={() => handleOpenEditStock(stock)}
                              title="Click to edit stock details"
                              className="font-mono font-bold text-cyan-400 hover:text-cyan-200 bg-cyan-500/10 hover:bg-cyan-500/20 px-2 py-1 rounded-lg border border-cyan-500/30 flex items-center gap-1.5 transition cursor-pointer group-hover:border-cyan-400"
                            >
                              <Edit3 className="w-3 h-3 opacity-70 group-hover:opacity-100" />
                              <span>{stock.StockId}</span>
                            </button>
                          </td>

                          {/* Symbol Clickable Button -> opens Edit Mode */}
                          <td className="py-3 px-4">
                            <button
                              onClick={() => handleOpenEditStock(stock)}
                              title="Click to edit stock details"
                              className="font-bold text-white hover:text-cyan-300 text-sm tracking-tight flex items-center gap-1.5 transition cursor-pointer hover:underline"
                            >
                              <span>{stock.Symbol}</span>
                              <Edit3 className="w-3 h-3 text-slate-500 group-hover:text-cyan-400 opacity-60" />
                            </button>
                          </td>

                          <td className="py-3 px-4 font-semibold text-slate-200">
                            {stock.CompanyName}
                          </td>

                          {/* Industry Name joined from Industry table */}
                          <td className="py-3 px-4">
                            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-800 text-cyan-300 border border-slate-700/80">
                              {stock.industryName || 'General'}
                            </span>
                            <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                              {stock.IndustryId}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-xs font-semibold text-slate-200">
                            {stock.Capitalization || 'Unclassified'}
                          </td>

                          <td className="py-3 px-4 text-right font-mono font-bold text-emerald-400 text-sm">
                            <div className="flex items-center justify-end gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                              <span>{formatINR(stock.Liverate)}</span>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-semibold text-white">
                            {stock.totalQuantity.toLocaleString()}
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-white font-bold text-sm">
                            {hasPurchases ? formatINR(stock.currentHoldingValue) : '₹0.00'}
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-cyan-300 font-semibold">
                            {formatINR(stock.SuggestedInvestment)}
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-slate-200 font-semibold">
                            {hasPurchaseHistory ? formatINR(stock.cumulativeInvested) : '—'}
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-amber-300 font-semibold">
                            {stock.saleCount > 0 ? formatINR(stock.totalSales) : '—'}
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-slate-300">
                            {hasPurchaseHistory ? formatINR(stock.averagePurchasePrice) : '—'}
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-slate-200 font-semibold">
                            {hasPurchaseHistory ? formatINR(stock.totalInvested) : '—'}
                          </td>
                          <td className="py-3 px-4 text-right">
                            {hasPurchases ? (
                              <div>
                                <div className={`font-bold flex items-center justify-end gap-0.5 font-mono ${isProfit ? 'text-emerald-400' : 'text-rose-400'}`}>
                                  {isProfit ? '+' : ''}{formatINR(stock.unrealizedGainLoss)}
                                </div>
                                <div className={`text-[11px] ${isProfit ? 'text-emerald-500' : 'text-rose-500'}`}>
                                  {isProfit ? '+' : ''}{stock.unrealizedGainLossPercent.toFixed(2)}%
                                </div>
                              </div>
                            ) : (
                              <span className="text-slate-500">No purchases</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <button
                              onClick={() => handleOpenPurchaseForStock(stock.StockId)}
                              className="px-2.5 py-1 text-[11px] font-semibold text-emerald-300 hover:text-white bg-slate-800 hover:bg-emerald-600 rounded-lg border border-slate-700 transition flex items-center gap-1 mx-auto cursor-pointer"
                            >
                              <ShoppingCart className="w-3 h-3" />
                              Buy ({stock.Symbol})
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

        {/* TAB 2: PURCHASES LEDGER */}
        {activeTab === 'purchases' && (
          <div>
            <div className="p-3.5 sm:p-4 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-sm sm:text-base font-bold text-white">
                Purchases
              </h3>
              <div className="text-xs text-slate-400">
                {filteredPurchases.length} {filteredPurchases.length === 1 ? 'record' : 'records'}
              </div>
            </div>

            {filteredPurchases.length === 0 ? (
              <div className="p-12 text-center">
                <ShoppingCart className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                <h4 className="text-base font-semibold text-white">No Purchases Found</h4>
                <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                  Click "Buy Shares" to record your first stock purchase.
                </p>
              </div>
            ) : (
              <>
                {/* Mobile Card List (< md screens) */}
                <div className="p-3 sm:p-4">
                  <FinancialYearTree
                    records={filteredPurchases}
                    getKey={purchase => purchase.PurchaseId}
                    getDate={purchase => purchase.PurchaseDate}
                    getAmount={purchase => purchase.TotalAmount || purchase.Quantity * purchase.PurchasePrice}
                    totalLabel="Total purchases"
                    emptyMessage="No purchase records in a valid date range."
                    exportFileName="purchases"
                    exportColumns={[
                      { header: 'Purchase ID', value: purchase => purchase.PurchaseId },
                      { header: 'Stock ID', value: purchase => purchase.StockId },
                      { header: 'Symbol', value: purchase => purchase.symbol },
                      { header: 'Date', value: purchase => purchase.PurchaseDate },
                      { header: 'Quantity', value: purchase => purchase.Quantity },
                      { header: 'Sold Quantity', value: purchase => purchase.soldQuantity },
                      { header: 'Remaining Quantity', value: purchase => purchase.remainingQuantity },
                      { header: 'Purchase Price', value: purchase => purchase.PurchasePrice },
                      { header: 'Total Amount', value: purchase => purchase.TotalAmount },
                      { header: 'Current Value', value: purchase => purchase.currentValue },
                      { header: 'Unrealized P&L', value: purchase => purchase.gainLoss },
                    ]}
                    renderRecord={purchase => {
                      const hasAvailable = purchase.remainingQuantity > 0;
                      const isProfit = purchase.gainLoss >= 0;
                      return (
                        <div className="grid grid-cols-2 items-center gap-x-3 gap-y-2 px-3 py-3 sm:grid-cols-[minmax(105px,0.8fr)_minmax(130px,1.2fr)_repeat(4,minmax(90px,0.8fr))_auto] sm:px-4">
                          <button
                            type="button"
                            onClick={() => { setEditingPurchase(purchase); setIsEditPurchaseOpen(true); }}
                            className="text-left font-mono text-xs font-bold text-amber-400 hover:underline"
                            title={`Edit purchase ${purchase.PurchaseId}`}
                          >
                            {purchase.PurchaseId}
                          </button>
                          <span className="min-w-0 truncate text-xs font-semibold text-white" title={`${purchase.symbol} (${purchase.StockId})`}>
                            {purchase.symbol} <span className="font-mono font-normal text-slate-500">{purchase.StockId}</span>
                          </span>
                          <span className="text-right font-mono text-[11px] text-slate-300">{purchase.remainingQuantity}/{purchase.Quantity} held</span>
                          <span className="text-right font-mono text-[11px] text-slate-300">Buy {formatINR(purchase.PurchasePrice)}</span>
                          <span className="text-right font-mono text-[11px] text-slate-200">Cost {formatINR(purchase.TotalAmount)}</span>
                          <span className={`text-right font-mono text-[11px] ${isProfit ? 'text-emerald-300' : 'text-rose-300'}`}>
                            P&L {formatINR(purchase.gainLoss)}
                          </span>
                          {hasAvailable ? (
                            <button
                              type="button"
                              onClick={() => handleOpenSaleForPurchase(purchase.PurchaseId)}
                              className="col-span-2 justify-self-end rounded-lg bg-amber-400 px-2.5 py-1.5 text-[11px] font-bold text-slate-950 hover:bg-amber-300 sm:col-span-1"
                            >
                              Sell lot
                            </button>
                          ) : <span className="col-span-2 justify-self-end text-[10px] text-slate-500 sm:col-span-1">Fully sold</span>}
                        </div>
                      );
                    }}
                  />
                </div>
                <div className="hidden md:hidden divide-y divide-slate-800">
                  {filteredPurchases.map((p, idx) => {
                    const isProfit = p.gainLoss >= 0;
                    const hasAvailable = p.remainingQuantity > 0;
                    return (
                      <div key={`m_purchase_${p.PurchaseId}_${idx}`} className="p-4 space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingPurchase(p);
                                  setIsEditPurchaseOpen(true);
                                }}
                                className="font-mono font-bold text-amber-400 text-xs hover:underline cursor-pointer"
                                title={`Edit purchase ${p.PurchaseId}`}
                              >
                                {p.PurchaseId}
                              </button>
                              <span className="font-mono text-[11px] font-bold text-cyan-400 bg-cyan-500/10 px-1.5 py-0.5 rounded border border-cyan-500/20">
                                {p.StockId}
                              </span>
                              <span className="font-bold text-white text-sm">{p.symbol}</span>
                            </div>
                            <div className="text-xs text-slate-400 truncate max-w-[200px]">{p.companyName}</div>
                          </div>
                          <div className="text-right">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingPurchase(p);
                                setIsEditPurchaseOpen(true);
                              }}
                              className="text-xs text-cyan-400 underline decoration-cyan-500/40 block hover:text-cyan-300 cursor-pointer"
                              title={`Edit purchase ${p.PurchaseId}`}
                            >
                              {new Date(p.PurchaseDate).toLocaleDateString()}
                            </button>
                            <span className={`text-xs font-mono font-bold ${isProfit ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {isProfit ? '+' : ''}{p.gainLossPercent.toFixed(1)}%
                            </span>
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-2 p-2.5 rounded-xl bg-slate-950/70 border border-slate-800/80 text-center text-xs">
                          <div>
                            <span className="text-[10px] text-slate-400 block uppercase">Available</span>
                            <span className={`font-mono font-bold ${hasAvailable ? 'text-emerald-400' : 'text-slate-500'}`}>
                              {p.remainingQuantity} / {p.Quantity}
                            </span>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-400 block uppercase">Buy Price</span>
                            <span className="font-mono font-semibold text-slate-200">{formatINR(p.PurchasePrice)}</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-400 block uppercase">Total Cost</span>
                            <span className="font-mono font-bold text-white">{formatINR(p.TotalAmount)}</span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between pt-1">
                          <span className="text-xs font-mono text-emerald-400 font-semibold">
                            Value: {formatINR(p.currentValue)}
                          </span>
                          {hasAvailable ? (
                            <button
                              onClick={() => handleOpenSaleForPurchase(p.PurchaseId)}
                              className="px-3.5 py-1.5 min-h-[36px] text-xs font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-xl transition flex items-center gap-1.5 touch-manipulation cursor-pointer shadow"
                            >
                              <TrendingDown className="w-3.5 h-3.5" />
                              <span>Sell Lot</span>
                            </button>
                          ) : (
                            <span className="px-2 py-1 rounded text-[11px] font-semibold bg-slate-800 text-slate-500 border border-slate-700/50">
                              Fully Sold
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Desktop & Tablet Table (>= md screens) */}
                <div ref={purchasesTableScrollRef} className="hidden md:hidden overflow-x-auto -mx-3 sm:mx-0 px-3 sm:px-0">
                  <table className="w-full text-left text-xs whitespace-nowrap">
                    <thead className="bg-slate-950/60 text-slate-400 font-semibold border-b border-slate-800 uppercase tracking-wider">
                      <tr>
                        <th className="py-3 px-4">Purchase ID</th>
                        <th className="py-3 px-4">Stock ID</th>
                        <th className="py-3 px-4">Symbol</th>
                        <th className="py-3 px-4">Date</th>
                        <th className="py-3 px-4 text-right">Bought</th>
                        <th className="py-3 px-4 text-right">Sold</th>
                        <th className="py-3 px-4 text-right">Available</th>
                        <th className="py-3 px-4 text-right">Buy Price</th>
                        <th className="py-3 px-4 text-right">Total Cost</th>
                        <th className="py-3 px-4 text-right">Current Value</th>
                        <th className="py-3 px-4 text-right">Unrealized P&L</th>
                        <th className="py-3 px-4 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-medium">
                      {filteredPurchases.map((p, idx) => {
                        const isProfit = p.gainLoss >= 0;
                        const hasAvailable = p.remainingQuantity > 0;
                        return (
                          <tr key={`${p.PurchaseId}_${idx}`} className="hover:bg-slate-800/40 transition">
                            <td className="py-3 px-4 font-mono font-bold text-amber-400">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingPurchase(p);
                                  setIsEditPurchaseOpen(true);
                                }}
                                className="hover:underline hover:text-amber-300 cursor-pointer"
                                title={`Edit purchase lot ${p.PurchaseId}`}
                              >
                                {p.PurchaseId}
                              </button>
                            </td>
                            <td className="py-3 px-4 font-mono text-cyan-400 font-semibold">
                              {p.StockId}
                            </td>
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-1.5 font-bold text-white text-sm">
                                <Tag className="w-3.5 h-3.5 text-cyan-400" />
                                {p.symbol}
                              </div>
                              <div className="text-[11px] text-slate-400">{p.companyName}</div>
                            </td>
                            <td className="py-3 px-4 text-slate-400 whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingPurchase(p);
                                  setIsEditPurchaseOpen(true);
                                }}
                                className="hover:underline hover:text-cyan-300 text-cyan-400/90 cursor-pointer flex items-center gap-1.5"
                                title={`Edit purchase lot ${p.PurchaseId}`}
                              >
                                <Calendar className="w-3.5 h-3.5 text-cyan-400" />
                                <span>{new Date(p.PurchaseDate).toLocaleDateString()}</span>
                              </button>
                            </td>
                            <td className="py-3 px-4 text-right font-mono text-slate-300">
                              {p.Quantity.toLocaleString()}
                            </td>
                            <td className="py-3 px-4 text-right font-mono text-amber-400">
                              {p.soldQuantity > 0 ? p.soldQuantity.toLocaleString() : '0'}
                            </td>
                            <td className="py-3 px-4 text-right font-mono font-bold">
                              <span className={hasAvailable ? 'text-emerald-400' : 'text-slate-500'}>
                                {p.remainingQuantity.toLocaleString()}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right font-mono text-slate-300">
                              {formatINR(p.PurchasePrice)}
                            </td>
                            <td className="py-3 px-4 text-right font-mono font-bold text-white">
                              {formatINR(p.TotalAmount)}
                            </td>
                            <td className="py-3 px-4 text-right font-mono font-bold text-emerald-400">
                              {formatINR(p.currentValue)}
                            </td>
                            <td className="py-3 px-4 text-right">
                              <div className={`font-bold flex items-center justify-end gap-0.5 font-mono ${isProfit ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {isProfit ? '+' : ''}{formatINR(p.gainLoss)}
                              </div>
                              <div className={`text-[11px] ${isProfit ? 'text-emerald-500' : 'text-rose-500'}`}>
                                {isProfit ? '+' : ''}{p.gainLossPercent.toFixed(2)}%
                              </div>
                            </td>
                            <td className="py-3 px-4 text-center">
                              {hasAvailable ? (
                                <button
                                  onClick={() => handleOpenSaleForPurchase(p.PurchaseId)}
                                  className="px-2.5 py-1 text-[11px] font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-lg transition flex items-center gap-1 mx-auto cursor-pointer shadow"
                                  title={`Sell shares from ${p.PurchaseId}`}
                                >
                                  <TrendingDown className="w-3 h-3" />
                                  Sell Lot
                                </button>
                              ) : (
                                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-800 text-slate-500 border border-slate-700/50">
                                  Fully Sold
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}

        {/* TAB 3: SALES LEDGER */}
        {activeTab === 'sales' && (
          <div>
            <div className="p-3.5 sm:p-4 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-sm sm:text-base font-bold text-white">
                Sales
              </h3>
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-400">{filteredSales.length} {filteredSales.length === 1 ? 'record' : 'records'}</span>
                <CsvExportButton
                  fileName="sales"
                  records={filteredSales}
                  columns={[
                    { header: 'Sale ID', value: sale => sale.SaleId },
                    { header: 'Purchase ID', value: sale => sale.PurchaseId },
                    { header: 'Stock ID', value: sale => sale.StockId },
                    { header: 'Symbol', value: sale => sale.symbol },
                    { header: 'Date', value: sale => sale.SaleDate },
                    { header: 'Quantity', value: sale => sale.Quantity },
                    { header: 'Sale Price', value: sale => sale.SalePrice },
                    { header: 'Gross Amount', value: sale => sale.grossAmount },
                    { header: 'Net Proceeds', value: sale => sale.netAmount },
                    { header: 'Realized P&L', value: sale => sale.realizedGainLoss },
                    { header: 'Notes', value: sale => sale.Notes },
                  ]}
                />
              </div>
            </div>

            {filteredSales.length === 0 ? (
              <div className="p-12 text-center">
                <Receipt className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                <h4 className="text-base font-semibold text-white">No Sales Recorded</h4>
                <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                  Click "Record Sale" to add a transaction.
                </p>
                <button
                  onClick={() => {
                    setPreselectedPurchaseId(undefined);
                    setIsSaleModalOpen(true);
                  }}
                  className="mt-4 px-4 py-2 text-xs font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-xl cursor-pointer"
                >
                  Record Sale
                </button>
              </div>
            ) : (
              <>
                <div className="p-3 sm:p-4">
                  <FinancialYearTree
                    records={filteredSales}
                    getKey={sale => sale.SaleId || sale.SalesId}
                    getDate={sale => sale.SaleDate}
                    getAmount={sale => sale.TotalAmount || sale.Quantity * sale.SalePrice}
                    totalLabel="Total sales"
                    emptyMessage="No sale records in a valid date range."
                    exportFileName="sales"
                    exportColumns={[
                      { header: 'Sale ID', value: sale => sale.SaleId },
                      { header: 'Purchase ID', value: sale => sale.PurchaseId },
                      { header: 'Stock ID', value: sale => sale.StockId },
                      { header: 'Symbol', value: sale => sale.symbol },
                      { header: 'Date', value: sale => sale.SaleDate },
                      { header: 'Quantity', value: sale => sale.Quantity },
                      { header: 'Sale Price', value: sale => sale.SalePrice },
                      { header: 'Gross Amount', value: sale => sale.grossAmount },
                      { header: 'Net Proceeds', value: sale => sale.netAmount },
                      { header: 'Realized P&L', value: sale => sale.realizedGainLoss },
                      { header: 'Notes', value: sale => sale.Notes },
                    ]}
                    renderRecord={sale => {
                      const activeSaleId = sale.SaleId || sale.SalesId;
                      const isProfit = sale.realizedGainLoss >= 0;
                      return (
                        <div className="grid grid-cols-2 items-center gap-x-3 gap-y-2 px-3 py-3 sm:grid-cols-[minmax(105px,0.8fr)_minmax(130px,1.2fr)_repeat(4,minmax(90px,0.8fr))_auto] sm:px-4">
                          <button
                            type="button"
                            onClick={() => handleOpenEditSale(sale)}
                            className="text-left font-mono text-xs font-bold text-amber-400 hover:underline"
                            title={`Edit sale ${activeSaleId}`}
                          >
                            {activeSaleId}
                          </button>
                          <span className="min-w-0 truncate text-xs font-semibold text-white" title={`${sale.symbol} (${sale.StockId})`}>
                            {sale.symbol} <span className="font-mono font-normal text-slate-500">{sale.StockId}</span>
                          </span>
                          <span className="text-right font-mono text-[11px] text-slate-300">Lot {sale.PurchaseId}</span>
                          <span className="text-right font-mono text-[11px] text-slate-300">{sale.Quantity} × {formatINR(sale.SalePrice)}</span>
                          <span className="text-right font-mono text-[11px] text-slate-200">Gross {formatINR(sale.grossAmount)}</span>
                          <span className={`text-right font-mono text-[11px] ${isProfit ? 'text-emerald-300' : 'text-rose-300'}`}>
                            P&L {formatINR(sale.realizedGainLoss)}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleOpenEditSale(sale)}
                            className="col-span-2 justify-self-end rounded-lg border border-amber-800/60 bg-amber-950/60 px-2.5 py-1.5 text-[11px] font-semibold text-amber-300 hover:bg-amber-900/60 sm:col-span-1"
                          >
                            Edit sale
                          </button>
                        </div>
                      );
                    }}
                  />
                </div>
                {/* Mobile Card List (< md screens) */}
                <div className="hidden md:hidden divide-y divide-slate-800">
                  {filteredSales.map((s, idx) => {
                    const isProfit = s.realizedGainLoss >= 0;
                    const activeId = s.SalesId || s.SaleId;
                    return (
                      <div key={`m_sale_${activeId}_${idx}`} className="p-4 space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono font-bold text-amber-400 text-xs">{activeId}</span>
                              <span className="font-mono text-[11px] font-bold text-cyan-400 bg-cyan-500/10 px-1.5 py-0.5 rounded border border-cyan-500/20">
                                {s.StockId}
                              </span>
                              <span className="font-bold text-white text-sm">{s.symbol}</span>
                            </div>
                            <div className="text-xs text-slate-400">
                              Lot: <span className="font-mono text-cyan-400 font-semibold">{s.PurchaseId}</span>
                            </div>
                          </div>
                          <div className="text-right">
                            <span className="text-xs text-slate-400 block">{new Date(s.SaleDate).toLocaleDateString()}</span>
                            <div className={`text-xs font-mono font-bold ${isProfit ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {isProfit ? '+' : ''}{formatINR(s.realizedGainLoss)}
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-2 p-2.5 rounded-xl bg-slate-950/70 border border-slate-800/80 text-center text-xs">
                          <div>
                            <span className="text-[10px] text-slate-400 block uppercase">Sold</span>
                            <span className="font-mono font-bold text-white">{s.Quantity.toLocaleString()}</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-400 block uppercase">Rate (₹)</span>
                            <span className="font-mono font-bold text-emerald-400">{formatINR(s.Rate !== undefined ? s.Rate : s.SalePrice)}</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-400 block uppercase">Net</span>
                            <span className="font-mono font-bold text-white">{formatINR(s.netAmount)}</span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between pt-1">
                          <span className="text-xs text-slate-400 truncate max-w-[200px]">
                            {s.Notes || 'No notes'}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleOpenEditSale(s)}
                            className="px-3.5 py-1.5 min-h-[36px] text-xs font-bold text-amber-400 hover:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded-xl transition inline-flex items-center gap-1.5 cursor-pointer touch-manipulation"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            <span>Edit</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Desktop & Tablet Table (>= md screens) */}
                <div ref={salesTableScrollRef} className="hidden md:hidden overflow-x-auto -mx-3 sm:mx-0 px-3 sm:px-0">
                  <table className="w-full text-left text-xs whitespace-nowrap">
                    <thead className="bg-slate-950/60 text-slate-400 font-semibold border-b border-slate-800 uppercase tracking-wider">
                      <tr>
                        <th className="py-3 px-4">Sales ID</th>
                        <th className="py-3 px-4">Purchase ID</th>
                        <th className="py-3 px-4">Stock ID</th>
                        <th className="py-3 px-4">Symbol</th>
                        <th className="py-3 px-4">Date</th>
                        <th className="py-3 px-4 text-right">Shares Sold</th>
                        <th className="py-3 px-4 text-right">Rate (₹)</th>
                        <th className="py-3 px-4 text-right">Buy Price (₹)</th>
                        <th className="py-3 px-4 text-right">Cost Basis (₹)</th>
                        <th className="py-3 px-4 text-right">Net Proceeds (₹)</th>
                        <th className="py-3 px-4 text-right">Realized P&L</th>
                        <th className="py-3 px-4">Notes</th>
                        <th className="py-3 px-4 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-medium">
                      {filteredSales.map((s, idx) => {
                        const isProfit = s.realizedGainLoss >= 0;
                        const salesForThisLot = sales.filter(item => item.PurchaseId.trim().toUpperCase() === s.PurchaseId.trim().toUpperCase());
                        const hasMultipleSales = salesForThisLot.length > 1;
                        const lotIndex = salesForThisLot.findIndex(item => item.SaleId.trim().toUpperCase() === s.SaleId.trim().toUpperCase()) + 1;
                        const activeId = s.SalesId || s.SaleId;

                        return (
                          <tr key={`${activeId}_${idx}`} className="hover:bg-slate-800/40 transition">
                            <td className="py-3 px-4 font-mono font-bold">
                              <button
                                type="button"
                                onClick={() => handleOpenEditSale(s)}
                                className="inline-flex items-center gap-1.5 text-amber-400 hover:text-amber-300 font-mono font-bold hover:underline cursor-pointer group"
                                title={`Click to open sale ${activeId} in edit mode`}
                              >
                                <span>{activeId}</span>
                                <Edit3 className="w-3.5 h-3.5 text-amber-500/60 group-hover:text-amber-300 transition-colors" />
                              </button>
                            </td>
                            <td className="py-3 px-4 font-mono text-cyan-400 font-semibold">
                              <div className="flex flex-col">
                                <span>{s.PurchaseId}</span>
                                {hasMultipleSales && (
                                  <span className="text-[10px] text-cyan-400/80 font-normal">
                                    Lot sale {lotIndex} of {salesForThisLot.length}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-3 px-4 font-mono text-cyan-400 font-semibold">
                              {s.StockId}
                            </td>
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-1.5 font-bold text-white text-sm">
                                <Tag className="w-3.5 h-3.5 text-cyan-400" />
                                <span className="text-cyan-300 font-mono">{s.symbol}</span>
                              </div>
                              <div className="text-[11px] text-slate-400">{s.companyName}</div>
                            </td>
                            <td className="py-3 px-4 text-slate-400 whitespace-nowrap">
                              {new Date(s.SaleDate).toLocaleDateString()}
                            </td>
                            <td className="py-3 px-4 text-right font-mono text-white font-bold">
                              {s.Quantity.toLocaleString()}
                            </td>
                            <td className="py-3 px-4 text-right font-mono text-emerald-400 font-bold">
                              {formatINR(s.Rate !== undefined ? s.Rate : s.SalePrice)}
                            </td>
                            <td className="py-3 px-4 text-right font-mono text-slate-400">
                              {formatINR(s.purchasePrice)}
                            </td>
                            <td className="py-3 px-4 text-right font-mono text-slate-300">
                              {formatINR(s.costBasis)}
                            </td>
                            <td className="py-3 px-4 text-right font-mono font-bold text-white">
                              {formatINR(s.netAmount)}
                            </td>
                            <td className="py-3 px-4 text-right">
                              <div className={`font-bold flex items-center justify-end gap-0.5 font-mono ${isProfit ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {isProfit ? '+' : ''}{formatINR(s.realizedGainLoss)}
                              </div>
                              <div className={`text-[11px] font-mono ${isProfit ? 'text-emerald-500' : 'text-rose-500'}`}>
                                {isProfit ? '+' : ''}{s.realizedGainLossPercent.toFixed(2)}%
                              </div>
                            </td>
                            <td className="py-3 px-4 text-slate-400 max-w-xs truncate" title={s.Notes}>
                              {s.Notes || '—'}
                            </td>
                            <td className="py-3 px-4 text-center">
                              <button
                                type="button"
                                onClick={() => handleOpenEditSale(s)}
                                className="px-2.5 py-1 text-[11px] font-bold text-amber-400 hover:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded-lg transition inline-flex items-center gap-1 cursor-pointer"
                                title={`Edit sale ${activeId}`}
                              >
                                <Edit3 className="w-3 h-3" />
                                <span>Edit</span>
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === 'dividends' && (
          <div>
            <div className="p-3.5 sm:p-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm sm:text-base font-bold text-white">Dividends</h3>
                <p className="text-xs text-slate-400 mt-1">Import dividend records from a CSV file. Dates are read as MM-DD-YYYY.</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-400">{dividends.length} records</span>
                <CsvExportButton
                  fileName="dividends"
                  records={sortedDividends}
                  columns={[
                    { header: 'Dividend ID', value: dividend => dividend.DividendId },
                    { header: 'Stock ID', value: dividend => dividend.StockId },
                    { header: 'Symbol', value: dividend => stocks.find(stock => stock.StockId.toUpperCase() === dividend.StockId.toUpperCase())?.Symbol || '' },
                    { header: 'Date', value: dividend => dividend.Date },
                    { header: 'Quantity', value: dividend => dividend.Quantity },
                    { header: 'Per Share', value: dividend => dividend.PerStock },
                    { header: 'Total Dividend', value: dividend => dividend.TotalDividend },
                  ]}
                />
                <input
                  ref={dividendFileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={handleDividendFileChange}
                />
                <button
                  type="button"
                  onClick={() => dividendFileInputRef.current?.click()}
                  disabled={isImportingDividends}
                  className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                >
                  <Upload className="h-4 w-4" />
                  {isImportingDividends ? 'Importing...' : 'Import CSV'}
                </button>
              </div>
            </div>

            {dividendImportMessage && (
              <div className="border-b border-slate-800 bg-slate-950/70 px-4 py-3 text-xs text-cyan-200" role="status">
                {dividendImportMessage}
              </div>
            )}

            {sortedDividends.length === 0 ? (
              <div className="p-12 text-center">
                <Receipt className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                <h4 className="text-sm font-semibold text-white">No dividend records</h4>
                <p className="text-xs text-slate-400 mt-1">Import Dividends.csv to add dividend history to matching stocks.</p>
              </div>
            ) : (
              <div className="space-y-3 p-3 sm:p-4">
                <div className="flex items-center justify-between rounded-lg border border-emerald-900/70 bg-emerald-950/30 px-4 py-3">
                  <span className="text-xs font-semibold uppercase text-emerald-200">All-time dividend total</span>
                  <span className="font-mono text-sm font-bold text-emerald-300">{formatINR(totalDividendIncome)}</span>
                </div>
                <div className="space-y-2">
                  {financialYearGroups.map(([yearStart, yearGroup]) => (
                    <details key={yearStart} className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950/40">
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 hover:bg-slate-800/50">
                        <span className="font-semibold text-white">{yearGroup.financialYear}</span>
                        <span className="font-mono text-sm font-bold text-emerald-300">{formatINR(yearGroup.total)}</span>
                      </summary>
                      <div className="space-y-2 border-t border-slate-800 p-3 sm:p-4">
                        {[...yearGroup.months.entries()].sort((left, right) => right[0].localeCompare(left[0])).map(([monthKey, monthGroup]) => (
                          <details key={`${yearStart}-${monthKey}`} className="overflow-hidden rounded-lg border border-slate-800/80 bg-slate-900/60">
                            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 hover:bg-slate-800/50">
                              <span className="text-sm font-medium text-slate-200">{monthGroup.label}</span>
                              <span className="font-mono text-xs font-semibold text-cyan-300">{formatINR(monthGroup.total)}</span>
                            </summary>
                            <div className="divide-y divide-slate-800/70 border-t border-slate-800/80">
                              {monthGroup.records.map(dividend => {
                                const stock = stocks.find(item => item.StockId.trim().toUpperCase() === dividend.StockId.trim().toUpperCase());
                                return (
                                  <div key={dividend.DividendId} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 px-3 py-2.5 sm:grid-cols-[minmax(100px,1fr)_minmax(100px,1.5fr)_auto_auto_auto] sm:px-4">
                                    <span className="text-xs text-slate-400">{dividend.Date}</span>
                                    <span className="min-w-0 truncate text-xs font-semibold text-white" title={`${stock?.Symbol || 'Unknown stock'} (${dividend.StockId})`}>
                                      {stock?.Symbol || 'Unknown stock'} <span className="font-mono font-normal text-slate-500">{dividend.StockId}</span>
                                    </span>
                                    <span className="text-right font-mono text-[11px] text-slate-400">{dividend.Quantity.toLocaleString()} shares</span>
                                    <span className="text-right font-mono text-[11px] text-slate-300">{formatINR(dividend.PerStock)} / share</span>
                                    <span className="col-span-2 text-right font-mono text-xs font-semibold text-emerald-300 sm:col-span-1">{formatINR(dividend.TotalDividend)}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </details>
                        ))}
                      </div>
                    </details>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 4: SECTORS OVERVIEW */}
        {activeTab === 'schema' && (
          <div className="p-4 sm:p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <div>
                <h3 className="text-base sm:text-lg font-bold text-white tracking-tight">Industry Sectors</h3>
                <p className="text-xs text-slate-400">
                  Portfolio distribution across sectors
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs font-mono text-slate-400">{industries.length} sectors • {stocks.length} stocks</span>
                <CsvExportButton
                  fileName="industry-summary"
                  records={industries}
                  columns={[
                    { header: 'Industry ID', value: industry => industry.IndustryId },
                    { header: 'Industry', value: industry => industry.Name },
                    { header: 'Suggested %', value: industry => industry.Suggested },
                    { header: 'Stocks', value: industry => enrichedStocks.filter(stock => stock.IndustryId.toUpperCase() === industry.IndustryId.toUpperCase()).length },
                    { header: 'Current Market Value', value: industry => enrichedStocks.filter(stock => stock.IndustryId.toUpperCase() === industry.IndustryId.toUpperCase()).reduce((sum, stock) => sum + stock.currentHoldingValue, 0) },
                    { header: 'Open Invested', value: industry => enrichedStocks.filter(stock => stock.IndustryId.toUpperCase() === industry.IndustryId.toUpperCase()).reduce((sum, stock) => sum + stock.totalInvested, 0) },
                  ]}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {industries.map(ind => {
                const sectorStocks = enrichedStocks.filter(
                  s => (s.IndustryId || '').trim().toUpperCase() === ind.IndustryId.trim().toUpperCase()
                );
                const sectorValue = sectorStocks.reduce((sum, s) => sum + s.currentHoldingValue, 0);
                const sectorInvested = sectorStocks.reduce((sum, s) => sum + s.totalInvested, 0);
                const sectorGain = sectorValue - sectorInvested;
                const allocation = totalCurrentValue > 0 ? (sectorValue / totalCurrentValue) * 100 : 0;

                return (
                  <div 
                    key={ind.IndustryId}
                    className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 hover:border-slate-700 transition flex flex-col justify-between space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-sm font-bold text-white">{ind.Name}</h4>
                        <span className="text-[11px] font-mono text-cyan-400">{ind.IndustryId}</span>
                      </div>
                      <span className="px-2 py-0.5 rounded text-xs font-mono font-bold bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
                        {allocation.toFixed(1)}%
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-slate-800/80">
                      <div>
                        <span className="text-[10px] text-slate-400 block uppercase">Stocks</span>
                        <span className="font-semibold text-white">{sectorStocks.length}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block uppercase">Market Value</span>
                        <span className="font-mono font-semibold text-emerald-400">{formatINR(sectorValue)}</span>
                      </div>
                    </div>

                    {sectorStocks.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {sectorStocks.map(stk => (
                          <span 
                            key={stk.StockId}
                            className="px-2 py-0.5 rounded text-[11px] font-mono bg-slate-900 border border-slate-800 text-slate-300"
                          >
                            {stk.Symbol}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {activeTab === 'infographics' && (
          <React.Suspense fallback={<div className="p-6 text-xs text-slate-400">Loading portfolio charts...</div>}>
            <PortfolioInfographics stocks={enrichedStocks} industries={industries} dividends={dividends} />
          </React.Suspense>
        )}
        {(activeTab === 'stocks' || activeTab === 'purchases' || activeTab === 'sales') && (
          <DashboardHorizontalScrollBar
            key={activeTab}
            targetRef={
              activeTab === 'stocks'
                ? stocksTableScrollRef
                : activeTab === 'purchases'
                  ? purchasesTableScrollRef
                  : salesTableScrollRef
            }
          />
        )}
      </div>

      {/* Purchase Modal Form (Fast Direct Save) */}
      <PurchaseModal
        isOpen={isPurchaseModalOpen}
        onClose={() => setIsPurchaseModalOpen(false)}
        stocks={stocks}
        purchases={purchases}
        initialStockId={preselectedStockId}
        onRequestSubmit={onExecutePurchase}
      />

      {/* Add Sale Modal Form */}
      <AddSaleModal
        isOpen={isSaleModalOpen}
        onClose={() => {
          setIsSaleModalOpen(false);
          setPreselectedPurchaseId(undefined);
        }}
        purchases={enrichedPurchases}
        stocks={stocks}
        sales={sales}
        initialPurchaseId={preselectedPurchaseId}
        onExecuteSale={onExecuteSale}
      />

      {/* Edit Sale Modal (Triggered by clicking SaleId or Edit button) */}
      <EditSaleModal
        isOpen={isEditSaleOpen}
        onClose={() => {
          setIsEditSaleOpen(false);
          setEditingSale(null);
        }}
        sale={editingSale}
        purchases={enrichedPurchases}
        stocks={stocks}
        allSales={sales}
        onUpdateSale={onUpdateSale}
      />

      {/* Edit Stock Modal (Triggered by clicking StockId or Symbol) */}
      <EditStockModal
        isOpen={isEditStockOpen}
        onClose={() => {
          setIsEditStockOpen(false);
          setEditingStock(null);
        }}
        stock={editingStock}
        industries={industries}
        purchases={purchases}
        sales={sales}
        dividends={dividends}
        stocks={stocks}
        onSave={onUpdateStock}
        onUpdatePurchase={onUpdatePurchase}
        onUpdateSale={onUpdateSale}
      />

      {/* Edit Purchase Modal (Triggered by clicking PurchaseId or Date in Purchases list) */}
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

      {/* Add Stock Modal */}
      {isAddStockOpen && (
        <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-slate-900 border border-slate-700/80 rounded-t-3xl sm:rounded-2xl shadow-2xl p-4 sm:p-6 max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 shrink-0">
              <div>
                <h3 className="text-base sm:text-lg font-bold text-white tracking-tight">
                  Add Stock
                </h3>
                <p className="text-xs text-slate-400">
                  Track a new stock in your portfolio
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsAddStockOpen(false)}
                className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-slate-800 min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateStock} className="space-y-4 mt-4 overflow-y-auto flex-1">
              {addStockError && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300 font-medium">
                  {addStockError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center justify-between">
                    <span>Stock ID <span className="text-cyan-400">*</span></span>
                    <span className="text-[10px] text-cyan-400 font-mono">Unique</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. STK0001"
                    value={newStockData.stockId}
                    onChange={e => {
                      setAddStockError(null);
                      setNewStockData({ ...newStockData, stockId: e.target.value.toUpperCase().trim() });
                    }}
                    className="w-full min-h-[44px] bg-slate-950 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-base sm:text-sm text-cyan-400 font-bold uppercase focus:outline-none focus:border-cyan-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Symbol (Ticker) <span className="text-cyan-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. INFY"
                    value={newStockData.symbol}
                    onChange={e => handleSymbolChange(e.target.value)}
                    className="w-full min-h-[44px] bg-slate-950 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-base sm:text-sm text-white uppercase focus:outline-none focus:border-cyan-500 font-bold font-mono"
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
                    placeholder="e.g. INFY.NSE"
                    value={newStockData.mktSymbol}
                    onChange={e => {
                      setAddStockError(null);
                      setNewStockData({ ...newStockData, mktSymbol: e.target.value.toUpperCase().trim() });
                    }}
                    className="w-full min-h-[44px] bg-slate-950 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-base sm:text-sm text-white uppercase focus:outline-none focus:border-cyan-500 font-mono"
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
                  placeholder="e.g. Infosys Ltd."
                  value={newStockData.name}
                  onChange={e => setNewStockData({ ...newStockData, name: e.target.value })}
                  className="w-full min-h-[44px] bg-slate-950 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-base sm:text-sm text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Industry Sector
                </label>
                <select
                  value={newStockData.industryId}
                  onChange={e => setNewStockData({ ...newStockData, industryId: e.target.value })}
                  className="w-full min-h-[44px] bg-slate-950 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-base sm:text-xs text-white focus:outline-none focus:border-cyan-500"
                >
                  {industries.map((ind, idx) => (
                    <option key={`${ind.IndustryId}_${idx}`} value={ind.IndustryId}>
                      {ind.Name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Price (₹ INR)
                  </label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={newStockData.price}
                    onChange={e => setNewStockData({ ...newStockData, price: e.target.value })}
                    className="w-full min-h-[44px] bg-slate-950 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-base sm:text-sm text-white focus:outline-none focus:border-cyan-500 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Dividend Yield (%)
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={newStockData.dividendYield}
                    onChange={e => setNewStockData({ ...newStockData, dividendYield: e.target.value })}
                    className="w-full min-h-[44px] bg-slate-950 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-base sm:text-sm text-white focus:outline-none focus:border-cyan-500 font-mono"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAddStockOpen(false)}
                  disabled={isSavingStock}
                  className="px-4 py-2.5 min-h-[44px] text-xs font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-xl transition disabled:opacity-50 touch-manipulation cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingStock}
                  className="px-5 py-2.5 min-h-[44px] text-xs font-bold text-white bg-cyan-600 hover:bg-cyan-500 rounded-xl transition flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer touch-manipulation shadow-lg shadow-cyan-950/40"
                >
                  {isSavingStock ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Saving Stock...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Save Stock</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
