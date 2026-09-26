/**
 * DeviceTelemetryService
 * Production-grade hardware, network, GPU, and IP Geolocation telemetry collector.
 * Gathers complete device intelligence for real-time fleet monitoring.
 */

export interface HardwareSpecs {
  deviceType: 'mobile' | 'tablet' | 'desktop' | 'smartboard';
  brandModel: string;
  os: string;
  osVersion: string;
  browser: string;
  browserVersion: string;
  cpuCores: number;
  deviceMemoryGB: number | null;
  gpuRenderer: string;
  gpuVendor: string;
  screenWidth: number;
  screenHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  pixelRatio: number;
  colorDepth: number;
  touchPoints: number;
  isTouchScreen: boolean;
  isPWA: boolean;
  batteryLevel: number | null;
  batteryCharging: boolean | null;
  networkType: string;
  effectiveConnectionType: string;
  downlinkSpeedMbps: number | null;
  rttMs: number | null;
  language: string;
  timezone: string;
}

export interface GeoLocationInfo {
  ip: string;
  city: string;
  region: string;
  country: string;
  countryCode: string;
  countryFlag: string;
  postalCode: string;
  latitude: number | null;
  longitude: number | null;
  isp: string;
  org: string;
  timezone: string;
  localTime: string;
}

export interface TelemetrySessionData {
  deviceId: string;
  sessionId: string;
  userId?: string | null;
  userName?: string | null;
  userEmail?: string | null;
  userRole?: string | null;
  userAvatar?: string | null;
  isAnonymous: boolean;
  currentRoute: string;
  pageTitle: string;
  routeEnteredAt: number;
  sessionStartedAt: number;
  lastHeartbeat: number;
  status: 'online' | 'idle' | 'offline';
  hardware: HardwareSpecs;
  geo: GeoLocationInfo;
  recentEvents: Array<{
    id: string;
    type: string;
    description: string;
    timestamp: number;
    metadata?: Record<string, any>;
  }>;
}

const DEVICE_ID_KEY = 'presences_device_telemetry_id';
const GEO_CACHE_KEY = 'presences_geo_telemetry_cache';

// Generate or retrieve persistent unique device fingerprint
export function getDeviceFingerprintId(): string {
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      const array = new Uint8Array(12);
      crypto.getRandomValues(array);
      id = 'dev_' + Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch {
    return 'dev_' + Math.random().toString(36).substring(2, 15);
  }
}

// Generate ephemeral session ID (per tab/session)
let sessionEphemeralId: string | null = null;
export function getSessionId(): string {
  if (!sessionEphemeralId) {
    try {
      let id = sessionStorage.getItem('presences_session_id');
      if (!id) {
        id = 'ses_' + Math.random().toString(36).substring(2, 15);
        sessionStorage.setItem('presences_session_id', id);
      }
      sessionEphemeralId = id;
    } catch {
      sessionEphemeralId = 'ses_' + Math.random().toString(36).substring(2, 15);
    }
  }
  return sessionEphemeralId;
}

// Extract GPU & WebGL details
function getGpuInfo(): { renderer: string; vendor: string } {
  try {
    const canvas = document.createElement('canvas');
    const gl =
      canvas.getContext('webgl2') ||
      canvas.getContext('webgl') ||
      (canvas.getContext('experimental-webgl') as WebGLRenderingContext | null);

    if (gl) {
      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      if (debugInfo) {
        const vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) || 'Generic GPU';
        const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || 'Generic Renderer';
        return {
          vendor: String(vendor),
          renderer: String(renderer).replace(/ANGLE \((.*)\)/, '$1'),
        };
      }
    }
  } catch (e) {
    // Non-fatal
  }
  return { renderer: 'Standard Graphics Renderer', vendor: 'System GPU' };
}

// Parse detailed OS, Browser, and Device Model from User-Agent
function parseDeviceInfo(): {
  deviceType: 'mobile' | 'tablet' | 'desktop' | 'smartboard';
  brandModel: string;
  os: string;
  osVersion: string;
  browser: string;
  browserVersion: string;
} {
  const ua = navigator.userAgent || '';
  const width = window.screen?.width || window.innerWidth;
  const height = window.screen?.height || window.innerHeight;
  const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

  // OS detection
  let os = 'Unknown OS';
  let osVersion = '';
  if (/Windows NT 10.0/i.test(ua)) {
    os = 'Windows';
    osVersion = '10 / 11';
  } else if (/Windows NT 6.3/i.test(ua)) {
    os = 'Windows';
    osVersion = '8.1';
  } else if (/Windows NT 6.1/i.test(ua)) {
    os = 'Windows';
    osVersion = '7';
  } else if (/Macintosh|Mac OS X/i.test(ua)) {
    os = 'macOS';
    const match = ua.match(/Mac OS X (\d+[._]\d+[._]?\d*)/);
    osVersion = match ? match[1].replace(/_/g, '.') : '';
  } else if (/Android/i.test(ua)) {
    os = 'Android';
    const match = ua.match(/Android\s+([0-9.]+)/i);
    osVersion = match ? match[1] : '';
  } else if (/iPhone|iPad|iPod/i.test(ua)) {
    os = /iPad/i.test(ua) ? 'iPadOS' : 'iOS';
    const match = ua.match(/OS (\d+[._]\d+)/);
    osVersion = match ? match[1].replace(/_/g, '.') : '';
  } else if (/CrOS/i.test(ua)) {
    os = 'ChromeOS';
  } else if (/Linux/i.test(ua)) {
    os = 'Linux';
  }

  // Browser detection
  let browser = 'Browser';
  let browserVersion = '';
  if (/Edg\/([0-9.]+)/i.test(ua)) {
    browser = 'Microsoft Edge';
    browserVersion = ua.match(/Edg\/([0-9.]+)/i)?.[1] || '';
  } else if (/OPR\/([0-9.]+)/i.test(ua) || /Opera/i.test(ua)) {
    browser = 'Opera';
    browserVersion = ua.match(/OPR\/([0-9.]+)/i)?.[1] || '';
  } else if (/Chrome\/([0-9.]+)/i.test(ua)) {
    browser = 'Google Chrome';
    browserVersion = ua.match(/Chrome\/([0-9.]+)/i)?.[1] || '';
  } else if (/Safari\/([0-9.]+)/i.test(ua) && !/Chrome/i.test(ua)) {
    browser = 'Apple Safari';
    browserVersion = ua.match(/Version\/([0-9.]+)/i)?.[1] || '';
  } else if (/Firefox\/([0-9.]+)/i.test(ua)) {
    browser = 'Mozilla Firefox';
    browserVersion = ua.match(/Firefox\/([0-9.]+)/i)?.[1] || '';
  }

  // Device Category & Model
  let deviceType: 'mobile' | 'tablet' | 'desktop' | 'smartboard' = 'desktop';
  let brandModel = `${os} Device`;

  // Smart Board detection (Large 4K touch display or smartboard route)
  if (isTouch && (Math.max(width, height) >= 1920 && Math.min(width, height) >= 1080) && !/iPhone|iPad/i.test(ua)) {
    if (window.location.pathname.includes('/smartboard') || Math.max(width, height) >= 2560) {
      deviceType = 'smartboard';
      brandModel = 'Smart Board Touch Display (4K)';
    }
  }

  if (deviceType !== 'smartboard') {
    if (/iPad|Tablet|PlayBook/i.test(ua) || (os === 'macOS' && isTouch)) {
      deviceType = 'tablet';
      brandModel = /iPad/i.test(ua) ? 'Apple iPad' : 'Android Tablet';
    } else if (/Mobile|Android|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)) {
      deviceType = 'mobile';
      if (/iPhone/i.test(ua)) {
        brandModel = 'Apple iPhone';
      } else if (/SM-[A-Z0-9]+/i.test(ua) || /Samsung/i.test(ua)) {
        const smMatch = ua.match(/SM-[A-Z0-9]+/i);
        brandModel = smMatch ? `Samsung Galaxy (${smMatch[0]})` : 'Samsung Galaxy';
      } else if (/Pixel\s+[0-9a-zA-Z]+/i.test(ua)) {
        const pxMatch = ua.match(/Pixel\s+[0-9a-zA-Z]+/i);
        brandModel = pxMatch ? `Google ${pxMatch[0]}` : 'Google Pixel';
      } else if (/OnePlus|Redmi|POCO|Xiaomi|Realme|Vivo|Oppo|Motorola/i.test(ua)) {
        const match = ua.match(/OnePlus|Redmi|POCO|Xiaomi|Realme|Vivo|Oppo|Motorola/i);
        brandModel = match ? `${match[0]} Smartphone` : 'Android Smartphone';
      } else {
        brandModel = 'Android Smartphone';
      }
    } else {
      deviceType = 'desktop';
      brandModel = os === 'macOS' ? 'Apple Mac' : `${os} PC`;
    }
  }

  return { deviceType, brandModel, os, osVersion, browser, browserVersion };
}

// Convert 2-letter country code into emoji flag
function getCountryFlagEmoji(countryCode: string): string {
  if (!countryCode || countryCode.length !== 2) return '🌐';
  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map((char) => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

// Deep Hardware & Environment collector
export async function collectHardwareSpecs(): Promise<HardwareSpecs> {
  const deviceInfo = parseDeviceInfo();
  const gpu = getGpuInfo();
  const nav = navigator as any;

  // Battery status if supported
  let batteryLevel: number | null = null;
  let batteryCharging: boolean | null = null;
  try {
    if (nav.getBattery) {
      const battery = await nav.getBattery();
      batteryLevel = Math.round(battery.level * 100);
      batteryCharging = Boolean(battery.charging);
    }
  } catch {
    // Battery API unavailable
  }

  // Network info
  const conn = nav.connection || nav.mozConnection || nav.webkitConnection || {};
  const networkType = conn.type || (conn.effectiveType ? `${conn.effectiveType.toUpperCase()}` : 'Standard Web');
  const effectiveConnectionType = conn.effectiveType || '4g';
  const downlinkSpeedMbps = conn.downlink ? Number(conn.downlink) : null;
  const rttMs = conn.rtt ? Number(conn.rtt) : null;

  // Standalone PWA detection
  const isPWA =
    window.matchMedia('(display-mode: standalone)').matches ||
    nav.standalone === true ||
    document.referrer.includes('android-app://');

  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

  return {
    ...deviceInfo,
    cpuCores: navigator.hardwareConcurrency || 4,
    deviceMemoryGB: nav.deviceMemory ? Number(nav.deviceMemory) : null,
    gpuRenderer: gpu.renderer,
    gpuVendor: gpu.vendor,
    screenWidth: window.screen?.width || window.innerWidth,
    screenHeight: window.screen?.height || window.innerHeight,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    pixelRatio: window.devicePixelRatio || 1,
    colorDepth: window.screen?.colorDepth || 24,
    touchPoints: navigator.maxTouchPoints || 0,
    isTouchScreen: 'ontouchstart' in window || navigator.maxTouchPoints > 0,
    isPWA,
    batteryLevel,
    batteryCharging,
    networkType,
    effectiveConnectionType,
    downlinkSpeedMbps,
    rttMs,
    language: navigator.language || 'en-US',
    timezone,
  };
}

// In-memory geo cache
let inMemoryGeo: GeoLocationInfo | null = null;

// Multi-provider resilient IP & Geolocation Resolver
export async function resolveGeoLocationAndIP(): Promise<GeoLocationInfo> {
  if (inMemoryGeo) return inMemoryGeo;

  // Check sessionStorage
  try {
    const cached = sessionStorage.getItem(GEO_CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed && parsed.ip) {
        inMemoryGeo = parsed;
        return parsed;
      }
    }
  } catch {
    // Continue fetching
  }

  const defaultGeo: GeoLocationInfo = {
    ip: '127.0.0.1 (Local / Unknown)',
    city: 'School Campus',
    region: 'Delhi / NCR',
    country: 'India',
    countryCode: 'IN',
    countryFlag: '🇮🇳',
    postalCode: '110001',
    latitude: 28.6139,
    longitude: 77.209,
    isp: 'School Local Network',
    org: 'PM Shri KV Network',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata',
    localTime: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
  };

  // Provider 1: ipwho.is (Fast, HTTPS, CORS friendly, free)
  try {
    const res = await fetch('https://ipwho.is/', { cache: 'force-cache' });
    if (res.ok) {
      const data = await res.json();
      if (data && data.success !== false && data.ip) {
        const geo: GeoLocationInfo = {
          ip: data.ip,
          city: data.city || 'Delhi',
          region: data.region || 'Delhi',
          country: data.country || 'India',
          countryCode: data.country_code || 'IN',
          countryFlag: getCountryFlagEmoji(data.country_code || 'IN'),
          postalCode: data.postal || '',
          latitude: data.latitude ? Number(data.latitude) : null,
          longitude: data.longitude ? Number(data.longitude) : null,
          isp: data.connection?.isp || data.connection?.org || 'Internet Provider',
          org: data.connection?.org || data.connection?.isp || 'Broadband',
          timezone: data.timezone?.id || 'Asia/Kolkata',
          localTime: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        };
        inMemoryGeo = geo;
        try {
          sessionStorage.setItem(GEO_CACHE_KEY, JSON.stringify(geo));
        } catch {}
        return geo;
      }
    }
  } catch {
    // Try Provider 2
  }

  // Provider 2: ipapi.co
  try {
    const res = await fetch('https://ipapi.co/json/');
    if (res.ok) {
      const data = await res.json();
      if (data && data.ip) {
        const geo: GeoLocationInfo = {
          ip: data.ip,
          city: data.city || 'Delhi',
          region: data.region || 'Delhi',
          country: data.country_name || 'India',
          countryCode: data.country_code || 'IN',
          countryFlag: getCountryFlagEmoji(data.country_code || 'IN'),
          postalCode: data.postal || '',
          latitude: data.latitude ? Number(data.latitude) : null,
          longitude: data.longitude ? Number(data.longitude) : null,
          isp: data.org || 'Internet Provider',
          org: data.org || 'Broadband',
          timezone: data.timezone || 'Asia/Kolkata',
          localTime: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        };
        inMemoryGeo = geo;
        try {
          sessionStorage.setItem(GEO_CACHE_KEY, JSON.stringify(geo));
        } catch {}
        return geo;
      }
    }
  } catch {
    // Try Provider 3
  }

  // Provider 3: api.ipify.org (fallback IP only)
  try {
    const res = await fetch('https://api.ipify.org?format=json');
    if (res.ok) {
      const data = await res.json();
      if (data && data.ip) {
        defaultGeo.ip = data.ip;
      }
    }
  } catch {
    // Fallback defaultGeo
  }

  inMemoryGeo = defaultGeo;
  return defaultGeo;
}

// Event bus for recent device activities
const recentActivityBuffer: Array<{
  id: string;
  type: string;
  description: string;
  timestamp: number;
  metadata?: Record<string, any>;
}> = [];

export function recordLocalActivity(type: string, description: string, metadata?: Record<string, any>) {
  const event = {
    id: 'evt_' + Math.random().toString(36).substring(2, 9),
    type,
    description,
    timestamp: Date.now(),
    metadata,
  };
  recentActivityBuffer.unshift(event);
  if (recentActivityBuffer.length > 20) {
    recentActivityBuffer.pop();
  }
  window.dispatchEvent(new CustomEvent('presences:activity-event', { detail: event }));
}

export function getLocalActivityBuffer() {
  return [...recentActivityBuffer];
}
