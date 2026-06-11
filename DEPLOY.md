# Deploying Fiona's Japanese Flashcards

The site is hosted on GitHub Pages at:
**https://bumnumber1.github.io/fionas-japanese-flashcards/**

## How to publish updates

After making changes, commit and push to deploy:

```bash
git add -A
git commit -m "Description of changes"
git push
```

GitHub Pages will automatically rebuild the site within 1-2 minutes of pushing to the `master` branch.

## Offline support

The whole course works offline:

- **kanjivg_data.js** — embedded KanjiVG stroke data for every character taught
  (used by writing.html and ocean.html for guides and accuracy scoring).
- **fonts/** — locally hosted Nunito + Noto Sans JP (no Google Fonts dependency).
- **sw.js** — a service worker that caches every page, font, image, and the
  music after the first online visit, so the GitHub Pages URL keeps working
  with no internet. The pages also work opened directly from a local copy.

After certain changes, regenerate the offline files and commit them:

| When you... | Run |
|---|---|
| Add/change characters in writing.html or ocean.html | `node generate_kanjivg_data.js` |
| Change the font families/weights | `node generate_local_fonts.js` |
| Add/rename any page, image, font, or audio file — or change any content | `node generate_sw.js` (bumps the cache version so devices pick up the update) |

Run `node generate_sw.js` after **every** content change before pushing,
otherwise previously-visited devices may keep serving the old cached version.

Known limitation: the speech *recognition* in voicepractice.html
(`webkitSpeechRecognition`) is processed by the browser vendor's servers and
cannot work offline. Speech *synthesis* (the speaking voice) works offline as
long as the device has a Japanese voice installed (iPhones/iPads and Windows
include one).

## Repository

https://github.com/Bumnumber1/fionas-japanese-flashcards
