# Database and Setup Guide

## Source of Truth

The spreadsheet schema and fresh-workbook seed rows are defined in `src/types/database.ts` in `INVESTMENT_SHEET_SCHEMAS`. Spreadsheet creation and schema repair are implemented in `src/services/sheetsDatabase.ts`.

The app searches the signed-in Google Drive for a spreadsheet named `InvestmentStockTracker`. If none exists, it creates a workbook with all schemas and their current seed rows. The seed data is sample/demo data, not a copy of another Gmail account's private spreadsheet.

Each Google account has its own Drive and spreadsheet data. The app does not copy one account's real portfolio into another account, and real spreadsheet rows are intentionally not checked into this repository. To move real records between accounts, export the source sheets and import/copy those records into the new account's workbook.

## Sheets

### Industry

| Column | Meaning |
| --- | --- |
| `IndustryId` | Primary key, for example `IND0001` |
| `Name` | Industry display name |
| `Suggested` | Suggested percentage of the portfolio corpus allocated to the industry |

Older workbooks receive a missing `Suggested` header during the next successful sync. Existing rows are left in place; missing suggestions load as 0%.

### Stocks

| Column | Meaning |
| --- | --- |
| `StockId` | Primary key used by transaction sheets |
| `Symbol` | Exchange ticker shown in the app |
| `MktSymbol` | Ticker passed to `GOOGLEFINANCE` |
| `CompanyName` | Company display name |
| `IndustryId` | Foreign key to `Industry.IndustryId` |
| `Exchange` | Exchange derived from the market ticker |
| `Liverate` | Current price formula/value |
| `closeyest`, `volume`, `52WkHigh`, `52WkLow`, `shares`, `changepct`, `eps`, `pe` | Market metrics; several are Google Sheets formulas |
| `Currency` | Usually `INR` |
| `DividendYield` | Dividend yield percentage |
| `LastUpdated` | Last update date |
| `SuggestedInvestment` | Investor's suggested amount for this stock, in INR |
| `Capitalization` | One of `Bluechip`, `Next 50`, `Midcap`, `Small cap`, `Micro Cap` |

Older workbooks get the two new stock headers appended without shifting existing columns. The app writes values by matching header names, so appended columns remain supported.

### Purchases

`PurchaseId` (primary key), `StockId` (foreign key), `PurchaseDate`, `Quantity`, `PurchasePrice`, `TotalAmount`, `Fees`, and `Notes`.

### Sales

`SalesId` (primary key; `SaleId` is also accepted), `PurchaseId` (foreign key), `StockId`, `SaleDate`, `Quantity`, `Rate` (sale price per share), `TotalAmount`, `Fees`, and `Notes`.

### Dividends

`DividendId` (primary key), `StockId` (canonical Stocks foreign key), `Date`, `Quantity`, `PerStock`, and `TotalDividend`.

CSV imports resolve the CSV `StockId` field against a stock's exact `StockId`, ticker `Symbol`, or `MktSymbol`, then store the canonical `StockId`. Duplicate dividend rows are skipped.

## Relationships and Calculations

- `Stocks.StockId` is referenced by Purchases, Sales, and Dividends.
- `Sales.PurchaseId` references `Purchases.PurchaseId` to attribute a sale to its purchase lot.
- Current quantity is total purchased quantity minus total sold quantity for the stock.
- Open cost basis sums each purchase lot's remaining quantity times its purchase price.
- Historical Total Invested is the sum of purchase quantity times purchase price across all purchase records.
- Total Sales is the sum of sale quantity times sale price across all sales records.
- Dividend income is the sum of `TotalDividend` records.
- Industry suggested rupee allocation is `total historical purchase corpus * Industry.Suggested / 100`.

## Create and Migration Flow

1. Google OAuth obtains an access token with Sheets and Drive scopes.
2. `findInvestmentSpreadsheet` searches Drive for `InvestmentStockTracker`.
3. `createInvestmentSpreadsheet` creates all sheet tabs from `INVESTMENT_SHEET_SCHEMAS`, writes headers and seed rows, then formats headers.
4. `ensureRequiredSheets` creates missing tabs and appends supported new headers to existing Industry and Stocks tabs.
5. `loadAllTables` reads the tabs, normalizes supported legacy header aliases, parses numbers/dates, and builds typed records.

Initialization errors are raised if Google rejects workbook population, required sheet creation, or schema-header migration; they should appear in the app's database error notification and browser console.

## Local Development

```powershell
npm install
npm run dev
```

The development server is pinned to `http://localhost:3000` and exits if that port is occupied (`--strictPort`). To find the process using port 3000 on Windows:

```powershell
Get-NetTCPConnection -State Listen -LocalPort 3000
```

Run the standard checks with:

```powershell
npm run lint
npm run build
```

## Common Issues

### Google OAuth `origin_mismatch`

In Google Cloud Console, add the exact local origin `http://localhost:3000` to the OAuth client’s **Authorized JavaScript origins**. Add the deployed site origin there as well when deploying. Do not add a path or trailing route.

### Google Sheets/Drive `403` or permission errors

Confirm the Google account granted the requested Drive and Sheets scopes, the Google Sheets API and Google Drive API are enabled for the associated Cloud project, and the target spreadsheet is accessible to that account. Check the response message in the app notification/browser console.

### Spreadsheet not found or a new workbook is created

The search is scoped to the signed-in account's Drive and exact spreadsheet name `InvestmentStockTracker`. A workbook owned by a different Gmail account will not automatically be found or copied. Share it with the signed-in account or migrate the sheet data explicitly.

### Missing columns or a partially initialized workbook

Run Sync again after the API/network issue is resolved. The loader repairs missing tabs and supported schema headers. If Google rejects an operation, the app now reports the Sheets API error rather than treating the initialization as successful.

### CSV rows skipped during dividend import

Check the required columns `StockId`, `Date`, `Quantity`, `PerStock`, and `TotalDividend`. The `StockId` value must match a Stocks row's stock ID, symbol, or market symbol. Dates like `10-01-2026` are interpreted as month-day-year when the first part is 12 or less.

### TypeScript or production build error

Run `npm run lint` first for type diagnostics and `npm run build` for Vite bundle errors. Resolve the first reported source error, then rerun both checks.
