/**
 * The word log, in IndexedDB: one record per lookup, so saving one costs the same however
 * long the log grows. Shared by the worker, which writes, and the log page, which reads.
 * It lives on the reader's machine and is never sent anywhere.
 */

import { entryId, type LogEntry, type NewEntry } from "./entry";

const DATABASE = "vocabboost";
const STORE = "log";
const BY_TIME = "savedAt";

let database: Promise<IDBDatabase> | undefined;

const failure = (error: DOMException | null): Error =>
  error ?? new Error("The word log could not be read or written.");

function open(): Promise<IDBDatabase> {
  database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore(STORE, { keyPath: "id" });
      store.createIndex(BY_TIME, BY_TIME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(failure(request.error));
  });
  return database;
}

/** Runs `work` in one transaction and resolves when the transaction has finished. */
async function transact<T>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const transaction = (await open()).transaction(STORE, mode);
  const request = work(transaction.objectStore(STORE));
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve(request.result);
    transaction.onerror = () => reject(failure(transaction.error));
  });
}

/** Every entry, newest first. */
export async function readLog(): Promise<LogEntry[]> {
  const oldestFirst = await transact("readonly", (store) =>
    store.index(BY_TIME).getAll(),
  );
  return (oldestFirst as LogEntry[]).reverse();
}

async function readEntry(id: string): Promise<LogEntry | undefined> {
  return (await transact("readonly", (store) => store.get(id))) as
    LogEntry | undefined;
}

async function writeEntry(entry: LogEntry): Promise<void> {
  await transact("readwrite", (store) => store.put(entry));
}

/** Adds a lookup, or brings the same earlier one to the top, keeping its chosen sense. */
export async function logLookup(entry: NewEntry): Promise<void> {
  const id = entryId(entry);
  const earlier = await readEntry(id);
  await writeEntry({
    ...entry,
    id,
    savedAt: Date.now(),
    ...(earlier?.chosen !== undefined ? { chosen: earlier.chosen } : {}),
  });
}

export async function removeEntry(id: string): Promise<void> {
  await transact("readwrite", (store) => store.delete(id));
}

export async function chooseSense(id: string, index: number): Promise<void> {
  const entry = await readEntry(id);
  if (entry) {
    await writeEntry({ ...entry, chosen: index });
  }
}
