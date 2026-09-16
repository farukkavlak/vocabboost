import { explainWord, lookupWord } from "./lookup";
import { closePage } from "./lookup/providers/local";
import { configured } from "./lookup/settings";
import { LookupError } from "./meaning";
import type { LookupResult, Message } from "./messages";

chrome.commands.onCommand.addListener((command) => {
  if (command !== "lookup-subtitle") {
    return;
  }

  void (async () => {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (tab?.id === undefined) {
      return;
    }

    // Throws when nothing is listening: the tab is not a supported platform, or its
    // content script was orphaned by reloading the extension and needs a page refresh.
    await chrome.tabs
      .sendMessage(tab.id, { type: "LOOKUP_SUBTITLE" })
      .catch(() => undefined);
  })();
});

/**
 * Lookups run here rather than in the content script: the worker's requests carry the
 * extension's host permissions instead of answering to each provider's CORS policy, and
 * an API key never has to reach a script sharing a page with the site.
 */
chrome.runtime.onMessage.addListener(
  (
    message: Message,
    _sender,
    respond: (result: LookupResult | boolean) => void,
  ) => {
    if (message.type === "OFFSCREEN_IDLE") {
      void closePage();
      return false;
    }

    if (message.type === "MODEL_READY") {
      void configured().then((model) => respond(model !== null));
      return true;
    }

    if (message.type !== "LOOKUP_WORD" && message.type !== "EXPLAIN_WORD") {
      return false;
    }

    const answer =
      message.type === "LOOKUP_WORD"
        ? lookupWord(message.word, message.sentence)
        : explainWord(message.word, message.sentence);

    void answer
      .then((meaning) => respond({ ok: true, meaning }))
      .catch((error: unknown) =>
        respond(
          error instanceof LookupError
            ? { ok: false, message: error.message }
            : { ok: false },
        ),
      );

    // Keeps the channel open for the answer.
    return true;
  },
);
