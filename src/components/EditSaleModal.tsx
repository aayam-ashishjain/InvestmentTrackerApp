import React, { useState, useEffect } from 'react';
import { 
  X, 
  TrendingDown, 
  TrendingUp,
  Tag, 
  Layers, 
  Calendar, 
  FileText, 
  DollarSign, 
  AlertCircle, 
  CheckCircle2, 
  Edit3,
  Info,
  Clock,
  ExternalLink
} from 'lucide-react';
import { 
  Sale, 
  Purchase, 
  Stock, 
  EnrichedSale,
  EnrichedPurchase,
  formatINR,
  formatDateOnly,
  getTodayDateOnly 
} from '../types/database';

interface EditSaleModalProps {
  isOpen: boolean;
  onClose: () => void;
  sale: (Sale & Partial<EnrichedSale>) | null;
  purchases: (Purchase | EnrichedPurchase)[];
  stocks: Stock[];
  allSales?: Sale[];
  sales?: Sale[];
  onUpdateSale: (updatedSale: Sale) => Promise<void>;
}

export const EditSaleModal: React.FC<EditSaleModalProps> = ({
  isOpen,
  onClose,
  sale,
  purchases,
  stocks,
  allSales,
  sales,
  onUpdateSale,
}) => {
  const salesList = allSales || sales || [];
  const [quantity, setQuantity] = useState<string>('');
  const [salePrice, setSalePrice] = useState<string>('');
  const [fees, setFees] = useState<string>('0.00');
  const [saleDate, setSaleDate] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Find linked Purchase lot
  const linkedPurchase = purchases.find(
    p => p.PurchaseId.trim().toUpperCase() === (sale?.PurchaseId || '').trim().toUpperCase()
  );

  // Find linked Stock (StockId is foreign key in Purchases / Sales linking to Stocks table)
  const stockId = (sale?.StockId || linkedPurchase?.StockId || '').trim().toUpperCase();
  const linkedStock = stocks.find(s => s.StockId.trim().toUpperCase() === stockId);

  // Display value as Symbol from Stocks table
  const displaySymbol = linkedStock?.Symbol || `Stock ${stockId}` || 'UNKNOWN';
  const displayCompanyName = linkedStock?.CompanyName || 'Unknown Company';
  const displayExchange = linkedStock?.Exchange || 'NSE';

  // Calculate other sales against this same purchase lot
  const otherSales = salesList.filter(
    s => s.PurchaseId.trim().toUpperCase() === (sale?.PurchaseId || '').trim().toUpperCase() &&
         s.SaleId.trim().toUpperCase() !== (sale?.SaleId || '').trim().toUpperCase()
  );
  const otherSalesQuantity = otherSales.reduce((sum, s) => sum + (Number(s.Quantity) || 0), 0);
  const totalPurchaseQuantity = linkedPurchase ? Number(linkedPurchase.Quantity) || 0 : 0;
  
  // Maximum allowed quantity for this sale record so that sum of all sales <= purchase quantity
  const maxAllowedQuantity = Math.max(0, totalPurchaseQuantity - otherSalesQuantity);

  // Populate form fields when modal opens or sale changes
  useEffect(() => {
    if (!isOpen || !sale) return;

    setQuantity(sale.Quantity ? sale.Quantity.toString() : '1');
    setSalePrice(sale.SalePrice ? sale.SalePrice.toString() : '');
    setFees(sale.Fees !== undefined ? Number(sale.Fees).toFixed(2) : '0.00');
    
    setSaleDate(formatDateOnly(sale.SaleDate));
    setNotes(sale.Notes || '');
    setError(null);
  }, [isOpen, sale]);

  if (!isOpen || !sale) return null;

  const parsedQty = parseFloat(quantity) || 0;
  const parsedPrice = parseFloat(salePrice) || 0;
  const parsedFees = parseFloat(fees) || 0;
  const originalBuyPrice = linkedPurchase ? linkedPurchase.PurchasePrice : 0;

  // Real-time calculations
  const grossProceeds = parsedQty * parsedPrice;
  const netProceeds = Math.max(0, grossProceeds - parsedFees);
  const costBasis = parsedQty * originalBuyPrice;
  const realizedPnL = netProceeds - costBasis;
  const realizedPnLPct = costBasis > 0 ? (realizedPnL / costBasis) * 100 : 0;
  const isProfit = realizedPnL >= 0;

  const isOverQuantityLimit = parsedQty > maxAllowedQuantity;

  const handleSetMax = () => {
    setQuantity(maxAllowedQuantity.toString());
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (parsedQty <= 0) {
      setError('Sale quantity must be greater than 0.');
      return;
    }

    if (parsedQty > maxAllowedQuantity) {
      setError(
        `Cannot sell ${parsedQty} shares. Maximum allowed for this sale is ${maxAllowedQuantity} shares (Purchase lot total: ${totalPurchaseQuantity}, other sales: ${otherSalesQuantity}).`
      );
      return;
    }

    if (isNaN(parsedPrice) || parsedPrice <= 0) {
      setError('Sale price must be greater than 0.');
      return;
    }

    setIsSubmitting(true);
    try {
      const updated: Sale = {
        ...sale,
        Quantity: parsedQty,
        SalePrice: parsedPrice,
        Rate: parsedPrice,
        TotalAmount: netProceeds,
        Fees: parsedFees,
        Notes: notes.trim(),
        SaleDate: formatDateOnly(saleDate),
      };

      await onUpdateSale(updated);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to update sale record in Google Sheets.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto animate-in fade-in duration-150">
      <div 
        className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-150"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="p-4 sm:p-6 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
              <Edit3 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-white tracking-tight">
                Edit Sale Record
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Update shares sold, rate, fees, or date
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition cursor-pointer"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4 sm:space-y-5">
          {/* Linked Record & Stock Information Card */}
          <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800/80 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-800/60">
              <div className="flex items-center gap-2">
                <Tag className="w-4 h-4 text-cyan-400" />
                <span className="font-bold text-white text-sm">{displaySymbol}</span>
                <span className="text-xs text-slate-400 font-medium">({displayCompanyName})</span>
              </div>
              {linkedPurchase?.PurchaseDate ? (
                <div className="flex items-center gap-1.5 text-xs text-slate-400">
                  <Clock className="w-3.5 h-3.5 text-slate-500" />
                  <span>Bought {new Date(linkedPurchase.PurchaseDate).toLocaleDateString()}</span>
                </div>
              ) : null}
            </div>

            {/* Purchase Lot Share Balance Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <div className="p-2 rounded-xl bg-slate-900/60 border border-slate-800">
                <span className="text-[10px] text-slate-400 block uppercase font-medium">Total In Lot</span>
                <span className="text-sm font-mono font-bold text-white">
                  {totalPurchaseQuantity.toLocaleString()} shares
                </span>
              </div>
              <div className="p-2 rounded-xl bg-slate-900/60 border border-slate-800">
                <span className="text-[10px] text-slate-400 block uppercase font-medium">Other Sales</span>
                <span className="text-sm font-mono font-bold text-amber-400">
                  {otherSalesQuantity.toLocaleString()} shares
                </span>
              </div>
              <div className="p-2 rounded-xl bg-slate-900/60 border border-slate-800">
                <span className="text-[10px] text-slate-400 block uppercase font-medium">Max For This Sale</span>
                <span className="text-sm font-mono font-bold text-emerald-400">
                  {maxAllowedQuantity.toLocaleString()} shares
                </span>
              </div>
              <div className="p-2 rounded-xl bg-slate-900/60 border border-slate-800">
                <span className="text-[10px] text-slate-400 block uppercase font-medium">Buy Price</span>
                <span className="text-sm font-mono font-bold text-slate-200">
                  {formatINR(originalBuyPrice)}
                </span>
              </div>
            </div>
          </div>

          {/* Error Banner */}
          {error && (
            <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-2.5 text-rose-300 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
              <div className="leading-relaxed">{error}</div>
            </div>
          )}

          {/* Form Fields Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Quantity to Sell */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-amber-400" />
                  <span>Shares Sold</span>
                </label>
                <button
                  type="button"
                  onClick={handleSetMax}
                  className="text-[11px] text-cyan-400 hover:text-cyan-300 font-bold transition cursor-pointer"
                >
                  Set Max ({maxAllowedQuantity})
                </button>
              </div>
              <div className="relative">
                <input
                  type="number"
                  min="1"
                  max={maxAllowedQuantity}
                  step="1"
                  value={quantity}
                  onChange={e => {
                    setQuantity(e.target.value);
                    setError(null);
                  }}
                  className={`w-full bg-slate-950 border rounded-xl px-3.5 py-2.5 text-sm text-white font-mono focus:outline-none transition ${
                    isOverQuantityLimit 
                      ? 'border-rose-500 focus:border-rose-400 text-rose-300' 
                      : 'border-slate-800 focus:border-amber-500'
                  }`}
                  placeholder="e.g. 5"
                  required
                />
              </div>
              {isOverQuantityLimit && (
                <p className="text-[11px] text-rose-400 mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  Exceeds allowed max of {maxAllowedQuantity} shares
                </p>
              )}
            </div>

            {/* Sale Price */}
            <div>
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5 mb-1.5">
                <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                <span>Sale Price per Share (₹ INR)</span>
              </label>
              <input
                type="number"
                step="any"
                value={salePrice}
                onChange={e => {
                  setSalePrice(e.target.value);
                  setError(null);
                }}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white font-mono focus:outline-none focus:border-amber-500 transition"
                placeholder="0.00"
              />
            </div>

            {/* Brokerage & Transaction Fees */}
            <div>
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5 mb-1.5">
                <span>Brokerage / STT / Taxes (₹)</span>
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={fees}
                onChange={e => setFees(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white font-mono focus:outline-none focus:border-amber-500 transition"
                placeholder="20.00"
              />
            </div>

            {/* Sale Date */}
            <div>
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5 mb-1.5">
                <Calendar className="w-3.5 h-3.5 text-cyan-400" />
                <span>Sale Date</span>
              </label>
              <input
                type="date"
                value={saleDate}
                onChange={e => setSaleDate(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white font-mono focus:outline-none focus:border-amber-500 transition"
                required
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5 mb-1.5">
              <FileText className="w-3.5 h-3.5 text-slate-400" />
              <span>Notes / Rationale (Optional)</span>
            </label>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="e.g. Booking profit on target reached, partial rebalancing"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition"
            />
          </div>

          {/* Real-time Calculation Summary Card */}
          <div className="p-4 rounded-2xl bg-gradient-to-r from-slate-950 to-slate-900 border border-slate-800 space-y-2.5">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
              Updated Financial Breakdown
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <div>
                <span className="text-slate-400 text-[10px] block">Gross Proceeds</span>
                <span className="font-mono font-bold text-white text-sm">{formatINR(grossProceeds)}</span>
              </div>
              <div>
                <span className="text-slate-400 text-[10px] block">Net Proceeds</span>
                <span className="font-mono font-bold text-white text-sm">{formatINR(netProceeds)}</span>
              </div>
              <div>
                <span className="text-slate-400 text-[10px] block">Cost Basis</span>
                <span className="font-mono text-slate-300 text-sm">{formatINR(costBasis)}</span>
              </div>
              <div>
                <span className="text-slate-400 text-[10px] block">Realized Gain/Loss</span>
                <span className={`font-mono font-bold text-sm flex items-center gap-1 ${isProfit ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {isProfit ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                  {isProfit ? '+' : ''}{formatINR(realizedPnL)}
                  <span className="text-[10px] font-normal">({isProfit ? '+' : ''}{realizedPnLPct.toFixed(1)}%)</span>
                </span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-semibold transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || isOverQuantityLimit || parsedQty <= 0 || parsedPrice <= 0}
              className={`px-5 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer shadow-lg ${
                isSubmitting || isOverQuantityLimit || parsedQty <= 0 || parsedPrice <= 0
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                  : 'bg-amber-600 hover:bg-amber-500 text-white shadow-amber-950/40'
              }`}
            >
              {isSubmitting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Updating Sale in Google Sheets...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Save Sale Changes</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
