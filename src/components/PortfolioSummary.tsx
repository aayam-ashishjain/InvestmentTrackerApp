import React from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  ArrowUpRight, 
  ArrowDownRight, 
  Wallet, 
  PieChart, 
  Receipt,
  Layers,
  Sparkles
} from 'lucide-react';
import { EnrichedStock, EnrichedSale, formatINR } from '../types/database';

export interface PortfolioSummaryProps {
  enrichedStocks: EnrichedStock[];
  enrichedSales?: EnrichedSale[];
  className?: string;
}

export const PortfolioSummary: React.FC<PortfolioSummaryProps> = ({
  enrichedStocks,
  enrichedSales = [],
  className = '',
}) => {
  // 1. Total Current Value: Sum of current holding values of all enriched stocks
  const totalCurrentValue = enrichedStocks.reduce(
    (sum, stock) => sum + (stock.currentHoldingValue || 0),
    0
  );

  // 2. Total Invested Amount: Cost basis of the unsold shares in each purchase lot
  const totalInvestedAmount = enrichedStocks.reduce(
    (sum, stock) => sum + stock.activeCostBasis,
    0
  );

  // Cumulative total invested across all historical purchases
  const totalCumulativeInvested = enrichedStocks.reduce(
    (sum, stock) => sum + stock.cumulativeInvested,
    0
  );

  // 3. Unrealized Profit / Loss
  const unrealizedProfitLoss = totalCurrentValue - totalInvestedAmount;
  const unrealizedProfitLossPercent = totalInvestedAmount > 0 
    ? (unrealizedProfitLoss / totalInvestedAmount) * 100 
    : 0;

  // Realized Profit / Loss from Sales
  const realizedProfitLoss = enrichedSales.reduce(
    (sum, sale) => sum + (sale.realizedGainLoss || 0),
    0
  );

  // Total Combined Profit / Loss (Unrealized + Realized)
  const totalProfitLoss = unrealizedProfitLoss + realizedProfitLoss;
  const totalProfitLossPercent = totalInvestedAmount > 0 
    ? (totalProfitLoss / totalInvestedAmount) * 100 
    : 0;

  // Additional Portfolio Insights
  const activeHoldings = enrichedStocks.filter(s => s.totalQuantity > 0);
  const totalActiveShares = enrichedStocks.reduce((sum, s) => sum + (s.totalQuantity || 0), 0);
  const profitableHoldingsCount = activeHoldings.filter(s => s.unrealizedGainLoss >= 0).length;

  // Top gainer
  const topGainer = activeHoldings.length > 0 
    ? [...activeHoldings].sort((a, b) => b.unrealizedGainLossPercent - a.unrealizedGainLossPercent)[0]
    : null;

  const isTotalProfit = totalProfitLoss >= 0;
  const isUnrealizedProfit = unrealizedProfitLoss >= 0;

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        
        {/* Card 1: Total Invested Amount */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg relative overflow-hidden group hover:border-slate-700/80 transition-all duration-200">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 to-cyan-500 opacity-80" />
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase tracking-wider">
            <span className="flex items-center gap-1.5 text-slate-300">
              <Wallet className="w-4 h-4 text-cyan-400" />
              Total Invested Amount
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-bold">
              Cost Basis
            </span>
          </div>
          
          <div className="mt-3 text-2xl lg:text-3xl font-bold text-white tracking-tight font-mono">
            {formatINR(totalInvestedAmount)}
          </div>
          
          <div className="mt-2.5 pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
            <span>Cumulative Purchases</span>
            <span className="font-mono text-slate-300 font-semibold">
              {formatINR(totalCumulativeInvested)}
            </span>
          </div>
        </div>

        {/* Card 2: Total Current Value */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg relative overflow-hidden group hover:border-slate-700/80 transition-all duration-200">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 to-teal-400 opacity-80" />
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase tracking-wider">
            <span className="flex items-center gap-1.5 text-slate-300">
              <PieChart className="w-4 h-4 text-emerald-400" />
              Total Current Value
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold">
              Market Value
            </span>
          </div>
          
          <div className="mt-3 text-2xl lg:text-3xl font-bold text-white tracking-tight font-mono">
            {formatINR(totalCurrentValue)}
          </div>
          
          <div className="mt-2.5 pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
            <span>Active Shares Owned</span>
            <span className="font-mono text-emerald-400 font-semibold">
              {totalActiveShares.toLocaleString()} shares
            </span>
          </div>
        </div>

        {/* Card 3: Total Profit/Loss */}
        <div className={`bg-slate-900 border ${isTotalProfit ? 'border-slate-800 hover:border-emerald-500/40' : 'border-slate-800 hover:border-rose-500/40'} rounded-2xl p-5 shadow-lg relative overflow-hidden group transition-all duration-200`}>
          <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${isTotalProfit ? 'from-emerald-500 to-teal-400' : 'from-rose-500 to-amber-500'} opacity-80`} />
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase tracking-wider">
            <span className="flex items-center gap-1.5 text-slate-300">
              {isTotalProfit ? (
                <TrendingUp className="w-4 h-4 text-emerald-400" />
              ) : (
                <TrendingDown className="w-4 h-4 text-rose-400" />
              )}
              Total Profit/Loss
            </span>
            <div className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
              isTotalProfit ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
            }`}>
              {isTotalProfit ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
              {isTotalProfit ? '+' : ''}{totalProfitLossPercent.toFixed(2)}%
            </div>
          </div>
          
          <div className={`mt-3 text-2xl lg:text-3xl font-bold tracking-tight font-mono ${
            isTotalProfit ? 'text-emerald-400' : 'text-rose-400'
          }`}>
            {isTotalProfit ? '+' : ''}{formatINR(totalProfitLoss)}
          </div>
          
          <div className="mt-2.5 pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5 text-slate-400">
              <span>Unrealized:</span>
              <span className={`font-mono font-semibold ${isUnrealizedProfit ? 'text-emerald-400' : 'text-rose-400'}`}>
                {isUnrealizedProfit ? '+' : ''}{formatINR(unrealizedProfitLoss)}
              </span>
            </div>
            {realizedProfitLoss !== 0 && (
              <div className="flex items-center gap-1 text-slate-400">
                <span>Realized:</span>
                <span className={`font-mono font-semibold ${realizedProfitLoss >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {realizedProfitLoss >= 0 ? '+' : ''}{formatINR(realizedProfitLoss)}
                </span>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Sub-bar: Portfolio Diagnostics & Top Performer */}
      <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-3 text-slate-300">
          <span className="flex items-center gap-1.5 text-slate-400">
            <Layers className="w-3.5 h-3.5 text-cyan-400" />
            <span>Active Positions:</span>
            <strong className="text-white font-mono">{activeHoldings.length}</strong>
          </span>
          <span className="text-slate-600">•</span>
          <span className="flex items-center gap-1 text-slate-400">
            <span>Winning Stocks:</span>
            <strong className="text-emerald-400 font-mono">
              {profitableHoldingsCount}/{activeHoldings.length || enrichedStocks.length}
            </strong>
          </span>
        </div>

        {topGainer && topGainer.unrealizedGainLossPercent !== 0 && (
          <div className="flex items-center gap-2">
            <span className="text-slate-400 flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              Top Gainer:
            </span>
            <span className="font-mono font-bold text-white bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
              {topGainer.Symbol}
            </span>
            <span className={`font-mono font-bold ${topGainer.unrealizedGainLossPercent >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {topGainer.unrealizedGainLossPercent >= 0 ? '+' : ''}{topGainer.unrealizedGainLossPercent.toFixed(2)}%
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
