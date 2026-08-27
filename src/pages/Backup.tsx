import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import JSZip from 'jszip';
import PageLayout from '@/components/layouts/PageLayout';
import PageTransition from '@/components/PageTransition';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { useUserRole } from '@/hooks/useUserRole';
import { supabase } from '@/integrations/supabase/client';
import {
  DatabaseBackup,
  Upload,
  Download,
  ShieldAlert,
  Loader2,
  CheckCircle2,
  Clock,
  HardDrive,
  Trash2,
  Sparkles,
  Archive,
  FileArchive,
  Database,
  Users,
  Layers,
  FolderArchive,
  FileCheck2,
  AlertTriangle,
  RefreshCw,
  Server,
  CloudCheck,
} from 'lucide-react';
import {
  deleteSnapshot,
  getSnapshot,
  listSnapshots,
  saveSnapshot,
  trimSnapshots,
  type SnapshotMeta,
  type StoredSnapshot,
} from '@/lib/backup/indexeddb';

// ---------- Types ----------
export type Manifest = {
  version: string;
  generatedAt: string;
  system: string;
  tables: Array<{ table: string; count: number }>;
  authUsers: number;
  storageBuckets?: Array<{ name: string; filesCount: number }>;
  restoreOrder: string[];
};

export type StorageFile = { path: string; contentType: string | null; base64: string };
export type StorageBucketInfo = { name: string; public: boolean; fileCount: number };

export type FullBackup = {
  version: string;
  createdAt: string;
  manifest: Manifest;
  tables: Record<string, unknown[]>;
  authUsers: Array<Record<string, unknown>>;
  storage: Record<string, StorageFile[]>;
  storageBuckets: StorageBucketInfo[];
};

export type BackupProgress = {
  phase: 'idle' | 'preparing' | 'exporting_db' | 'exporting_auth' | 'exporting_storage' | 'zipping' | 'importing_auth' | 'importing_db' | 'importing_storage' | 'done' | 'failed';
  label: string;
  currentScope?: string;
  done: number;
  total: number;
  pct: number;
};

export type RestoreReport = {
  tablesRestored: number;
  rowsRestored: number;
  authUsersCreated: number;
  authUsersSkipped: number;
  storageFilesRestored: number;
  skippedTables: string[];
  errors: Array<{ scope: string; message: string }>;
};

const SETTINGS_KEY = 'presences_cloud_backup_settings_v3';
const LAST_AUTO_KEY = 'presences_cloud_backup_last_auto_v3';
const CHUNK_SIZE = 500;
const AUTH_PAGE_SIZE = 500;
const MAX_SNAPSHOTS = 10;

type Settings = {
  autoEnabled: boolean;
  frequency: 'daily' | 'weekly';
  includeAuthUsers: boolean;
  includeStorage: boolean;
};

const defaultSettings: Settings = {
  autoEnabled: true,
  frequency: 'daily',
  includeAuthUsers: true,
  includeStorage: true,
};

// ---------- Helpers ----------
function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return defaultSettings;
    return { ...defaultSettings, ...JSON.parse(raw) };
  } catch {
    return defaultSettings;
  }
}

function saveSettings(s: Settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

function fmtBytes(n: number): string {
  if (!n || isNaN(n)) return '0 B';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(2)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function fmtRelative(iso: string): string {
  if (!iso) return 'Never';
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.max(0, now - then);
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  return `${days}d ago`;
}

async function invokeAction<T = any>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('project-backup-manager', { body });
  if (error) {
    const details = (error as any)?.context?.text ? await (error as any).context.text() : error.message;
    throw new Error(details || error.message || 'Cloud backup edge function failed');
  }
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as T;
}

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Convert base64 to Uint8Array safely
function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// Convert Uint8Array to base64 safely
function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// ---------- Full Cloud ZIP Export Pipeline ----------
async function createFullCloudZipBackup(
  settings: Settings,
  onProgress: (p: Partial<BackupProgress>) => void,
): Promise<{ zipBlob: Blob; backupObj: FullBackup; stats: { tables: number; rows: number; authUsers: number; storageFiles: number; sizeBytes: number } }> {
  onProgress({ phase: 'preparing', label: 'Querying Cloud database manifest...', pct: 3 });

  const manifest = await invokeAction<Manifest>({ action: 'list_public_tables' });
  const totalDbRows = manifest.tables.reduce((s, t) => s + t.count, 0);
  const totalAuthUsers = settings.includeAuthUsers ? manifest.authUsers || 0 : 0;
  
  let totalStorageFiles = 0;
  let bucketsList: StorageBucketInfo[] = [];
  if (settings.includeStorage) {
    try {
      const bres = await invokeAction<{ buckets: StorageBucketInfo[] }>({ action: 'list_storage_buckets' });
      bucketsList = bres.buckets || [];
      totalStorageFiles = bucketsList.reduce((s, b) => s + (b.fileCount || 0), 0);
    } catch (e) {
      console.warn('Could not list storage buckets:', e);
    }
  }

  const grandTotal = totalDbRows + totalAuthUsers + (totalStorageFiles * 2) + 20;
  let processedItems = 0;

  const zip = new JSZip();
  const dbFolder = zip.folder('database');
  const authFolder = zip.folder('auth');
  const storageFolder = zip.folder('storage');

  const backupObj: FullBackup = {
    version: '3.0-cloud-zip',
    createdAt: new Date().toISOString(),
    manifest: {
      ...manifest,
      version: '3.0-cloud-zip',
      system: 'Presences AI Cloud Engine',
      storageBuckets: bucketsList.map((b) => ({ name: b.name, filesCount: b.fileCount })),
    },
    tables: {},
    authUsers: [],
    storage: {},
    storageBuckets: bucketsList,
  };

  // 1. Export Database Tables
  onProgress({ phase: 'exporting_db', label: 'Exporting database tables...', total: grandTotal, done: processedItems, pct: 6 });
  for (const { table, count } of manifest.tables) {
    backupObj.tables[table] = [];
    if (count === 0) {
      dbFolder?.file(`${table}.json`, JSON.stringify([], null, 2));
      continue;
    }

    let offset = 0;
    while (offset < count) {
      onProgress({
        phase: 'exporting_db',
        currentScope: table,
        label: `Exporting table ${table} (${offset.toLocaleString()} / ${count.toLocaleString()} rows)`,
        done: processedItems,
        total: grandTotal,
        pct: Math.min(90, Math.round((processedItems / Math.max(1, grandTotal)) * 100)),
      });

      const res = await invokeAction<{ rows: unknown[] }>({
        action: 'export_table_chunk',
        table,
        offset,
        limit: CHUNK_SIZE,
      });

      const rows = res.rows ?? [];
      (backupObj.tables[table] as unknown[]).push(...rows);
      processedItems += rows.length;
      offset += CHUNK_SIZE;
      if (rows.length < CHUNK_SIZE) break;
    }

    dbFolder?.file(`${table}.json`, JSON.stringify(backupObj.tables[table], null, 2));
  }

  // 2. Export Auth Users
  if (settings.includeAuthUsers && manifest.authUsers > 0) {
    onProgress({ phase: 'exporting_auth', label: 'Exporting authentication users...', total: grandTotal, done: processedItems });
    let page = 1;
    let fetched = 0;
    while (true) {
      onProgress({
        phase: 'exporting_auth',
        currentScope: 'auth.users',
        label: `Exporting auth users (${fetched.toLocaleString()} / ${manifest.authUsers.toLocaleString()})`,
        done: processedItems,
        total: grandTotal,
        pct: Math.min(90, Math.round((processedItems / Math.max(1, grandTotal)) * 100)),
      });

      const res = await invokeAction<{ users: Array<Record<string, unknown>> }>({
        action: 'export_auth_users_chunk',
        page,
        perPage: AUTH_PAGE_SIZE,
      });

      const users = res.users ?? [];
      backupObj.authUsers.push(...users);
      fetched += users.length;
      processedItems += users.length;
      if (users.length < AUTH_PAGE_SIZE) break;
      page += 1;
    }
    authFolder?.file('users.json', JSON.stringify(backupObj.authUsers, null, 2));
  }

  // 3. Export Storage Files & Face Samples
  let downloadedStorageFilesCount = 0;
  if (settings.includeStorage && bucketsList.length > 0) {
    onProgress({ phase: 'exporting_storage', label: 'Exporting cloud storage files & face descriptors...', total: grandTotal, done: processedItems });
    for (const bucket of bucketsList) {
      backupObj.storage[bucket.name] = [];
      if (!bucket.fileCount) continue;

      const bucketFolder = storageFolder?.folder(bucket.name);
      const listRes = await invokeAction<{ paths: string[] }>({ action: 'list_storage_files', bucket: bucket.name });
      const paths = listRes.paths || [];

      for (let i = 0; i < paths.length; i++) {
        const filePath = paths[i];
        onProgress({
          phase: 'exporting_storage',
          currentScope: `${bucket.name}/${filePath}`,
          label: `Downloading storage file [${bucket.name}] ${i + 1}/${paths.length}`,
          done: processedItems,
          total: grandTotal,
          pct: Math.min(92, Math.round((processedItems / Math.max(1, grandTotal)) * 100)),
        });

        try {
          const fileData = await invokeAction<StorageFile>({ action: 'download_storage_file', bucket: bucket.name, path: filePath });
          backupObj.storage[bucket.name].push(fileData);
          downloadedStorageFilesCount += 1;

          // Save directly into the bucket directory in ZIP as binary bytes
          if (fileData.base64 && bucketFolder) {
            const rawBytes = base64ToUint8Array(fileData.base64);
            bucketFolder.file(filePath, rawBytes);
          }
        } catch (err) {
          console.warn(`Storage file download failed for ${bucket.name}/${filePath}:`, err);
        }
        processedItems += 2;
      }
    }
  }

  // Add Master Manifest and combined document
  zip.file('manifest.json', JSON.stringify(backupObj.manifest, null, 2));
  zip.file('backup_full.json', JSON.stringify(backupObj, null, 2));

  // 4. Compress into ZIP Blob
  onProgress({ phase: 'zipping', label: 'Packaging and compressing ZIP archive...', pct: 94 });
  const zipBlob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  }, (metadata) => {
    onProgress({
      phase: 'zipping',
      label: `Compressing ZIP file (${Math.round(metadata.percent)}%)...`,
      pct: 90 + Math.round(metadata.percent * 0.09),
    });
  });

  onProgress({ phase: 'done', label: 'Cloud ZIP backup created successfully!', pct: 100, done: grandTotal, total: grandTotal });

  const stats = {
    tables: Object.keys(backupObj.tables).length,
    rows: totalDbRows,
    authUsers: backupObj.authUsers.length,
    storageFiles: downloadedStorageFilesCount,
    sizeBytes: zipBlob.size,
  };

  return { zipBlob, backupObj, stats };
}

// ---------- Full Cloud ZIP Import & Restore Engine ----------
async function restoreFromCloudZipOrJson(
  file: File,
  settings: Settings,
  onProgress: (p: Partial<BackupProgress>) => void,
): Promise<RestoreReport> {
  const report: RestoreReport = {
    tablesRestored: 0,
    rowsRestored: 0,
    authUsersCreated: 0,
    authUsersSkipped: 0,
    storageFilesRestored: 0,
    skippedTables: [],
    errors: [],
  };

  onProgress({ phase: 'preparing', label: `Inspecting backup package: ${file.name}...`, pct: 3 });

  let backup: FullBackup;

  if (file.name.endsWith('.zip') || file.type.includes('zip')) {
    // Parse ZIP package
    const zip = await JSZip.loadAsync(file);

    // 1. Try reading backup_full.json
    const fullJsonEntry = zip.file('backup_full.json');
    if (fullJsonEntry) {
      const rawText = await fullJsonEntry.async('text');
      backup = JSON.parse(rawText);
    } else {
      // Reconstruct from folders
      const manifestEntry = zip.file('manifest.json');
      let manifest: Manifest = {
        version: '3.0-cloud-zip',
        generatedAt: new Date().toISOString(),
        system: 'Presences AI',
        tables: [],
        authUsers: 0,
        restoreOrder: [],
      };
      if (manifestEntry) {
        manifest = JSON.parse(await manifestEntry.async('text'));
      }

      backup = {
        version: manifest.version || '3.0-cloud-zip',
        createdAt: manifest.generatedAt || new Date().toISOString(),
        manifest,
        tables: {},
        authUsers: [],
        storage: {},
        storageBuckets: [],
      };

      // Read database table JSONs
      const dbFolder = zip.folder('database');
      if (dbFolder) {
        const tableFiles = Object.keys(zip.files).filter((k) => k.startsWith('database/') && k.endsWith('.json'));
        for (const tf of tableFiles) {
          const tableName = tf.replace('database/', '').replace('.json', '');
          const tableData = JSON.parse(await zip.file(tf)!.async('text'));
          backup.tables[tableName] = tableData;
        }
      }

      // Read auth users
      const authFile = zip.file('auth/users.json') || zip.file('auth_users.json');
      if (authFile) {
        backup.authUsers = JSON.parse(await authFile.async('text'));
      }

      // Read storage files from ZIP
      const storageFiles = Object.keys(zip.files).filter((k) => k.startsWith('storage/') && !zip.files[k].dir);
      for (const sf of storageFiles) {
        const parts = sf.split('/');
        if (parts.length >= 3) {
          const bucket = parts[1];
          const path = parts.slice(2).join('/');
          if (!backup.storage[bucket]) backup.storage[bucket] = [];
          const fileBytes = await zip.file(sf)!.async('uint8array');
          backup.storage[bucket].push({
            path,
            contentType: null,
            base64: uint8ArrayToBase64(fileBytes),
          });
        }
      }
    }
  } else {
    // Parse JSON
    const text = await file.text();
    backup = JSON.parse(text);
  }

  // Get allowed public tables from Cloud
  let allowedTables: Set<string>;
  try {
    const liveManifest = await invokeAction<Manifest>({ action: 'list_public_tables' });
    allowedTables = new Set(liveManifest.tables.map((t) => t.table));
  } catch (e: any) {
    throw new Error(`Cannot reach Cloud database: ${e?.message || 'Check network connection'}`);
  }

  const restoreOrderRaw = backup.manifest?.restoreOrder?.length
    ? backup.manifest.restoreOrder
    : Object.keys(backup.tables || {});

  const restoreOrder = restoreOrderRaw.filter((t) => {
    if (!allowedTables.has(t)) {
      report.skippedTables.push(t);
      return false;
    }
    return true;
  });

  const totalDbRows = restoreOrder.reduce((s, t) => s + ((backup.tables[t] as unknown[])?.length || 0), 0);
  const totalAuthUsers = settings.includeAuthUsers ? backup.authUsers?.length || 0 : 0;
  const totalStorageFiles = settings.includeStorage
    ? Object.values(backup.storage || {}).reduce((s, arr) => s + (arr?.length || 0), 0)
    : 0;

  const grandTotal = totalDbRows + totalAuthUsers + (totalStorageFiles * 2) + 10;
  let done = 0;

  // 1. Restore Auth Users First
  if (settings.includeAuthUsers && backup.authUsers?.length) {
    onProgress({ phase: 'importing_auth', label: 'Restoring authentication users...', total: grandTotal, done });
    const totalUsers = backup.authUsers.length;
    for (let i = 0; i < totalUsers; i += 100) {
      const slice = backup.authUsers.slice(i, i + 100);
      onProgress({
        phase: 'importing_auth',
        currentScope: 'auth.users',
        label: `Restoring Auth Users (${i.toLocaleString()} / ${totalUsers.toLocaleString()})`,
        done,
        total: grandTotal,
        pct: Math.min(95, Math.round((done / Math.max(1, grandTotal)) * 100)),
      });

      try {
        const res = await invokeAction<{ created: number; skipped: number }>({
          action: 'import_auth_users_chunk',
          users: slice,
        });
        report.authUsersCreated += res.created || 0;
        report.authUsersSkipped += res.skipped || 0;
      } catch (e: any) {
        report.errors.push({ scope: 'auth.users', message: e?.message || 'chunk failed' });
      }
      done += slice.length;
    }
  }

  // 2. Restore Database Tables in FK Order
  for (const table of restoreOrder) {
    const rows = (backup.tables[table] as unknown[]) || [];
    if (rows.length === 0) continue;

    onProgress({
      phase: 'importing_db',
      currentScope: table,
      label: `Clearing table: ${table}...`,
      done,
      total: grandTotal,
      pct: Math.min(95, Math.round((done / Math.max(1, grandTotal)) * 100)),
    });

    try {
      await invokeAction({ action: 'clear_table', table });
    } catch (e: any) {
      report.errors.push({ scope: `clear ${table}`, message: e?.message || 'clear failed' });
    }

    let tableRowsInserted = 0;
    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      const chunk = rows.slice(i, i + CHUNK_SIZE);
      onProgress({
        phase: 'importing_db',
        currentScope: table,
        label: `Restoring table ${table} (${i.toLocaleString()} / ${rows.length.toLocaleString()} rows)`,
        done,
        total: grandTotal,
        pct: Math.min(95, Math.round((done / Math.max(1, grandTotal)) * 100)),
      });

      try {
        await invokeAction({ action: 'import_table_chunk', table, rows: chunk });
        tableRowsInserted += chunk.length;
      } catch (e: any) {
        // Retry with smaller batch
        const smaller = 100;
        let recovered = 0;
        for (let j = 0; j < chunk.length; j += smaller) {
          const mini = chunk.slice(j, j + smaller);
          try {
            await invokeAction({ action: 'import_table_chunk', table, rows: mini });
            recovered += mini.length;
          } catch (e2: any) {
            report.errors.push({
              scope: `${table} rows ${i + j}-${i + j + mini.length}`,
              message: e2?.message || e?.message || 'chunk failed',
            });
          }
        }
        tableRowsInserted += recovered;
      }
      done += chunk.length;
    }

    if (tableRowsInserted > 0) {
      report.tablesRestored += 1;
      report.rowsRestored += tableRowsInserted;
    }
  }

  // 3. Restore Storage Buckets & Files
  if (settings.includeStorage && backup.storage) {
    for (const [bucket, files] of Object.entries(backup.storage)) {
      if (!files || files.length === 0) continue;

      onProgress({
        phase: 'importing_storage',
        currentScope: `storage:${bucket}`,
        label: `Clearing storage bucket: ${bucket}...`,
        done,
        total: grandTotal,
        pct: Math.min(95, Math.round((done / Math.max(1, grandTotal)) * 100)),
      });

      try {
        await invokeAction({ action: 'clear_storage_bucket', bucket });
      } catch (e: any) {
        report.errors.push({ scope: `clear bucket ${bucket}`, message: e?.message || 'clear failed' });
      }

      for (let i = 0; i < files.length; i++) {
        const fileItem = files[i];
        onProgress({
          phase: 'importing_storage',
          currentScope: `${bucket}/${fileItem.path}`,
          label: `Uploading storage file [${bucket}] ${i + 1}/${files.length}`,
          done,
          total: grandTotal,
          pct: Math.min(98, Math.round((done / Math.max(1, grandTotal)) * 100)),
        });

        try {
          await invokeAction({
            action: 'upload_storage_file',
            bucket,
            path: fileItem.path,
            base64: fileItem.base64,
            contentType: fileItem.contentType,
          });
          report.storageFilesRestored += 1;
        } catch (e: any) {
          report.errors.push({ scope: `${bucket}/${fileItem.path}`, message: e?.message || 'upload failed' });
        }
        done += 2;
      }
    }
  }

  onProgress({ phase: 'done', label: 'Cloud restoration completed successfully!', pct: 100, done: grandTotal, total: grandTotal });
  return report;
}

// ---------- Main Backup Page Component ----------
const Backup = () => {
  const { toast } = useToast();
  const { role, isLoading } = useUserRole();
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [progress, setProgress] = useState<BackupProgress>({
    phase: 'idle',
    label: '',
    done: 0,
    total: 0,
    pct: 0,
  });
  const [busy, setBusy] = useState<null | 'backup' | 'snapshot' | 'restore'>(null);
  const [snapshots, setSnapshots] = useState<SnapshotMeta[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(null);
  const [liveManifest, setLiveManifest] = useState<Manifest | null>(null);
  const [isLoadingManifest, setIsLoadingManifest] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const autoRanRef = useRef(false);

  const updateProgress = useCallback((patch: Partial<BackupProgress>) => {
    setProgress((prev) => ({ ...prev, ...patch }));
  }, []);

  const refreshLiveStats = useCallback(async () => {
    try {
      setIsLoadingManifest(true);
      const m = await invokeAction<Manifest>({ action: 'list_public_tables' });
      setLiveManifest(m);
    } catch (e) {
      console.warn('Could not fetch live cloud stats:', e);
    } finally {
      setIsLoadingManifest(false);
    }
  }, []);

  const refreshSnapshots = useCallback(async () => {
    try {
      const list = await listSnapshots();
      setSnapshots(list);
      if (list.length && !lastBackupAt) setLastBackupAt(list[0].createdAt);
    } catch (e) {
      console.warn('snapshot list failed', e);
    }
  }, [lastBackupAt]);

  useEffect(() => {
    setSettings(loadSettings());
    setLastBackupAt(localStorage.getItem(LAST_AUTO_KEY));
    void refreshSnapshots();
    void refreshLiveStats();
  }, [refreshSnapshots, refreshLiveStats]);

  const updateSettings = (patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
  };

  const persistSnapshot = async (
    backup: FullBackup,
    label: string,
    triggerType: 'manual' | 'auto' | 'rollback',
  ) => {
    const stats = {
      tables: Object.keys(backup.tables || {}).length,
      rows: Object.values(backup.tables || {}).reduce((s, arr) => s + ((arr as unknown[])?.length || 0), 0),
      authUsers: backup.authUsers?.length || 0,
    };
    const snap: StoredSnapshot = {
      id: crypto.randomUUID(),
      label,
      createdAt: backup.createdAt,
      triggerType,
      sizeBytes: JSON.stringify(backup).length,
      stats,
      backup,
    };
    await saveSnapshot(snap);
    await trimSnapshots(MAX_SNAPSHOTS);
    await refreshSnapshots();
    localStorage.setItem(LAST_AUTO_KEY, backup.createdAt);
    setLastBackupAt(backup.createdAt);
  };

  // 1-Click ZIP Backup Action
  const handleDownloadCloudZip = async () => {
    try {
      setBusy('backup');
      setProgress({ phase: 'preparing', label: 'Starting 1-Click Cloud ZIP backup...', done: 0, total: 0, pct: 2 });

      const { zipBlob, backupObj, stats } = await createFullCloudZipBackup(settings, updateProgress);
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
      const fileName = `presences-cloud-backup-${stamp}.zip`;

      downloadBlob(zipBlob, fileName);
      await persistSnapshot(backupObj, `Full Cloud ZIP ${new Date().toLocaleString()}`, 'manual');

      toast({
        title: 'Cloud Backup Complete',
        description: `Downloaded ${fileName} (${fmtBytes(stats.sizeBytes)}) with ${stats.rows.toLocaleString()} rows & ${stats.storageFiles} files.`,
      });
      void refreshLiveStats();
    } catch (e: any) {
      updateProgress({ phase: 'failed', label: e?.message || 'Cloud backup failed', pct: 0 });
      toast({ title: 'Backup failed', description: e?.message || 'Unknown error occurred', variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  // Save Quick Local Snapshot Action
  const handleSaveLocalSnapshot = async () => {
    try {
      setBusy('snapshot');
      setProgress({ phase: 'preparing', label: 'Creating local safety snapshot...', done: 0, total: 0, pct: 2 });

      const { backupObj } = await createFullCloudZipBackup({ ...settings, includeStorage: false }, updateProgress);
      await persistSnapshot(backupObj, `Snapshot ${new Date().toLocaleString()}`, 'manual');

      toast({ title: 'Snapshot Saved', description: 'Stored locally in browser storage (IndexedDB).' });
    } catch (e: any) {
      updateProgress({ phase: 'failed', label: e?.message || 'Snapshot failed', pct: 0 });
      toast({ title: 'Snapshot failed', description: e?.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  // Restore from ZIP/JSON Action
  const handleRestoreFromPackage = async () => {
    if (!selectedFile) {
      toast({ title: 'No backup package selected', variant: 'destructive' });
      return;
    }

    try {
      setBusy('restore');
      setProgress({ phase: 'preparing', label: 'Creating pre-restore rollback snapshot...', done: 0, total: 0, pct: 2 });

      // Rollback safety snapshot
      try {
        const { backupObj } = await createFullCloudZipBackup({ ...settings, includeStorage: false }, () => {});
        await persistSnapshot(backupObj, `Pre-Restore Rollback ${new Date().toLocaleString()}`, 'rollback');
      } catch (err) {
        console.warn('Pre-restore rollback snapshot skipped:', err);
      }

      const report = await restoreFromCloudZipOrJson(selectedFile, settings, updateProgress);

      const hasErrors = report.errors.length > 0;
      toast({
        title: hasErrors ? 'Restoration finished with notes' : 'Restoration Complete',
        description: `Restored ${report.rowsRestored.toLocaleString()} rows across ${report.tablesRestored} tables, ${report.authUsersCreated} auth users, & ${report.storageFilesRestored} storage files.`,
      });

      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      void refreshLiveStats();
    } catch (e: any) {
      updateProgress({ phase: 'failed', label: e?.message || 'Restoration failed', pct: 0 });
      toast({ title: 'Restoration failed', description: e?.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  // Restore Local Snapshot
  const handleRestoreSnapshot = async (id: string) => {
    try {
      setBusy('restore');
      setProgress({ phase: 'preparing', label: 'Loading snapshot data...', done: 0, total: 0, pct: 2 });
      const snap = await getSnapshot(id);
      if (!snap) throw new Error('Snapshot record not found');

      // Convert stored snapshot to virtual JSON file
      const jsonBlob = new Blob([JSON.stringify(snap.backup)], { type: 'application/json' });
      const virtualFile = new File([jsonBlob], `${snap.label}.json`, { type: 'application/json' });

      const report = await restoreFromCloudZipOrJson(virtualFile, settings, updateProgress);
      toast({ title: 'Snapshot Restored', description: `Successfully restored ${snap.label}` });
      void refreshLiveStats();
    } catch (e: any) {
      updateProgress({ phase: 'failed', label: e?.message || 'Restore failed', pct: 0 });
      toast({ title: 'Restore failed', description: e?.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  const handleDeleteSnapshot = async (id: string) => {
    await deleteSnapshot(id);
    await refreshSnapshots();
    toast({ title: 'Snapshot Deleted' });
  };

  const handleDownloadSnapshot = async (id: string) => {
    const snap = await getSnapshot(id);
    if (!snap) return;
    const blob = new Blob([JSON.stringify(snap.backup, null, 2)], { type: 'application/json' });
    downloadBlob(blob, `${snap.label.replace(/[^a-z0-9]+/gi, '-')}.json`);
  };

  // Auto Backup Scheduler
  useEffect(() => {
    if (isLoading || (role !== 'admin' && role !== 'principal')) return;
    if (!settings.autoEnabled || autoRanRef.current || busy) return;

    const last = localStorage.getItem(LAST_AUTO_KEY);
    const intervalMs = settings.frequency === 'daily' ? 24 * 3600e3 : 7 * 24 * 3600e3;
    if (last && Date.now() - new Date(last).getTime() < intervalMs) return;

    autoRanRef.current = true;
    (async () => {
      try {
        const { backupObj } = await createFullCloudZipBackup({ ...settings, includeStorage: false }, () => {});
        await persistSnapshot(backupObj, `Auto ${settings.frequency} ${new Date().toLocaleString()}`, 'auto');
      } catch (err) {
        console.warn('Auto backup skipped:', err);
      }
    })();
  }, [isLoading, role, settings, busy]);

  // Guards
  if (isLoading) {
    return (
      <PageLayout>
        <div className="flex items-center justify-center py-28">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </PageLayout>
    );
  }

  if (role !== 'admin' && role !== 'principal') {
    return (
      <PageLayout>
        <div className="py-12 max-w-lg mx-auto">
          <Alert variant="destructive" className="rounded-2xl border-destructive/40 bg-destructive/10">
            <ShieldAlert className="h-5 w-5" />
            <AlertDescription className="text-sm font-medium">
              Access Restricted. Only school administrators and principals can access the Cloud Backup & Restore Hub.
            </AlertDescription>
          </Alert>
        </div>
      </PageLayout>
    );
  }

  const isWorking = progress.phase === 'preparing' || progress.phase.startsWith('exporting') || progress.phase.startsWith('importing') || progress.phase === 'zipping';
  const totalRowsLive = liveManifest ? liveManifest.tables.reduce((s, t) => s + t.count, 0) : 0;
  const totalTablesLive = liveManifest ? liveManifest.tables.length : 0;
  const totalAuthUsersLive = liveManifest ? liveManifest.authUsers : 0;

  return (
    <PageTransition>
      <PageLayout className="has-bottom-nav">
        <div className="space-y-8 max-w-6xl mx-auto pb-12">
          
          {/* Header Banner */}
          <div className="relative overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-r from-primary/10 via-card/70 to-accent/10 p-6 md:p-8 backdrop-blur-2xl shadow-xl">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/15 px-3 py-1 text-xs font-bold uppercase tracking-wider text-primary">
                  <CloudCheck className="h-3.5 w-3.5" />
                  Cloud Infrastructure Hub
                </div>
                <h1 className="text-3xl md:text-4xl font-extrabold text-foreground" style={{ fontFamily: 'Sora, sans-serif' }}>
                  Cloud Backup & Restore
                </h1>
                <p className="text-sm md:text-base text-muted-foreground max-w-2xl">
                  Take a complete snapshot of your entire school cloud — Database tables, Auth Users, and Storage files into a single standalone ZIP archive.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={refreshLiveStats}
                  disabled={isLoadingManifest}
                  className="rounded-2xl border-border/70 bg-card/60 gap-2 text-xs font-semibold"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${isLoadingManifest ? 'animate-spin' : ''}`} />
                  Refresh Cloud Stats
                </Button>
                {lastBackupAt && (
                  <Badge variant="secondary" className="rounded-full px-3 py-1 text-xs font-medium gap-1.5">
                    <Clock className="h-3 w-3" /> Last: {fmtRelative(lastBackupAt)}
                  </Badge>
                )}
              </div>
            </div>

            {/* Cloud Metric Tiles */}
            <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="rounded-2xl border border-border/60 bg-card/60 p-4 backdrop-blur-md">
                <div className="flex items-center gap-2 text-muted-foreground text-xs font-semibold uppercase">
                  <Database className="h-4 w-4 text-primary" /> Public Tables
                </div>
                <p className="mt-2 text-2xl font-extrabold text-foreground" style={{ fontFamily: 'Sora, sans-serif' }}>
                  {isLoadingManifest ? '...' : totalTablesLive.toLocaleString()}
                </p>
              </div>

              <div className="rounded-2xl border border-border/60 bg-card/60 p-4 backdrop-blur-md">
                <div className="flex items-center gap-2 text-muted-foreground text-xs font-semibold uppercase">
                  <Layers className="h-4 w-4 text-emerald-500" /> Total Records
                </div>
                <p className="mt-2 text-2xl font-extrabold text-foreground" style={{ fontFamily: 'Sora, sans-serif' }}>
                  {isLoadingManifest ? '...' : totalRowsLive.toLocaleString()}
                </p>
              </div>

              <div className="rounded-2xl border border-border/60 bg-card/60 p-4 backdrop-blur-md">
                <div className="flex items-center gap-2 text-muted-foreground text-xs font-semibold uppercase">
                  <Users className="h-4 w-4 text-blue-500" /> Auth Accounts
                </div>
                <p className="mt-2 text-2xl font-extrabold text-foreground" style={{ fontFamily: 'Sora, sans-serif' }}>
                  {isLoadingManifest ? '...' : totalAuthUsersLive.toLocaleString()}
                </p>
              </div>

              <div className="rounded-2xl border border-border/60 bg-card/60 p-4 backdrop-blur-md">
                <div className="flex items-center gap-2 text-muted-foreground text-xs font-semibold uppercase">
                  <HardDrive className="h-4 w-4 text-amber-500" /> Local Snapshots
                </div>
                <p className="mt-2 text-2xl font-extrabold text-foreground" style={{ fontFamily: 'Sora, sans-serif' }}>
                  {snapshots.length}
                </p>
              </div>
            </div>
          </div>

          {/* Real-time Interactive Progress Banner */}
          {(isWorking || progress.phase === 'done' || progress.phase === 'failed') && (
            <Card className={`rounded-3xl border ${progress.phase === 'failed' ? 'border-destructive/60 bg-destructive/5' : 'border-primary/40 bg-card/80'} backdrop-blur-xl shadow-lg`}>
              <CardContent className="p-6 space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2.5 min-w-0 font-semibold">
                    {isWorking ? (
                      <Loader2 className="h-5 w-5 animate-spin text-primary shrink-0" />
                    ) : progress.phase === 'done' ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
                    ) : (
                      <ShieldAlert className="h-5 w-5 text-destructive shrink-0" />
                    )}
                    <span className="truncate text-foreground">{progress.label || 'Processing...'}</span>
                  </span>
                  <span className="tabular-nums font-bold text-primary shrink-0 ml-4">
                    {progress.pct}%
                  </span>
                </div>
                <Progress value={progress.pct} className="h-2.5 rounded-full" />
                {progress.currentScope && (
                  <p className="text-xs text-muted-foreground font-mono truncate">
                    Scope: {progress.currentScope}
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Main Action Tabs */}
          <Tabs defaultValue="export" className="w-full space-y-6">
            <TabsList className="grid grid-cols-3 max-w-xl rounded-2xl p-1 bg-card/70 border border-border/60">
              <TabsTrigger value="export" className="rounded-xl font-bold gap-2">
                <Download className="h-4 w-4" /> 1-Click ZIP Export
              </TabsTrigger>
              <TabsTrigger value="import" className="rounded-xl font-bold gap-2">
                <Upload className="h-4 w-4" /> Import & Restore
              </TabsTrigger>
              <TabsTrigger value="snapshots" className="rounded-xl font-bold gap-2">
                <DatabaseBackup className="h-4 w-4" /> Local Snapshots
              </TabsTrigger>
            </TabsList>

            {/* TAB 1: 1-CLICK ZIP EXPORT */}
            <TabsContent value="export" className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                
                {/* Primary ZIP Card */}
                <Card className="md:col-span-2 rounded-3xl border border-primary/25 bg-card/70 backdrop-blur-xl shadow-xl overflow-hidden">
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15 text-primary">
                        <FileArchive className="h-6 w-6" />
                      </div>
                      <div>
                        <CardTitle className="text-xl font-bold">Download Complete Cloud ZIP</CardTitle>
                        <CardDescription>
                          Compiles Auth Users, Database tables, and Storage files into a single <code className="text-xs font-mono font-bold text-primary">.zip</code> package.
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="space-y-3 rounded-2xl border border-border/60 bg-muted/20 p-4">
                      <div className="flex items-center justify-between text-sm">
                        <div className="space-y-0.5">
                          <Label className="font-semibold text-foreground">Include Auth Accounts</Label>
                          <p className="text-xs text-muted-foreground">Exports login emails, user IDs, and metadata (<code className="text-xs">auth/users.json</code>).</p>
                        </div>
                        <Switch
                          checked={settings.includeAuthUsers}
                          onCheckedChange={(checked) => updateSettings({ includeAuthUsers: checked })}
                          disabled={!!busy}
                        />
                      </div>

                      <div className="flex items-center justify-between text-sm pt-2 border-t border-border/40">
                        <div className="space-y-0.5">
                          <Label className="font-semibold text-foreground">Include Storage Files & Faces</Label>
                          <p className="text-xs text-muted-foreground">Packages student registration face samples and circular attachments directly into folders.</p>
                        </div>
                        <Switch
                          checked={settings.includeStorage}
                          onCheckedChange={(checked) => updateSettings({ includeStorage: checked })}
                          disabled={!!busy}
                        />
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3 pt-2">
                      <Button
                        size="lg"
                        onClick={handleDownloadCloudZip}
                        disabled={!!busy}
                        className="flex-1 rounded-2xl h-14 bg-primary text-primary-foreground font-bold shadow-lg shadow-primary/25 hover:bg-primary/90 btn-spring gap-2 text-base"
                      >
                        {busy === 'backup' ? (
                          <Loader2 className="h-5 w-5 animate-spin" />
                        ) : (
                          <FolderArchive className="h-5 w-5" />
                        )}
                        {busy === 'backup' ? 'Exporting Cloud...' : 'Click to Download Cloud ZIP'}
                      </Button>

                      <Button
                        size="lg"
                        variant="outline"
                        onClick={handleSaveLocalSnapshot}
                        disabled={!!busy}
                        className="rounded-2xl h-14 border-border/70 bg-card/60 font-semibold hover:bg-card/90 btn-spring gap-2"
                      >
                        {busy === 'snapshot' ? <Loader2 className="h-5 w-5 animate-spin" /> : <HardDrive className="h-5 w-5" />}
                        Save Local Snapshot
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {/* Package Architecture Info */}
                <Card className="rounded-3xl border border-border/60 bg-card/60 backdrop-blur-xl p-2">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base font-bold flex items-center gap-2">
                      <Archive className="h-4 w-4 text-primary" /> ZIP Package Contents
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-xs text-muted-foreground font-mono">
                    <div className="p-3 rounded-xl bg-muted/40 space-y-1.5 leading-relaxed">
                      <p className="text-foreground font-bold">📦 cloud-backup.zip</p>
                      <p className="pl-3">├── 📄 manifest.json</p>
                      <p className="pl-3">├── 📁 database/</p>
                      <p className="pl-6">├── profiles.json</p>
                      <p className="pl-6">├── attendance_records.json</p>
                      <p className="pl-6">└── ...all 35+ tables</p>
                      <p className="pl-3">├── 📁 auth/</p>
                      <p className="pl-6">└── users.json</p>
                      <p className="pl-3">└── 📁 storage/</p>
                      <p className="pl-6">├── student-faces/</p>
                      <p className="pl-6">└── circulars/</p>
                    </div>
                    <p className="text-[11px] text-muted-foreground font-sans leading-normal">
                      The generated ZIP can be stored anywhere (Google Drive, USB, local disk) and imported back into Presences at any time.
                    </p>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* TAB 2: IMPORT & RESTORE */}
            <TabsContent value="import" className="space-y-6">
              <Card className="rounded-3xl border border-border/60 bg-card/70 backdrop-blur-xl shadow-xl">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15 text-primary">
                      <Upload className="h-6 w-6" />
                    </div>
                    <div>
                      <CardTitle className="text-xl font-bold">Restore Cloud from ZIP or JSON</CardTitle>
                      <CardDescription>
                        Select or drop your previously exported <code className="text-xs font-mono font-bold text-primary">.zip</code> or <code className="text-xs font-mono font-bold text-primary">.json</code> backup file to restore your entire school system.
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-6">
                  {/* File Upload Box */}
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className={`relative flex flex-col items-center justify-center p-8 md:p-12 rounded-3xl border-2 border-dashed transition-all cursor-pointer ${
                      selectedFile ? 'border-primary/60 bg-primary/5' : 'border-border/70 hover:border-primary/40 bg-muted/10 hover:bg-muted/20'
                    }`}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".zip,.json,application/zip,application/json"
                      disabled={!!busy}
                      onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                      className="hidden"
                    />

                    <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-primary/15 text-primary mb-4">
                      {selectedFile ? <FileCheck2 className="h-8 w-8 text-primary" /> : <Upload className="h-8 w-8 text-primary" />}
                    </div>

                    {selectedFile ? (
                      <div className="text-center space-y-1">
                        <p className="text-base font-bold text-foreground">{selectedFile.name}</p>
                        <p className="text-xs text-muted-foreground font-mono">
                          Size: {fmtBytes(selectedFile.size)} · Type: {selectedFile.name.endsWith('.zip') ? 'ZIP Archive' : 'JSON Document'}
                        </p>
                        <p className="text-xs text-primary font-semibold pt-2">Click to choose a different file</p>
                      </div>
                    ) : (
                      <div className="text-center space-y-1">
                        <p className="text-base font-bold text-foreground">Drop backup ZIP here or click to browse</p>
                        <p className="text-xs text-muted-foreground">Supports .ZIP (complete cloud package) and .JSON (database document)</p>
                      </div>
                    )}
                  </div>

                  <Alert className="rounded-2xl border-amber-500/30 bg-amber-500/10">
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                    <AlertDescription className="text-xs font-medium text-foreground">
                      Restoring will overwrite current tables and upload storage files. A safety snapshot of your live database will automatically be taken before restoration begins.
                    </AlertDescription>
                  </Alert>

                  <Button
                    size="lg"
                    onClick={handleRestoreFromPackage}
                    disabled={!selectedFile || !!busy}
                    className="w-full rounded-2xl h-14 bg-primary text-primary-foreground font-bold shadow-lg shadow-primary/25 hover:bg-primary/90 btn-spring gap-2 text-base"
                  >
                    {busy === 'restore' ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <Upload className="h-5 w-5" />
                    )}
                    {busy === 'restore' ? 'Restoring Cloud System...' : 'Start 1-Click Cloud Restore'}
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            {/* TAB 3: LOCAL SNAPSHOTS */}
            <TabsContent value="snapshots" className="space-y-6">
              <Card className="rounded-3xl border border-border/60 bg-card/70 backdrop-blur-xl shadow-xl">
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-xl font-bold">Local Device Snapshots</CardTitle>
                    <CardDescription>
                      Fast local snapshots stored on this browser in IndexedDB. Retains up to 10 safety checkpoints.
                    </CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSaveLocalSnapshot}
                    disabled={!!busy}
                    className="rounded-2xl border-border/70 bg-card/60 gap-2 text-xs font-bold"
                  >
                    <DatabaseBackup className="h-3.5 w-3.5 text-primary" /> Take Snapshot Now
                  </Button>
                </CardHeader>
                <CardContent>
                  {snapshots.length === 0 ? (
                    <div className="text-center py-12 space-y-3">
                      <HardDrive className="h-10 w-10 mx-auto text-muted-foreground/50" />
                      <p className="text-sm font-semibold text-muted-foreground">No local snapshots saved yet</p>
                      <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                        Snapshots are created automatically before each restore and on your scheduled frequency.
                      </p>
                    </div>
                  ) : (
                    <div className="divide-y divide-border/40">
                      {snapshots.map((snap) => (
                        <div key={snap.id} className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-sm text-foreground">{snap.label}</span>
                              <Badge
                                variant={snap.triggerType === 'rollback' ? 'destructive' : snap.triggerType === 'auto' ? 'secondary' : 'outline'}
                                className="text-[10px] uppercase font-bold"
                              >
                                {snap.triggerType}
                              </Badge>
                            </div>
                            <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                              <span>{fmtRelative(snap.createdAt)}</span>
                              <span>•</span>
                              <span>{snap.stats?.rows?.toLocaleString() || 0} rows</span>
                              <span>•</span>
                              <span>{fmtBytes(snap.sizeBytes || 0)}</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 self-end sm:self-auto">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleRestoreSnapshot(snap.id)}
                              disabled={!!busy}
                              className="rounded-xl text-xs font-bold gap-1.5"
                            >
                              <Upload className="h-3.5 w-3.5 text-primary" /> Restore
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDownloadSnapshot(snap.id)}
                              disabled={!!busy}
                              className="rounded-xl text-xs"
                            >
                              <Download className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDeleteSnapshot(snap.id)}
                              disabled={!!busy}
                              className="rounded-xl text-xs text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

        </div>
      </PageLayout>
    </PageTransition>
  );
};

export default Backup;
