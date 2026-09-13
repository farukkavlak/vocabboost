# VocabBoost

Look up a word from a film's subtitles without leaving the film.

![The panel opening in the caption's place, a word being looked up, and the model asked for the meaning in that line](docs/flow.gif)

Press the shortcut. The video pauses and the subtitle line stays where it was, but its
words are now clickable. Click one and you get its meaning, an example, and how it
sounds. Esc, a click anywhere else, or pressing play puts the film back.

None of that needs an account or a key. If the dictionary is not enough, one more press
asks a model what the word means in that line, using your own API key.

## Install

```sh
npm install
npm run build
```

Open `chrome://extensions`, turn on Developer mode, choose Load unpacked, pick
`extension/dist`.

The suggested shortcut is `Ctrl+Shift+H` (`⌘⇧H` on macOS). Chrome drops it without
warning if something else already uses it, so check `chrome://extensions/shortcuts`. The
popup links there and shows the one you actually have.

## Keys

The dictionary is [dictionaryapi.dev](https://dictionaryapi.dev): free, no key, and the
only source of a pronunciation and a real example sentence.

The model is optional and uses your own key, Claude or OpenAI.

- The key stays on your machine, in `storage.local`. Not in `sync`, which would copy it
  to Google. There is no server of ours for it to reach.
- It is used in the background worker, so it never reaches the script running on the
  video page.
- Access to a provider is requested only when you enter a key for it.

## Platforms

- YouTube
- Netflix
- Prime Video (`primevideo.com`)

A new one is a file in `extension/src/content/sources` plus a line in its `index.ts`. The
manifest's match patterns are built from that list.

## How it works

The content script reads captions from the page and keeps the last few lines, since a
caption is often gone by the time you react to it. The panel is drawn in a shadow root,
so page styles cannot reach it. Lookups run in the background worker, which is why the
key never touches the page.

## research/

Work on a meaning provider that needs no key and no network: a 23 MB encoder that picks
which sense of a word a subtitle line is using. Not shipped yet. `research/README.md`
has the numbers.

---

Ömer Faruk Kavlak — [LinkedIn](https://www.linkedin.com/in/omerfarukkavlak/)
