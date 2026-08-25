import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

type BackupPayload = {
  version: string;
  createdAt: string;
  authUsers: Array<Record<string, unknown>>;
  tables: Record<string, Array<Record<string, unknown>>>;
  storage: Record<string, Array<{ path: string; contentType: string | null; base64: string }>>;
};

type ExportOptions = {
  includeStorage?: boolean;
  includeAuthUsers?: boolean;
  includeFaceDescriptors?: boolean;
  tableAllowlist?: string[];
  fastMode?: boolean;
  maxAuthUsers?: number;
  maxTableRows?: number;
  maxTotalRows?: number;
  maxTables?: number;
};

type SnapshotTriggerType = "manual" | "auto";
const REQUEST_SOFT_TIMEOUT_MS = 120_000;
const UPSTREAM_REQUEST_TIMEOUT_MS = 20_000;
const RESPONSE_SAFETY_MARGIN_MS = 12_000;

const FACE_BUCKETS = ["student-registration-faces", "attendance-training-faces"];
const STORAGE_CONCURRENCY = 6;
const EXCLUDED_BACKUP_TABLES = new Set(["backup_snapshots"]);
const HEAVY_TABLES = new Set(["face_descriptors"]);
const FAST_EXPORT_TABLES = [
  "profiles",
  "user_roles",
  "subjects",
  "period_timings",
  "class_teachers",
  "teacher_permissions",
  "timetable",
  "attendance_records",
  "attendance_points",
  "attendance_predictions",
  "notifications",
  "student_badges",
] as const;

const DELETE_ORDER = [
  "zone_entries",
  "wellness_scores",
  "student_badges",
  "notifications",
  "notification_log",
  "late_entries",
  "gate_entries",
  "face_descriptors",
  "emergency_events",
  "class_leaderboard",
  "attendance_points",
  "attendance_predictions",
  "attendance_records",
  "substitutions",
  "teacher_permissions",
  "class_teachers",
  "period_timings",
  "subjects",
  "timetable",
  "profiles",
  "user_roles",
] as const;

const RESTORE_ORDER = [
  "profiles",
  "user_roles",
  "subjects",
  "period_timings",
  "class_teachers",
  "teacher_permissions",
  "attendance_records",
  "attendance_points",
  "attendance_predictions",
  "class_leaderboard",
  "emergency_events",
  "face_descriptors",
  "gate_entries",
  "late_entries",
  "notification_log",
  "notifications",
  "student_badges",
  "substitutions",
  "wellness_scores",
  "zone_entries",
] as const;

const PREFERRED_BACKUP_TABLES = new Set<string>([
  ...RESTORE_ORDER,
  ...DELETE_ORDER,
]);

// Every public.* table we back up in the full-site pipeline
const ALL_PUBLIC_TABLES = [
  "profiles",
  "user_roles",
  "subjects",
  "period_timings",
  "class_teachers",
  "teacher_permissions",
  "timetable",
  "substitutions",
  "attendance_settings",
  "attendance_records",
  "attendance_points",
  "attendance_predictions",
  "class_leaderboard",
  "badges",
  "student_badges",
  "wellness_scores",
  "ai_insights",
  "notifications",
  "notification_log",
  "circulars",
  "school_holidays",
  "school_gates",
  "campus_zones",
  "gate_entries",
  "gate_sessions",
  "late_entries",
  "zone_entries",
  "visitors",
  "buses",
  "bus_events",
  "emergency_events",
  "emotion_events",
  "face_descriptors",
  "gv_cameras",
  "gv_camera_zones",
  "gv_class_sessions",
  "gv_tracks",
  "gv_events",
] as const;

// Restore in an order that respects FKs — parents first
const FULL_RESTORE_ORDER = [
  "profiles",
  "user_roles",
  "subjects",
  "period_timings",
  "class_teachers",
  "teacher_permissions",
  "timetable",
  "substitutions",
  "attendance_settings",
  "school_gates",
  "campus_zones",
  "buses",
  "badges",
  "gv_cameras",
  "gv_camera_zones",
  "attendance_records",
  "attendance_points",
  "attendance_predictions",
  "class_leaderboard",
  "student_badges",
  "wellness_scores",
  "ai_insights",
  "notifications",
  "notification_log",
  "circulars",
  "school_holidays",
  "gate_entries",
  "gate_sessions",
  "late_entries",
  "zone_entries",
  "visitors",
  "bus_events",
  "emergency_events",
  "emotion_events",
  "face_descriptors",
  "gv_class_sessions",
  "gv_tracks",
  "gv_events",
] as const;

function ensureWithinDeadline(deadlineMs: number, phase: string) {
  if (Date.now() > deadlineMs) {
    throw new Error(`Backup operation timed out during ${phase}. Please retry with a smaller dataset.`);
  }
}

function shouldStopForResponse(deadlineMs: number) {
  return Date.now() >= deadlineMs - RESPONSE_SAFETY_MARGIN_MS;
}

function isAbortError(error: unknown) {
  const name = (error as { name?: string } | null)?.name;
  const message = String((error as { message?: string } | null)?.message || "");
  return name === "AbortError" || message.toLowerCase().includes("aborted");
}

async function yieldControl() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function withTimeout(
  operation: PromiseLike<any> | any,
  timeoutMs: number,
  phase: string,
): Promise<any> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(operation),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`Operation timed out during ${phase}.`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

async function toBase64(bytes: Uint8Array, deadlineMs: number): Promise<string> {
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    if (i % (chunkSize * 64) === 0) {
      ensureWithinDeadline(deadlineMs, "binary encoding");
      await yieldControl();
    }
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

async function fromBase64(base64: string, deadlineMs: number): Promise<Uint8Array> {
  const binary = atob(base64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    if (i % 50_000 === 0) {
      ensureWithinDeadline(deadlineMs, "base64 decoding");
      await yieldControl();
    }
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

async function listAllStoragePaths(
  svc: ReturnType<typeof createClient>,
  bucket: string,
  prefix = "",
): Promise<string[]> {
  const paths: string[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await withTimeout(
      svc.storage.from(bucket).list(prefix, {
        limit: 100,
        offset,
        sortBy: { column: "name", order: "asc" },
      }),
      UPSTREAM_REQUEST_TIMEOUT_MS,
      `${bucket}/${prefix || "/"} storage list`,
    );

    if (error) throw error;
    if (!data || data.length === 0) break;

    for (const item of data) {
      const name = item.name;
      const fullPath = prefix ? `${prefix}/${name}` : name;
      const isFolder = !item.id || item.metadata === null;

      if (isFolder) {
        const nested = await listAllStoragePaths(svc, bucket, fullPath);
        paths.push(...nested);
      } else {
        paths.push(fullPath);
      }
    }

    if (data.length < 100) break;
    offset += 100;
  }

  return paths;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const results: R[] = new Array(items.length);
  let cursor = 0;

  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) break;
      results[index] = await worker(items[index], index);
    }
  });

  await Promise.all(runners);
  return results;
}

async function requireAdmin(req: Request) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authHeader = req.headers.get("Authorization");

  if (!authHeader) throw new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const userResult = await withTimeout(
    authClient.auth.getUser(),
    UPSTREAM_REQUEST_TIMEOUT_MS,
    "auth getUser",
  );

  const {
    data: { user },
    error: userError,
  } = userResult;

  if (userError || !user) {
    throw new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const svc = createClient(supabaseUrl, serviceKey);
  const { data: roleData, error: roleError } = await withTimeout(
    svc
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle(),
    UPSTREAM_REQUEST_TIMEOUT_MS,
    "admin role check",
  );

  if (roleError) throw roleError;
  if (!roleData) {
    throw new Response(JSON.stringify({ error: "Admin access required" }), { status: 403 });
  }

  return { svc, callerUserId: user.id };
}

async function exportBackup(
  svc: ReturnType<typeof createClient>,
  deadlineMs: number,
  options?: ExportOptions,
) {
  const includeStorage = options?.includeStorage ?? true;
  const includeAuthUsers = options?.includeAuthUsers ?? true;
  const includeFaceDescriptors = options?.includeFaceDescriptors === true;
  const fastMode = options?.fastMode !== false;
  const tableAllowlist = Array.isArray(options?.tableAllowlist)
    ? options.tableAllowlist.filter((table): table is string => typeof table === "string" && table.trim().length > 0)
    : [];
  const maxAuthUsers = Math.max(0, Math.min(2_000, Number(options?.maxAuthUsers ?? 120)));
  const maxTableRows = Math.max(50, Math.min(800, Number(options?.maxTableRows ?? 500)));
  const maxTotalRows = Math.max(maxTableRows, Math.min(6_000, Number(options?.maxTotalRows ?? 2400)));
  const maxTables = Math.max(1, Math.min(30, Number(options?.maxTables ?? 12)));
  const warnings: string[] = [];
  let totalExportedRows = 0;

  const authUsers: Array<Record<string, unknown>> = [];
  if (includeAuthUsers && maxAuthUsers > 0) {
    let page = 1;
    const perPage = 500;

    while (true) {
      ensureWithinDeadline(deadlineMs, "auth user export");
      if (shouldStopForResponse(deadlineMs)) {
        warnings.push("Stopped auth-user export early to avoid timeout.");
        break;
      }

      const { data, error } = await withTimeout(
        svc.auth.admin.listUsers({ page, perPage }),
        UPSTREAM_REQUEST_TIMEOUT_MS,
        "auth user export request",
      );
      if (error) throw error;

      const users = data?.users || [];
      const remaining = maxAuthUsers - authUsers.length;
      if (remaining <= 0) {
        warnings.push(`Reached auth-user export cap (${maxAuthUsers}).`);
        break;
      }

      const slicedUsers = users.slice(0, remaining);
      authUsers.push(
        ...slicedUsers.map((u) => ({
          id: u.id,
          email: u.email,
          phone: u.phone,
          app_metadata: u.app_metadata,
          user_metadata: u.user_metadata,
          email_confirmed_at: u.email_confirmed_at,
          phone_confirmed_at: u.phone_confirmed_at,
        })),
      );

      if (users.length > remaining) {
        warnings.push(`Reached auth-user export cap (${maxAuthUsers}).`);
        break;
      }

      if (users.length < perPage) break;
      page += 1;
    }
  } else if (includeAuthUsers && maxAuthUsers === 0) {
    warnings.push("Auth-user export disabled by maxAuthUsers=0.");
  }

  const tables: Record<string, Array<Record<string, unknown>>> = {};
  let availableTables: string[] = [];

  if (tableAllowlist.length > 0) {
    availableTables = tableAllowlist;
    warnings.push(`Using custom table allowlist (${tableAllowlist.length} tables).`);
  } else if (fastMode) {
    availableTables = [...FAST_EXPORT_TABLES];
    warnings.push("Using fast backup mode with a curated table set for reliability.");
  } else {
    try {
      const { data: tableRows, error: tableErr } = await withTimeout(
        svc.rpc("list_public_tables"),
        UPSTREAM_REQUEST_TIMEOUT_MS,
        "list public tables",
      );

      if (tableErr) throw tableErr;
      availableTables = (tableRows || [])
        .map((row: { table_name?: string }) => row.table_name)
        .filter((table): table is string => Boolean(table));
    } catch (error) {
      availableTables = [...FAST_EXPORT_TABLES];
      warnings.push("Table discovery timed out; fell back to fast backup table set.");
      console.warn("table discovery fallback:", String((error as Error)?.message || error));
    }
  }

  if (includeFaceDescriptors && !availableTables.includes("face_descriptors")) {
    availableTables.push("face_descriptors");
  }

  availableTables = availableTables.filter((table) => {
    if (!table) return false;
    if (EXCLUDED_BACKUP_TABLES.has(table)) return false;
    if (!includeFaceDescriptors && HEAVY_TABLES.has(table)) return false;
    return true;
  });

  if (!includeFaceDescriptors) {
    warnings.push("Skipped face_descriptors in fast mode to avoid timeout. Enable it only when needed.");
  }

  const orderedTables = [
    ...availableTables.filter((t) => PREFERRED_BACKUP_TABLES.has(t)),
    ...availableTables.filter((t) => !PREFERRED_BACKUP_TABLES.has(t)),
  ].filter((table, idx, arr) => arr.indexOf(table) === idx);

  for (let tableIndex = 0; tableIndex < orderedTables.length; tableIndex += 1) {
    ensureWithinDeadline(deadlineMs, "table export");
    if (shouldStopForResponse(deadlineMs)) {
      warnings.push("Stopped table export early to avoid timeout. Run backup again for more coverage.");
      break;
    }
    if (Object.keys(tables).length >= maxTables) {
      warnings.push(`Reached table export cap (${maxTables}).`);
      break;
    }
    if (totalExportedRows >= maxTotalRows) {
      warnings.push(`Reached total row cap (${maxTotalRows}).`);
      break;
    }

    const table = orderedTables[tableIndex];

    const allRows: Array<Record<string, unknown>> = [];
    let from = 0;

    while (true) {
      ensureWithinDeadline(deadlineMs, `${table} rows export`);
      if (shouldStopForResponse(deadlineMs)) {
        warnings.push(`Stopped while exporting ${table} to avoid timeout.`);
        break;
      }
      if (allRows.length >= maxTableRows || totalExportedRows >= maxTotalRows) {
        break;
      }

      try {
        const { data, error } = await withTimeout(
          svc
            .from(table)
            .select("*")
            .range(from, from + 499),
          UPSTREAM_REQUEST_TIMEOUT_MS,
          `${table} rows export request`,
        );

        if (error) {
          warnings.push(`Skipped ${table}: ${error.message}`);
          break;
        }
        if (!data || data.length === 0) break;

        const remainingTableRows = maxTableRows - allRows.length;
        const remainingTotalRows = maxTotalRows - totalExportedRows;
        const allowed = Math.max(0, Math.min(remainingTableRows, remainingTotalRows));
        if (allowed <= 0) break;

        const sliced = (data as Array<Record<string, unknown>>).slice(0, allowed);
        allRows.push(...sliced);
        totalExportedRows += sliced.length;

        if (allRows.length >= maxTableRows || totalExportedRows >= maxTotalRows) break;
        if (data.length < 500) break;
        from += 500;
      } catch (error: any) {
        warnings.push(`Skipped ${table}: ${error?.message || "request failed"}`);
        break;
      }
    }

    tables[table] = allRows;
  }

  const storage: BackupPayload["storage"] = {};
  if (includeStorage) {
    for (const bucket of FACE_BUCKETS) {
      ensureWithinDeadline(deadlineMs, `${bucket} storage listing`);
      if (shouldStopForResponse(deadlineMs)) {
        warnings.push(`Stopped storage export early for ${bucket} to avoid timeout.`);
        break;
      }
      const paths = await listAllStoragePaths(svc, bucket);
      const files = await mapWithConcurrency(paths, STORAGE_CONCURRENCY, async (path) => {
        ensureWithinDeadline(deadlineMs, `${bucket}/${path} storage download`);
        let result: { data: Blob | null; error: Error | null };
        try {
          result = await withTimeout(
            svc.storage.from(bucket).download(path),
            UPSTREAM_REQUEST_TIMEOUT_MS,
            `${bucket}/${path} storage download request`,
          );
        } catch (error) {
          if (isAbortError(error) || String((error as Error)?.message || "").includes("timed out")) {
            console.warn(`Skipped slow storage file during export: ${bucket}/${path}`);
            return null;
          }
          throw error;
        }

        const { data, error } = result;
        if (error || !data) return null;

        const bytes = new Uint8Array(await data.arrayBuffer());
        return {
          path,
          contentType: data.type || null,
          base64: await toBase64(bytes, deadlineMs),
        };
      });

      storage[bucket] = files.filter((f): f is { path: string; contentType: string | null; base64: string } => Boolean(f));
    }
  }

  const backup: BackupPayload = {
    version: "1.0.0",
    createdAt: new Date().toISOString(),
    authUsers,
    tables,
    storage,
  };

  return {
    backup,
    stats: {
      users: authUsers.length,
      tables: Object.keys(tables).length,
      storageFiles: Object.values(storage).reduce((sum, files) => sum + files.length, 0),
      totalRows: totalExportedRows,
      partial: warnings.length > 0,
    },
    warnings,
  };
}

async function createSnapshot(
  svc: ReturnType<typeof createClient>,
  callerUserId: string,
  deadlineMs: number,
  opts?: { label?: string; triggerType?: SnapshotTriggerType } & ExportOptions,
) {
  const { backup, stats } = await exportBackup(svc, deadlineMs, {
    includeStorage: opts?.includeStorage ?? false,
    includeAuthUsers: opts?.includeAuthUsers ?? false,
    maxTableRows: opts?.maxTableRows ?? 3000,
  });
  const triggerType: SnapshotTriggerType = opts?.triggerType === "auto" ? "auto" : "manual";
  const fallbackLabel = triggerType === "auto"
    ? `Auto Daily ${new Date().toISOString().slice(0, 10)}`
    : `Manual Snapshot ${new Date().toISOString().slice(0, 19).replace("T", " ")}`;

  const { data, error } = await withTimeout(
    svc
      .from("backup_snapshots")
      .insert({
        label: (opts?.label || fallbackLabel).slice(0, 120),
        trigger_type: triggerType,
        backup_json: backup,
        stats,
        created_by: callerUserId,
      })
      .select("id, label, trigger_type, created_at, stats")
      .single(),
    UPSTREAM_REQUEST_TIMEOUT_MS,
    "snapshot insert",
  );

  if (error) throw error;

  return { snapshot: data };
}

async function listSnapshots(svc: ReturnType<typeof createClient>) {
  const { data, error } = await withTimeout(
    svc
      .from("backup_snapshots")
      .select("id, label, trigger_type, created_at, created_by, stats")
      .order("created_at", { ascending: false })
      .limit(30),
    UPSTREAM_REQUEST_TIMEOUT_MS,
    "list snapshots",
  );

  if (error) throw error;
  return { snapshots: data || [] };
}

async function restoreSnapshot(svc: ReturnType<typeof createClient>, snapshotId: string, deadlineMs: number) {
  if (!snapshotId) throw new Error("snapshotId is required");

  const { data, error } = await withTimeout(
    svc
      .from("backup_snapshots")
      .select("id, label, backup_json")
      .eq("id", snapshotId)
      .maybeSingle(),
    UPSTREAM_REQUEST_TIMEOUT_MS,
    "get snapshot",
  );

  if (error) throw error;
  if (!data?.backup_json) throw new Error("Snapshot not found");

  const restored = await restoreBackup(svc, data.backup_json as BackupPayload, deadlineMs);
  return {
    ok: true,
    snapshot: {
      id: data.id,
      label: data.label,
    },
    restored,
  };
}

async function runDailySnapshot(svc: ReturnType<typeof createClient>, callerUserId: string, deadlineMs: number) {
  const today = new Date().toISOString().slice(0, 10);
  const { data: existing, error } = await withTimeout(
    svc
      .from("backup_snapshots")
      .select("id")
      .eq("trigger_type", "auto")
      .gte("created_at", `${today}T00:00:00.000Z`)
      .lt("created_at", `${today}T23:59:59.999Z`)
      .limit(1)
      .maybeSingle(),
    UPSTREAM_REQUEST_TIMEOUT_MS,
    "daily snapshot existence check",
  );

  if (error) throw error;
  if (existing?.id) {
    return { ok: true, skipped: true, reason: "daily_snapshot_already_exists" };
  }

  return createSnapshot(svc, callerUserId, deadlineMs, {
    triggerType: "auto",
    label: `Auto Daily ${today}`,
    includeStorage: false,
    includeAuthUsers: false,
    maxTableRows: 5000,
  });
}

async function cleanCloud(svc: ReturnType<typeof createClient>, callerUserId: string, includeAuthUsers: boolean) {
  for (const bucket of FACE_BUCKETS) {
    const paths = await listAllStoragePaths(svc, bucket);
    for (let i = 0; i < paths.length; i += 100) {
      const chunk = paths.slice(i, i + 100);
      if (chunk.length > 0) {
        await withTimeout(
          svc.storage.from(bucket).remove(chunk),
          UPSTREAM_REQUEST_TIMEOUT_MS,
          `${bucket} storage cleanup remove`,
        );
      }
    }
  }

  for (const table of DELETE_ORDER) {
    let q = svc.from(table).delete().not("id", "is", null);
    if (table === "user_roles" || table === "profiles") {
      q = svc.from(table).delete().neq("user_id", callerUserId);
    }
    const { error } = await withTimeout(
      q,
      UPSTREAM_REQUEST_TIMEOUT_MS,
      `${table} cleanup delete`,
    );
    if (error) console.error(`delete ${table}:`, error.message);
  }

  if (includeAuthUsers) {
    let page = 1;
    const perPage = 500;
    while (true) {
      const { data, error } = await withTimeout(
        svc.auth.admin.listUsers({ page, perPage }),
        UPSTREAM_REQUEST_TIMEOUT_MS,
        "cleanup auth user list",
      );
      if (error) throw error;
      const users = data?.users || [];

      for (const u of users) {
        if (u.id === callerUserId) continue;
        await withTimeout(
          svc.auth.admin.deleteUser(u.id),
          UPSTREAM_REQUEST_TIMEOUT_MS,
          `cleanup auth user delete ${u.id}`,
        );
      }

      if (users.length < perPage) break;
      page += 1;
    }
  }

  return { ok: true };
}

async function restoreBackup(svc: ReturnType<typeof createClient>, backup: BackupPayload, deadlineMs: number) {
  if (!backup || !backup.tables || !backup.storage || !Array.isArray(backup.authUsers)) {
    throw new Error("Invalid backup file format");
  }

  for (const table of DELETE_ORDER) {
    ensureWithinDeadline(deadlineMs, `restore cleanup ${table}`);
    const { error } = await withTimeout(
      svc.from(table).delete().not("id", "is", null),
      UPSTREAM_REQUEST_TIMEOUT_MS,
      `restore cleanup ${table}`,
    );
    if (error) console.error(`restore-clean ${table}:`, error.message);
  }

  for (const table of RESTORE_ORDER) {
    ensureWithinDeadline(deadlineMs, `restore insert ${table}`);
    const rows = backup.tables?.[table] || [];
    if (!Array.isArray(rows) || rows.length === 0) continue;
    const { error } = await withTimeout(
      svc.from(table).insert(rows),
      UPSTREAM_REQUEST_TIMEOUT_MS,
      `restore insert ${table}`,
    );
    if (error) console.error(`insert ${table}:`, error.message);
  }

  for (const bucket of FACE_BUCKETS) {
    ensureWithinDeadline(deadlineMs, `restore cleanup storage ${bucket}`);
    const paths = await listAllStoragePaths(svc, bucket);
    for (let i = 0; i < paths.length; i += 100) {
      const chunk = paths.slice(i, i + 100);
      if (chunk.length > 0) {
        await withTimeout(
          svc.storage.from(bucket).remove(chunk),
          UPSTREAM_REQUEST_TIMEOUT_MS,
          `${bucket} restore storage remove`,
        );
      }
    }
  }

  for (const [bucket, files] of Object.entries(backup.storage || {})) {
    if (!FACE_BUCKETS.includes(bucket)) continue;
    await mapWithConcurrency(files || [], STORAGE_CONCURRENCY, async (file) => {
      ensureWithinDeadline(deadlineMs, `restore upload ${bucket}/${file.path}`);
      const bytes = await fromBase64(file.base64, deadlineMs);
      await withTimeout(
        svc.storage.from(bucket).upload(file.path, bytes, {
          upsert: true,
          contentType: file.contentType || "application/octet-stream",
        }),
        UPSTREAM_REQUEST_TIMEOUT_MS,
        `restore upload ${bucket}/${file.path}`,
      );
      return true;
    });
  }

  for (const user of backup.authUsers) {
    ensureWithinDeadline(deadlineMs, "restore auth users");
    const email = (user.email as string | undefined)?.trim();
    const id = user.id as string | undefined;
    if (!email || !id) continue;

    const { data: existing } = await withTimeout(
      svc.auth.admin.getUserById(id),
      UPSTREAM_REQUEST_TIMEOUT_MS,
      `restore auth user lookup ${id}`,
    );
    if (existing?.user) continue;

    const tempPassword = crypto.randomUUID() + "Aa1!";
    await withTimeout(
      svc.auth.admin.createUser({
        id,
        email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: (user.user_metadata as Record<string, unknown>) || {},
        app_metadata: (user.app_metadata as Record<string, unknown>) || {},
        phone: (user.phone as string | undefined) || undefined,
      }),
      UPSTREAM_REQUEST_TIMEOUT_MS,
      `restore auth user create ${id}`,
    );
  }

  return {
    ok: true,
    restored: {
      users: backup.authUsers.length,
      tables: Object.keys(backup.tables).length,
      storageBuckets: Object.keys(backup.storage).length,
    },
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { svc, callerUserId } = await requireAdmin(req);
    const payload = await req.json().catch(() => ({}));
    const action = payload?.action;
    const deadlineMs = Date.now() + REQUEST_SOFT_TIMEOUT_MS;

    if (action === "export_backup") {
      const result = await exportBackup(svc, deadlineMs, {
        includeStorage: Boolean(payload?.includeStorage),
        includeAuthUsers: payload?.includeAuthUsers === true,
        includeFaceDescriptors: payload?.includeFaceDescriptors === true,
        fastMode: payload?.fastMode !== false,
        tableAllowlist: Array.isArray(payload?.tableAllowlist) ? payload.tableAllowlist : undefined,
        maxAuthUsers: Number(payload?.maxAuthUsers ?? 120),
        maxTableRows: Number(payload?.maxTableRows ?? 500),
        maxTotalRows: Number(payload?.maxTotalRows ?? 2400),
        maxTables: Number(payload?.maxTables ?? 12),
      });
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "restore_backup") {
      const result = await restoreBackup(svc, payload?.backup as BackupPayload, deadlineMs);
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "create_snapshot") {
      const result = await createSnapshot(svc, callerUserId, deadlineMs, {
        label: payload?.label,
        triggerType: payload?.triggerType,
        includeStorage: Boolean(payload?.includeStorage),
        includeAuthUsers: payload?.includeAuthUsers === true,
        maxTableRows: Number(payload?.maxTableRows || 3000),
      });
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "list_snapshots") {
      const result = await listSnapshots(svc);
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "restore_snapshot") {
      const result = await restoreSnapshot(svc, String(payload?.snapshotId || ""), deadlineMs);
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "run_daily_snapshot") {
      const result = await runDailySnapshot(svc, callerUserId, deadlineMs);
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "clean_cloud") {
      if (payload?.confirmationCode !== "CLEAN MY CLOUD") {
        return new Response(JSON.stringify({ error: "Invalid confirmation code" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const result = await cleanCloud(svc, callerUserId, Boolean(payload?.includeAuthUsers));
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ============ Chunked full-site backup API ============
    if (action === "list_public_tables") {
      const tables: Array<{ table: string; count: number }> = [];
      for (const t of ALL_PUBLIC_TABLES) {
        try {
          const { count, error } = await withTimeout(
            svc.from(t).select("*", { count: "exact", head: true }),
            UPSTREAM_REQUEST_TIMEOUT_MS,
            `count ${t}`,
          );
          if (!error) tables.push({ table: t, count: count ?? 0 });
          else tables.push({ table: t, count: 0 });
        } catch {
          tables.push({ table: t, count: 0 });
        }
      }
      let authUsers = 0;
      try {
        const { data } = await svc.auth.admin.listUsers({ page: 1, perPage: 1 });
        authUsers = (data as any)?.total ?? (data?.users?.length ?? 0);
      } catch {}
      return new Response(
        JSON.stringify({
          generatedAt: new Date().toISOString(),
          tables,
          authUsers,
          restoreOrder: FULL_RESTORE_ORDER,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (action === "export_table_chunk") {
      const table = String(payload?.table || "");
      const offset = Math.max(0, Number(payload?.offset ?? 0));
      const limit = Math.min(2000, Math.max(1, Number(payload?.limit ?? 500)));
      if (!ALL_PUBLIC_TABLES.includes(table as any)) {
        return new Response(JSON.stringify({ error: `Unknown table: ${table}` }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data, error } = await withTimeout(
        svc.from(table).select("*").range(offset, offset + limit - 1),
        UPSTREAM_REQUEST_TIMEOUT_MS,
        `export ${table}`,
      );
      if (error) throw new Error(error.message);
      return new Response(
        JSON.stringify({ table, offset, limit, rows: data ?? [] }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (action === "export_auth_users_chunk") {
      const page = Math.max(1, Number(payload?.page ?? 1));
      const perPage = Math.min(1000, Math.max(1, Number(payload?.perPage ?? 500)));
      const { data, error } = await withTimeout(
        svc.auth.admin.listUsers({ page, perPage }),
        UPSTREAM_REQUEST_TIMEOUT_MS,
        "export auth users chunk",
      );
      if (error) throw new Error(error.message);
      const users = (data?.users || []).map((u: any) => ({
        id: u.id,
        email: u.email,
        phone: u.phone,
        user_metadata: u.user_metadata,
        app_metadata: u.app_metadata,
        created_at: u.created_at,
      }));
      return new Response(
        JSON.stringify({ page, perPage, users, total: (data as any)?.total ?? users.length }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (action === "clear_table") {
      const table = String(payload?.table || "");
      if (!ALL_PUBLIC_TABLES.includes(table as any)) {
        return new Response(JSON.stringify({ error: `Unknown table: ${table}` }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { error } = await withTimeout(
        svc.from(table).delete().not("id", "is", null),
        UPSTREAM_REQUEST_TIMEOUT_MS,
        `clear ${table}`,
      );
      if (error) throw new Error(error.message);
      return new Response(JSON.stringify({ ok: true, table }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "import_table_chunk") {
      const table = String(payload?.table || "");
      const rows = Array.isArray(payload?.rows) ? payload.rows : [];
      if (!ALL_PUBLIC_TABLES.includes(table as any)) {
        return new Response(JSON.stringify({ error: `Unknown table: ${table}` }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (rows.length === 0) {
        return new Response(JSON.stringify({ ok: true, inserted: 0 }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Try upsert on id; fall back to insert if the table has no id column
      let inserted = 0;
      const { error: upsertErr } = await withTimeout(
        svc.from(table).upsert(rows, { onConflict: "id" }),
        UPSTREAM_REQUEST_TIMEOUT_MS,
        `import ${table}`,
      );
      if (upsertErr) {
        const { error: insErr } = await withTimeout(
          svc.from(table).insert(rows),
          UPSTREAM_REQUEST_TIMEOUT_MS,
          `import insert ${table}`,
        );
        if (insErr) throw new Error(`${table}: ${insErr.message}`);
      }
      inserted = rows.length;
      return new Response(JSON.stringify({ ok: true, inserted, table }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "import_auth_users_chunk") {
      const users = Array.isArray(payload?.users) ? payload.users : [];
      let created = 0;
      let skipped = 0;
      for (const u of users) {
        const id = u?.id as string | undefined;
        const email = (u?.email as string | undefined)?.trim();
        if (!id || !email) { skipped++; continue; }
        try {
          const { data: existing } = await withTimeout(
            svc.auth.admin.getUserById(id),
            UPSTREAM_REQUEST_TIMEOUT_MS,
            `auth lookup ${id}`,
          );
          if (existing?.user) { skipped++; continue; }
          const tempPassword = crypto.randomUUID() + "Aa1!";
          await withTimeout(
            svc.auth.admin.createUser({
              id,
              email,
              password: tempPassword,
              email_confirm: true,
              user_metadata: u.user_metadata || {},
              app_metadata: u.app_metadata || {},
              phone: u.phone || undefined,
            }),
            UPSTREAM_REQUEST_TIMEOUT_MS,
            `auth create ${id}`,
          );
          created++;
        } catch (e) {
          console.error("auth import error:", (e as Error).message);
          skipped++;
        }
      }
      return new Response(JSON.stringify({ ok: true, created, skipped }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ============ Chunked storage backup API ============
    if (action === "list_storage_buckets") {
      const { data, error } = await withTimeout(
        svc.storage.listBuckets(),
        UPSTREAM_REQUEST_TIMEOUT_MS,
        "list storage buckets",
      );
      if (error) throw new Error(error.message);
      const buckets: Array<{ name: string; public: boolean; fileCount: number }> = [];
      for (const b of data || []) {
        let count = 0;
        try {
          const paths = await listAllStoragePaths(svc, b.name);
          count = paths.length;
        } catch { /* ignore */ }
        buckets.push({ name: b.name, public: Boolean((b as any).public), fileCount: count });
      }
      return new Response(JSON.stringify({ buckets }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "list_storage_files") {
      const bucket = String(payload?.bucket || "");
      if (!bucket) throw new Error("bucket is required");
      const paths = await listAllStoragePaths(svc, bucket);
      return new Response(JSON.stringify({ bucket, paths }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "download_storage_file") {
      const bucket = String(payload?.bucket || "");
      const path = String(payload?.path || "");
      if (!bucket || !path) throw new Error("bucket and path are required");
      const { data, error } = await withTimeout(
        svc.storage.from(bucket).download(path),
        UPSTREAM_REQUEST_TIMEOUT_MS,
        `download ${bucket}/${path}`,
      );
      if (error || !data) throw new Error(error?.message || "download failed");
      const bytes = new Uint8Array(await data.arrayBuffer());
      const base64 = await toBase64(bytes, deadlineMs);
      return new Response(
        JSON.stringify({ bucket, path, contentType: data.type || null, base64 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (action === "clear_storage_bucket") {
      const bucket = String(payload?.bucket || "");
      if (!bucket) throw new Error("bucket is required");
      const paths = await listAllStoragePaths(svc, bucket);
      for (let i = 0; i < paths.length; i += 100) {
        const chunk = paths.slice(i, i + 100);
        await withTimeout(
          svc.storage.from(bucket).remove(chunk),
          UPSTREAM_REQUEST_TIMEOUT_MS,
          `clear ${bucket}`,
        );
      }
      return new Response(JSON.stringify({ ok: true, removed: paths.length }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "upload_storage_file") {
      const bucket = String(payload?.bucket || "");
      const path = String(payload?.path || "");
      const base64 = String(payload?.base64 || "");
      const contentType = (payload?.contentType as string | null) || "application/octet-stream";
      if (!bucket || !path) throw new Error("bucket and path are required");
      // Ensure the bucket exists — create as private by default so restores never fail.
      try {
        const { data: existing } = await svc.storage.getBucket(bucket);
        if (!existing) {
          await svc.storage.createBucket(bucket, { public: false });
        }
      } catch {
        try { await svc.storage.createBucket(bucket, { public: false }); } catch { /* ignore */ }
      }
      const bytes = await fromBase64(base64, deadlineMs);
      const { error } = await withTimeout(
        svc.storage.from(bucket).upload(path, bytes, {
          contentType: contentType || undefined,
          upsert: true,
        }),
        UPSTREAM_REQUEST_TIMEOUT_MS,
        `upload ${bucket}/${path}`,
      );
      if (error) throw new Error(error.message);
      return new Response(JSON.stringify({ ok: true }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: `Unsupported action: ${action ?? "(none)"}` }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    const status = error instanceof Response ? error.status : 500;
    const rawMessage = error instanceof Response ? "Request failed" : error?.message || "Unexpected error";
    const message = rawMessage.toLowerCase().includes("timed out")
      ? "Backup operation took too long. Try again after reducing dataset size (old snapshots, attendance rows, or large face-image volumes)."
      : rawMessage;
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});