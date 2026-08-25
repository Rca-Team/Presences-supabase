import React, { useCallback, useRef, useState } from 'react';
import JSZip from 'jszip';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import {
  FileArchive, Database, HardDrive, Loader2, CheckCircle2, AlertTriangle,
  Users, UploadCloud, X,
} from 'lucide-react';

type Job = 'db' | 'storage';

type RunState = {
  running: boolean;
  pct: number;
  label: string;
  done: number;
  total: number;
  logs: string[];
  finished: boolean;
  failed: boolean;
};

const emptyRun: RunState = {
  running: false, pct: 0, label: '', done: 0, total: 0, logs: [], finished: false, failed: false,
};

const CHUNK = 400;

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(2)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
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

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + step)) as any);
  }
  return btoa(binary);
}

function guessContentType(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() || '';
  const map: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
    gif: 'image/gif', svg: 'image/svg+xml', pdf: 'application/pdf',
    json: 'application/json', csv: 'text/csv', txt: 'text/plain',
    mp4: 'video/mp4', webm: 'video/webm', bin: 'application/octet-stream',
  };
  return map[ext] || 'application/octet-stream';
}

const ZipImportPanel: React.FC = () => {
  const { toast } = useToast();
  const dbInputRef = useRef<HTMLInputElement>(null);
  const storageInputRef = useRef<HTMLInputElement>(null);
  const [dbFile, setDbFile] = useState<File | null>(null);
  const [storageFile, setStorageFile] = useState<File | null>(null);
  const [dbRun, setDbRun] = useState<RunState>(emptyRun);
  const [storageRun, setStorageRun] = useState<RunState>(emptyRun);
  const [wipeTables, setWipeTables] = useState(true);
  const [importUsers, setImportUsers] = useState(true);
  const [wipeBuckets, setWipeBuckets] = useState(false);
  const [dragging, setDragging] = useState<Job | null>(null);

  const patch = useCallback((job: Job, p: Partial<RunState>) => {
    const setter = job === 'db' ? setDbRun : setStorageRun;
    setter((prev) => ({ ...prev, ...p }));
  }, []);

  const log = useCallback((job: Job, line: string) => {
    const setter = job === 'db' ? setDbRun : setStorageRun;
    setter((prev) => ({ ...prev, logs: [...prev.logs.slice(-120), line] }));
  }, []);

  // ---------- Database + users ----------
  const runDbImport = async (file: File) => {
    setDbRun({ ...emptyRun, running: true, label: 'Reading archive…', pct: 2 });
    try {
      const zip = await JSZip.loadAsync(file);
      const entries = Object.values(zip.files).filter((f) => !f.dir && /\.json$/i.test(f.name));
      if (entries.length === 0) throw new Error('No .json files found inside the ZIP.');

      const tables: Record<string, any[]> = {};
      let authUsers: Array<Record<string, unknown>> = [];

      patch('db', { label: `Parsing ${entries.length} JSON file(s)…`, pct: 6 });

      for (const entry of entries) {
        const text = await entry.async('string');
        let parsed: any;
        try { parsed = JSON.parse(text); } catch {
          log('db', `⚠︎ Skipped ${entry.name} — invalid JSON`);
          continue;
        }
        const base = entry.name.split('/').pop()!.replace(/\.json$/i, '');

        if (parsed && !Array.isArray(parsed) && parsed.tables && typeof parsed.tables === 'object') {
          // Full-site backup document
          for (const [t, rows] of Object.entries(parsed.tables)) {
            if (Array.isArray(rows) && rows.length) tables[t] = [...(tables[t] || []), ...rows];
          }
          if (Array.isArray(parsed.authUsers)) authUsers = [...authUsers, ...parsed.authUsers];
          log('db', `✓ ${entry.name} — full backup document`);
        } else if (Array.isArray(parsed)) {
          if (/^(auth[._-]?users|users)$/i.test(base)) {
            authUsers = [...authUsers, ...parsed];
            log('db', `✓ ${entry.name} — ${parsed.length} auth users`);
          } else {
            tables[base] = [...(tables[base] || []), ...parsed];
            log('db', `✓ ${entry.name} — ${parsed.length} rows → ${base}`);
          }
        } else {
          log('db', `⚠︎ Skipped ${entry.name} — unrecognised shape`);
        }
      }

      // Only import tables this project actually has
      const manifest = await invokeAction<{ tables: Array<{ table: string }>; restoreOrder?: string[] }>({
        action: 'list_public_tables',
      });
      const allowed = new Set(manifest.tables.map((t) => t.table));
      const order = (manifest.restoreOrder?.length ? manifest.restoreOrder : Object.keys(tables))
        .filter((t) => tables[t]?.length && allowed.has(t));
      for (const t of Object.keys(tables)) {
        if (!allowed.has(t)) log('db', `⚠︎ Table "${t}" does not exist here — skipped`);
        else if (!order.includes(t)) order.push(t);
      }

      const totalRows = order.reduce((s, t) => s + tables[t].length, 0)
        + (importUsers ? authUsers.length : 0);
      if (totalRows === 0) throw new Error('Nothing importable found in the archive.');

      let done = 0;
      const bump = (label: string) => patch('db', {
        done, total: totalRows, label,
        pct: Math.min(98, Math.max(4, Math.round((done / totalRows) * 100))),
      });

      if (importUsers && authUsers.length) {
        for (let i = 0; i < authUsers.length; i += 100) {
          const slice = authUsers.slice(i, i + 100);
          bump(`Restoring users — ${i}/${authUsers.length}`);
          try {
            const res = await invokeAction<{ created: number; skipped: number }>({
              action: 'import_auth_users_chunk', users: slice,
            });
            log('db', `users: +${res.created || 0} created, ${res.skipped || 0} existing`);
          } catch (e: any) {
            log('db', `⚠︎ users chunk failed — ${e?.message || 'error'}`);
          }
          done += slice.length;
        }
      }

      let rowsRestored = 0;
      for (const table of order) {
        const rows = tables[table];
        if (wipeTables) {
          bump(`Clearing ${table}…`);
          try { await invokeAction({ action: 'clear_table', table }); }
          catch (e: any) { log('db', `⚠︎ clear ${table} — ${e?.message || 'failed'}`); }
        }
        for (let i = 0; i < rows.length; i += CHUNK) {
          const chunk = rows.slice(i, i + CHUNK);
          bump(`Importing ${table} — ${i}/${rows.length}`);
          try {
            await invokeAction({ action: 'import_table_chunk', table, rows: chunk });
            rowsRestored += chunk.length;
          } catch (e: any) {
            let recovered = 0;
            for (let j = 0; j < chunk.length; j += 50) {
              const mini = chunk.slice(j, j + 50);
              try { await invokeAction({ action: 'import_table_chunk', table, rows: mini }); recovered += mini.length; }
              catch { /* skip poison rows */ }
            }
            rowsRestored += recovered;
            if (recovered < chunk.length) {
              log('db', `⚠︎ ${table}: ${chunk.length - recovered} rows rejected — ${e?.message || 'error'}`);
            }
          }
          done += chunk.length;
        }
        log('db', `✓ ${table} — ${rows.length.toLocaleString()} rows`);
      }

      patch('db', {
        running: false, finished: true, pct: 100, done: totalRows, total: totalRows,
        label: `Imported ${rowsRestored.toLocaleString()} rows across ${order.length} tables`,
      });
      toast({
        title: 'Database import complete',
        description: `${rowsRestored.toLocaleString()} rows · ${order.length} tables${importUsers ? ` · ${authUsers.length} users processed` : ''}`,
      });
    } catch (e: any) {
      patch('db', { running: false, failed: true, label: e?.message || 'Import failed' });
      toast({ title: 'Database import failed', description: e?.message || 'Unknown error', variant: 'destructive' });
    }
  };

  // ---------- Storage ----------
  const runStorageImport = async (file: File) => {
    setStorageRun({ ...emptyRun, running: true, label: 'Reading archive…', pct: 2 });
    try {
      const zip = await JSZip.loadAsync(file);
      const files = Object.values(zip.files).filter((f) => !f.dir);
      if (files.length === 0) throw new Error('The ZIP contains no files.');

      // Group as bucket/path — first folder segment is the bucket name.
      const grouped = new Map<string, Array<{ path: string; entry: JSZip.JSZipObject }>>();
      for (const entry of files) {
        const parts = entry.name.split('/').filter(Boolean);
        if (parts.length < 2) {
          log('storage', `⚠︎ Skipped ${entry.name} — expected <bucket>/<path> layout`);
          continue;
        }
        const bucket = parts[0];
        const path = parts.slice(1).join('/');
        if (!grouped.has(bucket)) grouped.set(bucket, []);
        grouped.get(bucket)!.push({ path, entry });
      }
      if (grouped.size === 0) {
        throw new Error('No bucket folders found. Put files inside a top-level folder named after each bucket.');
      }

      const total = Array.from(grouped.values()).reduce((s, a) => s + a.length, 0);
      let done = 0;
      let uploaded = 0;

      for (const [bucket, items] of grouped) {
        if (wipeBuckets) {
          patch('storage', { label: `Clearing bucket ${bucket}…`, done, total, pct: Math.max(3, Math.round((done / total) * 100)) });
          try { await invokeAction({ action: 'clear_storage_bucket', bucket }); }
          catch (e: any) { log('storage', `⚠︎ clear ${bucket} — ${e?.message || 'failed'}`); }
        }
        for (const item of items) {
          done += 1;
          patch('storage', {
            label: `Uploading ${bucket}/${item.path}`,
            done, total, pct: Math.min(98, Math.round((done / total) * 100)),
          });
          try {
            const bytes = await item.entry.async('uint8array');
            await invokeAction({
              action: 'upload_storage_file',
              bucket, path: item.path,
              base64: uint8ToBase64(bytes),
              contentType: guessContentType(item.path),
            });
            uploaded += 1;
          } catch (e: any) {
            log('storage', `⚠︎ ${bucket}/${item.path} — ${e?.message || 'upload failed'}`);
          }
        }
        log('storage', `✓ ${bucket} — ${items.length} file(s)`);
      }

      patch('storage', {
        running: false, finished: true, pct: 100, done: total, total,
        label: `Uploaded ${uploaded}/${total} files into ${grouped.size} bucket(s)`,
      });
      toast({ title: 'Storage import complete', description: `${uploaded}/${total} files uploaded.` });
    } catch (e: any) {
      patch('storage', { running: false, failed: true, label: e?.message || 'Import failed' });
      toast({ title: 'Storage import failed', description: e?.message || 'Unknown error', variant: 'destructive' });
    }
  };

  const pickFile = (job: Job, f: File | null) => {
    if (!f) return;
    if (!/\.zip$/i.test(f.name)) {
      toast({ title: 'Not a ZIP file', description: 'Please choose a .zip archive.', variant: 'destructive' });
      return;
    }
    if (job === 'db') { setDbFile(f); setDbRun(emptyRun); } else { setStorageFile(f); setStorageRun(emptyRun); }
  };

  const dropZone = (job: Job, file: File | null, run: RunState) => {
    const inputRef = job === 'db' ? dbInputRef : storageInputRef;
    const active = dragging === job;
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={() => !run.running && inputRef.current?.click()}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click(); }}
        onDragOver={(e) => { e.preventDefault(); setDragging(job); }}
        onDragLeave={() => setDragging(null)}
        onDrop={(e) => {
          e.preventDefault(); setDragging(null);
          pickFile(job, e.dataTransfer.files?.[0] || null);
        }}
        className={[
          'relative cursor-pointer rounded-xl border-2 border-dashed p-6 text-center transition-all',
          active ? 'border-primary bg-primary/10 scale-[1.01]' : 'border-border hover:border-primary/60 hover:bg-muted/40',
          run.running ? 'pointer-events-none opacity-70' : '',
        ].join(' ')}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".zip,application/zip"
          className="hidden"
          onChange={(e) => pickFile(job, e.target.files?.[0] || null)}
        />
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          {run.running
            ? <Loader2 className="h-6 w-6 animate-spin text-primary" />
            : <UploadCloud className="h-6 w-6 text-primary" />}
        </div>
        {file ? (
          <div className="space-y-1">
            <p className="font-medium truncate">{file.name}</p>
            <p className="text-xs text-muted-foreground">{fmtBytes(file.size)} · click to change</p>
          </div>
        ) : (
          <div className="space-y-1">
            <p className="font-medium">Click to open a ZIP file</p>
            <p className="text-xs text-muted-foreground">or drag &amp; drop it here</p>
          </div>
        )}
      </div>
    );
  };

  const progressBlock = (run: RunState) => {
    if (!run.running && !run.finished && !run.failed) return null;
    return (
      <div className="space-y-2 rounded-lg border bg-card/60 p-3">
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="flex min-w-0 items-center gap-2">
            {run.running ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
              : run.failed ? <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
                : <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />}
            <span className="truncate">{run.label}</span>
          </span>
          <span className="shrink-0 tabular-nums text-muted-foreground">
            {run.total > 0 ? `${run.done.toLocaleString()} / ${run.total.toLocaleString()}` : `${run.pct}%`}
          </span>
        </div>
        <Progress value={run.failed ? 100 : run.pct} className="h-2" />
        {run.logs.length > 0 && (
          <ScrollArea className="h-28 rounded-md border bg-muted/30 p-2">
            <div className="space-y-0.5 font-mono text-[11px] leading-relaxed">
              {run.logs.map((l, i) => <div key={i} className="truncate">{l}</div>)}
            </div>
          </ScrollArea>
        )}
      </div>
    );
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* DATABASE + USERS */}
      <Card className="overflow-hidden">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Database className="h-5 w-5 text-primary" />
                Import Database &amp; Users
              </CardTitle>
              <CardDescription>
                One click — open a ZIP containing a full backup <code className="text-xs">.json</code> or one JSON
                array per table (e.g. <code className="text-xs">profiles.json</code>).
              </CardDescription>
            </div>
            <Badge variant="secondary" className="gap-1 shrink-0"><FileArchive className="h-3 w-3" /> ZIP</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {dropZone('db', dbFile, dbRun)}

          <div className="space-y-3 rounded-lg border p-3">
            <div className="flex items-center justify-between gap-3">
              <Label className="text-sm">Replace existing rows</Label>
              <Switch checked={wipeTables} onCheckedChange={setWipeTables} disabled={dbRun.running} />
            </div>
            <div className="flex items-center justify-between gap-3">
              <Label className="flex items-center gap-2 text-sm"><Users className="h-3.5 w-3.5" /> Import auth users</Label>
              <Switch checked={importUsers} onCheckedChange={setImportUsers} disabled={dbRun.running} />
            </div>
          </div>

          <div className="flex gap-2">
            <Button className="gap-2" disabled={!dbFile || dbRun.running} onClick={() => dbFile && runDbImport(dbFile)}>
              {dbRun.running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
              Import now
            </Button>
            {dbFile && !dbRun.running && (
              <Button variant="ghost" size="icon" onClick={() => { setDbFile(null); setDbRun(emptyRun); }}>
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>

          {progressBlock(dbRun)}

          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="text-xs">
              Rows are matched by ID. Tables that don't exist in this project are skipped safely.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* STORAGE */}
      <Card className="overflow-hidden">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <HardDrive className="h-5 w-5 text-primary" />
                Import Storage Files
              </CardTitle>
              <CardDescription>
                One click — open a ZIP where each top-level folder is a bucket
                (e.g. <code className="text-xs">attendance-snapshots/2026/img.jpg</code>).
              </CardDescription>
            </div>
            <Badge variant="secondary" className="gap-1 shrink-0"><FileArchive className="h-3 w-3" /> ZIP</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {dropZone('storage', storageFile, storageRun)}

          <div className="space-y-3 rounded-lg border p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label className="text-sm">Clear bucket before upload</Label>
                <p className="text-xs text-muted-foreground">Off = merge with existing files.</p>
              </div>
              <Switch checked={wipeBuckets} onCheckedChange={setWipeBuckets} disabled={storageRun.running} />
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              className="gap-2"
              disabled={!storageFile || storageRun.running}
              onClick={() => storageFile && runStorageImport(storageFile)}
            >
              {storageRun.running ? <Loader2 className="h-4 w-4 animate-spin" /> : <HardDrive className="h-4 w-4" />}
              Import now
            </Button>
            {storageFile && !storageRun.running && (
              <Button variant="ghost" size="icon" onClick={() => { setStorageFile(null); setStorageRun(emptyRun); }}>
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>

          {progressBlock(storageRun)}

          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="text-xs">
              Missing buckets are created automatically as private. Existing files with the same path are overwritten.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  );
};

export default ZipImportPanel;
