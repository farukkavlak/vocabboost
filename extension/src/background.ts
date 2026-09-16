import { explainWord, lookupWord } from "./lookup";
import { closePage } from "./lookup/local/client";
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
 * Lookups run in the worker, not the content script: its requests carry the extension's
 * host permissions, and an API key never reaches a script that shares the site's page.
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

    const { word, sentence, occurrence } = message;
    const target = { word, sentence, occurrence };
    const answer =
      message.type === "LOOKUP_WORD" ? lookupWord(target) : explainWord(target);

    void answer
      .then((meaning) => respond({ ok: true, meaning }))
      .catch((error: unknown) =>
        respond(
          error instanceof LookupError
            ? { ok: false, message: error.message }
            : { ok: false },
        ),
      );

    return true; // the answer is sent asynchronously
  },
);
