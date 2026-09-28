import React, { useState, useEffect } from 'react';
import { 
  X, 
  TrendingDown, 
  Hash, 
  CheckCircle2, 
  AlertCircle,
  Layers,
  ArrowRight
} from 'lucide-react';
import { 
  Stock, 
  Sale,
  EnrichedPurchase, 
  generateSaleId,
  formatINR 
} from '../types/database';

interface AddSaleModalProps {
  isOpen: boolean;
  onClose: () => void;
  purchases: EnrichedPurchase[];
  stocks: Stock[];
  sales?: Sale[];
  initialPurchaseId?: string;
  onExecuteSale: (saleData: {
    SaleId?: string;
    SalesId?: string;
    PurchaseId: string;
    StockId: string;
    Quantity: number;
    SalePrice: number;
    Rate?: number;
    TotalAmount: number;
    Fees: number;
    Notes?: string;
    SaleDate?: string;
  }) => Promise<void>;
}

export const AddSaleModal: React.FC<AddSaleModalProps> = ({
  isOpen,
  onClose,
  purchases,
  stocks,
  sales = [],
  initialPurchaseId,
  onExecuteSale,
}) => {
  // Only show purchase lots that have remaining shares, or currently selected
  const availablePurchases = purchases.filter(p => p.remainingQuantity > 0 || p.PurchaseId === initialPurchaseId);

  const [selectedPurchaseId, setSelectedPurchaseId] = useState<string>('');
  const [quantity, setQuantity] = useState<string>('1');
  const [salePrice, setSalePrice] = useState<string>('');
  const [fees, setFees] = useState<string>('20.00');
  const [saleDate, setSaleDate] = useState<string>(() => new Date().toISOString().slice(0, 16));
  const [notes, setNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Generate next SalesId for this transaction
  const nextSalesId = generateSaleId(sales);

  // Initialize selected purchase lot
  useEffect(() => {
    if (!isOpen) return;

    let targetPurchase: EnrichedPurchase | undefined;
    if (initialPurchaseId) {
      targetPurchase = purchases.find(p => p.PurchaseId === initialPurchaseId);
    }
    if (!targetPurchase) {
      targetPurchase = availablePurchases[0] || purchases[0];
    }

    if (targetPurchase) {
      setSelectedPurchaseId(targetPurchase.PurchaseId);
      const defaultQty = Math.min(1, targetPurchase.remainingQuantity || 1);
      setQuantity(defaultQty.toString());

      // Pre-populate with live price from Stocks table
      const stock = stocks.find(s => s.StockId.trim().toUpperCase() === targetPurchase!.StockId.trim().toUpperCase());
      const livePrice = stock ? (stock.Liverate > 0 ? stock.Liverate : stock.CurrentPrice) : targetPurchase.PurchasePrice;
      setSalePrice(livePrice.toFixed(2));
      setSaleDate(new Date().toISOString().slice(0, 16));
      setError(null);
    }
  }, [isOpen, initialPurchaseId, purchases, stocks]);

  // When selected purchase lot changes
  const handlePurchaseChange = (purchaseId: string) => {
    setSelectedPurchaseId(purchaseId);
    setError(null);
    const targetPurchase = purchases.find(p => p.PurchaseId === purchaseId);
    if (targetPurchase) {
      const stock = stocks.find(s => s.StockId.trim().toUpperCase() === targetPurchase.StockId.trim().toUpperCase());
      const livePrice = stock ? (stock.Liverate > 0 ? stock.Liverate : stock.CurrentPrice) : targetPurchase.PurchasePrice;
      setSalePrice(livePrice.toFixed(2));
      
      const maxAvail = targetPurchase.remainingQuantity;
      const currentQtyNum = parseFloat(quantity) || 0;
      if (currentQtyNum > maxAvail || currentQtyNum <= 0) {
        setQuantity(Math.max(1, Math.min(1, maxAvail)).toString());
      }
    }
  };

  const selectedPurchase = purchases.find(p => p.PurchaseId === selectedPurchaseId);
  const selectedStock = selectedPurchase ? stocks.find(s => s.StockId.trim().toUpperCase() === selectedPurchase.StockId.trim().toUpperCase()) : undefined;

  const displaySymbol = selectedStock?.Symbol || selectedPurchase?.symbol || 'UNKNOWN';
  const displayCompanyName = selectedStock?.CompanyName || selectedPurchase?.companyName || 'Unknown Company';
  const maxAvailableQuantity = selectedPurchase ? selectedPurchase.remainingQuantity : 0;

  // Real-time P&L calculations
  const parsedQty = parseFloat(quantity) || 0;
  const parsedPrice = parseFloat(salePrice) || 0;
  const parsedFees = parseFloat(fees) || 0;
  const originalBuyPrice = selectedPurchase ? selectedPurchase.PurchasePrice : 0;

  const grossProceeds = parsedQty * parsedPrice;
  const netProceeds = Math.max(0, grossProceeds - parsedFees);
  const costBasis = parsedQty * originalBuyPrice;
  const realizedPnL = netProceeds - costBasis;
  const realizedPnLPct = costBasis > 0 ? (realizedPnL / costBasis) * 100 : 0;

  const handleSetMaxQuantity = () => {
    if (maxAvailableQuantity > 0) {
      setQuantity(maxAvailableQuantity.toString());
      setError(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!selectedPurchase) {
      setError('Please select a valid purchase lot to sell from.');
      return;
    }

    if (parsedQty <= 0) {
      setError('Sale quantity must be greater than 0.');
      return;
    }

    if (parsedQty > maxAvailableQuantity) {
      setError(`Cannot sell ${parsedQty} shares. Maximum available in lot ${selectedPurchase.PurchaseId} is ${maxAvailableQuantity} shares.`);
      return;
    }

    if (isNaN(parsedPrice) || parsedPrice <= 0) {
      setError('Sale price must be greater than 0.');
      return;
    }

    setIsSubmitting(true);
    try {
      await onExecuteSale({
        SaleId: nextSalesId,
        SalesId: nextSalesId,
        PurchaseId: selectedPurchase.PurchaseId,
        StockId: selectedPurchase.StockId,
        Quantity: parsedQty,
        SalePrice: parsedPrice,
        Rate: parsedPrice,
        TotalAmount: netProceeds,
        Fees: parsedFees,
        Notes: notes.trim(),
        SaleDate: new Date(saleDate).toISOString(),
      });
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to record sale transaction');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto">
      <div 
        className="relative w-full max-w-lg bg-slate-900 border border-slate-700/80 rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col animate-in fade-in slide-in-from-bottom-4 sm:zoom-in-95 duration-150"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-800 bg-slate-900/90 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 sm:p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <TrendingDown className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">
                Record Stock Sale
              </h2>
              <p className="text-xs text-slate-400">
                Sell shares from your holding lots
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mx-4 sm:mx-5 mt-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2 shrink-0">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1">
          {/* Autogenerated Sales ID Card */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950/80 border border-slate-800 text-xs">
            <div className="flex items-center gap-2 text-slate-300">
              <Hash className="w-4 h-4 text-amber-400 shrink-0" />
              <span className="font-medium">Generated Sales ID</span>
            </div>
            <span className="font-mono font-bold text-amber-400 bg-amber-400/10 px-2.5 py-1 rounded-lg border border-amber-400/20 text-xs">
              {nextSalesId}
            </span>
          </div>

          {/* Purchase Lot Selection */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-cyan-400" />
              <span>Purchase Lot</span>
            </label>
            <select
              value={selectedPurchaseId}
              onChange={e => handlePurchaseChange(e.target.value)}
              className="w-full min-h-[44px] bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm sm:text-xs text-white focus:outline-none focus:border-cyan-500 font-mono"
            >
              {purchases.map((p, idx) => {
                const stock = stocks.find(s => s.StockId.trim().toUpperCase() === p.StockId.trim().toUpperCase());
                const sym = stock?.Symbol || p.symbol || 'UNKNOWN';
                const isAvail = p.remainingQuantity > 0;
                return (
                  <option 
                    key={`${p.PurchaseId}_${idx}`} 
                    value={p.PurchaseId} 
                    disabled={!isAvail && p.PurchaseId !== initialPurchaseId}
                  >
                    {sym} — {p.PurchaseId} ({isAvail ? `${p.remainingQuantity} available of ${p.Quantity}` : 'Fully Sold'})
                  </option>
                );
              })}
            </select>
          </div>

          {/* Purchase Lot Summary */}
          {selectedPurchase && (
            <div className="p-3.5 bg-slate-950/70 rounded-xl border border-slate-800 text-xs space-y-2.5">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-mono font-bold text-sm">
                    {displaySymbol}
                  </span>
                  <span className="text-slate-300 font-medium text-xs truncate max-w-[150px] sm:max-w-none">
                    {displayCompanyName}
                  </span>
                </div>
                <span className="text-[10px] text-slate-400 font-mono">
                  {selectedPurchase.exchange || 'NSE'}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-slate-900/90 p-2 rounded-lg border border-slate-800">
                  <div className="text-[10px] text-slate-400">Lot ID</div>
                  <div className="font-mono text-cyan-300 font-semibold text-xs mt-0.5 truncate">
                    {selectedPurchase.PurchaseId}
                  </div>
                </div>
                <div className="bg-slate-900/90 p-2 rounded-lg border border-slate-800">
                  <div className="text-[10px] text-slate-400">Buy Price</div>
                  <div className="font-mono text-slate-200 font-semibold text-xs mt-0.5 truncate">
                    {formatINR(selectedPurchase.PurchasePrice)}
                  </div>
                </div>
                <div className="bg-slate-900/90 p-2 rounded-lg border border-slate-800">
                  <div className="text-[10px] text-slate-400">Available</div>
                  <div className="font-mono text-emerald-400 font-bold text-xs mt-0.5">
                    {maxAvailableQuantity} / {selectedPurchase.Quantity}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Quantity & Sale Price */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-300">
                  Shares to Sell
                </label>
                {maxAvailableQuantity > 0 && (
                  <button
                    type="button"
                    onClick={handleSetMaxQuantity}
                    className="text-[11px] text-cyan-400 hover:text-cyan-300 font-semibold cursor-pointer underline touch-manipulation"
                  >
                    Sell All ({maxAvailableQuantity})
                  </button>
                )}
              </div>
              <input
                type="number"
                min="1"
                max={maxAvailableQuantity || 1}
                required
                value={quantity}
                onChange={e => {
                  setQuantity(e.target.value);
                  setError(null);
                }}
                className="w-full min-h-[44px] bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-base sm:text-sm text-white font-mono focus:outline-none focus:border-cyan-500 font-bold"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Sale Price (₹ INR)
              </label>
              <input
                type="number"
                step="any"
                value={salePrice}
                onChange={e => {
                  setSalePrice(e.target.value);
                  setError(null);
                }}
                placeholder="0.00"
                className="w-full min-h-[44px] bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-base sm:text-sm text-white font-mono focus:outline-none focus:border-cyan-500 font-bold"
              />
            </div>
          </div>

          {/* Sale Date & Brokerage Fees */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Sale Date & Time
              </label>
              <input
                type="datetime-local"
                value={saleDate}
                onChange={e => setSaleDate(e.target.value)}
                className="w-full min-h-[44px] bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm sm:text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Fees / Charges (₹ INR)
              </label>
              <input
                type="number"
                step="any"
                min="0"
                value={fees}
                onChange={e => setFees(e.target.value)}
                placeholder="20.00"
                className="w-full min-h-[44px] bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-base sm:text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Notes (Optional)
            </label>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="e.g. Profit booking, portfolio rebalance"
              className="w-full min-h-[44px] bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm sm:text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
            />
          </div>

          {/* Realized Profit / Loss Preview */}
          <div className={`p-3.5 rounded-xl border ${
            realizedPnL >= 0 
              ? 'bg-emerald-950/20 border-emerald-500/30' 
              : 'bg-rose-950/20 border-rose-500/30'
          }`}>
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="text-slate-300 font-medium">Estimated Realized P&L:</span>
              <div className="flex items-center gap-1.5">
                <span className={`font-mono font-bold text-sm ${realizedPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {realizedPnL >= 0 ? '+' : ''}{formatINR(realizedPnL)}
                </span>
                <span className={`text-[11px] font-mono px-1.5 py-0.5 rounded ${
                  realizedPnL >= 0 
                    ? 'bg-emerald-500/20 text-emerald-300' 
                    : 'bg-rose-500/20 text-rose-300'
                }`}>
                  {realizedPnL >= 0 ? '+' : ''}{realizedPnLPct.toFixed(2)}%
                </span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 text-[11px] text-slate-400 font-mono pt-1.5 border-t border-slate-800/80">
              <div>
                Gross: <span className="text-slate-200">{formatINR(grossProceeds)}</span>
              </div>
              <div className="text-center">
                Net: <span className="text-slate-200 font-semibold">{formatINR(netProceeds)}</span>
              </div>
              <div className="text-right">
                Cost: <span className="text-slate-200">{formatINR(costBasis)}</span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2.5 min-h-[44px] text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition cursor-pointer touch-manipulation"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || maxAvailableQuantity <= 0}
              className="px-5 py-2.5 min-h-[44px] text-xs font-bold text-slate-950 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 rounded-xl shadow-lg shadow-amber-500/20 transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation"
            >
              {isSubmitting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                  <span>Recording Sale...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Record Sale</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
