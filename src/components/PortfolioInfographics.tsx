import React from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Dividend, EnrichedStock, formatINR, Industry, STOCK_CAPITALIZATIONS } from '../types/database';

interface PortfolioInfographicsProps {
  stocks: EnrichedStock[];
  industries: Industry[];
  dividends: Dividend[];
}

const chartColors = ['#22d3ee', '#34d399', '#fbbf24', '#fb7185', '#818cf8', '#a3e635', '#f97316', '#38bdf8'];
const tooltipStyle = {
  backgroundColor: '#0f172a',
  border: '1px solid #334155',
  borderRadius: 8,
  color: '#e2e8f0',
  fontSize: 12,
};

function formatCompact(value: number): string {
  return new Intl.NumberFormat('en-IN', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

const ChartPanel: React.FC<{ title: string; subtitle: string; children: React.ReactNode }> = ({
  title,
  subtitle,
  children,
}) => (
  <section className="min-w-0 rounded-xl border border-slate-800 bg-slate-900 p-4 sm:p-5">
    <div className="mb-4">
      <h3 className="text-sm font-bold text-white">{title}</h3>
      <p className="mt-1 text-xs text-slate-400">{subtitle}</p>
    </div>
    {children}
  </section>
);

export const PortfolioInfographics: React.FC<PortfolioInfographicsProps> = ({ stocks, industries, dividends }) => {
  const activeStocks = stocks.filter(stock => stock.totalQuantity > 0);
  const topHoldings = [...activeStocks]
    .sort((left, right) => right.currentHoldingValue - left.currentHoldingValue)
    .slice(0, 10)
    .map(stock => ({
      name: stock.Symbol,
      marketValue: stock.currentHoldingValue,
      openCost: stock.activeCostBasis,
    }));
  const stockPerformance = [...stocks]
    .sort((left, right) => Math.abs(right.realizedGainLoss) + Math.abs(right.unrealizedGainLoss)
      - Math.abs(left.realizedGainLoss) - Math.abs(left.unrealizedGainLoss))
    .slice(0, 10)
    .map(stock => ({
      name: stock.Symbol,
      realized: stock.realizedGainLoss,
      unrealized: stock.unrealizedGainLoss,
    }));
  const transactionValues = [...stocks]
    .filter(stock => stock.cumulativeInvested > 0 || stock.totalSales > 0)
    .sort((left, right) => Math.max(right.cumulativeInvested, right.totalSales)
      - Math.max(left.cumulativeInvested, left.totalSales))
    .slice(0, 10)
    .map(stock => ({
      name: stock.Symbol,
      purchases: stock.cumulativeInvested,
      sales: stock.totalSales,
    }));
  const quantityData = [...stocks]
    .filter(stock => stock.totalPurchasedQuantity > 0 || stock.totalSoldQuantity > 0)
    .sort((left, right) => right.totalPurchasedQuantity - left.totalPurchasedQuantity)
    .slice(0, 10)
    .map(stock => ({
      name: stock.Symbol,
      purchased: stock.totalPurchasedQuantity,
      sold: stock.totalSoldQuantity,
      held: stock.totalQuantity,
    }));
  const investmentRecommendations = [...stocks]
    .filter(stock => stock.SuggestedInvestment > 0 || stock.currentHoldingValue > 0)
    .sort((left, right) => Math.max(right.SuggestedInvestment, right.currentHoldingValue)
      - Math.max(left.SuggestedInvestment, left.currentHoldingValue))
    .slice(0, 12)
    .map(stock => ({
      name: stock.Symbol,
      suggested: stock.SuggestedInvestment,
      current: stock.currentHoldingValue,
    }));
  const capitalizationInvestments = STOCK_CAPITALIZATIONS.map(capitalization => {
    const categoryStocks = stocks.filter(stock => stock.Capitalization === capitalization);
    return {
      name: capitalization,
      suggested: categoryStocks.reduce((sum, stock) => sum + stock.SuggestedInvestment, 0),
      current: categoryStocks.reduce((sum, stock) => sum + stock.currentHoldingValue, 0),
    };
  });
  const industryMap = new Map<string, number>();
  activeStocks.forEach(stock => {
    const industry = stock.industryName || 'Other';
    industryMap.set(industry, (industryMap.get(industry) || 0) + stock.currentHoldingValue);
  });
  const industryAllocation = [...industryMap.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((left, right) => right.value - left.value);
  const stockById = new Map(stocks.map(stock => [stock.StockId.trim().toUpperCase(), stock]));
  const dividendTotalsByStock = new Map<string, { name: string; total: number }>();
  dividends.forEach(dividend => {
    const stockId = dividend.StockId.trim().toUpperCase();
    const stock = stockById.get(stockId);
    const current = dividendTotalsByStock.get(stockId) || { name: stock?.Symbol || stockId, total: 0 };
    current.total += dividend.TotalDividend;
    dividendTotalsByStock.set(stockId, current);
  });
  const dividendsByStock = [...dividendTotalsByStock.values()].sort((left, right) => right.total - left.total);

  const totalCorpus = stocks.reduce((sum, stock) => sum + stock.cumulativeInvested, 0);
  const industryInvestmentComparison = industries.map(industry => {
    const industryStocks = stocks.filter(stock =>
      stock.IndustryId.trim().toUpperCase() === industry.IndustryId.trim().toUpperCase()
    );
    return {
      name: industry.Name,
      invested: industryStocks.reduce((sum, stock) => sum + stock.cumulativeInvested, 0),
      suggested: totalCorpus * industry.Suggested / 100,
      suggestedPercent: industry.Suggested,
    };
  }).filter(item => item.invested > 0 || item.suggested > 0);

  const totalMarketValue = activeStocks.reduce((sum, stock) => sum + stock.currentHoldingValue, 0);
  const openCost = activeStocks.reduce((sum, stock) => sum + stock.activeCostBasis, 0);
  const totalPurchases = stocks.reduce((sum, stock) => sum + stock.cumulativeInvested, 0);
  const totalSales = stocks.reduce((sum, stock) => sum + stock.totalSales, 0);
  const totalDividendIncome = dividends.reduce((sum, dividend) => sum + dividend.TotalDividend, 0);
  const totalSuggestedInvestment = stocks.reduce((sum, stock) => sum + stock.SuggestedInvestment, 0);
  const realizedGainLoss = stocks.reduce((sum, stock) => sum + stock.realizedGainLoss, 0);
  const unrealizedGainLoss = stocks.reduce((sum, stock) => sum + stock.unrealizedGainLoss, 0);

  const metrics = [
    { label: 'Market Value', value: formatINR(totalMarketValue), color: 'text-emerald-300' },
    { label: 'Open Cost Basis', value: formatINR(openCost), color: 'text-cyan-300' },
    { label: 'Total Purchases', value: formatINR(totalPurchases), color: 'text-sky-300' },
    { label: 'Suggested Investment', value: formatINR(totalSuggestedInvestment), color: 'text-cyan-300' },
    { label: 'Total Sales', value: formatINR(totalSales), color: 'text-amber-300' },
    { label: 'Dividend Income', value: formatINR(totalDividendIncome), color: 'text-emerald-300' },
    { label: 'Realized P&L', value: formatINR(realizedGainLoss), color: realizedGainLoss >= 0 ? 'text-emerald-300' : 'text-rose-300' },
    { label: 'Unrealized P&L', value: formatINR(unrealizedGainLoss), color: unrealizedGainLoss >= 0 ? 'text-emerald-300' : 'text-rose-300' },
  ];

  const noData = (message: string) => (
    <div className="flex h-[260px] items-center justify-center text-xs text-slate-500">{message}</div>
  );

  return (
    <div className="space-y-4 p-4 sm:p-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-8">
        {metrics.map(metric => (
          <div key={metric.label} className="min-w-0 border-l-2 border-slate-700 pl-3 py-1">
            <div className="text-[10px] font-semibold uppercase text-slate-500">{metric.label}</div>
            <div className={`mt-1 truncate text-sm font-bold font-mono ${metric.color}`} title={metric.value}>
              {metric.value}
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartPanel title="Dividend Income by Stock" subtitle="Total dividend received from each stock across imported dividend records">
          {dividendsByStock.length ? (
            <ResponsiveContainer width="100%" height={330}>
              <BarChart data={dividendsByStock} layout="vertical" margin={{ top: 4, right: 18, bottom: 4, left: 8 }}>
                <CartesianGrid stroke="#1e293b" horizontal={false} />
                <XAxis type="number" tickFormatter={formatCompact} tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={84} tick={{ fill: '#cbd5e1', fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} formatter={(value) => formatINR(Number(value))} />
                <Bar dataKey="total" name="Total Dividends" fill="#34d399" radius={[0, 4, 4, 0]}>
                  {dividendsByStock.map((entry, index) => (
                    <Cell key={entry.name} fill={chartColors[index % chartColors.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : noData('Import dividend records to compare dividend income by stock.')}
        </ChartPanel>

        <ChartPanel title="Suggested vs. Current Investment" subtitle="Top stocks by either recommended allocation or current market value">
          {investmentRecommendations.length ? (
            <ResponsiveContainer width="100%" height={330}>
              <BarChart data={investmentRecommendations} layout="vertical" margin={{ top: 4, right: 18, bottom: 4, left: 8 }}>
                <CartesianGrid stroke="#1e293b" horizontal={false} />
                <XAxis type="number" tickFormatter={formatCompact} tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={72} tick={{ fill: '#cbd5e1', fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} formatter={(value) => formatINR(Number(value))} />
                <Legend wrapperStyle={{ color: '#cbd5e1', fontSize: 11 }} />
                <Bar dataKey="suggested" name="Suggested Investment" fill="#22d3ee" radius={[0, 4, 4, 0]} />
                <Bar dataKey="current" name="Current Market Value" fill="#34d399" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : noData('Add suggested allocations or record holdings to compare investments.')}
        </ChartPanel>

        <ChartPanel title="Investment by Capitalization" subtitle="Suggested allocations compared with current market value in each company size category">
          {capitalizationInvestments.some(item => item.suggested > 0 || item.current > 0) ? (
            <ResponsiveContainer width="100%" height={330}>
              <BarChart data={capitalizationInvestments} margin={{ top: 8, right: 8, bottom: 8, left: 4 }}>
                <CartesianGrid stroke="#1e293b" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: '#cbd5e1', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={formatCompact} tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} formatter={(value) => formatINR(Number(value))} />
                <Legend wrapperStyle={{ color: '#cbd5e1', fontSize: 11 }} />
                <Bar dataKey="suggested" name="Suggested Investment" fill="#818cf8" radius={[3, 3, 0, 0]} />
                <Bar dataKey="current" name="Current Market Value" fill="#fbbf24" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : noData('Classify stocks and add suggested allocations to view this comparison.')}
        </ChartPanel>

        <ChartPanel title="Largest Holdings" subtitle="Current market value compared with the cost basis of shares still held">
          {topHoldings.length ? (
            <ResponsiveContainer width="100%" height={310}>
              <BarChart data={topHoldings} layout="vertical" margin={{ top: 4, right: 18, bottom: 4, left: 8 }}>
                <CartesianGrid stroke="#1e293b" horizontal={false} />
                <XAxis type="number" tickFormatter={formatCompact} tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={72} tick={{ fill: '#cbd5e1', fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} formatter={(value) => formatINR(Number(value))} />
                <Legend wrapperStyle={{ color: '#cbd5e1', fontSize: 11 }} />
                <Bar dataKey="marketValue" name="Market Value" fill="#34d399" radius={[0, 4, 4, 0]} />
                <Bar dataKey="openCost" name="Open Cost Basis" fill="#22d3ee" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : noData('No active holdings to chart yet.')}
        </ChartPanel>

        <ChartPanel title="Allocation by Industry" subtitle="Share of current portfolio market value across industries">
          {industryAllocation.length ? (
            <ResponsiveContainer width="100%" height={310}>
              <PieChart>
                <Pie data={industryAllocation} dataKey="value" nameKey="name" cx="50%" cy="48%" innerRadius={66} outerRadius={105} paddingAngle={2}>
                  {industryAllocation.map((entry, index) => (
                    <Cell key={entry.name} fill={chartColors[index % chartColors.length]} stroke="#0f172a" />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} formatter={(value) => formatINR(Number(value))} />
                <Legend layout="horizontal" verticalAlign="bottom" align="center" wrapperStyle={{ color: '#cbd5e1', fontSize: 10 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : noData('Industry allocation appears when the portfolio has active holdings.')}
        </ChartPanel>

        <ChartPanel title="Industry Investment vs. Suggested" subtitle={`Historical purchase cost versus each industry's suggested share of the ${formatINR(totalCorpus)} portfolio corpus`}>
          {industryInvestmentComparison.length ? (
            <ResponsiveContainer width="100%" height={330}>
              <BarChart data={industryInvestmentComparison} layout="vertical" margin={{ top: 4, right: 18, bottom: 4, left: 8 }}>
                <CartesianGrid stroke="#1e293b" horizontal={false} />
                <XAxis type="number" tickFormatter={formatCompact} tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={128} tick={{ fill: '#cbd5e1', fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value, name, item) => [formatINR(Number(value)), `${String(name)}${name === 'Suggested' ? ` (${item.payload.suggestedPercent}%)` : ''}`]}
                />
                <Legend wrapperStyle={{ color: '#cbd5e1', fontSize: 11 }} />
                <Bar dataKey="invested" name="Invested" fill="#34d399" radius={[0, 4, 4, 0]} />
                <Bar dataKey="suggested" name="Suggested" fill="#22d3ee" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : noData('Add industry Suggested percentages or stock investments to view this comparison.')}
        </ChartPanel>

        <ChartPanel title="Realized and Unrealized P&L" subtitle="Profit or loss by stock for sold shares and current holdings">
          {stockPerformance.length ? (
            <ResponsiveContainer width="100%" height={310}>
              <BarChart data={stockPerformance} margin={{ top: 8, right: 8, bottom: 8, left: 4 }}>
                <CartesianGrid stroke="#1e293b" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={formatCompact} tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} formatter={(value) => formatINR(Number(value))} />
                <Legend wrapperStyle={{ color: '#cbd5e1', fontSize: 11 }} />
                <Bar dataKey="realized" name="Realized P&L" fill="#fbbf24" radius={[3, 3, 0, 0]} />
                <Bar dataKey="unrealized" name="Unrealized P&L" fill="#22d3ee" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : noData('P&L data appears after recording purchases or sales.')}
        </ChartPanel>

        <ChartPanel title="Purchases and Sales" subtitle="Historical transaction value by stock, before sale proceeds or fees are netted">
          {transactionValues.length ? (
            <ResponsiveContainer width="100%" height={310}>
              <BarChart data={transactionValues} margin={{ top: 8, right: 8, bottom: 8, left: 4 }}>
                <CartesianGrid stroke="#1e293b" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={formatCompact} tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} formatter={(value) => formatINR(Number(value))} />
                <Legend wrapperStyle={{ color: '#cbd5e1', fontSize: 11 }} />
                <Bar dataKey="purchases" name="Purchases" fill="#818cf8" radius={[3, 3, 0, 0]} />
                <Bar dataKey="sales" name="Sales" fill="#fb7185" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : noData('Purchase and sale comparisons appear after transactions are recorded.')}
        </ChartPanel>

        <ChartPanel title="Share Quantities" subtitle="Purchased, sold, and currently held shares by stock">
          {quantityData.length ? (
            <ResponsiveContainer width="100%" height={310}>
              <BarChart data={quantityData} margin={{ top: 8, right: 8, bottom: 8, left: 4 }}>
                <CartesianGrid stroke="#1e293b" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={formatCompact} tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ color: '#cbd5e1', fontSize: 11 }} />
                <Bar dataKey="purchased" name="Purchased" fill="#38bdf8" radius={[3, 3, 0, 0]} />
                <Bar dataKey="sold" name="Sold" fill="#f97316" radius={[3, 3, 0, 0]} />
                <Bar dataKey="held" name="Currently Held" fill="#34d399" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : noData('Share quantities appear after purchases are recorded.')}
        </ChartPanel>
      </div>
    </div>
  );
};
