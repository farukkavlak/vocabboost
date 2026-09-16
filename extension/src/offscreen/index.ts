/**
 * The offscreen page that holds the local model. It loads on the first question and asks
 * the worker to close it after a quiet spell, which frees the memory.
 */

import { env, pipeline } from "@huggingface/transformers";
import { choose, type Resources } from "../lookup/local/choose";
import type { TaggerData } from "../lookup/local/tagger";
import type { VocabData } from "../lookup/local/vocab";
import type { ChooseResult, ChooseSense, OffscreenIdle } from "../messages";

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

async function load(): Promise<Resources> {
  const [vocab, tagger, extract] = await Promise.all([
    readJson<VocabData>("vocab.json"),
    readJson<TaggerData>("tagger.json"),
    pipeline("feature-extraction", "vocabboost", {
      dtype: "q8",
      device: "wasm",
    }),
  ]);
  const embed = async (texts: string[]) =>
    (
      await extract(texts, { pooling: "mean", normalize: true })
    ).tolist() as number[][];
  return { vocab, tagger, embed };
}

let resources: Promise<Resources> | undefined;
let idleTimer: ReturnType<typeof setTimeout> | undefined;

function restartIdleTimer(): void {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    const idle: OffscreenIdle = { type: "OFFSCREEN_IDLE" };
    void chrome.runtime.sendMessage(idle);
  }, IDLE_MS);
}

chrome.runtime.onMessage.addListener(
  (message: ChooseSense, _sender, respond: (result: ChooseResult) => void) => {
    // Every extension page hears every message; answer only our own.
    if (message.to !== "offscreen" || message.type !== "CHOOSE_SENSE") {
      return false;
    }

    clearTimeout(idleTimer);
    resources ??= load();
    void resources
      .then((loaded) => choose(loaded, message))
      .then(
        (choice) => respond({ ok: true, choice }),
        (error: unknown) => respond({ ok: false, error: String(error) }),
      )
      .finally(restartIdleTimer);

    return true; // the answer is sent asynchronously
  },
);
