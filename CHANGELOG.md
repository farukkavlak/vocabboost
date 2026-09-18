# Changelog

## Unreleased

### Added

- When the model is sure of a meaning, the card says how sure ("92% sure"). The number is
  calibrated: of the answers given at about 90%, about 90% are right.
- The word log keeps that number with each word.
- TypeSafe's Jev as a model you can choose, with your own key. It picks the meaning from
  the dictionary's senses and was right on 82% of the held-out lines, against 65% for the
  built-in model.

### Changed

- The popup picks one model — built-in, Jev, Claude or OpenAI — and that model answers
  every lookup. The separate "Ask your model" button on the card is gone; a model that
  writes explanations still writes them.
- When the model you chose cannot answer, the built-in one answers and the card says why.

## 2.0.0 (2026-09-17)

A full rewrite. The extension now reads subtitles from the page and works without a key
or an internet connection.

### Added

- A panel that replaces the subtitle and lets you click its words. Works on YouTube,
  Netflix and Prime Video.
- A small model inside the extension that picks the meaning a word has in the subtitle.
  If it is not sure, the card shows the three most likely meanings.
- A word log that saves every word you look up, with its subtitle and video. On YouTube,
  each word links back to the moment it appeared.
- Optional answers from Claude or OpenAI, with your own API key, and optional
  translation.
- A settings popup.

### Changed

- Subtitles are read from the page, not from screenshots.
- Meanings come from WordNet, which is included in the extension.

### Removed

- Reading subtitles from screenshots with Google Cloud Vision.
- The server that called the AI model.

## 1.0.0 (2023-07-10)

- First version. It read subtitles from screenshots and asked a server for meanings.
