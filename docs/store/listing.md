# Chrome Web Store listing

## Name

VocabBoost

## Summary (up to 132 characters)

Click any word in a video's subtitles to see what it means in that sentence. Works
offline, with no account.

## Description

Didn't catch a word in a film? Look it up without leaving the video.

Press the shortcut while a video is playing. The video pauses and the subtitle stays on
screen, and you can click any of its words. You see what the word means in that
sentence, with an example. Press play to continue watching.

- It reads the sentence. A small model inside the extension picks the meaning that fits
  the subtitle. If it is not sure, it shows the three most likely meanings.
- It works offline. You don't need an account, an API key or an internet connection.
- It keeps a word log. Every word you look up is saved with its subtitle and video. On
  YouTube, you can jump back to the moment.
- Other models are optional. Add your own key and pick Jev, which finds the right
  meaning more often, or Claude or OpenAI for a written explanation and a translation.
- It is private. Your data stays on your computer.

Works on YouTube, Netflix and Prime Video.

Open source: https://github.com/farukkavlak/vocabboost

## Category

Education

## Language

English

## Privacy policy URL

https://github.com/farukkavlak/vocabboost/blob/main/PRIVACY.md

## Single purpose

Look up the meaning of words in video subtitles.

## Permission justifications

- **Host access to youtube.com, netflix.com, primevideo.com**: to read the subtitle text
  and show the lookup panel over the video.
- **storage**: to save settings, past answers and the optional API key.
- **unlimitedStorage**: the word log grows over time and should not stop at 10 MB.
- **offscreen**: the model runs in an offscreen document. A service worker is stopped
  when idle, so the model would have to load again for every word.
- **Optional host access to api.typesafe.ai, api.anthropic.com, api.openai.com**: asked
  only when the user saves a key. Used to send the word and its subtitle to that company.
- **wasm-unsafe-eval (content security policy)**: the model runs on the ONNX runtime,
  which is WebAssembly and included in the extension. No code is loaded from outside.

## Data use

The extension does not collect or send user data. If the user adds a key and asks, the
word and its subtitle are sent to the company the user chose.

## Assets

- Icon: `icon-128.png`
- Screenshots, 1280 × 800: `screenshot-*.png`, rebuilt with `npm run store`
