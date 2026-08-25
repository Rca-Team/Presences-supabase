/**
 * NetLoaderService
 *
 * Single source of truth for loading face-api.js neural nets.
 *
 * Root cause this fixes: several services (ModelService, OptimizedModelService,
 * RealtimeRecognitionEngine, individual components) each called
 * `faceapi.nets.<net>.load('/models')` on their own. On a cold start they all
 * fire at once for the SAME net, so the same weight shards are fetched several
 * times in parallel. On the first visit (empty HTTP cache) that saturates the
 * connection, one of the duplicate loads never settles, and the waiter that
 * polls for the "loaded" flag hits its 30 s limit → "Model loading timeout"
 * and a stuck Face ID screen.
 *
 * Here every net has exactly ONE in-flight promise. Concurrent callers await
 * the same promise, loads are sequential per net, each attempt is bounded by a
 * real timeout, and a failed attempt is retried with backoff instead of
 * poisoning the shared state.
 */

import * as faceapi from 'face-api.js';

export type NetName =
  | 'ssdMobilenetv1'
  | 'tinyFaceDetector'
  | 'faceLandmark68Net'
  | 'faceLandmark68TinyNet'
  | 'faceRecognitionNet'
  | 'faceExpressionNet'
  | 'ageGenderNet';

const MODEL_URL = '/models';
const ATTEMPT_TIMEOUT_MS = 45_000;
const MAX_ATTEMPTS = 3;

const inFlight = new Map<NetName, Promise<void>>();

function getNet(name: NetName) {
  const net = (faceapi.nets as unknown as Record<string, { isLoaded: boolean; load: (u: string) => Promise<void> }>)[name];
  if (!net) throw new Error(`Unknown face-api net: ${name}`);
  return net;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms} ms`)), ms);
    promise.then(
      value => {
        clearTimeout(timer);
        resolve(value);
      },
      err => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** Load one net. Repeated/concurrent calls share a single load. */
export function loadNet(name: NetName): Promise<void> {
  const net = getNet(name);
  if (net.isLoaded) return Promise.resolve();

  const existing = inFlight.get(name);
  if (existing) return existing;

  const task = (async () => {
    let lastErr: unknown = null;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      if (net.isLoaded) return;
      try {
        await withTimeout(net.load(MODEL_URL), ATTEMPT_TIMEOUT_MS, `Loading ${name}`);
        if (!net.isLoaded) throw new Error(`${name} reported not loaded after load()`);
        return;
      } catch (err) {
        lastErr = err;
        if (net.isLoaded) return; // another path finished it
        console.warn(`[NetLoader] ${name} attempt ${attempt}/${MAX_ATTEMPTS} failed:`, err);
        if (attempt < MAX_ATTEMPTS) await delay(Math.min(600 * 2 ** (attempt - 1), 4000));
      }
    }
    throw new Error(`Failed to load ${name}: ${lastErr}`);
  })().finally(() => {
    inFlight.delete(name);
  });

  inFlight.set(name, task);
  return task;
}

/**
 * Load several nets. Loads run SEQUENTIALLY so a cold cache never has to fetch
 * four models' weight shards at the same time — that parallel burst is what
 * made the very first Face ID session stall.
 */
export async function loadNets(names: NetName[]): Promise<void> {
  for (const name of names) {
    if (getNet(name).isLoaded) continue;
    await loadNet(name);
  }
}

export function isNetLoaded(name: NetName): boolean {
  return getNet(name).isLoaded;
}

export function areNetsLoaded(names: NetName[]): boolean {
  return names.every(isNetLoaded);
}
