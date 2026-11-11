import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT || 3001);
const APP_URL = process.env.APP_URL || 'http://localhost:3000';
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || `http://localhost:${PORT}/api/google/callback`;
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const ENCRYPTION_KEY = process.env.APP_ENCRYPTION_KEY || 'replace-this-with-a-32-byte-secret';
const CONFIG_DIR = path.join(__dirname, 'config');
const CONFIG_PATH = path.join(CONFIG_DIR, 'investment-stock-tracker-config.enc');

const spreadsheetSchema = [
  { title: 'Industry', headers: ['IndustryId', 'Name', 'Suggested'] },
  { title: 'Stocks', headers: ['StockId', 'Symbol', 'MktSymbol', 'CompanyName', 'IndustryId', 'Exchange', 'Liverate', 'closeyest', 'volume', '52WkHigh', '52WkLow', 'shares', 'changepct', 'eps', 'pe', 'Currency', 'DividendYield', 'LastUpdated', 'SuggestedInvestment', 'Capitalization'] },
  { title: 'Purchases', headers: ['PurchaseId', 'StockId', 'PurchaseDate', 'Quantity', 'PurchasePrice', 'TotalAmount', 'Fees', 'Notes'] },
  { title: 'Sales', headers: ['SaleId', 'PurchaseId', 'StockId', 'SaleDate', 'Quantity', 'Rate', 'TotalAmount', 'Fees', 'Notes'] },
  { title: 'Dividends', headers: ['DividendId', 'StockId', 'Date', 'Quantity', 'PerStock', 'TotalDividend'] },
];

fs.mkdirSync(CONFIG_DIR, { recursive: true });

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

function deriveKey() {
  return crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();
}

function encryptText(text) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey(), iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    iv: iv.toString('hex'),
    content: encrypted.toString('base64'),
    tag: tag.toString('hex'),
  };
}

function decryptText(payload) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', deriveKey(), Buffer.from(payload.iv, 'hex'));
  decipher.setAuthTag(Buffer.from(payload.tag, 'hex'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(payload.content, 'base64')),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}

function readConfig() {
  try {
    if (!fs.existsSync(CONFIG_PATH)) {
      return null;
    }

    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return JSON.parse(decryptText(parsed));
  } catch {
    return null;
  }
}

function writeConfig(data) {
  const encrypted = encryptText(JSON.stringify(data));
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(encrypted), 'utf8');
}

function stripSecretsFromConfig(data) {
  if (!data) return { connected: false };

  return {
    connected: true,
    spreadsheetId: data.spreadsheetId,
    spreadsheetName: data.spreadsheetName,
    email: data.email,
    createdAt: data.createdAt,
  };
}

async function createGoogleOAuthClient() {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error('Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET in environment.');
  }

  const { google } = await import('googleapis');
  return new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
}

async function getGoogleUserInfo(accessToken) {
  const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch user profile from Google.');
  }

  return response.json();
}

async function findSpreadsheet(accessToken) {
  const query = encodeURIComponent("name = 'InvestmentStockTracker' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false");
  const response = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)&spaces=drive`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error('Unable to list Google Drive spreadsheets.');
  }

  const payload = await response.json();
  return payload.files?.[0] || null;
}

async function createSpreadsheet(accessToken) {
  const createResponse = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: { title: 'InvestmentStockTracker' },
      sheets: spreadsheetSchema.map((sheet) => ({
        properties: {
          title: sheet.title,
          sheetType: 'GRID',
          gridProperties: { rowCount: 200, columnCount: 30 },
        },
      })),
    }),
  });

  if (!createResponse.ok) {
    throw new Error(`Failed to create spreadsheet: ${await createResponse.text()}`);
  }

  const created = await createResponse.json();
  const spreadsheetId = created.spreadsheetId;

  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      valueInputOption: 'RAW',
      data: spreadsheetSchema.map((sheet) => ({
        range: `${sheet.title}!A1`,
        values: [sheet.headers],
      })),
    }),
  });

  return { id: spreadsheetId, name: 'InvestmentStockTracker' };
}

async function ensureSpreadsheet(accessToken) {
  const existing = await findSpreadsheet(accessToken);
  if (existing) return existing;
  return createSpreadsheet(accessToken);
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, app: 'InvestmentStockTracker', timestamp: new Date().toISOString() });
});

app.get('/api/google/config', (_req, res) => {
  const config = readConfig();
  res.json(stripSecretsFromConfig(config));
});

app.get('/api/google/auth', async (req, res) => {
  try {
    if (!CLIENT_ID || !CLIENT_SECRET) {
      return res.status(500).json({ error: 'Google OAuth is not configured on the server.' });
    }

    const returnTo = String(req.query.returnTo || APP_URL);
    const state = Buffer.from(JSON.stringify({ returnTo })).toString('base64url');
    const oauth2Client = await createGoogleOAuthClient();
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: true,
      scope: [
        'openid',
        'email',
        'profile',
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive.file',
      ],
      state,
    });

    return res.redirect(authUrl);
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Google auth setup failed.' });
  }
});

app.get('/api/google/callback', async (req, res) => {
  try {
    const code = req.query.code;
    const state = req.query.state;
    if (!code || !state) {
      return res.status(400).send('Missing OAuth code/state.');
    }

    const returnTo = (() => {
      try {
        const parsed = JSON.parse(Buffer.from(String(state), 'base64url').toString('utf8'));
        return parsed.returnTo || APP_URL;
      } catch {
        return APP_URL;
      }
    })();

    const oauth2Client = await createGoogleOAuthClient();
    const { tokens } = await oauth2Client.getToken(String(code));
    oauth2Client.setCredentials(tokens);

    const userInfo = await getGoogleUserInfo(tokens.access_token);
    const user = userInfo || {};
    const accessToken = tokens.access_token || '';
    const refreshToken = tokens.refresh_token || readConfig()?.refreshToken;

    const spreadsheet = await ensureSpreadsheet(accessToken);
    const config = {
      spreadsheetId: spreadsheet.id,
      spreadsheetName: spreadsheet.name,
      email: user.email,
      refreshToken,
      accessToken,
      createdAt: new Date().toISOString(),
    };

    writeConfig(config);

    const params = new URLSearchParams({
      google_auth: '1',
      email: user.email || '',
      display_name: user.name || user.email || 'Investor',
      access_token: accessToken,
      spreadsheet_id: spreadsheet.id,
    });

    const redirectUrl = new URL(returnTo);
    redirectUrl.search = params.toString();
    return res.redirect(redirectUrl.toString());
  } catch (error) {
    console.error('Google callback error:', error);
    return res.status(500).send(error.message || 'Google callback failed.');
  }
});

app.post('/api/google/logout', (_req, res) => {
  if (fs.existsSync(CONFIG_PATH)) {
    fs.unlinkSync(CONFIG_PATH);
  }

  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`InvestmentStockTracker server running on http://localhost:${PORT}`);
});
