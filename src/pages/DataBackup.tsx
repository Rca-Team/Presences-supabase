import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useUserRole } from '@/hooks/useUserRole';
import { supabase } from '@/integrations/supabase/client';
import {
  DatabaseBackup, Upload, Download, ShieldAlert, Loader2, RotateCcw,
  CheckCircle2, Clock, HardDrive, Trash2, Sparkles,
} from 'lucide-react';
import {
  deleteSnapshot, getSnapshot, listSnapshots, saveSnapshot, trimSnapshots,
  type SnapshotMeta, type StoredSnapshot,
} from '@/lib/backup/indexeddb';
import { lazyWithRetry } from '@/lib/lazyWithRetry';

const ZipImportPanel = lazyWithRetry(() => import('@/components/admin/ZipImportPanel'), 'zip-import-panel');


// ---------- Types ----------
type Manifest = {
  generatedAt: string;
  tables: Array<{ table: string; count: number }>;
  authUsers: number;
  restoreOrder: string[];
};

type StorageFile = { path: string; contentType: string | null; base64: string };
type StorageBucketInfo = { name: string; public: boolean; fileCount: number };

type FullBackup = {
  version: '2.1';
  createdAt: string;
  manifest: Manifest;
  tables: Record<string, unknown[]>;
  authUsers: Array<Record<string, unknown>>;
  storage: Record<string, StorageFile[]>;
  storageBuckets: StorageBucketInfo[];
};

type Progress = {
  phase: 'idle' | 'preparing' | 'exporting' | 'importing' | 'done' | 'failed';
  label: string;
  currentTable?: string;
  done: number;
  total: number;
  pct: number;
};

const SETTINGS_KEY = 'presences_backup_settings_v2';
const LAST_AUTO_KEY = 'presences_backup_last_auto_v2';
const CHUNK_SIZE = 500;
const AUTH_PAGE_SIZE = 500;
const MAX_SNAPSHOTS = 7;

type Settings = {
  autoEnabled: boolean;
  frequency: 'daily' | 'weekly';
  includeAuthUsers: boolean;
};

const defaultSettings: Settings = {
  autoEnabled: true,
  frequency: 'daily',
  includeAuthUsers: true,
};

// ---------- Helpers ----------
function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return defaultSettings;
    return { ...defaultSettings, ...JSON.parse(raw) };
  } catch { return defaultSettings; }
}

function saveSettings(s: Settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(2)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function fmtRelative(iso: string): string {
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
    throw new Error(details || error.message || 'Edge function failed');
  }
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as T;
}

// ---------- Chunked backup pipeline ----------
async function runFullBackup(
  includeAuthUsers: boolean,
  onProgress: (p: Partial<Progress>) => void,
): Promise<FullBackup> {
  onProgress({ phase: 'preparing', label: 'Reading site manifest...', pct: 2 });

  const manifest = await invokeAction<Manifest>({ action: 'list_public_tables' });
  const totalRows = manifest.tables.reduce((s, t) => s + t.count, 0) + (includeAuthUsers ? manifest.authUsers : 0);
  const backup: FullBackup = {
    version: '2.1',
    createdAt: new Date().toISOString(),
    manifest,
    tables: {},
    authUsers: [],
    storage: {},
    storageBuckets: [],
  };

  let done = 0;
  onProgress({ phase: 'exporting', total: totalRows, done: 0, pct: 3 });

  for (const { table, count } of manifest.tables) {
    backup.tables[table] = [];
    if (count === 0) continue;
    let offset = 0;
    while (offset < count) {
      onProgress({
        currentTable: table,
        label: `Exporting ${table} — ${offset.toLocaleString()} / ${count.toLocaleString()}`,
        done,
        total: totalRows,
        pct: totalRows === 0 ? 50 : Math.min(98, Math.round((done / totalRows) * 100)),
      });
      const res = await invokeAction<{ rows: unknown[] }>({
        action: 'export_table_chunk',
        table,
        offset,
        limit: CHUNK_SIZE,
      });
      const rows = res.rows ?? [];
      (backup.tables[table] as unknown[]).push(...rows);
      done += rows.length;
      offset += CHUNK_SIZE;
      if (rows.length < CHUNK_SIZE) break; // reached end
    }
  }

  if (includeAuthUsers && manifest.authUsers > 0) {
    let page = 1;
    let fetched = 0;
    while (true) {
      onProgress({
        currentTable: 'auth.users',
        label: `Exporting auth users — ${fetched.toLocaleString()} / ${manifest.authUsers.toLocaleString()}`,
        done,
        total: totalRows,
        pct: Math.min(98, Math.round((done / Math.max(1, totalRows)) * 100)),
      });
      const res = await invokeAction<{ users: Array<Record<string, unknown>> }>({
        action: 'export_auth_users_chunk',
        page,
        perPage: AUTH_PAGE_SIZE,
      });
      const users = res.users ?? [];
      backup.authUsers.push(...users);
      fetched += users.length;
      done += users.length;
      if (users.length < AUTH_PAGE_SIZE) break;
      page += 1;
    }
  }

  // Storage buckets (all of them, all files) — captures face samples, uploads, etc.
  try {
    const bres = await invokeAction<{ buckets: StorageBucketInfo[] }>({ action: 'list_storage_buckets' });
    backup.storageBuckets = bres.buckets || [];
    for (const bucket of backup.storageBuckets) {
      backup.storage[bucket.name] = [];
      if (!bucket.fileCount) continue;
      const listRes = await invokeAction<{ paths: string[] }>({ action: 'list_storage_files', bucket: bucket.name });
      const paths = listRes.paths || [];
      let i = 0;
      for (const path of paths) {
        i += 1;
        onProgress({
          currentTable: `storage:${bucket.name}`,
          label: `Downloading ${bucket.name}/${path} (${i}/${paths.length})`,
          done, total: totalRows, pct: Math.min(98, Math.round((done / Math.max(1, totalRows)) * 100)),
        });
        try {
          const f = await invokeAction<StorageFile>({ action: 'download_storage_file', bucket: bucket.name, path });
          backup.storage[bucket.name].push({ path: f.path, contentType: f.contentType, base64: f.base64 });
        } catch (e) {
          console.warn('storage download failed', bucket.name, path, e);
        }
      }
    }
  } catch (e) {
    console.warn('storage backup skipped', e);
  }

  onProgress({ phase: 'done', label: 'Backup complete', done: totalRows, total: totalRows, pct: 100 });
  return backup;
}

export type RestoreReport = {
  tablesRestored: number;
  rowsRestored: number;
  authUsersCreated: number;
  authUsersSkipped: number;
  skippedTables: string[];
  errors: Array<{ scope: string; message: string }>;
};

function validateBackup(raw: unknown): FullBackup {
  if (!raw || typeof raw !== 'object') throw new Error('Backup file is empty or invalid JSON.');
  const b = raw as Partial<FullBackup>;
  if (!b.tables || typeof b.tables !== 'object') {
    throw new Error('Backup is missing the "tables" section.');
  }
  // Coerce optional fields so downstream code is safe
  const safe: FullBackup = {
    version: (b.version as any) || '2.1',
    createdAt: b.createdAt || new Date().toISOString(),
    manifest: b.manifest || { generatedAt: '', tables: [], authUsers: 0, restoreOrder: Object.keys(b.tables) },
    tables: {},
    authUsers: Array.isArray(b.authUsers) ? b.authUsers : [],
    storage: (b as any).storage && typeof (b as any).storage === 'object' ? (b as any).storage : {},
    storageBuckets: Array.isArray((b as any).storageBuckets) ? (b as any).storageBuckets : [],
  };
  for (const [k, v] of Object.entries(b.tables)) {
    if (Array.isArray(v)) safe.tables[k] = v;
  }
  return safe;
}

async function runFullRestore(
  backup: FullBackup,
  includeAuthUsers: boolean,
  onProgress: (p: Partial<Progress>) => void,
): Promise<RestoreReport> {
  const report: RestoreReport = {
    tablesRestored: 0, rowsRestored: 0,
    authUsersCreated: 0, authUsersSkipped: 0,
    skippedTables: [], errors: [],
  };

  // Ask the server which tables it accepts so an old/foreign backup can't break the loop
  let allowedTables: Set<string>;
  try {
    const manifest = await invokeAction<Manifest>({ action: 'list_public_tables' });
    allowedTables = new Set(manifest.tables.map((t) => t.table));
  } catch (e: any) {
    throw new Error(`Cannot reach backup service: ${e?.message || 'unknown error'}`);
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

  const totalRows = restoreOrder.reduce((s, t) => s + ((backup.tables[t] as unknown[])?.length || 0), 0)
    + (includeAuthUsers ? (backup.authUsers?.length || 0) : 0);

  let done = 0;
  onProgress({ phase: 'importing', total: totalRows, done: 0, pct: 2, label: 'Preparing restore...' });

  // Restore auth users first so profile.user_id references resolve
  if (includeAuthUsers && backup.authUsers?.length) {
    const total = backup.authUsers.length;
    for (let i = 0; i < total; i += 100) {
      const slice = backup.authUsers.slice(i, i + 100);
      onProgress({
        currentTable: 'auth.users',
        label: `Restoring auth users — ${i.toLocaleString()} / ${total.toLocaleString()}`,
        done, total: totalRows,
        pct: Math.min(98, Math.round((done / Math.max(1, totalRows)) * 100)),
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

  for (const table of restoreOrder) {
    const rows = (backup.tables[table] as unknown[]) || [];
    if (rows.length === 0) continue;

    onProgress({
      currentTable: table,
      label: `Clearing ${table}...`,
      done, total: totalRows,
      pct: Math.min(98, Math.round((done / Math.max(1, totalRows)) * 100)),
    });
    try { await invokeAction({ action: 'clear_table', table }); } catch (e: any) {
      // Non-fatal — upsert will still overwrite on id match
      report.errors.push({ scope: `clear ${table}`, message: e?.message || 'clear failed' });
    }

    let tableRowsInserted = 0;
    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      const chunk = rows.slice(i, i + CHUNK_SIZE);
      onProgress({
        currentTable: table,
        label: `Restoring ${table} — ${i.toLocaleString()} / ${rows.length.toLocaleString()}`,
        done, total: totalRows,
        pct: Math.min(98, Math.round((done / Math.max(1, totalRows)) * 100)),
      });
      try {
        await invokeAction({ action: 'import_table_chunk', table, rows: chunk });
        tableRowsInserted += chunk.length;
      } catch (e: any) {
        // Retry once with a smaller batch to isolate a poison row / transient error
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

  // Restore storage buckets & files
  const storage = backup.storage || {};
  for (const [bucket, files] of Object.entries(storage)) {
    if (!files || files.length === 0) continue;
    onProgress({
      currentTable: `storage:${bucket}`,
      label: `Clearing bucket ${bucket}...`,
      done, total: totalRows, pct: Math.min(98, Math.round((done / Math.max(1, totalRows)) * 100)),
    });
    try { await invokeAction({ action: 'clear_storage_bucket', bucket }); } catch (e: any) {
      report.errors.push({ scope: `clear bucket ${bucket}`, message: e?.message || 'clear failed' });
    }
    let i = 0;
    for (const file of files) {
      i += 1;
      onProgress({
        currentTable: `storage:${bucket}`,
        label: `Uploading ${bucket}/${file.path} (${i}/${files.length})`,
        done, total: totalRows, pct: Math.min(98, Math.round((done / Math.max(1, totalRows)) * 100)),
      });
      try {
        await invokeAction({
          action: 'upload_storage_file',
          bucket, path: file.path,
          base64: file.base64, contentType: file.contentType,
        });
      } catch (e: any) {
        report.errors.push({ scope: `${bucket}/${file.path}`, message: e?.message || 'upload failed' });
      }
    }
  }

  onProgress({ phase: 'done', label: 'Restore complete', done: totalRows, total: totalRows, pct: 100 });
  return report;
}

function backupToBlob(backup: FullBackup): Blob {
  return new Blob([JSON.stringify(backup)], { type: 'application/json' });
}

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function computeStats(backup: FullBackup) {
  const tables = Object.keys(backup.tables).length;
  const rows = Object.values(backup.tables).reduce((s, arr) => s + ((arr as unknown[])?.length || 0), 0);
  const authUsers = backup.authUsers?.length || 0;
  return { tables, rows, authUsers };
}

// ---------- Component ----------
const DataBackup = ({ embedded = false }: { embedded?: boolean }) => {
  const { toast } = useToast();
  const { role, isLoading } = useUserRole();
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [progress, setProgress] = useState<Progress>({
    phase: 'idle', label: '', done: 0, total: 0, pct: 0,
  });
  const [busy, setBusy] = useState<null | 'backup' | 'snapshot' | 'restore'>(null);
  const [snapshots, setSnapshots] = useState<SnapshotMeta[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const autoRanRef = useRef(false);

  const updateProgress = useCallback((patch: Partial<Progress>) => {
    setProgress((prev) => ({ ...prev, ...patch }));
  }, []);

  const showRestoreReport = useCallback((report: RestoreReport, label?: string) => {
    const bits: string[] = [];
    bits.push(`${report.rowsRestored.toLocaleString()} rows across ${report.tablesRestored} tables`);
    if (report.authUsersCreated + report.authUsersSkipped > 0) {
      bits.push(`${report.authUsersCreated} users created, ${report.authUsersSkipped} kept`);
    }
    if (report.skippedTables.length > 0) {
      bits.push(`skipped: ${report.skippedTables.slice(0, 3).join(', ')}${report.skippedTables.length > 3 ? '…' : ''}`);
    }
    const hasErrors = report.errors.length > 0;
    toast({
      title: hasErrors ? 'Restore finished with warnings' : `Restore complete${label ? ` — ${label}` : ''}`,
      description: `${bits.join(' · ')}${hasErrors ? ` · ${report.errors.length} issues (see console)` : ''}`,
      variant: hasErrors ? 'default' : 'default',
    });
    if (hasErrors) {
      console.group('Restore report');
      for (const err of report.errors) console.warn(`[${err.scope}]`, err.message);
      console.groupEnd();
    }
  }, [toast]);

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
  }, [refreshSnapshots]);

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
    const stats = computeStats(backup);
    const blob = backupToBlob(backup);
    const snap: StoredSnapshot = {
      id: crypto.randomUUID(),
      label,
      createdAt: backup.createdAt,
      triggerType,
      sizeBytes: blob.size,
      stats,
      backup,
    };
    await saveSnapshot(snap);
    await trimSnapshots(MAX_SNAPSHOTS);
    await refreshSnapshots();
    localStorage.setItem(LAST_AUTO_KEY, backup.createdAt);
    setLastBackupAt(backup.createdAt);
  };

  // ---------- Actions ----------
  const handleBackupNow = async () => {
    try {
      setBusy('backup');
      setProgress({ phase: 'preparing', label: 'Preparing full-site backup...', done: 0, total: 0, pct: 2 });
      const backup = await runFullBackup(settings.includeAuthUsers, updateProgress);
      const blob = backupToBlob(backup);
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      downloadBlob(blob, `presences-backup-${stamp}.json`);
      await persistSnapshot(backup, `Full Backup ${new Date().toLocaleString()}`, 'manual');
      toast({
        title: 'Backup complete',
        description: `Downloaded ${fmtBytes(blob.size)} — ${computeStats(backup).rows.toLocaleString()} rows.`,
      });
    } catch (e: any) {
      updateProgress({ phase: 'failed', label: e?.message || 'Backup failed', pct: 0 });
      toast({ title: 'Backup failed', description: e?.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  const handleSaveSnapshot = async () => {
    try {
      setBusy('snapshot');
      setProgress({ phase: 'preparing', label: 'Creating snapshot...', done: 0, total: 0, pct: 2 });
      const backup = await runFullBackup(settings.includeAuthUsers, updateProgress);
      await persistSnapshot(backup, `Snapshot ${new Date().toLocaleString()}`, 'manual');
      toast({ title: 'Snapshot saved', description: 'Stored on this device (IndexedDB).' });
    } catch (e: any) {
      updateProgress({ phase: 'failed', label: e?.message || 'Snapshot failed', pct: 0 });
      toast({ title: 'Snapshot failed', description: e?.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  const handleRestoreFile = async () => {
    if (!selectedFile) {
      toast({ title: 'No file selected', variant: 'destructive' });
      return;
    }
    try {
      setBusy('restore');
      setProgress({ phase: 'preparing', label: 'Creating pre-restore snapshot...', done: 0, total: 0, pct: 2 });
      // Safety net: snapshot current state first
      try {
        const preBackup = await runFullBackup(settings.includeAuthUsers, () => {});
        await persistSnapshot(preBackup, `Pre-restore ${new Date().toLocaleString()}`, 'rollback');
      } catch (e) {
        console.warn('pre-restore snapshot failed', e);
      }

      const raw = await selectedFile.text();
      let parsed: unknown;
      try { parsed = JSON.parse(raw); } catch { throw new Error('File is not valid JSON.'); }
      const backup = validateBackup(parsed);

      const report = await runFullRestore(backup, settings.includeAuthUsers, updateProgress);
      showRestoreReport(report);
    } catch (e: any) {
      updateProgress({ phase: 'failed', label: e?.message || 'Restore failed', pct: 0 });
      toast({ title: 'Restore failed', description: e?.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  const handleRestoreSnapshot = async (id: string) => {
    try {
      setBusy('restore');
      setProgress({ phase: 'preparing', label: 'Loading snapshot...', done: 0, total: 0, pct: 2 });
      const snap = await getSnapshot(id);
      if (!snap) throw new Error('Snapshot not found');
      const report = await runFullRestore(snap.backup as FullBackup, settings.includeAuthUsers, updateProgress);
      showRestoreReport(report, snap.label);
      toast({ title: 'Restore complete', description: `Restored ${snap.label}` });
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
  };

  const handleDownloadSnapshot = async (id: string) => {
    const snap = await getSnapshot(id);
    if (!snap) return;
    const blob = backupToBlob(snap.backup as FullBackup);
    downloadBlob(blob, `${snap.label.replace(/[^a-z0-9]+/gi, '-')}.json`);
  };

  // ---------- Auto backup ----------
  useEffect(() => {
    if (isLoading || role !== 'admin') return;
    if (!settings.autoEnabled) return;
    if (autoRanRef.current) return;
    if (busy) return;

    const last = localStorage.getItem(LAST_AUTO_KEY);
    const intervalMs = settings.frequency === 'daily' ? 24 * 3600e3 : 7 * 24 * 3600e3;
    if (last && Date.now() - new Date(last).getTime() < intervalMs) return;

    autoRanRef.current = true;
    (async () => {
      // Run silently in the background: do NOT set `busy` or touch the visible
      // progress bar so the admin can still click Backup Now / Save Snapshot /
      // Restore / Delete while this runs.
      try {
        const backup = await runFullBackup(settings.includeAuthUsers, () => {});
        await persistSnapshot(backup, `Auto ${settings.frequency} ${new Date().toLocaleString()}`, 'auto');
        toast({ title: 'Automatic backup saved', description: 'Latest snapshot stored on this device.' });
      } catch (e: any) {
        console.warn('auto backup failed', e);
      }
    })();
  }, [isLoading, role, settings, busy, updateProgress, toast]);

  // ---------- Guards ----------
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (role !== 'admin') {
    return (
      <Alert variant="destructive">
        <ShieldAlert className="h-4 w-4" />
        <AlertDescription>Only admins can access Data Backup.</AlertDescription>
      </Alert>
    );
  }

  const running = progress.phase === 'preparing' || progress.phase === 'exporting' || progress.phase === 'importing';
  const totalRowsAcrossSnapshots = snapshots.reduce((s, x) => s + (x.stats.rows || 0), 0);
  const totalSizeAcrossSnapshots = snapshots.reduce((s, x) => s + (x.sizeBytes || 0), 0);

  const inner = (
    <div className="space-y-6">
      {/* Header + overview */}
      <Card className="overflow-hidden border-border/60">
        <CardHeader className="pb-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <CardTitle className="flex items-center gap-2">
                <DatabaseBackup className="h-5 w-5 text-primary" />
                Full-site Backup
              </CardTitle>
              <CardDescription>
                Automatically capture every table, user, attendance record and face sample — restore in one click.
              </CardDescription>
            </div>
            <div className="flex gap-2 flex-wrap">
              {settings.autoEnabled && (
                <Badge variant="secondary" className="gap-1">
                  <Sparkles className="h-3 w-3" /> Auto {settings.frequency}
                </Badge>
              )}
              {lastBackupAt && (
                <Badge variant="outline" className="gap-1">
                  <Clock className="h-3 w-3" /> Last: {fmtRelative(lastBackupAt)}
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatTile icon={<DatabaseBackup className="h-4 w-4" />} label="Snapshots" value={snapshots.length.toString()} />
          <StatTile icon={<HardDrive className="h-4 w-4" />} label="Storage used" value={fmtBytes(totalSizeAcrossSnapshots)} />
          <StatTile icon={<CheckCircle2 className="h-4 w-4" />} label="Rows captured" value={totalRowsAcrossSnapshots.toLocaleString()} />
          <StatTile icon={<Clock className="h-4 w-4" />} label="Last backup" value={lastBackupAt ? fmtRelative(lastBackupAt) : 'Never'} />
        </CardContent>
      </Card>

      {/* Progress bar (always mounted so animation is smooth) */}
      {(running || progress.phase === 'done' || progress.phase === 'failed') && (
        <Card className={progress.phase === 'failed' ? 'border-destructive/50' : ''}>
          <CardContent className="py-4 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 min-w-0">
                {running ? <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" /> :
                 progress.phase === 'done' ? <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" /> :
                 <ShieldAlert className="h-4 w-4 text-destructive shrink-0" />}
                <span className="truncate">{progress.label || 'Working...'}</span>
              </span>
              <span className="tabular-nums text-muted-foreground shrink-0">
                {progress.total > 0
                  ? `${progress.done.toLocaleString()} / ${progress.total.toLocaleString()}`
                  : `${progress.pct}%`}
              </span>
            </div>
            <Progress value={progress.pct} className="h-2" />
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="backup" className="w-full">
        <TabsList className="grid grid-cols-4 w-full max-w-2xl">
          <TabsTrigger value="backup">Backup</TabsTrigger>
          <TabsTrigger value="restore">Restore</TabsTrigger>
          <TabsTrigger value="zip">Import ZIP</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        {/* ZIP IMPORT */}
        <TabsContent value="zip" className="mt-4">
          <React.Suspense
            fallback={<div className="h-64 animate-pulse rounded-xl border bg-muted/30" />}
          >
            <ZipImportPanel />
          </React.Suspense>
        </TabsContent>


        {/* BACKUP */}
        <TabsContent value="backup" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Create a new backup</CardTitle>
              <CardDescription>
                Downloads a complete JSON file with every table, plus a local safety snapshot on this device.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col sm:flex-row gap-3">
              <Button onClick={handleBackupNow} disabled={!!busy} className="gap-2">
                {busy === 'backup' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                Backup Now & Download
              </Button>
              <Button variant="outline" onClick={handleSaveSnapshot} disabled={!!busy} className="gap-2">
                {busy === 'snapshot' ? <Loader2 className="h-4 w-4 animate-spin" /> : <DatabaseBackup className="h-4 w-4" />}
                Save Snapshot (this device)
              </Button>
            </CardContent>
          </Card>

          <SnapshotList
            snapshots={snapshots}
            busy={!!busy}
            onRestore={handleRestoreSnapshot}
            onDownload={handleDownloadSnapshot}
            onDelete={handleDeleteSnapshot}
          />
        </TabsContent>

        {/* RESTORE */}
        <TabsContent value="restore" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Restore from file</CardTitle>
              <CardDescription>
                Upload a previously downloaded <code className="text-xs">.json</code> backup. A safety snapshot is created before restore.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label htmlFor="restore-file" className="sr-only">Backup file</Label>
                <Input
                  id="restore-file"
                  ref={fileInputRef}
                  type="file"
                  accept="application/json,.json"
                  disabled={!!busy}
                  onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                />
              </div>
              {selectedFile && (
                <div className="text-sm text-muted-foreground">
                  Selected: <span className="font-medium text-foreground">{selectedFile.name}</span>
                  {' '}({fmtBytes(selectedFile.size)})
                </div>
              )}
              <Button onClick={handleRestoreFile} disabled={!selectedFile || !!busy} className="gap-2">
                {busy === 'restore' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                Restore from file
              </Button>
              <Alert>
                <ShieldAlert className="h-4 w-4" />
                <AlertDescription>
                  Restoring replaces existing rows in every table it contains. Existing users are matched by ID.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>

          <SnapshotList
            snapshots={snapshots}
            busy={!!busy}
            onRestore={handleRestoreSnapshot}
            onDownload={handleDownloadSnapshot}
            onDelete={handleDeleteSnapshot}
          />
        </TabsContent>

        {/* SETTINGS */}
        <TabsContent value="settings" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Automatic backups</CardTitle>
              <CardDescription>Runs silently in the background when you visit the admin panel.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <Label className="text-sm font-medium">Enable automatic backups</Label>
                  <p className="text-xs text-muted-foreground">Stored on this device only.</p>
                </div>
                <Switch
                  checked={settings.autoEnabled}
                  onCheckedChange={(v) => updateSettings({ autoEnabled: v })}
                />
              </div>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <Label className="text-sm font-medium">Frequency</Label>
                </div>
                <Select
                  value={settings.frequency}
                  onValueChange={(v: 'daily' | 'weekly') => updateSettings({ frequency: v })}
                >
                  <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <Label className="text-sm font-medium">Include auth users</Label>
                  <p className="text-xs text-muted-foreground">Preserves account IDs so profiles/roles stay linked.</p>
                </div>
                <Switch
                  checked={settings.includeAuthUsers}
                  onCheckedChange={(v) => updateSettings({ includeAuthUsers: v })}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );

  if (embedded) return inner;
  return (
    <PageLayout>
      <PageTransition>
        <div className="container mx-auto p-4 md:p-6 max-w-5xl">{inner}</div>
      </PageTransition>
    </PageLayout>
  );
};

// ---------- Sub-components ----------
function StatTile({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card/50 p-3">
      <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
        {icon}<span>{label}</span>
      </div>
      <div className="text-lg font-semibold tabular-nums truncate">{value}</div>
    </div>
  );
}

function SnapshotList({
  snapshots, busy, onRestore, onDownload, onDelete,
}: {
  snapshots: SnapshotMeta[];
  busy: boolean;
  onRestore: (id: string) => void;
  onDownload: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  if (snapshots.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          No snapshots yet. Run "Backup Now" or "Save Snapshot" to create the first one.
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Saved snapshots</CardTitle>
        <CardDescription>Local device only · newest first · keeps last {MAX_SNAPSHOTS}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {snapshots.map((s) => (
          <div key={s.id} className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3 flex-wrap">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium truncate">{s.label}</span>
                <Badge variant={s.triggerType === 'auto' ? 'secondary' : s.triggerType === 'rollback' ? 'destructive' : 'outline'}>
                  {s.triggerType}
                </Badge>
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {new Date(s.createdAt).toLocaleString()} · {s.stats.rows.toLocaleString()} rows · {s.stats.authUsers} users · {fmtBytes(s.sizeBytes)}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button size="sm" variant="outline" disabled={busy} onClick={() => onDownload(s.id)} title="Download">
                <Download className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => onRestore(s.id)} title="Restore">
                <RotateCcw className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => onDelete(s.id)} title="Delete">
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export default DataBackup;
