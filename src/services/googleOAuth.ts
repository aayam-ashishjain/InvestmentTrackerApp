import googleOAuthConfig from '../../google-oauth-config.json';

export interface GoogleUser {
  displayName: string;
  email: string;
  photoURL?: string;
}

interface OAuthTokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
}

interface OAuthTokenClient {
  requestAccessToken: (options?: { prompt?: string }) => void;
}

interface GoogleIdentityServices {
  accounts: {
    oauth2: {
      initTokenClient: (options: {
        client_id: string;
        scope: string;
        callback: (response: OAuthTokenResponse) => void;
        error_callback: (error: { message?: string }) => void;
      }) => OAuthTokenClient;
      revoke: (token: string, callback: () => void) => void;
    };
  };
}

declare global {
  interface Window {
    google?: GoogleIdentityServices;
  }
}

const scopes = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/drive.file',
].join(' ');

let identityServicesPromise: Promise<void> | null = null;

function loadGoogleIdentityServices(): Promise<void> {
  if (window.google?.accounts.oauth2) return Promise.resolve();

  if (!identityServicesPromise) {
    identityServicesPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => {
        identityServicesPromise = null;
        reject(new Error('Could not load Google sign-in. Check your connection and try again.'));
      };
      document.head.appendChild(script);
    });
  }

  return identityServicesPromise;
}

export async function googleSignIn(): Promise<{ user: GoogleUser; accessToken: string }> {
  if (!googleOAuthConfig.clientId) {
    throw new Error('Google OAuth client ID is not configured.');
  }

  await loadGoogleIdentityServices();
  const oauth = window.google?.accounts.oauth2;
  if (!oauth) throw new Error('Google sign-in could not be initialized.');

  const response = await new Promise<OAuthTokenResponse>((resolve, reject) => {
    const tokenClient = oauth.initTokenClient({
      client_id: googleOAuthConfig.clientId,
      scope: scopes,
      callback: result => {
        if (result.error || !result.access_token) {
          reject(new Error(result.error_description || result.error || 'Google sign-in did not return an access token.'));
          return;
        }
        resolve(result);
      },
      error_callback: error => reject(new Error(error.message || 'Google sign-in was interrupted.')),
    });
    tokenClient.requestAccessToken({ prompt: 'consent' });
  });

  const accessToken = response.access_token!;
  const profileResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const profile = profileResponse.ok
    ? await profileResponse.json() as { name?: string; email?: string; picture?: string }
    : {};

  return {
    accessToken,
    user: {
      displayName: profile.name || 'Investor',
      email: profile.email || '',
      photoURL: profile.picture,
    },
  };
}

export async function logout(accessToken: string | null): Promise<void> {
  if (!accessToken) return;
  await loadGoogleIdentityServices();
  window.google?.accounts.oauth2.revoke(accessToken, () => undefined);
}