import { 
  INVESTMENT_SHEET_SCHEMAS, 
  Industry,
  Stock, 
  Purchase, 
  Sale,
  EnrichedPurchase, 
  EnrichedSale,
  EnrichedStock, 
  generatePurchaseId,
  generateSaleId,
  deriveExchangeFromMktSymbol,
  DEFAULT_INDUSTRIES
} from '../types/database';

export const TRACKER_SPREADSHEET_NAME = 'InvestmentStockTracker';

interface SheetApiErrorResponse {
  error?: {
    code: number;
    message: string;
    status: string;
  };
}

/**
 * Searches Google Drive for an existing spreadsheet named "InvestmentStockTracker".
 */
export async function findInvestmentSpreadsheet(accessToken: string): Promise<{ id: string; name: string } | null> {
  const query = encodeURIComponent(`name = '${TRACKER_SPREADSHEET_NAME}' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`);
  const response = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,modifiedTime)&spaces=drive`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(`Google Drive API error: ${err?.error?.message || response.statusText}`);
  }

  const data = await response.json();
  if (data.files && data.files.length > 0) {
    return { id: data.files[0].id, name: data.files[0].name };
  }
  return null;
}

/**
 * Creates the InvestmentStockTracker Google Spreadsheet with Industry, Stocks, and Purchases tables.
 */
export async function createInvestmentSpreadsheet(accessToken: string): Promise<{ id: string; name: string }> {
  const payload = {
    properties: {
      title: TRACKER_SPREADSHEET_NAME,
    },
    sheets: INVESTMENT_SHEET_SCHEMAS.map(schema => ({
      properties: {
        title: schema.title,
        gridProperties: {
          rowCount: 200,
          columnCount: schema.headers.length + 2,
          frozenRowCount: 1,
        },
      },
    })),
  };

  const createRes = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!createRes.ok) {
    const err: SheetApiErrorResponse = await createRes.json();
    throw new Error(`Failed to create spreadsheet: ${err?.error?.message || createRes.statusText}`);
  }

  const createdData = await createRes.json();
  const spreadsheetId = createdData.spreadsheetId;

  // Populate headers and initial seed data for Industry, Stocks, and Purchases
  const valueData = INVESTMENT_SHEET_SCHEMAS.map(schema => ({
    range: `${schema.title}!A1:${String.fromCharCode(65 + schema.headers.length - 1)}${schema.sampleRows.length + 1}`,
    values: [schema.headers, ...schema.sampleRows],
  }));

  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      valueInputOption: 'USER_ENTERED',
      data: valueData,
    }),
  });

  await formatSpreadsheetTables(accessToken, spreadsheetId, createdData.sheets);

  return { id: spreadsheetId, name: TRACKER_SPREADSHEET_NAME };
}

/**
 * Format headers with styling
 */
async function formatSpreadsheetTables(accessToken: string, spreadsheetId: string, sheets: any[]) {
  try {
    const requests = sheets.map(sheet => ({
      repeatCell: {
        range: {
          sheetId: sheet.properties.sheetId,
          startRowIndex: 0,
          endRowIndex: 1,
        },
        cell: {
          userEnteredFormat: {
            backgroundColor: { red: 0.08, green: 0.12, blue: 0.22 },
            textFormat: {
              foregroundColor: { red: 1, green: 1, blue: 1 },
              bold: true,
              fontSize: 10,
            },
          },
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat)',
      },
    }));

    await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ requests }),
    });
  } catch (err) {
    console.error('Error formatting headers:', err);
  }
}

function parseNumericValue(val: any): number | undefined {
  if (val === undefined || val === null || val === '') return undefined;
  if (typeof val === 'number') return isNaN(val) ? undefined : val;
  const cleaned = String(val).replace(/[^0-9.-]/g, '');
  if (!cleaned) return undefined;
  const num = parseFloat(cleaned);
  return isNaN(num) ? undefined : num;
}

function colIndexToLetter(colIndex: number): string {
  let temp = colIndex;
  let letter = '';
  while (temp >= 0) {
    letter = String.fromCharCode((temp % 26) + 65) + letter;
    temp = Math.floor(temp / 26) - 1;
  }
  return letter;
}

/**
 * Ensures the 'Industry', 'Stocks', and 'Purchases' sheets exist in the spreadsheet.
 */
export async function ensureRequiredSheets(accessToken: string, spreadsheetId: string): Promise<void> {
  const metaRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!metaRes.ok) return;

  const metaData = await metaRes.json();
  const existingSheetTitles = new Set(metaData.sheets?.map((s: any) => s.properties?.title) || []);

  const missingSchemas = INVESTMENT_SHEET_SCHEMAS.filter(schema => !existingSheetTitles.has(schema.title));

  if (missingSchemas.length > 0) {
    const addSheetRequests = missingSchemas.map(schema => ({
      addSheet: {
        properties: {
          title: schema.title,
          gridProperties: {
            rowCount: 200,
            columnCount: schema.headers.length + 2,
            frozenRowCount: 1,
          },
        },
      },
    }));

    const updateRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ requests: addSheetRequests }),
    });

    if (updateRes.ok) {
      const valueData = missingSchemas.map(schema => ({
        range: `${schema.title}!A1:${String.fromCharCode(65 + schema.headers.length - 1)}${schema.sampleRows.length + 1}`,
        values: [schema.headers, ...schema.sampleRows],
      }));

      await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          valueInputOption: 'USER_ENTERED',
          data: valueData,
        }),
      });
    }
  }
}

/**
 * Loads all relational tables from Google Sheets:
 * - Industry (IndustryId PK, Name)
 * - Stocks (StockId PK, Symbol, MktSymbol, CompanyName, IndustryId/InduistryId FK, Exchange, CurrentPrice...)
 * - Purchases (PurchaseId PK, StockId FK, PurchaseDate...)
 * - Sales (SaleId PK, PurchaseId FK, StockId FK, SaleDate, Quantity, SalePrice...)
 */
export async function loadAllTables(accessToken: string, spreadsheetId: string): Promise<{
  industries: Industry[];
  stocks: Stock[];
  purchases: Purchase[];
  sales: Sale[];
}> {
  await ensureRequiredSheets(accessToken, spreadsheetId);

  const ranges = ['Industry!A1:Z', 'Stocks!A1:Z', 'Purchases!A1:Z', 'Sales!A1:Z'];
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet?` +
    ranges.map(r => `ranges=${encodeURIComponent(r)}`).join('&');

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Failed to load tables: ${err?.error?.message || res.statusText}`);
  }

  const data = await res.json();
  const valueRanges = data.valueRanges || [];

  const parseTable = (index: number) => {
    const vr = valueRanges[index];
    if (!vr || !vr.values || vr.values.length < 2) return [];
    const headers = vr.values[0] as string[];
    const rows = vr.values.slice(1);

    return rows.map((row: any[]) => {
      const obj: any = {};
      headers.forEach((h, colIdx) => {
        obj[h] = row[colIdx] !== undefined ? row[colIdx] : '';
      });
      return obj;
    });
  };

  const rawIndustries = parseTable(0);
  const rawStocks = parseTable(1);
  const rawPurchases = parseTable(2);
  const rawSales = parseTable(3);

  // Parse Industries
  const parsedIndustries: Industry[] = rawIndustries.length > 0 
    ? rawIndustries.map((ind: any, idx: number) => ({
        IndustryId: (ind.IndustryId || `IND${String(idx + 1).padStart(4, '0')}`).trim(),
        Name: ind.Name || 'General',
      }))
    : DEFAULT_INDUSTRIES;

  // Deduplicate industries by IndustryId (Primary Key)
  const industryMapById = new Map<string, Industry>();
  parsedIndustries.forEach(ind => {
    const key = ind.IndustryId.toUpperCase();
    if (!industryMapById.has(key)) {
      industryMapById.set(key, ind);
    }
  });
  const industries: Industry[] = Array.from(industryMapById.values());

  const industryNameMap = new Map<string, string>(industries.map(i => [i.Name.toLowerCase(), i.IndustryId]));

  // Parse Stocks
  const parsedStocks: Stock[] = rawStocks.map((s: any, idx: number) => {
    const rawStockId = (s.StockId || `STK${String(idx + 1).padStart(4, '0')}`).toString().trim();
    const symbol = (s.Symbol || '').toUpperCase().trim();
    const mktSymbol = (s.MktSymbol || `${symbol}.NSE`).toUpperCase().trim();
    const exchange = s.Exchange || deriveExchangeFromMktSymbol(mktSymbol, symbol);

    // Support IndustryId, InduistryId, or derive from legacy Sector name
    let industryId = s.IndustryId || s.InduistryId;
    if (!industryId && s.Sector) {
      industryId = industryNameMap.get(s.Sector.toLowerCase()) || 'IND0002';
    }
    if (!industryId) {
      industryId = 'IND0002';
    }

    const rawLive = parseNumericValue(s.Liverate) ?? parseNumericValue(s.liverate) ?? parseNumericValue(s.LiveRate) ?? parseNumericValue(s.CurrentPrice) ?? 0;
    const fallbackPrice = parseNumericValue(s.CurrentPrice) ?? 0;
    const finalPrice = rawLive > 0 ? rawLive : fallbackPrice;

    return {
      StockId: rawStockId,
      Symbol: symbol,
      MktSymbol: mktSymbol,
      CompanyName: s.CompanyName || '',
      IndustryId: industryId,
      Sector: s.Sector || '',
      Exchange: exchange,
      Liverate: finalPrice,
      CurrentPrice: finalPrice,
      CloseYest: parseNumericValue(s.closeyest) ?? parseNumericValue(s.CloseYest) ?? parseNumericValue(s.close_yest),
      Volume: parseNumericValue(s.volume) ?? parseNumericValue(s.Volume),
      High52: parseNumericValue(s['52WkHigh']) ?? parseNumericValue(s['52wkhigh']) ?? parseNumericValue(s.High52),
      Low52: parseNumericValue(s['52WkLow']) ?? parseNumericValue(s['52wklow']) ?? parseNumericValue(s.Low52),
      SharesFormula: parseNumericValue(s.shares) ?? parseNumericValue(s.Shares),
      ChangePct: parseNumericValue(s.changepct) ?? parseNumericValue(s.ChangePct),
      Eps: parseNumericValue(s.eps) ?? parseNumericValue(s.Eps) ?? parseNumericValue(s.EPS),
      Pe: parseNumericValue(s.pe) ?? parseNumericValue(s.Pe) ?? parseNumericValue(s.PE),
      Currency: s.Currency || 'INR',
      DividendYield: parseFloat(s.DividendYield) || 0,
      LastUpdated: s.LastUpdated || new Date().toISOString(),
    };
  });

  // Deduplicate stocks by StockId (Primary Key uniqueness) to prevent duplicate key crashes
  const stockMapById = new Map<string, Stock>();
  parsedStocks.forEach(s => {
    const key = s.StockId.toUpperCase();
    const existing = stockMapById.get(key);
    if (!existing) {
      stockMapById.set(key, s);
    } else {
      // Merge best non-empty values
      stockMapById.set(key, {
        ...existing,
        ...s,
        Liverate: s.Liverate > 0 ? s.Liverate : existing.Liverate,
        CurrentPrice: s.CurrentPrice > 0 ? s.CurrentPrice : existing.CurrentPrice,
        CompanyName: s.CompanyName || existing.CompanyName,
        Symbol: s.Symbol || existing.Symbol,
        MktSymbol: s.MktSymbol || existing.MktSymbol,
      });
    }
  });
  const stocks: Stock[] = Array.from(stockMapById.values());

  // Parse Purchases
  const parsedPurchases: Purchase[] = rawPurchases.map((p: any, idx: number) => ({
    PurchaseId: (p.PurchaseId || `Pur${String(idx + 1).padStart(8, '0')}`).toString().trim(),
    StockId: (p.StockId || '').toString().trim(),
    PurchaseDate: p.PurchaseDate || new Date().toISOString(),
    Quantity: parseFloat(p.Quantity) || 0,
    PurchasePrice: parseFloat(p.PurchasePrice) || 0,
    TotalAmount: parseFloat(p.TotalAmount) || (parseFloat(p.Quantity) * parseFloat(p.PurchasePrice)) || 0,
    Fees: parseFloat(p.Fees) || 0,
    Notes: p.Notes || '',
  }));

  // Deduplicate purchases by PurchaseId (Primary Key)
  const purchaseMapById = new Map<string, Purchase>();
  parsedPurchases.forEach(p => {
    const key = p.PurchaseId.toUpperCase();
    if (!purchaseMapById.has(key)) {
      purchaseMapById.set(key, p);
    }
  });
  const purchases: Purchase[] = Array.from(purchaseMapById.values()).sort(
    (a: Purchase, b: Purchase) => new Date(b.PurchaseDate).getTime() - new Date(a.PurchaseDate).getTime()
  );

  // Parse Sales
  const parsedSales: Sale[] = rawSales.map((s: any, idx: number) => {
    const rawId = (s.SaleId || s.SalesId || s.saleid || s.salesid || s['Sale Id'] || s['Sales Id'] || s.Id || s.ID || '').toString().trim();
    const saleId = rawId || `Sal${String(idx + 1).padStart(8, '0')}`;
    const rawPurchaseId = (s.PurchaseId || s.PurchasesId || s.purchaseid || s.purchasesid || s['Purchase Id'] || '').toString().trim();
    const rawStockId = (s.StockId || s.stockid || s['Stock Id'] || '').toString().trim();
    const saleRate = parseFloat(s.Rate ?? s.rate ?? s.SalePrice ?? s.saleprice ?? s.SalesPrice ?? s.salesprice ?? s['Sale Price'] ?? s['Rate'] ?? 0) || 0;
    return {
      SaleId: saleId,
      SalesId: saleId,
      PurchaseId: rawPurchaseId,
      StockId: rawStockId,
      SaleDate: s.SaleDate || s.salesdate || s.Date || new Date().toISOString(),
      Quantity: parseFloat(s.Quantity || s.qty || s.shares) || 0,
      SalePrice: saleRate,
      Rate: saleRate,
      TotalAmount: parseFloat(s.TotalAmount || s.total || s.amount) || (parseFloat(s.Quantity) * saleRate) || 0,
      Fees: parseFloat(s.Fees || s.fees || s.fee) || 0,
      Notes: s.Notes || s.notes || '',
    };
  });

  // Deduplicate sales by SaleId (Primary Key)
  const saleMapById = new Map<string, Sale>();
  parsedSales.forEach(s => {
    const key = s.SaleId.toUpperCase();
    if (!saleMapById.has(key)) {
      saleMapById.set(key, s);
    }
  });
  const sales: Sale[] = Array.from(saleMapById.values()).sort(
    (a: Sale, b: Sale) => new Date(b.SaleDate).getTime() - new Date(a.SaleDate).getTime()
  );

  return { industries, stocks, purchases, sales };
}

/**
 * Join Operations: Joins Purchases with Stocks, Industries, and Sales.
 * Calculates remaining available quantity for each purchase lot.
 */
export function joinPurchasesWithStocks(
  purchases: Purchase[], 
  stocks: Stock[], 
  industries: Industry[],
  sales: Sale[] = []
): EnrichedPurchase[] {
  const stockMap = new Map(stocks.map(s => [s.StockId.trim().toUpperCase(), s]));
  const industryMap = new Map(industries.map(i => [i.IndustryId.trim().toUpperCase(), i.Name]));

  // Pre-aggregate sold quantities by PurchaseId
  const soldByPurchaseId = new Map<string, number>();
  sales.forEach(sale => {
    const key = (sale.PurchaseId || '').trim().toUpperCase();
    soldByPurchaseId.set(key, (soldByPurchaseId.get(key) || 0) + sale.Quantity);
  });

  return purchases.map(purchase => {
    const stockIdKey = (purchase.StockId || '').trim().toUpperCase();
    const stock = stockMap.get(stockIdKey);
    const livePrice = stock ? (stock.Liverate > 0 ? stock.Liverate : stock.CurrentPrice) : purchase.PurchasePrice;
    const currentPrice = livePrice || purchase.PurchasePrice;

    const purchaseKey = (purchase.PurchaseId || '').trim().toUpperCase();
    const soldQuantity = soldByPurchaseId.get(purchaseKey) || 0;
    const remainingQuantity = Math.max(0, purchase.Quantity - soldQuantity);
    const isFullySold = remainingQuantity <= 0;

    const currentValue = remainingQuantity * currentPrice;
    const unitCost = purchase.Quantity > 0 ? (purchase.TotalAmount / purchase.Quantity) : purchase.PurchasePrice;
    const remainingCostBasis = remainingQuantity * unitCost;
    const gainLoss = currentValue - remainingCostBasis;
    const gainLossPercent = remainingCostBasis > 0 ? (gainLoss / remainingCostBasis) * 100 : 0;
    const industryName = stock?.IndustryId ? (industryMap.get(stock.IndustryId.trim().toUpperCase()) || stock.Sector || 'Other') : (stock?.Sector || 'Other');

    return {
      ...purchase,
      stock,
      symbol: stock ? stock.Symbol : 'UNKNOWN',
      mktSymbol: stock ? stock.MktSymbol : '',
      companyName: stock ? stock.CompanyName : 'Unknown Company',
      industryName,
      sector: industryName,
      exchange: stock ? stock.Exchange : 'NSE',
      currentPrice,
      currentValue,
      gainLoss,
      gainLossPercent,
      soldQuantity,
      remainingQuantity,
      isFullySold,
    };
  });
}

/**
 * Join Operations: Joins Sales with Purchases and Stocks tables.
 * As StockId is the foreign key to Stocks table, builds display value as Symbol from Stocks table.
 */
export function joinSalesWithPurchasesAndStocks(
  sales: Sale[],
  purchases: Purchase[],
  stocks: Stock[],
  industries: Industry[]
): EnrichedSale[] {
  const purchaseMap = new Map(purchases.map(p => [p.PurchaseId.trim().toUpperCase(), p]));
  const stockMap = new Map(stocks.map(s => [s.StockId.trim().toUpperCase(), s]));
  const industryMap = new Map(industries.map(i => [i.IndustryId.trim().toUpperCase(), i.Name]));

  return sales.map(sale => {
    const purchaseKey = (sale.PurchaseId || '').trim().toUpperCase();
    const purchase = purchaseMap.get(purchaseKey);

    // Foreign key resolution: sale.StockId or purchase.StockId
    const stockId = (sale.StockId || purchase?.StockId || '').trim().toUpperCase();
    const stock = stockMap.get(stockId);

    // Display value as Symbol from Stocks table!
    const symbol = stock ? stock.Symbol : (purchase ? `Stock ${stockId}` : 'UNKNOWN');
    const mktSymbol = stock ? stock.MktSymbol : '';
    const companyName = stock ? stock.CompanyName : 'Unknown Company';
    const industryName = stock?.IndustryId ? (industryMap.get(stock.IndustryId.trim().toUpperCase()) || stock.Sector || 'General') : (stock?.Sector || 'General');
    const exchange = stock ? stock.Exchange : 'NSE';

    const purchasePrice = purchase ? purchase.PurchasePrice : 0;
    const purchaseDate = purchase ? purchase.PurchaseDate : '';

    const grossAmount = sale.Quantity * sale.SalePrice;
    const netAmount = sale.TotalAmount > 0 ? sale.TotalAmount : (grossAmount - (sale.Fees || 0));
    const costBasis = sale.Quantity * purchasePrice;
    const realizedGainLoss = netAmount - costBasis;
    const realizedGainLossPercent = costBasis > 0 ? (realizedGainLoss / costBasis) * 100 : 0;

    return {
      ...sale,
      stock,
      purchase,
      symbol, // Display value as Symbol from Stocks table
      mktSymbol,
      companyName,
      industryName,
      exchange,
      purchasePrice,
      purchaseDate,
      grossAmount,
      netAmount,
      costBasis,
      realizedGainLoss,
      realizedGainLossPercent,
    };
  });
}

/**
 * Aggregates Purchases and Sales by StockId and joins with Industry table on IndustryId.
 * Accurately tracks active remaining shares, cost basis, unrealized P&L, and realized P&L.
 */
export function aggregateStockHoldings(
  stocks: Stock[], 
  purchases: Purchase[], 
  industries: Industry[],
  sales: Sale[] = []
): EnrichedStock[] {
  const purchasesByStockId = new Map<string, Purchase[]>();
  const salesByStockId = new Map<string, Sale[]>();
  const industryMap = new Map(industries.map(i => [i.IndustryId.trim().toUpperCase(), i.Name]));
  const purchaseMap = new Map(purchases.map(p => [p.PurchaseId.trim().toUpperCase(), p]));

  purchases.forEach(p => {
    const key = (p.StockId || '').trim().toUpperCase();
    const list = purchasesByStockId.get(key) || [];
    list.push(p);
    purchasesByStockId.set(key, list);
  });

  sales.forEach(s => {
    const purchase = purchaseMap.get((s.PurchaseId || '').trim().toUpperCase());
    const stockId = (s.StockId || purchase?.StockId || '').trim().toUpperCase();
    const list = salesByStockId.get(stockId) || [];
    list.push(s);
    salesByStockId.set(stockId, list);
  });

  let totalPortfolioValue = 0;

  const enrichedList = stocks.map(stock => {
    const stockKey = stock.StockId.trim().toUpperCase();
    const stockPurchases = purchasesByStockId.get(stockKey) || [];
    const stockSales = salesByStockId.get(stockKey) || [];

    const totalPurchasedQuantity = stockPurchases.reduce((sum, p) => sum + p.Quantity, 0);
    const totalSoldQuantity = stockSales.reduce((sum, s) => sum + s.Quantity, 0);
    const totalQuantity = Math.max(0, totalPurchasedQuantity - totalSoldQuantity);

    const totalInvested = stockPurchases.reduce((sum, p) => sum + p.TotalAmount, 0);
    const averagePurchasePrice = totalPurchasedQuantity > 0 ? totalInvested / totalPurchasedQuantity : 0;
    const activeCostBasis = totalQuantity * averagePurchasePrice;

    const livePrice = stock.Liverate > 0 ? stock.Liverate : stock.CurrentPrice;
    const currentHoldingValue = totalQuantity * livePrice;
    const unrealizedGainLoss = currentHoldingValue - activeCostBasis;
    const unrealizedGainLossPercent = activeCostBasis > 0 ? (unrealizedGainLoss / activeCostBasis) * 100 : 0;

    // Realized profit/loss across all sales of this stock
    const realizedGainLoss = stockSales.reduce((acc, sale) => {
      const parentPur = purchaseMap.get((sale.PurchaseId || '').trim().toUpperCase());
      const buyPrice = parentPur ? parentPur.PurchasePrice : averagePurchasePrice;
      const gross = sale.Quantity * sale.SalePrice;
      const net = sale.TotalAmount > 0 ? sale.TotalAmount : (gross - (sale.Fees || 0));
      const cost = sale.Quantity * buyPrice;
      return acc + (net - cost);
    }, 0);

    const industryName = stock.IndustryId ? (industryMap.get(stock.IndustryId.trim().toUpperCase()) || stock.Sector || 'General') : (stock.Sector || 'General');

    totalPortfolioValue += currentHoldingValue;

    return {
      ...stock,
      industryName,
      totalQuantity,
      totalPurchasedQuantity,
      totalSoldQuantity,
      totalInvested,
      activeCostBasis,
      averagePurchasePrice,
      currentHoldingValue,
      unrealizedGainLoss,
      unrealizedGainLossPercent,
      realizedGainLoss,
      purchaseCount: stockPurchases.length,
      saleCount: stockSales.length,
    };
  });

  return enrichedList.map(stock => ({
    ...stock,
    allocationPercent: totalPortfolioValue > 0 ? (stock.currentHoldingValue / totalPortfolioValue) * 100 : 0,
  }));
}

/**
 * Fast direct execution of Real-Time Purchase Transaction:
 * 1. Autogenerates PurchaseId using template "Pur00000001"
 * 2. Appends row to 'Purchases' sheet directly without delays
 */
export async function executePurchaseTransaction(
  accessToken: string,
  spreadsheetId: string,
  purchaseInput: {
    StockId: string;
    Quantity: number;
    PurchasePrice: number;
    TotalAmount: number;
    Fees: number;
    Notes?: string;
    PurchaseDate?: string;
  },
  existingPurchases: Purchase[]
): Promise<{ success: boolean; purchaseId: string; newPurchase: Purchase }> {
  const purchaseId = generatePurchaseId(existingPurchases);
  const purchaseDate = purchaseInput.PurchaseDate || new Date().toISOString();

  const newPurchase: Purchase = {
    PurchaseId: purchaseId,
    StockId: purchaseInput.StockId,
    PurchaseDate: purchaseDate,
    Quantity: purchaseInput.Quantity,
    PurchasePrice: purchaseInput.PurchasePrice,
    TotalAmount: purchaseInput.TotalAmount,
    Fees: purchaseInput.Fees || 0,
    Notes: purchaseInput.Notes || '',
  };

  const newPurchaseRow = [
    newPurchase.PurchaseId,
    newPurchase.StockId,
    newPurchase.PurchaseDate,
    newPurchase.Quantity,
    newPurchase.PurchasePrice,
    newPurchase.TotalAmount,
    newPurchase.Fees,
    newPurchase.Notes,
  ];

  const appendRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Purchases!A:H:append?valueInputOption=USER_ENTERED`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ values: [newPurchaseRow] }),
    }
  );

  if (!appendRes.ok) {
    const err = await appendRes.json();
    throw new Error(`Failed to record purchase: ${err?.error?.message || appendRes.statusText}`);
  }

  return { success: true, purchaseId, newPurchase };
}

/**
 * Fast direct execution of Real-Time Sale Transaction:
 * 1. Autogenerates SaleId using template "Sal00000001"
 * 2. Foreign Key: PurchaseId referencing Purchases.PurchaseId
 * 3. StockId: Foreign Key referencing Stocks.StockId
 * 4. Appends row to 'Sales' sheet directly
 */
export async function executeSaleTransaction(
  accessToken: string,
  spreadsheetId: string,
  saleInput: {
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
  },
  existingSales: Sale[]
): Promise<{ success: boolean; saleId: string; newSale: Sale }> {
  // Query existing Sales sheet rows to get headers and find the true max ID directly in the database
  let sheetHeaders: string[] = [];
  let existingSheetRows: any[][] = [];
  try {
    const headRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Sales!A1:Z500?valueRenderOption=UNFORMATTED_VALUE`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (headRes.ok) {
      const hJson = await headRes.json();
      existingSheetRows = hJson.values || [];
      if (existingSheetRows.length > 0) {
        sheetHeaders = (existingSheetRows[0] || []).map((h: any) => String(h).trim());
      }
    }
  } catch {
    // fallback if fetch fails
  }

  // Aggregate all known IDs from both React memory and database sheet rows
  const allKnownIds: string[] = [];
  existingSales.forEach(s => {
    if (s.SalesId) allKnownIds.push(s.SalesId);
    if (s.SaleId) allKnownIds.push(s.SaleId);
  });

  let idColIdx = -1;
  if (existingSheetRows.length > 0 && sheetHeaders.length > 0) {
    idColIdx = sheetHeaders.findIndex(h => {
      const c = h.toLowerCase().replace(/[^a-z0-9]/g, '');
      return c === 'salesid' || c === 'saleid' || c === 'id' || c.includes('salesid') || c.includes('saleid');
    });
    const targetIdx = idColIdx !== -1 ? idColIdx : 0;
    for (let r = 1; r < existingSheetRows.length; r++) {
      const cellVal = String(existingSheetRows[r][targetIdx] || '').trim();
      if (cellVal) allKnownIds.push(cellVal);
    }
  }

  let maxId = 0;
  const idRegex = /^(?:Sal|Sale|Sales)?(\d+)$/i;
  for (const idStr of allKnownIds) {
    const match = idStr.match(idRegex);
    if (match) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num) && num > maxId) maxId = num;
    } else {
      const digits = idStr.replace(/\D/g, '');
      if (digits) {
        const num = parseInt(digits, 10);
        if (!isNaN(num) && num > maxId) maxId = num;
      }
    }
  }

  const nextNum = maxId + 1;
  const autogenSaleId = `Sal${String(nextNum).padStart(8, '0')}`;
  // Use caller-provided SaleId/SalesId if valid and not conflicting, otherwise use autogenerated
  const passedId = (saleInput.SalesId || saleInput.SaleId || '').trim();
  const saleId = passedId && !allKnownIds.map(i => i.toUpperCase()).includes(passedId.toUpperCase())
    ? passedId
    : autogenSaleId;

  const saleDate = saleInput.SaleDate || new Date().toISOString();
  const rateValue = saleInput.Rate !== undefined ? saleInput.Rate : saleInput.SalePrice;

  const newSale: Sale = {
    SaleId: saleId,
    SalesId: saleId,
    PurchaseId: saleInput.PurchaseId,
    StockId: saleInput.StockId,
    SaleDate: saleDate,
    Quantity: saleInput.Quantity,
    SalePrice: rateValue,
    Rate: rateValue,
    TotalAmount: saleInput.TotalAmount,
    Fees: saleInput.Fees || 0,
    Notes: saleInput.Notes || '',
  };

  let newSaleRow: any[];
  if (sheetHeaders.length > 0) {
    newSaleRow = new Array(sheetHeaders.length).fill('');
    sheetHeaders.forEach((h, idx) => {
      const cleanH = h.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (cleanH === 'salesid' || cleanH === 'saleid' || cleanH === 'id' || cleanH.includes('salesid') || cleanH.includes('saleid') || cleanH.includes('sale') || cleanH === 'sno' || cleanH === 'srno') {
        newSaleRow[idx] = saleId;
      } else if (cleanH === 'purchaseid' || cleanH === 'purchasesid' || cleanH.includes('purchaseid')) {
        newSaleRow[idx] = newSale.PurchaseId;
      } else if (cleanH === 'stockid' || cleanH === 'stocksid' || cleanH.includes('stockid')) {
        newSaleRow[idx] = newSale.StockId;
      } else if (cleanH === 'saledate' || cleanH === 'salesdate' || cleanH === 'date') {
        newSaleRow[idx] = newSale.SaleDate;
      } else if (cleanH === 'quantity' || cleanH === 'qty' || cleanH === 'shares') {
        newSaleRow[idx] = newSale.Quantity;
      } else if (cleanH === 'rate' || cleanH === 'saleprice' || cleanH === 'salesprice' || cleanH === 'price') {
        newSaleRow[idx] = rateValue;
      } else if (cleanH === 'totalamount' || cleanH === 'amount' || cleanH === 'total') {
        newSaleRow[idx] = newSale.TotalAmount;
      } else if (cleanH === 'fees' || cleanH === 'fee' || cleanH === 'brokerage') {
        newSaleRow[idx] = newSale.Fees;
      } else if (cleanH === 'notes' || cleanH === 'note' || cleanH === 'remarks') {
        newSaleRow[idx] = newSale.Notes;
      }
    });

    // Ensure SalesId is guaranteed in column 0 or idColIdx
    if (idColIdx !== -1 && !newSaleRow[idColIdx]) {
      newSaleRow[idColIdx] = saleId;
    }
    if (!newSaleRow[0]) {
      newSaleRow[0] = saleId;
    }
  } else {
    // Standard schema fallback with SalesId in column A and Rate in column F
    newSaleRow = [
      saleId,
      newSale.PurchaseId,
      newSale.StockId,
      newSale.SaleDate,
      newSale.Quantity,
      rateValue, // Stored in Rate column of Sales sheet
      newSale.TotalAmount,
      newSale.Fees,
      newSale.Notes,
    ];
  }

  const appendRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Sales!A:Z:append?valueInputOption=USER_ENTERED`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ values: [newSaleRow] }),
    }
  );

  if (!appendRes.ok) {
    const err = await appendRes.json();
    throw new Error(`Failed to record sale: ${err?.error?.message || appendRes.statusText}`);
  }

  return { success: true, saleId, newSale };
}

/**
 * Updates an existing Sale record in the 'Sales' sheet in Google Sheets.
 * Matches by SaleId (Primary Key) and updates Quantity, Rate/SalePrice, TotalAmount, Fees, Notes, SaleDate, etc.
 */
export async function updateSaleTransaction(
  accessToken: string,
  spreadsheetId: string,
  updatedSale: Sale
): Promise<{ success: boolean; sale: Sale }> {
  const fetchRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Sales!A1:Z500?valueRenderOption=UNFORMATTED_VALUE`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!fetchRes.ok) {
    throw new Error(`Failed to inspect Sales sheet for update: ${fetchRes.statusText}`);
  }

  const data = await fetchRes.json();
  const rows: any[][] = data.values || [];
  if (rows.length < 2) {
    throw new Error('Sales table has no transaction rows to update');
  }

  const headers: string[] = rows[0].map(h => String(h).trim());
  const colIndices: Record<string, number> = {};
  headers.forEach((h, idx) => {
    colIndices[h.toLowerCase().replace(/[^a-z0-9]/g, '')] = idx;
  });

  const saleIdColIdx = colIndices['salesid'] ?? colIndices['saleid'] ?? colIndices['id'] ?? 0;
  const targetId = (updatedSale.SalesId || updatedSale.SaleId || '').trim().toUpperCase();
  const rowIndex = rows.findIndex(
    (r, idx) => idx > 0 && String(r[saleIdColIdx] || '').trim().toUpperCase() === targetId
  );

  if (rowIndex === -1) {
    throw new Error(`Sale record with ID ${updatedSale.SaleId} not found in Sales sheet.`);
  }

  const sheetRowNum = rowIndex + 1; // 1-based sheet row
  const currentRow = [...rows[rowIndex]];

  // Ensure currentRow has enough columns
  while (currentRow.length < headers.length) {
    currentRow.push('');
  }

  const rateValue = updatedSale.Rate !== undefined ? updatedSale.Rate : updatedSale.SalePrice;
  const activeSaleId = updatedSale.SaleId || updatedSale.SalesId;

  if (colIndices['saleid'] !== undefined) currentRow[colIndices['saleid']] = activeSaleId;
  if (colIndices['salesid'] !== undefined) currentRow[colIndices['salesid']] = activeSaleId;
  if (colIndices['purchaseid'] !== undefined) currentRow[colIndices['purchaseid']] = updatedSale.PurchaseId;
  if (colIndices['stockid'] !== undefined) currentRow[colIndices['stockid']] = updatedSale.StockId;
  if (colIndices['saledate'] !== undefined) currentRow[colIndices['saledate']] = updatedSale.SaleDate;
  if (colIndices['quantity'] !== undefined) currentRow[colIndices['quantity']] = updatedSale.Quantity;
  if (colIndices['rate'] !== undefined) currentRow[colIndices['rate']] = rateValue;
  if (colIndices['saleprice'] !== undefined) currentRow[colIndices['saleprice']] = rateValue;
  if (colIndices['totalamount'] !== undefined) currentRow[colIndices['totalamount']] = updatedSale.TotalAmount;
  if (colIndices['fees'] !== undefined) currentRow[colIndices['fees']] = updatedSale.Fees;
  if (colIndices['notes'] !== undefined) currentRow[colIndices['notes']] = updatedSale.Notes;

  const endColLetter = colIndexToLetter(headers.length - 1);
  const updateRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Sales!A${sheetRowNum}:${endColLetter}${sheetRowNum}?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ values: [currentRow] }),
    }
  );

  if (!updateRes.ok) {
    const err = await updateRes.json();
    throw new Error(`Failed to update sale in Google Sheets: ${err?.error?.message || updateRes.statusText}`);
  }

  return { success: true, sale: updatedSale };
}

/**
 * Updates an existing Purchase record in the 'Purchases' sheet in Google Sheets.
 * Matches by PurchaseId (Primary Key) and updates Quantity, PurchasePrice, TotalAmount, Fees, Notes, PurchaseDate, etc.
 */
export async function updatePurchaseTransaction(
  accessToken: string,
  spreadsheetId: string,
  updatedPurchase: Purchase
): Promise<{ success: boolean; purchase: Purchase }> {
  const fetchRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Purchases!A1:Z500?valueRenderOption=UNFORMATTED_VALUE`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!fetchRes.ok) {
    throw new Error(`Failed to inspect Purchases sheet for update: ${fetchRes.statusText}`);
  }

  const data = await fetchRes.json();
  const rows: any[][] = data.values || [];
  if (rows.length < 2) {
    throw new Error('Purchases table has no transaction rows to update');
  }

  const headers: string[] = rows[0].map(h => String(h).trim());
  const colIndices: Record<string, number> = {};
  headers.forEach((h, idx) => {
    colIndices[h.toLowerCase().replace(/[^a-z0-9]/g, '')] = idx;
  });

  const purchaseIdColIdx = colIndices['purchaseid'] ?? colIndices['id'] ?? 0;
  const targetId = (updatedPurchase.PurchaseId || '').trim().toUpperCase();
  const rowIndex = rows.findIndex(
    (r, idx) => idx > 0 && String(r[purchaseIdColIdx] || '').trim().toUpperCase() === targetId
  );

  if (rowIndex === -1) {
    throw new Error(`Purchase record with ID ${updatedPurchase.PurchaseId} not found in Purchases sheet.`);
  }

  const sheetRowNum = rowIndex + 1; // 1-based sheet row
  const currentRow = [...rows[rowIndex]];

  // Ensure currentRow has enough columns
  while (currentRow.length < headers.length) {
    currentRow.push('');
  }

  if (colIndices['purchaseid'] !== undefined) currentRow[colIndices['purchaseid']] = updatedPurchase.PurchaseId;
  if (colIndices['stockid'] !== undefined) currentRow[colIndices['stockid']] = updatedPurchase.StockId;
  if (colIndices['purchasedate'] !== undefined) currentRow[colIndices['purchasedate']] = updatedPurchase.PurchaseDate;
  if (colIndices['date'] !== undefined && colIndices['purchasedate'] === undefined) currentRow[colIndices['date']] = updatedPurchase.PurchaseDate;
  if (colIndices['quantity'] !== undefined) currentRow[colIndices['quantity']] = updatedPurchase.Quantity;
  if (colIndices['shares'] !== undefined && colIndices['quantity'] === undefined) currentRow[colIndices['shares']] = updatedPurchase.Quantity;
  if (colIndices['purchaseprice'] !== undefined) currentRow[colIndices['purchaseprice']] = updatedPurchase.PurchasePrice;
  if (colIndices['price'] !== undefined && colIndices['purchaseprice'] === undefined) currentRow[colIndices['price']] = updatedPurchase.PurchasePrice;
  if (colIndices['rate'] !== undefined && colIndices['purchaseprice'] === undefined) currentRow[colIndices['rate']] = updatedPurchase.PurchasePrice;
  if (colIndices['totalamount'] !== undefined) currentRow[colIndices['totalamount']] = updatedPurchase.TotalAmount;
  if (colIndices['amount'] !== undefined && colIndices['totalamount'] === undefined) currentRow[colIndices['amount']] = updatedPurchase.TotalAmount;
  if (colIndices['fees'] !== undefined) currentRow[colIndices['fees']] = updatedPurchase.Fees;
  if (colIndices['notes'] !== undefined) currentRow[colIndices['notes']] = updatedPurchase.Notes;

  const endColLetter = colIndexToLetter(headers.length - 1);
  const updateRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Purchases!A${sheetRowNum}:${endColLetter}${sheetRowNum}?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ values: [currentRow] }),
    }
  );

  if (!updateRes.ok) {
    const err = await updateRes.json();
    throw new Error(`Failed to update purchase in Google Sheets: ${err?.error?.message || updateRes.statusText}`);
  }

  return { success: true, purchase: updatedPurchase };
}

/**
 * Analyzes the Stocks sheet header row and any existing data row formulas.
 * Reads the sheet with valueRenderOption=FORMULA to inspect actual formula patterns
 * for columns: Liverate, closeyest, volume, 52WkHigh, 52WkLow, shares, changepct, eps, pe.
 */
export async function analyzeSheetStockFormulas(
  accessToken: string,
  spreadsheetId: string
): Promise<{
  headers: string[];
  colIndices: Record<string, number>;
  formulaTemplates: Record<string, { formula: string; sourceRow: number }>;
  totalRows: number;
}> {
  const targetHeaders = INVESTMENT_SHEET_SCHEMAS.find(s => s.title === 'Stocks')!.headers;

  try {
    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Stocks!A1:Z100?valueRenderOption=FORMULA`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!res.ok) {
      return {
        headers: targetHeaders,
        colIndices: Object.fromEntries(targetHeaders.map((h, i) => [h.toLowerCase().replace(/[^a-z0-9]/g, ''), i])),
        formulaTemplates: {},
        totalRows: 1,
      };
    }

    const data = await res.json();
    const rows: any[][] = data.values || [];
    let headers: string[] = rows.length > 0 ? rows[0].map(h => String(h).trim()) : targetHeaders;

    // Build normalized column indices map
    const colIndices: Record<string, number> = {};
    headers.forEach((h, idx) => {
      const norm = h.toLowerCase().replace(/[^a-z0-9]/g, '');
      colIndices[norm] = idx;
    });

    // Check if key formula columns exist in headers; if not, use full target headers
    const requiredCols = ['liverate', 'closeyest', 'volume', '52wkhigh', '52wklow', 'shares', 'changepct', 'eps', 'pe'];
    const missingAny = requiredCols.some(k => colIndices[k] === undefined);

    if (missingAny) {
      headers = targetHeaders;
      headers.forEach((h, idx) => {
        const norm = h.toLowerCase().replace(/[^a-z0-9]/g, '');
        colIndices[norm] = idx;
      });

      // Update header row in Google Sheet to include all formula columns
      await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Stocks!A1:${colIndexToLetter(targetHeaders.length - 1)}1?valueInputOption=USER_ENTERED`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ values: [targetHeaders] }),
        }
      ).catch(console.error);
    }

    // Inspect existing data rows for formula patterns
    const formulaTemplates: Record<string, { formula: string; sourceRow: number }> = {};
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      const sourceRow = r + 1; // 1-based sheet row

      for (const colKey of requiredCols) {
        if (!formulaTemplates[colKey]) {
          const colIdx = colIndices[colKey];
          if (colIdx !== undefined && row[colIdx] !== undefined) {
            const cellVal = String(row[colIdx]).trim();
            if (cellVal.startsWith('=')) {
              formulaTemplates[colKey] = {
                formula: cellVal,
                sourceRow,
              };
            }
          }
        }
      }
    }

    return {
      headers,
      colIndices,
      formulaTemplates,
      totalRows: rows.length,
    };
  } catch (err) {
    console.error('Error analyzing stock formulas:', err);
    return {
      headers: targetHeaders,
      colIndices: Object.fromEntries(targetHeaders.map((h, i) => [h.toLowerCase().replace(/[^a-z0-9]/g, ''), i])),
      formulaTemplates: {},
      totalRows: 1,
    };
  }
}

/**
 * Adds a new stock to the Stocks main table.
 * Analyzes the sheet for formulas in Liverate, closeyest, volume, 52WkHigh, 52WkLow,
 * shares, changepct, eps, pe, and populates the same adapted formulas in the new row.
 */
export async function addNewStockWithFormulas(
  accessToken: string,
  spreadsheetId: string,
  newStock: Stock,
  defaultPrice?: number
): Promise<{ success: boolean; rowNumber: number; stock: Stock }> {
  const analysis = await analyzeSheetStockFormulas(accessToken, spreadsheetId);
  const targetRow = Math.max(2, analysis.totalRows + 1);

  const mktColLetter = colIndexToLetter(analysis.colIndices['mktsymbol'] ?? 2); // Col C
  const stockIdColLetter = colIndexToLetter(analysis.colIndices['stockid'] ?? 0); // Col A
  const initialPrice = defaultPrice || newStock.Liverate || newStock.CurrentPrice || 1000;

  // Adapt an existing formula from the sheet or construct standard robust formula
  const adaptOrGenerateFormula = (colKey: string, fallbackFormula: string): string => {
    const existing = analysis.formulaTemplates[colKey];
    if (existing && existing.formula) {
      // Replace references to sourceRow with targetRow e.g. C2 -> C10, A2 -> A10
      const rowRefRegex = new RegExp(`([A-Z]+)${existing.sourceRow}\\b`, 'g');
      let adapted = existing.formula.replace(rowRefRegex, `$1${targetRow}`);
      // Replace fallback price in IFERROR if applicable
      if (colKey === 'liverate' && initialPrice > 0) {
        adapted = adapted.replace(/,\s*[0-9]+(?:\.[0-9]+)?\s*\)/, `,${initialPrice.toFixed(2)})`);
      }
      return adapted;
    }
    return fallbackFormula;
  };

  const formulas: Record<string, string> = {
    liverate: adaptOrGenerateFormula(
      'liverate',
      `=IFERROR(GOOGLEFINANCE(${mktColLetter}${targetRow},"price"),${initialPrice.toFixed(2)})`
    ),
    closeyest: adaptOrGenerateFormula(
      'closeyest',
      `=IFERROR(GOOGLEFINANCE(${mktColLetter}${targetRow},"closeyest"),0)`
    ),
    volume: adaptOrGenerateFormula(
      'volume',
      `=IFERROR(GOOGLEFINANCE(${mktColLetter}${targetRow},"volume"),0)`
    ),
    '52wkhigh': adaptOrGenerateFormula(
      '52wkhigh',
      `=IFERROR(GOOGLEFINANCE(${mktColLetter}${targetRow},"high52"),0)`
    ),
    '52wklow': adaptOrGenerateFormula(
      '52wklow',
      `=IFERROR(GOOGLEFINANCE(${mktColLetter}${targetRow},"low52"),0)`
    ),
    shares: adaptOrGenerateFormula(
      'shares',
      `=IFERROR(SUMIFS(Purchases!D:D,Purchases!B:B,${stockIdColLetter}${targetRow}),0)`
    ),
    changepct: adaptOrGenerateFormula(
      'changepct',
      `=IFERROR(GOOGLEFINANCE(${mktColLetter}${targetRow},"changepct"),0)`
    ),
    eps: adaptOrGenerateFormula(
      'eps',
      `=IFERROR(GOOGLEFINANCE(${mktColLetter}${targetRow},"eps"),0)`
    ),
    pe: adaptOrGenerateFormula(
      'pe',
      `=IFERROR(GOOGLEFINANCE(${mktColLetter}${targetRow},"pe"),0)`
    ),
  };

  // Build row strictly matching header column order
  const newRow: any[] = analysis.headers.map(header => {
    const norm = header.toLowerCase().replace(/[^a-z0-9]/g, '');
    switch (norm) {
      case 'stockid':
        return newStock.StockId;
      case 'symbol':
        return newStock.Symbol;
      case 'mktsymbol':
        return newStock.MktSymbol;
      case 'companyname':
        return newStock.CompanyName;
      case 'industryid':
      case 'induistryid':
        return newStock.IndustryId;
      case 'exchange':
        return newStock.Exchange;
      case 'liverate':
        return formulas.liverate;
      case 'closeyest':
        return formulas.closeyest;
      case 'volume':
        return formulas.volume;
      case '52wkhigh':
        return formulas['52wkhigh'];
      case '52wklow':
        return formulas['52wklow'];
      case 'shares':
        return formulas.shares;
      case 'changepct':
        return formulas.changepct;
      case 'eps':
        return formulas.eps;
      case 'pe':
        return formulas.pe;
      case 'currency':
        return newStock.Currency || 'INR';
      case 'dividendyield':
        return newStock.DividendYield ?? 0;
      case 'lastupdated':
        return newStock.LastUpdated || new Date().toISOString();
      default:
        return '';
    }
  });

  const appendRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Stocks!A:R:append?valueInputOption=USER_ENTERED`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ values: [newRow] }),
    }
  );

  if (!appendRes.ok) {
    const err = await appendRes.json();
    throw new Error(`Failed to append new stock with formulas: ${err?.error?.message || appendRes.statusText}`);
  }

  return { success: true, rowNumber: targetRow, stock: newStock };
}

/**
 * Updates an existing Stock's editable fields (Symbol, MktSymbol, CompanyName, IndustryId,
 * Exchange, DividendYield, LastUpdated) in Google Sheets while strictly preserving existing
 * formulas for Liverate, closeyest, volume, 52WkHigh, 52WkLow, shares, changepct, eps, pe.
 */
export async function updateExistingStock(
  accessToken: string,
  spreadsheetId: string,
  updatedStock: Stock
): Promise<void> {
  const fetchRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Stocks!A1:Z100?valueRenderOption=FORMULA`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!fetchRes.ok) {
    throw new Error(`Failed to inspect Stocks sheet for update: ${fetchRes.statusText}`);
  }

  const data = await fetchRes.json();
  const rows: any[][] = data.values || [];
  if (rows.length < 2) {
    throw new Error('Stocks table has no data rows to update');
  }

  const headers: string[] = rows[0].map(h => String(h).trim());
  const colIndices: Record<string, number> = {};
  headers.forEach((h, idx) => {
    colIndices[h.toLowerCase().replace(/[^a-z0-9]/g, '')] = idx;
  });

  const stockIdColIdx = colIndices['stockid'] ?? 0;
  const rowIndex = rows.findIndex((r, idx) => idx > 0 && String(r[stockIdColIdx]).trim().toUpperCase() === updatedStock.StockId.trim().toUpperCase());

  if (rowIndex === -1) {
    // If not found, append as new
    await addNewStockWithFormulas(accessToken, spreadsheetId, updatedStock);
    return;
  }

  const sheetRowNum = rowIndex + 1; // 1-based sheet row
  const currentRow = [...rows[rowIndex]];

  // Update only editable metadata columns, preserving any formulas in Liverate, closeyest, etc.
  if (colIndices['symbol'] !== undefined) currentRow[colIndices['symbol']] = updatedStock.Symbol;
  if (colIndices['mktsymbol'] !== undefined) currentRow[colIndices['mktsymbol']] = updatedStock.MktSymbol;
  if (colIndices['companyname'] !== undefined) currentRow[colIndices['companyname']] = updatedStock.CompanyName;
  if (colIndices['industryid'] !== undefined) currentRow[colIndices['industryid']] = updatedStock.IndustryId;
  if (colIndices['induistryid'] !== undefined) currentRow[colIndices['induistryid']] = updatedStock.IndustryId;
  if (colIndices['exchange'] !== undefined) currentRow[colIndices['exchange']] = updatedStock.Exchange;
  if (colIndices['dividendyield'] !== undefined) currentRow[colIndices['dividendyield']] = updatedStock.DividendYield;
  if (colIndices['lastupdated'] !== undefined) currentRow[colIndices['lastupdated']] = new Date().toISOString();

  // If MktSymbol was modified, update row references in formulas if needed
  const endColLetter = colIndexToLetter(headers.length - 1);
  const updateRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Stocks!A${sheetRowNum}:${endColLetter}${sheetRowNum}?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ values: [currentRow] }),
    }
  );

  if (!updateRes.ok) {
    const err = await updateRes.json();
    throw new Error(`Failed to update stock in Google Sheets: ${err?.error?.message || updateRes.statusText}`);
  }
}

/**
 * Saves or updates a single Stock in the main Stocks table.
 * If new stock, populates formulas for Liverate, closeyest, volume, 52WkHigh, 52WkLow, shares, changepct, eps, pe.
 * If existing, updates metadata and preserves all formulas.
 */
export async function saveStock(
  accessToken: string,
  spreadsheetId: string,
  stock: Stock,
  existingStocks: Stock[]
): Promise<void> {
  const existing = existingStocks.find(s => s.StockId.trim().toUpperCase() === stock.StockId.trim().toUpperCase());
  if (existing) {
    await updateExistingStock(accessToken, spreadsheetId, stock);
  } else {
    await addNewStockWithFormulas(accessToken, spreadsheetId, stock, stock.Liverate || stock.CurrentPrice);
  }
}

/**
 * Updates Stock Prices in the Stocks table (real-time price tick or live market update)
 */
export async function updateStockPrices(
  accessToken: string,
  spreadsheetId: string,
  updatedStocks: Stock[]
): Promise<void> {
  // Touch LastUpdated in sheet or update fallback values without clearing formulas
  for (const s of updatedStocks) {
    await updateExistingStock(accessToken, spreadsheetId, s).catch(console.error);
  }
}
