// Tiny IndexedDB wrapper for storing full-site backup snapshots.
// One database, one object store keyed by snapshot id.

const DB_NAME = 'presences-backup';
const DB_VERSION = 1;
const STORE = 'snapshots';

export type SnapshotMeta = {
  id: string;
  label: string;
  createdAt: string;
  triggerType: 'manual' | 'auto' | 'rollback';
  sizeBytes: number;
  stats: {
    tables: number;
    rows: number;
    authUsers: number;
  };
};

export type StoredSnapshot = SnapshotMeta & {
  backup: unknown;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveSnapshot(snap: StoredSnapshot): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(snap);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function listSnapshots(): Promise<SnapshotMeta[]> {
  const db = await openDb();
  const all = await new Promise<StoredSnapshot[]>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result as StoredSnapshot[]);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return all
    .map(({ backup: _b, ...meta }) => meta)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function getSnapshot(id: string): Promise<StoredSnapshot | null> {
  const db = await openDb();
  const snap = await new Promise<StoredSnapshot | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => resolve(req.result as StoredSnapshot | undefined);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return snap ?? null;
}

export async function deleteSnapshot(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function trimSnapshots(keep: number): Promise<void> {
  const metas = await listSnapshots();
  const toDelete = metas.slice(keep);
  for (const m of toDelete) await deleteSnapshot(m.id);
}
