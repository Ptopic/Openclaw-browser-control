import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

export const config = {
  port: Number(process.env.PORT || 8787),
  cdpHttpUrl: process.env.CDP_HTTP_URL || 'http://127.0.0.1:9222',
  cdpHttpUrlCandidates: (process.env.CDP_HTTP_URL_CANDIDATES || '').split(',').map((x) => x.trim()).filter(Boolean),
  sessionSecret: process.env.SESSION_SECRET || 'change-me',
  publicBaseUrl: process.env.PUBLIC_BASE_URL || 'http://localhost:8787',
  // Mobile viewport
  mobileWidth: Number(process.env.MOBILE_WIDTH || 390),
  mobileHeight: Number(process.env.MOBILE_HEIGHT || 844),
  deviceScaleFactor: Number(process.env.DEVICE_SCALE_FACTOR || 2),
  // Desktop viewport
  desktopWidth: Number(process.env.DESKTOP_WIDTH || 1280),
  desktopHeight: Number(process.env.DESKTOP_HEIGHT || 800),
  screencastFormat: process.env.SCREENCAST_FORMAT || 'jpeg',
  screencastQuality: Number(process.env.SCREENCAST_QUALITY || 85),
  screencastMaxWidth: Number(process.env.SCREENCAST_MAX_WIDTH || 1440),
  screencastMaxHeight: Number(process.env.SCREENCAST_MAX_HEIGHT || 3120),
  screencastEveryNthFrame: Number(process.env.SCREENCAST_EVERY_NTH_FRAME || 1),
  sessionTtlSeconds: Number(process.env.SESSION_TTL_SECONDS || 1800),
};

export function ensureEnvFile() {
  const envPath = path.resolve(process.cwd(), '.env');
  return fs.existsSync(envPath);
}
