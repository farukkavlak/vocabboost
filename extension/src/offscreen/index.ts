/**
 * The offscreen page that holds the local model. It loads on the first question and asks
 * the worker to close it after a quiet spell, which frees the memory.
 */

import { env, pipeline } from "@huggingface/transformers";
import { choose, entryFor, type Embed } from "../lookup/local/choose";
import type { TaggerData } from "../lookup/local/tagger";
import type { VocabData } from "../lookup/local/vocab";
import type {
  AskOffscreen,
  CandidatesResult,
  ChooseResult,
  OffscreenIdle,
} from "../messages";

/** The dictionary and the tagger, which every question needs. */
interface Dictionary {
  vocab: VocabData;
  tagger: TaggerData;
}

const IDLE_MS = 2 * 60 * 1000;

// Everything is read from the extension; Manifest V3 allows no remote code.
env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = new URL("models/", location.href).href;
if (env.backends.onnx.wasm) {
  env.backends.onnx.wasm.wasmPaths = new URL("ort/", location.href).href;
  // Threads need a cross-origin isolated page.
  env.backends.onnx.wasm.numThreads = 1;
}

async function readJson<T>(file: string): Promise<T> {
  const response = await fetch(new URL(file, location.href));
  return (await response.json()) as T;
}

async function loadDictionary(): Promise<Dictionary> {
  const [vocab, tagger] = await Promise.all([
    readJson<VocabData>("vocab.json"),
    readJson<TaggerData>("tagger.json"),
  ]);
  return { vocab, tagger };
}

/** Kept apart from the dictionary: a provider that picks for itself never loads it. */
async function loadModel(): Promise<Embed> {
  const extract = await pipeline("feature-extraction", "vocabboost", {
    dtype: "q8",
    device: "wasm",
  });
  return async (texts: string[]) =>
    (
      await extract(texts, { pooling: "mean", normalize: true })
    ).tolist() as number[][];
}

let dictionary: Promise<Dictionary> | undefined;
let model: Promise<Embed> | undefined;
let idleTimer: ReturnType<typeof setTimeout> | undefined;

function restartIdleTimer(): void {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    const idle: OffscreenIdle = { type: "OFFSCREEN_IDLE" };
    void chrome.runtime.sendMessage(idle);
  }, IDLE_MS);
}

async function ranked(message: AskOffscreen): Promise<ChooseResult> {
  const [loaded, embed] = await Promise.all([
    (dictionary ??= loadDictionary()),
    (model ??= loadModel()),
  ]);
  return { ok: true, choice: await choose({ ...loaded, embed }, message) };
}

async function candidates(message: AskOffscreen): Promise<CandidatesResult> {
  const { vocab, tagger } = await (dictionary ??= loadDictionary());
  return { ok: true, entry: entryFor(vocab, tagger, message) };
}

chrome.runtime.onMessage.addListener(
  (
    message: AskOffscreen,
    _sender,
    respond: (result: ChooseResult | CandidatesResult) => void,
  ) => {
    // Every extension page hears every message; answer only our own.
    if (message.to !== "offscreen") {
      return false;
    }

    clearTimeout(idleTimer);
    const answer =
      message.type === "CHOOSE_SENSE" ? ranked(message) : candidates(message);
    void answer
      .then(respond, (error: unknown) =>
        respond({ ok: false, error: String(error) }),
      )
      .finally(restartIdleTimer);

    return true; // the answer is sent asynchronously
  },
);
