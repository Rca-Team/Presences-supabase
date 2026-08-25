/**
 * VectorIndexService
 *
 * Approximate nearest-neighbour index for face descriptors — the browser
 * equivalent of FAISS / hnswlib.
 *
 * Implementation: HNSW-lite (hierarchical navigable small world)
 *   - Multi-layer navigable graph, M neighbours per node
 *   - Greedy descent from the top layer, beam search (efSearch) on layer 0
 *   - Pure TypeScript, zero dependencies, works on any device
 *
 * Why: the old pipeline compared every detected face against EVERY stored
 * sample (O(n) per frame). With thousands of samples that dominates latency.
 * The index gives sub-linear lookups and returns a small candidate shortlist,
 * which the caller then re-scores EXACTLY — so accuracy is unchanged.
 */

export interface IndexedVector {
  /** Stable id of the owning person (user_id) */
  ownerId: string;
  /** Descriptor sample */
  vector: Float32Array;
}

interface Node {
  id: number;
  ownerId: string;
  vector: Float32Array;
  /** neighbours per layer */
  links: number[][];
}

interface IndexState {
  nodes: Node[];
  entryPoint: number;
  maxLayer: number;
  dim: number;
  signature: string;
}

const M = 16;               // neighbours per node per layer
const M_MAX0 = 32;          // neighbours on layer 0
const EF_CONSTRUCTION = 120; // beam width while building
const ML = 1 / Math.log(2); // level generation factor

let index: IndexState | null = null;

// ─── math ────────────────────────────────────────────────────────────────────

function dist(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return Number.POSITIVE_INFINITY;
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

function randomLevel(): number {
  return Math.floor(-Math.log(Math.random() || 1e-9) * ML);
}

// ─── build ───────────────────────────────────────────────────────────────────

/**
 * Build (or rebuild) the index. Cheap no-op when the signature is unchanged,
 * so callers can invoke it on every recognition pass.
 */
export function buildVectorIndex(vectors: IndexedVector[], signature?: string): void {
  const sig = signature ?? `${vectors.length}:${vectors[0]?.ownerId ?? ''}:${vectors[0]?.vector.length ?? 0}`;
  if (index && index.signature === sig) return;

  const usable = vectors.filter(v => v.vector && v.vector.length >= 64);
  if (usable.length === 0) {
    index = null;
    return;
  }

  // Keep only the dominant dimension — never mix 128-dim and 512-dim vectors.
  const byDim = new Map<number, IndexedVector[]>();
  for (const v of usable) {
    const arr = byDim.get(v.vector.length) ?? [];
    arr.push(v);
    byDim.set(v.vector.length, arr);
  }
  let dominant: IndexedVector[] = [];
  for (const arr of byDim.values()) if (arr.length > dominant.length) dominant = arr;

  const state: IndexState = {
    nodes: [],
    entryPoint: 0,
    maxLayer: 0,
    dim: dominant[0].vector.length,
    signature: sig,
  };

  for (const item of dominant) insertNode(state, item);
  index = state;
}

function insertNode(state: IndexState, item: IndexedVector): void {
  const level = randomLevel();
  const node: Node = {
    id: state.nodes.length,
    ownerId: item.ownerId,
    vector: item.vector,
    links: Array.from({ length: level + 1 }, () => []),
  };
  state.nodes.push(node);

  if (state.nodes.length === 1) {
    state.entryPoint = node.id;
    state.maxLayer = level;
    return;
  }

  let current = state.entryPoint;
  let currentDist = dist(item.vector, state.nodes[current].vector);

  // Greedy descent from the top down to level+1
  for (let layer = state.maxLayer; layer > level; layer--) {
    let improved = true;
    while (improved) {
      improved = false;
      for (const nb of state.nodes[current].links[layer] ?? []) {
        const d = dist(item.vector, state.nodes[nb].vector);
        if (d < currentDist) {
          current = nb;
          currentDist = d;
          improved = true;
        }
      }
    }
  }

  // Connect on each layer from min(level, maxLayer) down to 0
  for (let layer = Math.min(level, state.maxLayer); layer >= 0; layer--) {
    const candidates = searchLayer(state, item.vector, current, layer, EF_CONSTRUCTION);
    const maxLinks = layer === 0 ? M_MAX0 : M;
    const selected = candidates.slice(0, maxLinks);

    node.links[layer] = selected.map(c => c.id);
    for (const c of selected) {
      const other = state.nodes[c.id];
      if (!other.links[layer]) other.links[layer] = [];
      other.links[layer].push(node.id);
      // Prune over-connected nodes, keeping the closest neighbours
      if (other.links[layer].length > maxLinks) {
        other.links[layer] = other.links[layer]
          .map(id => ({ id, d: dist(other.vector, state.nodes[id].vector) }))
          .sort((a, b) => a.d - b.d)
          .slice(0, maxLinks)
          .map(x => x.id);
      }
    }
    if (candidates.length) current = candidates[0].id;
  }

  if (level > state.maxLayer) {
    state.maxLayer = level;
    state.entryPoint = node.id;
  }
}

function searchLayer(
  state: IndexState,
  query: Float32Array,
  entry: number,
  layer: number,
  ef: number,
): Array<{ id: number; d: number }> {
  const visited = new Set<number>([entry]);
  const entryDist = dist(query, state.nodes[entry].vector);
  const candidates: Array<{ id: number; d: number }> = [{ id: entry, d: entryDist }];
  const results: Array<{ id: number; d: number }> = [{ id: entry, d: entryDist }];

  while (candidates.length) {
    candidates.sort((a, b) => a.d - b.d);
    const c = candidates.shift()!;
    const worst = results[results.length - 1];
    if (results.length >= ef && c.d > worst.d) break;

    for (const nb of state.nodes[c.id].links[layer] ?? []) {
      if (visited.has(nb)) continue;
      visited.add(nb);
      const d = dist(query, state.nodes[nb].vector);
      if (results.length < ef || d < results[results.length - 1].d) {
        candidates.push({ id: nb, d });
        results.push({ id: nb, d });
        results.sort((a, b) => a.d - b.d);
        if (results.length > ef) results.pop();
      }
    }
  }
  return results;
}

// ─── search ──────────────────────────────────────────────────────────────────

export interface VectorHit {
  ownerId: string;
  distance: number;
}

/**
 * Approximate k-nearest search. Returns unique owners ordered by distance.
 */
export function searchVectorIndex(query: Float32Array | number[], k = 16, efSearch = 160): VectorHit[] {
  if (!index || index.nodes.length === 0) return [];
  const q = query instanceof Float32Array ? query : new Float32Array(query);
  if (q.length !== index.dim) return [];

  let current = index.entryPoint;
  let currentDist = dist(q, index.nodes[current].vector);
  for (let layer = index.maxLayer; layer > 0; layer--) {
    let improved = true;
    while (improved) {
      improved = false;
      for (const nb of index.nodes[current].links[layer] ?? []) {
        const d = dist(q, index.nodes[nb].vector);
        if (d < currentDist) {
          current = nb;
          currentDist = d;
          improved = true;
        }
      }
    }
  }

  const found = searchLayer(index, q, current, 0, Math.max(efSearch, k));
  const bestPerOwner = new Map<string, number>();
  for (const hit of found) {
    const owner = index.nodes[hit.id].ownerId;
    const prev = bestPerOwner.get(owner);
    if (prev === undefined || hit.d < prev) bestPerOwner.set(owner, hit.d);
  }

  return Array.from(bestPerOwner.entries())
    .map(([ownerId, distance]) => ({ ownerId, distance }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, k);
}

export function getVectorIndexStats() {
  return {
    built: !!index,
    vectors: index?.nodes.length ?? 0,
    layers: (index?.maxLayer ?? -1) + 1,
    dimension: index?.dim ?? 0,
  };
}

export function clearVectorIndex(): void {
  index = null;
}
