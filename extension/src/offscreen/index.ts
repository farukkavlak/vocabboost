import { env, pipeline } from "@huggingface/transformers";
import { choose, type Embed } from "../lookup/local/choose";
import type { TaggerData } from "../lookup/local/tagger";
import type { VocabData } from "../lookup/local/vocab";
import type { ChooseResult, ChooseSense, OffscreenIdle } from "../messages";

/**
 * Holds the model, the tagger and the vocabulary: about 600 MB once loaded. Loaded on the
 * first question, and given back once no question has come for this long — the worker
 * closes the page when told. The next question after that waits about a second.
 */
const IDLE_MS = 2 * 60 * 1000;

// Everything is read from the extension itself: Manifest V3 runs no remote code, and a
// reader who never added a key should never need the network.
env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = new URL("models/", location.href).href;
if (env.backends.onnx.wasm) {
  env.backends.onnx.wasm.wasmPaths = new URL("ort/", location.href).href;
  // Threads need a cross-origin isolated page, and one thread answers in 0.1 seconds.
  env.backends.onnx.wasm.numThreads = 1;
}

interface Loaded {
  vocab: VocabData;
  tagger: TaggerData;
  embed: Embed;
}

async function json<T>(file: string): Promise<T> {
  const response = await fetch(new URL(file, location.href));
  return (await response.json()) as T;
}

async function open(): Promise<Loaded> {
  const [vocab, tagger, extract] = await Promise.all([
    json<VocabData>("vocab.json"),
    json<TaggerData>("tagger.json"),
    // The 8-bit copy: 23 MB and 450 MB in use, against 700 for the 16-bit one.
    pipeline("feature-extraction", "vocabboost", {
      dtype: "q8",
      device: "wasm",
    }),
  ]);
  const embed: Embed = async (texts) =>
    (
      await extract(texts, { pooling: "mean", normalize: true })
    ).tolist() as number[][];
  return { vocab, tagger, embed };
}

let loaded: Promise<Loaded> | undefined;
let idle: ReturnType<typeof setTimeout> | undefined;

chrome.runtime.onMessage.addListener(
  (message: ChooseSense, _sender, respond: (result: ChooseResult) => void) => {
    if (message.target !== "offscreen" || message.type !== "CHOOSE_SENSE") {
      return false;
    }

    clearTimeout(idle);
    loaded ??= open();
    void loaded
      .then(({ vocab, tagger, embed }) =>
        choose(vocab, tagger, embed, message.sentence, message.word),
      )
      .then(
        (choice) => respond({ ok: true, choice }),
        (error: unknown) => respond({ ok: false, error: String(error) }),
      )
      .finally(() => {
        idle = setTimeout(() => {
          const done: OffscreenIdle = { type: "OFFSCREEN_IDLE" };
          void chrome.runtime.sendMessage(done);
        }, IDLE_MS);
      });

    // Keeps the channel open for the answer.
    return true;
  },
);
