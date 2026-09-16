# VocabBoost

Look up a word from a film's subtitles without leaving the film.

![The panel opening in the caption's place, a word being looked up, and the model asked for the meaning in that line](docs/flow.gif)

Press the shortcut. The video pauses and the subtitle line stays where it was, but its
words are now clickable. Click one and you get the meaning it has in that line, with an
example. Esc, a click anywhere else, or pressing play puts the film back.

None of that needs an account, a key or a network. A small model inside the extension
reads the line and picks the dictionary sense it uses. When the line does not settle it,
the card says so and shows the likeliest few. If you want a written explanation instead,
one more press asks Claude or OpenAI, using your own API key.

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

The meanings come from WordNet, shipped with the extension. A word WordNet does not
have gets a card that says so. There is no pronunciation for now.

The provider's model is optional and uses your own key, Claude or OpenAI.

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

The local model runs in an offscreen page rather than the worker, which Chrome stops
after 30 idle seconds. The page opens on the first lookup, which takes about half a
second, and closes after two idle minutes. The model adds about 350 MB while the page is
open, and it is handed back within about half a minute of closing
(`npm run test:memory`).
The extension is about 62 MB unpacked: the model 23, the vocabulary 19, the runtime 14,
the part-of-speech tagger 5.

## research/

How the local model was built and measured: a 23 MB encoder, fine-tuned to pick which
sense of a word a subtitle line is using. On 149 hand-labelled lines it picks the right
sense first 66% of the time and has it in its top three 87%, against 55% for showing the
dictionary's first sense. `research/README.md` has
the numbers.

---

Ömer Faruk Kavlak — [LinkedIn](https://www.linkedin.com/in/omerfarukkavlak/)
