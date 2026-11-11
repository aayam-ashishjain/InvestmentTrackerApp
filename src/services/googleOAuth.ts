export interface GoogleUser {
  displayName: string;
  email: string;
  photoURL?: string;
}

export interface SavedGoogleSession {
  user: GoogleUser;
  accessToken: string;
  spreadsheetId?: string | null;
  spreadsheetName?: string | null;
  savedAt: number;
}

const GOOGLE_SESSION_STORAGE_KEY = 'investment-stock-tracker-google-session';
const GOOGLE_BACKEND_BASE = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001').replace(/\/$/, '');

export function loadSavedGoogleSession(): SavedGoogleSession | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(GOOGLE_SESSION_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as SavedGoogleSession;
    if (!parsed?.user || !parsed?.accessToken) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveGoogleSession(session: SavedGoogleSession): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(GOOGLE_SESSION_STORAGE_KEY, JSON.stringify({
    ...session,
    savedAt: Date.now(),
  }));
}

export function clearSavedGoogleSession(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(GOOGLE_SESSION_STORAGE_KEY);
}

export function getGoogleAccessBlockedMessage(error: unknown): string {
  const raw = typeof error === 'string'
    ? error
    : (error as { message?: string; error?: string; error_description?: string })?.message
      || (error as { error?: string; error_description?: string })?.error_description
      || (error as { error?: string })?.error
      || 'Google sign-in failed';

  const normalized = raw.toLowerCase();

  if (normalized.includes('access blocked') || normalized.includes('verification process') || normalized.includes('not completed the google verification')) {
    return 'Google is blocking this app because the OAuth app is not yet verified for external users. In Google Cloud Console, publish the app or add the account as a Test User.';
  }

  if (normalized.includes('origin_mismatch')) {
    return 'Google rejected the sign-in because the app origin is not authorized. Add http://localhost:3000 and your deployed domain to the OAuth authorized JavaScript origins.';
  }

  if (normalized.includes('access_denied')) {
    return 'Google denied access to the spreadsheet. Please choose an account with permission to the Google Sheets and Drive data.';
  }

  return raw || 'Google sign-in failed.';
}

export async function googleSignIn(): Promise<{ user: GoogleUser; accessToken: string }> {
  const target = `${GOOGLE_BACKEND_BASE}/api/google/auth?returnTo=${encodeURIComponent(window.location.origin)}`;
  window.location.href = target;
  return { user: { displayName: 'Redirecting...', email: '' }, accessToken: '' };
}

export async function logout(accessToken: string | null): Promise<void> {
  if (!accessToken) return;
  try {
    await fetch(`${GOOGLE_BACKEND_BASE}/api/google/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken }),
    });
  } catch {
    // no-op: server-side logout is best effort
  }
}