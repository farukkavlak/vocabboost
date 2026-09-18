import { logLookup } from "./logbook/store";
import { lookupWord } from "./lookup";
import { closePage } from "./lookup/local/client";
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
    if (message.type === "LOG_LOOKUP") {
      // A log that cannot be written must not break the lookup it records.
      logLookup(message.entry).catch((error: unknown) =>
        console.error("The word log could not be written:", error),
      );
      return false;
    }

    if (message.type === "OFFSCREEN_IDLE") {
      void closePage();
      return false;
    }

    if (message.type !== "LOOKUP_WORD") {
      return false;
    }

    const { word, sentence, occurrence } = message;

    void lookupWord({ word, sentence, occurrence })
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
