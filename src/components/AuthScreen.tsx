import React from 'react';
import { Database, Shield, Lock, FileSpreadsheet, KeyRound, ArrowRight } from 'lucide-react';

interface AuthScreenProps {
  onSignIn: () => void;
  isLoading: boolean;
  error?: string | null;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ onSignIn, isLoading, error }) => {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center p-6 relative overflow-hidden">
      {/* Background glow effects */}
      <div className="absolute top-1/4 -left-32 w-96 h-96 bg-emerald-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-cyan-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl relative z-10">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-2xl">
            <FileSpreadsheet className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">InvestmentStockTracker</h1>
            <p className="text-xs text-slate-400">MEAN Stack & Google Sheets Relational Database</p>
          </div>
        </div>

        <div className="space-y-4 my-6">
          <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800/80">
            <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <KeyRound className="w-4 h-4 text-cyan-400" />
              Relational Tables as Sheets
            </h3>
            <ul className="text-xs text-slate-400 space-y-1.5">
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                <strong className="text-slate-200">Industry Table</strong>: Primary Key <code className="text-cyan-400">IndustryId</code>, Display Name <code className="text-slate-200">Name</code>
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <strong className="text-slate-200">Stocks (Main Table)</strong>: Primary Key <code className="text-cyan-400">StockId</code>, Foreign Key <code className="text-amber-400">IndustryId</code>, Symbol, CurrentPrice (₹ INR)
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                <strong className="text-slate-200">Purchases Table</strong>: Primary Key <code className="text-amber-400">Pur00000001</code> template, Foreign Key <code className="text-cyan-400">StockId</code>
              </li>
            </ul>
          </div>

          <div className="text-xs text-slate-400 leading-relaxed">
            Connect your Google account with permission to automatically open or initialize the <strong className="text-slate-200">InvestmentStockTracker</strong> spreadsheet in your Google Drive.
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs rounded-xl">
            {error}
          </div>
        )}

        {/* Google Official Styled Sign-In Button as mandated by skill */}
        <div className="flex flex-col items-center">
          <button
            onClick={onSignIn}
            disabled={isLoading}
            className="w-full h-12 bg-white hover:bg-slate-100 text-slate-800 font-semibold rounded-2xl shadow-lg transition flex items-center justify-center gap-3 border border-slate-300 active:scale-[0.99] disabled:opacity-50"
          >
            {isLoading ? (
              <div className="flex items-center gap-2 text-sm text-slate-700">
                <div className="w-5 h-5 border-2 border-slate-400 border-t-slate-800 rounded-full animate-spin" />
                Connecting with Google...
              </div>
            ) : (
              <>
                <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="w-5 h-5">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                  <path fill="none" d="M0 0h48v48H0z" />
                </svg>
                <span className="text-sm font-medium text-slate-800">Sign in with Google</span>
              </>
            )}
          </button>
        </div>

        <div className="mt-6 pt-4 border-t border-slate-800 text-[11px] text-slate-500 text-center flex items-center justify-center gap-1.5">
          <Shield className="w-3.5 h-3.5 text-slate-400" />
          <span>Requires read & write permission to Google Sheets and Drive files.</span>
        </div>
      </div>
    </div>
  );
};
