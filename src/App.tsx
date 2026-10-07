import React, { useEffect, useState, useCallback } from 'react';
import { GoogleUser, googleSignIn, logout } from './services/googleOAuth';
import { 
  findInvestmentSpreadsheet, 
  createInvestmentSpreadsheet, 
  loadAllTables, 
  joinPurchasesWithStocks, 
  joinSalesWithPurchasesAndStocks,
  aggregateStockHoldings, 
  executePurchaseTransaction,
  executeSaleTransaction,
  updatePurchaseTransaction,
  updateSaleTransaction,
  updateStockPrices,
  saveStock,
  importDividendsCsv,
  TRACKER_SPREADSHEET_NAME 
} from './services/sheetsDatabase';
import type { DividendCsvImportResult } from './services/sheetsDatabase';
import { 
  Industry,
  Stock, 
  Purchase, 
  Sale,
  Dividend,
  EnrichedPurchase, 
  EnrichedSale,
  EnrichedStock,
  DEFAULT_INDUSTRIES,
  getTodayDateOnly
} from './types/database';
import { AuthScreen } from './components/AuthScreen';
import { PortfolioDashboard } from './components/PortfolioDashboard';
import { 
  TrendingUp, 
  LogOut, 
  CheckCircle2, 
  AlertCircle 
} from 'lucide-react';

export default function App() {
  const [user, setUser] = useState<GoogleUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Spreadsheet Database State
  const [spreadsheetId, setSpreadsheetId] = useState<string | null>(null);
  const [isInitializingSheet, setIsInitializingSheet] = useState<boolean>(false);
  const [isLoadingData, setIsLoadingData] = useState<boolean>(false);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Relational Tables (Industry, Stocks as main table, Purchases as transaction table, Sales as sale ledger)
  const [industries, setIndustries] = useState<Industry[]>(DEFAULT_INDUSTRIES);
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [dividends, setDividends] = useState<Dividend[]>([]);

  // Joined Relational Data
  const [enrichedStocks, setEnrichedStocks] = useState<EnrichedStock[]>([]);
  const [enrichedPurchases, setEnrichedPurchases] = useState<EnrichedPurchase[]>([]);
  const [enrichedSales, setEnrichedSales] = useState<EnrichedSale[]>([]);

  const showNotification = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setNotification({ message, type });
    setTimeout(() => {
      setNotification(null);
    }, 4500);
  };

  // Re-compute joined views whenever tables change
  useEffect(() => {
    if (stocks.length > 0) {
      const joinedP = joinPurchasesWithStocks(purchases, stocks, industries, sales);
      const joinedS = joinSalesWithPurchasesAndStocks(sales, purchases, stocks, industries);
      const aggregatedS = aggregateStockHoldings(stocks, purchases, industries, sales);
      setEnrichedPurchases(joinedP);
      setEnrichedSales(joinedS);
      setEnrichedStocks(aggregatedS);
    } else {
      setEnrichedPurchases([]);
      setEnrichedSales([]);
      setEnrichedStocks([]);
    }
  }, [stocks, purchases, sales, industries]);

  // Load or Create Google Sheet Database
  const setupSpreadsheet = useCallback(async (accessToken: string) => {
    setIsInitializingSheet(true);
    try {
      showNotification('Checking for "InvestmentStockTracker" in Google Drive...', 'info');
      let sheet = await findInvestmentSpreadsheet(accessToken);
      
      if (!sheet) {
        showNotification('Creating new "InvestmentStockTracker" spreadsheet with Industry, Stocks, Purchases & Sales tables...', 'info');
        sheet = await createInvestmentSpreadsheet(accessToken);
        showNotification('Created InvestmentStockTracker database with Industry, Stocks (Main), Purchases, and Sales tables!', 'success');
      } else {
        showNotification('Connected to "InvestmentStockTracker" spreadsheet database!', 'success');
      }

      setSpreadsheetId(sheet.id);
      await refreshData(accessToken, sheet.id);
    } catch (err: any) {
      console.error('Spreadsheet initialization error:', err);
      showNotification(`Database Error: ${err.message || 'Failed to initialize sheet'}`, 'error');
    } finally {
      setIsInitializingSheet(false);
    }
  }, []);

  // Fetch all relational tables from Google Sheets
  const refreshData = async (accessToken: string, sheetId: string) => {
    setIsLoadingData(true);
    try {
      const data = await loadAllTables(accessToken, sheetId);
      if (data.industries && data.industries.length > 0) {
        setIndustries(data.industries);
      }
      setStocks(data.stocks);
      setPurchases(data.purchases);
      setSales(data.sales || []);
      setDividends(data.dividends || []);
    } catch (err: any) {
      console.error('Data loading error:', err);
      showNotification(`Failed to load data: ${err.message}`, 'error');
    } finally {
      setIsLoadingData(false);
    }
  };

  const handleSignIn = async () => {
    setIsAuthLoading(true);
    setAuthError(null);
    try {
      const result = await googleSignIn();
      if (result) {
        setUser(result.user);
        setToken(result.accessToken);
        await setupSpreadsheet(result.accessToken);
      }
    } catch (err: any) {
      console.error('Login error:', err);
      setAuthError(err.message || 'Failed to sign in with Google');
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logout(token);
    } finally {
      setUser(null);
      setToken(null);
      setSpreadsheetId(null);
      setStocks([]);
      setPurchases([]);
      setSales([]);
      setDividends([]);
    }
  };

  // Real-time Purchase transaction execution (fast and immediate)
  const handleExecutePurchase = async (purchaseData: any) => {
    if (!token || !spreadsheetId) return;

    try {
      const result = await executePurchaseTransaction(
        token,
        spreadsheetId,
        purchaseData,
        purchases
      );

      // Optimistically update purchases list immediately
      setPurchases(prev => [result.newPurchase, ...prev]);
      showNotification(`Purchase ${result.purchaseId} recorded in Google Sheets!`, 'success');
      
      // Background re-fetch to ensure sync with sheet
      refreshData(token, spreadsheetId).catch(console.error);
    } catch (err: any) {
      console.error('Purchase execution failed:', err);
      showNotification(`Purchase failed: ${err.message}`, 'error');
      throw err;
    }
  };

  // Real-time Purchase update transaction execution
  const handleUpdatePurchase = async (updatedPurchase: Purchase) => {
    if (!token || !spreadsheetId) return;

    try {
      const result = await updatePurchaseTransaction(token, spreadsheetId, updatedPurchase);

      // Optimistically update purchases list immediately
      setPurchases(prev =>
        prev.map(p =>
          p.PurchaseId.trim().toUpperCase() === result.purchase.PurchaseId.trim().toUpperCase()
            ? result.purchase
            : p
        )
      );
      showNotification(`Purchase record ${result.purchase.PurchaseId} updated in Google Sheets!`, 'success');

      // Background re-fetch to ensure sync with sheet
      refreshData(token, spreadsheetId).catch(console.error);
    } catch (err: any) {
      console.error('Purchase update failed:', err);
      showNotification(`Failed to update purchase: ${err.message}`, 'error');
      throw err;
    }
  };

  // Real-time Sale transaction execution (fast and immediate)
  const handleExecuteSale = async (saleData: any) => {
    if (!token || !spreadsheetId) return;

    try {
      const result = await executeSaleTransaction(
        token,
        spreadsheetId,
        saleData,
        sales
      );

      // Optimistically update sales list immediately
      setSales(prev => [result.newSale, ...prev]);
      showNotification(`Sale ${result.saleId} recorded in Google Sheets!`, 'success');
      
      // Background re-fetch to ensure sync with sheet
      refreshData(token, spreadsheetId).catch(console.error);
    } catch (err: any) {
      console.error('Sale execution failed:', err);
      showNotification(`Sale failed: ${err.message}`, 'error');
      throw err;
    }
  };

  // Real-time Sale update transaction execution
  const handleUpdateSale = async (updatedSale: Sale) => {
    if (!token || !spreadsheetId) return;

    try {
      const result = await updateSaleTransaction(token, spreadsheetId, updatedSale);

      // Optimistically update sales list immediately
      setSales(prev =>
        prev.map(s =>
          s.SaleId.trim().toUpperCase() === result.sale.SaleId.trim().toUpperCase() ? result.sale : s
        )
      );
      showNotification(`Sale record ${result.sale.SaleId} updated in Google Sheets!`, 'success');

      // Background re-fetch to ensure sync with sheet
      refreshData(token, spreadsheetId).catch(console.error);
    } catch (err: any) {
      console.error('Sale update failed:', err);
      showNotification(`Failed to update sale: ${err.message}`, 'error');
      throw err;
    }
  };

  // Simulate market price fluctuation and update Stocks sheet
  const handleSimulatePriceTick = async () => {
    if (!token || !spreadsheetId || stocks.length === 0) return;

    try {
      showNotification('Simulating market price ticks and updating Stocks sheet table...', 'info');
      const updatedStocks: Stock[] = stocks.map(stock => {
        // -2.5% to +2.5% random tick
        const delta = (Math.random() * 0.05 - 0.025);
        const newPrice = Math.max(1, parseFloat((stock.CurrentPrice * (1 + delta)).toFixed(2)));
        return {
          ...stock,
          CurrentPrice: newPrice,
          LastUpdated: getTodayDateOnly(),
        };
      });

      await updateStockPrices(token, spreadsheetId, updatedStocks);
      setStocks(updatedStocks);
      showNotification('Stock prices updated successfully in Google Sheet Stocks table!', 'success');
    } catch (err: any) {
      showNotification(`Failed to update stock prices: ${err.message}`, 'error');
    }
  };

  // Add new stock to Stocks main table
  const handleAddStock = async (newStock: Stock) => {
    if (!token || !spreadsheetId) return;
    try {
      showNotification(`Adding ticker "${newStock.Symbol}" (${newStock.StockId}) to Stocks table...`, 'info');
      await saveStock(token, spreadsheetId, newStock, stocks);
      await refreshData(token, spreadsheetId);
      showNotification(`Stock ${newStock.Symbol} (${newStock.StockId}) successfully added!`, 'success');
    } catch (err: any) {
      showNotification(`Failed to add stock: ${err.message}`, 'error');
    }
  };

  // Update existing stock details in Stocks table (fast and immediate)
  const handleUpdateStock = async (updatedStock: Stock) => {
    if (!token || !spreadsheetId) return;
    try {
      setStocks(prev => prev.map(s => s.StockId === updatedStock.StockId ? updatedStock : s));
      showNotification(`Updating stock ${updatedStock.Symbol} (${updatedStock.StockId}) in Google Sheets...`, 'info');
      await saveStock(token, spreadsheetId, updatedStock, stocks);
      showNotification(`Stock ${updatedStock.Symbol} (${updatedStock.StockId}) successfully updated!`, 'success');
      refreshData(token, spreadsheetId).catch(console.error);
    } catch (err: any) {
      showNotification(`Failed to update stock: ${err.message}`, 'error');
    }
  };

  const handleImportDividends = async (csvText: string): Promise<DividendCsvImportResult> => {
    if (!token || !spreadsheetId) throw new Error('Connect to the spreadsheet before importing dividends.');
    const result = await importDividendsCsv(token, spreadsheetId, csvText, stocks, dividends);
    setDividends(previous => [...result.imported, ...previous]);
    return result;
  };

  // If user is not logged in, show Auth Screen
  if (!user || !token) {
    return <AuthScreen onSignIn={handleSignIn} isLoading={isAuthLoading} error={authError} />;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-30 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 px-3.5 sm:px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 p-0.5 flex items-center justify-center shadow-lg shadow-emerald-950/40 shrink-0">
            <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
              <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-400" />
            </div>
          </div>
          <div className="min-w-0">
            <h1 className="text-sm sm:text-base font-bold text-white tracking-tight leading-none truncate">
              Portfolio Tracker
            </h1>
            <p className="text-[10px] sm:text-xs text-slate-400 mt-0.5 truncate">
              Real-time holdings, purchases & sales
            </p>
          </div>
        </div>

        {/* User profile & Logout */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <div className="hidden md:flex flex-col text-right">
            <span className="text-xs font-semibold text-white">{user.displayName || 'Investor'}</span>
            <span className="text-[10px] text-slate-400">{user.email}</span>
          </div>
          {user.photoURL ? (
            <img
              src={user.photoURL}
              alt={user.displayName || 'User'}
              className="w-7 h-7 sm:w-8 sm:h-8 rounded-full border border-slate-700 shadow"
            />
          ) : (
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold text-slate-300">
              {user.displayName?.[0] || 'U'}
            </div>
          )}
          <button
            onClick={handleLogout}
            className="p-1.5 sm:p-2 text-slate-400 hover:text-rose-400 hover:bg-slate-800/80 rounded-xl transition cursor-pointer"
            title="Sign Out"
            aria-label="Sign Out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Toast Notification */}
      {notification && (
        <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom-5 duration-300 max-w-md">
          <div
            className={`p-4 rounded-2xl shadow-2xl border flex items-start gap-3 backdrop-blur-md ${
              notification.type === 'success'
                ? 'bg-emerald-950/90 border-emerald-500/30 text-emerald-200'
                : notification.type === 'error'
                ? 'bg-rose-950/90 border-rose-500/30 text-rose-200'
                : 'bg-slate-900/90 border-cyan-500/30 text-cyan-200'
            }`}
          >
            {notification.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            ) : notification.type === 'error' ? (
              <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            ) : (
              <div className="w-5 h-5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin shrink-0 mt-0.5" />
            )}
            <div className="text-xs font-medium leading-relaxed">{notification.message}</div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6">
        {isInitializingSheet ? (
          <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
            <div className="w-12 h-12 border-3 border-emerald-500/20 border-t-emerald-400 rounded-full animate-spin mb-4" />
            <h3 className="text-lg font-bold text-white">Connecting to Portfolio</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-sm">
              Syncing portfolio database with Google Sheets...
            </p>
          </div>
        ) : spreadsheetId ? (
          <PortfolioDashboard
            spreadsheetId={spreadsheetId}
            spreadsheetName={TRACKER_SPREADSHEET_NAME}
            industries={industries}
            stocks={stocks}
            purchases={purchases}
            sales={sales}
            dividends={dividends}
            enrichedStocks={enrichedStocks}
            enrichedPurchases={enrichedPurchases}
            enrichedSales={enrichedSales}
            isLoading={isLoadingData}
            onRefresh={() => token && refreshData(token, spreadsheetId)}
            onExecutePurchase={handleExecutePurchase}
            onUpdatePurchase={handleUpdatePurchase}
            onExecuteSale={handleExecuteSale}
            onUpdateSale={handleUpdateSale}
            onSimulatePriceTick={handleSimulatePriceTick}
            onAddStock={handleAddStock}
            onUpdateStock={handleUpdateStock}
            onImportDividends={handleImportDividends}
          />
        ) : (
          <div className="text-center py-16">
            <p className="text-sm text-slate-400">Failed to connect to Google Sheets. Try refreshing.</p>
            <button
              onClick={() => token && setupSpreadsheet(token)}
              className="mt-4 px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-semibold"
            >
              Retry Connection
            </button>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 py-3.5 px-4 text-center text-xs text-slate-500">
        Portfolio Tracker • Real-time Investment Management
      </footer>
    </div>
  );
}
