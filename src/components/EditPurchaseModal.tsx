import React, { useState, useEffect } from 'react';
import {
  X,
  ShoppingCart,
  Calendar,
  AlertCircle,
  CheckCircle2,
  DollarSign,
  Layers,
  FileText
} from 'lucide-react';
import { Purchase, EnrichedPurchase, Stock, Sale, formatINR } from '../types/database';

interface EditPurchaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  purchase: (Purchase & Partial<EnrichedPurchase>) | null;
  stocks: Stock[];
  sales?: Sale[];
  onUpdatePurchase: (updatedPurchase: Purchase) => Promise<void>;
}

export const EditPurchaseModal: React.FC<EditPurchaseModalProps> = ({
  isOpen,
  onClose,
  purchase,
  stocks,
  sales = [],
  onUpdatePurchase,
}) => {
  const [purchaseDate, setPurchaseDate] = useState<string>('');
  const [quantity, setQuantity] = useState<string>('');
  const [purchasePrice, setPurchasePrice] = useState<string>('');
  const [fees, setFees] = useState<string>('0.00');
  const [notes, setNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Find linked stock
  const linkedStock = stocks.find(
    s => s.StockId.trim().toUpperCase() === (purchase?.StockId || '').trim().toUpperCase()
  );

  // Calculate shares already sold from this lot
  const lotSales = sales.filter(
    s => s.PurchaseId.trim().toUpperCase() === (purchase?.PurchaseId || '').trim().toUpperCase()
  );
  const soldQuantity = lotSales.reduce((sum, s) => sum + (Number(s.Quantity) || 0), 0);

  useEffect(() => {
    if (!isOpen || !purchase) return;

    setQuantity(purchase.Quantity !== undefined ? purchase.Quantity.toString() : '1');
    setPurchasePrice(purchase.PurchasePrice !== undefined ? purchase.PurchasePrice.toString() : '0');
    setFees(purchase.Fees !== undefined ? Number(purchase.Fees).toFixed(2) : '0.00');

    if (purchase.PurchaseDate) {
      try {
        const d = new Date(purchase.PurchaseDate);
        setPurchaseDate(d.toISOString().slice(0, 16));
      } catch {
        setPurchaseDate(new Date().toISOString().slice(0, 16));
      }
    } else {
      setPurchaseDate(new Date().toISOString().slice(0, 16));
    }

    setNotes(purchase.Notes || '');
    setError(null);
  }, [isOpen, purchase]);

  if (!isOpen || !purchase) return null;

  const parsedQty = parseFloat(quantity) || 0;
  const parsedPrice = parseFloat(purchasePrice) || 0;
  const parsedFees = parseFloat(fees) || 0;
  const calculatedTotal = (parsedQty * parsedPrice) + parsedFees;

  const isBelowSoldQuantity = soldQuantity > 0 && parsedQty < soldQuantity;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (parsedQty <= 0) {
      setError('Purchase quantity must be greater than 0.');
      return;
    }

    if (soldQuantity > 0 && parsedQty < soldQuantity) {
      setError(
        `Purchase quantity cannot be less than ${soldQuantity} shares because ${soldQuantity} ${soldQuantity === 1 ? 'share has' : 'shares have'} already been sold from this lot.`
      );
      return;
    }

    if (isNaN(parsedPrice) || parsedPrice <= 0) {
      setError('Purchase price must be greater than 0.');
      return;
    }

    setIsSubmitting(true);
    try {
      const updated: Purchase = {
        PurchaseId: purchase.PurchaseId,
        StockId: purchase.StockId,
        PurchaseDate: new Date(purchaseDate).toISOString(),
        Quantity: parsedQty,
        PurchasePrice: parsedPrice,
        TotalAmount: calculatedTotal,
        Fees: parsedFees,
        Notes: notes.trim(),
      };

      await onUpdatePurchase(updated);
      onClose();
    } catch (err: any) {
      console.error('Failed to update purchase:', err);
      setError(err.message || 'Failed to update purchase record.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto animate-in fade-in duration-150">
      <div 
        className="bg-slate-900 border border-slate-700/80 rounded-2xl sm:rounded-3xl w-full max-w-xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-150 my-auto"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
              <ShoppingCart className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-bold text-white tracking-tight">
                  Edit Purchase Lot
                </h3>
                <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-slate-800 text-amber-400 border border-slate-700">
                  {purchase.PurchaseId}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Update purchase date, price, or lot quantity
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
            title="Close"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Stock Badge Info */}
        <div className="px-4 sm:px-6 pt-4 pb-2 bg-slate-950/40 border-b border-slate-800/60 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="font-mono font-bold text-base text-white tracking-wide">
              {linkedStock?.Symbol || purchase.StockId}
            </div>
            <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-amber-300 font-mono font-semibold">
              {linkedStock?.Exchange || 'NSE'}
            </span>
            <span className="text-xs text-slate-400 hidden sm:inline truncate max-w-[200px]">
              {linkedStock?.CompanyName}
            </span>
          </div>
          <div className="text-xs font-mono text-slate-400">
            Stock ID: <span className="text-cyan-400 font-bold">{purchase.StockId}</span>
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4">
          {error && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Sold Shares Warning if applicable */}
          {soldQuantity > 0 && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-300 text-xs space-y-1">
              <div className="flex items-center gap-2 font-semibold">
                <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
                <span>Active Sales Linked to this Lot</span>
              </div>
              <p className="text-slate-300 pl-6 text-[11px]">
                {soldQuantity} {soldQuantity === 1 ? 'share has' : 'shares have'} already been sold from this lot across {lotSales.length} sale {lotSales.length === 1 ? 'transaction' : 'transactions'}.
                The lot quantity cannot be reduced below <span className="font-bold font-mono text-white">{soldQuantity}</span> shares.
              </p>
            </div>
          )}

          {/* Purchase Date */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-cyan-400" />
              <span>Purchase Date & Time</span>
            </label>
            <input
              type="datetime-local"
              required
              value={purchaseDate}
              onChange={e => setPurchaseDate(e.target.value)}
              className="w-full min-h-[44px] bg-slate-950 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-white text-sm focus:outline-none focus:border-amber-500 font-mono"
            />
          </div>

          {/* Quantity & Price Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-amber-400" />
                  <span>Quantity (Shares)</span>
                </span>
                {soldQuantity > 0 && (
                  <span className="text-[11px] text-amber-400 font-mono">
                    Min: {soldQuantity}
                  </span>
                )}
              </label>
              <input
                type="number"
                step="any"
                min={soldQuantity > 0 ? soldQuantity : 1}
                required
                value={quantity}
                onChange={e => setQuantity(e.target.value)}
                placeholder="e.g. 20"
                className={`w-full min-h-[44px] bg-slate-950 border rounded-xl px-3.5 py-2.5 text-white text-base sm:text-sm font-mono font-bold focus:outline-none ${
                  isBelowSoldQuantity
                    ? 'border-rose-500 focus:border-rose-400'
                    : 'border-slate-700/80 focus:border-amber-500'
                }`}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
                <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                <span>Purchase Price (₹ INR)</span>
              </label>
              <input
                type="number"
                step="any"
                min="0.01"
                required
                value={purchasePrice}
                onChange={e => setPurchasePrice(e.target.value)}
                placeholder="e.g. 2850.00"
                className="w-full min-h-[44px] bg-slate-950 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-white text-base sm:text-sm font-mono font-bold focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          {/* Fees & Total Preview */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Brokerage / Fees (₹ INR)
              </label>
              <input
                type="number"
                step="any"
                min="0"
                value={fees}
                onChange={e => setFees(e.target.value)}
                placeholder="20.00"
                className="w-full min-h-[44px] bg-slate-950 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-white text-sm font-mono focus:outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Calculated Total Amount
              </label>
              <div className="w-full min-h-[44px] bg-slate-950/80 border border-slate-800 rounded-xl px-3.5 py-2.5 flex items-center justify-between">
                <span className="text-xs text-slate-400">Total:</span>
                <span className="font-mono font-bold text-base text-emerald-400">
                  {formatINR(calculatedTotal)}
                </span>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-slate-400" />
              <span>Investment Notes & Remarks</span>
            </label>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="e.g. Dip buying / long-term holding"
              className="w-full min-h-[44px] bg-slate-950 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-white text-sm focus:outline-none focus:border-amber-500"
            />
          </div>

          {/* Footer Actions */}
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
              disabled={isSubmitting || isBelowSoldQuantity}
              className="px-5 py-2.5 min-h-[44px] text-xs font-bold rounded-xl text-white bg-amber-600 hover:bg-amber-500 shadow-lg shadow-amber-950/40 transition flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer touch-manipulation"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 text-amber-200" />
                  <span>Update Purchase</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
