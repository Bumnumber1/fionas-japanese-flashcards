# Fiona's Dojo

Open `taekwondo.html`, or choose **Fiona's Dojo** from the flashcards or Game Arcade. No build step, account, or remote runtime assets are needed. A local HTTP server enables the existing service worker; direct file opening also supports the game, without service-worker installation.

**Watch a fight** opens `taekwondo-demo.html`: an automatic demonstration using the exact same 3D renderer and moves as the game. It shows attack, counter, block, and combo animations without microphone access or changes to saved ranks/rewards. Pause, resume, and replay are available. This preview does not replace voice recognition in the learning campaign.

## Game loop

Fiona is a female fighter with shoulder-length orange hair and bangs, with no ponytail. Eleven different rivals wear the belt associated with their stage. Her own belt changes with earned rank. Select a technique, complete a reading or handwriting challenge, and the characters perform the resulting exchange in the 3D arena.

| Belts | Challenge |
| --- | --- |
| White, yellow | Read the first 23, then all 46 hiragana aloud with speech recognition |
| Orange, gold | Read the first 23, then all 46 katakana aloud with speech recognition |
| Green, blue | Write the first 23, then all 46 hiragana from memory |
| Purple, brown | Write the first 23, then all 46 katakana from memory |
| Red, red-black | Read Japanese words aloud with speech recognition |
| Black | Recall familiar words from their meaning and write their kanji |

Correct attack answers damage the rival. Consecutive clean attack answers grow damage and every third triggers a combo. Against the first ten rivals, a mistake resets the streak and queues the rival's counter without dealing damage yet. The next activity is a block chance: correct prevents all queued damage; incorrect deals exactly that queued damage, then returns to attacking. Guided attacks deal half damage and no combo credit; correct guided blocks still stop all damage. A bout ends when one energy bar reaches zero; losses allow a full-energy rematch and preserve rank. Belts advance only after defeating a rival, never during combat. There is no timer.

The final opponent is **Master Steif**, a male fighter with short grey hair. His kanji-writing match announces its special rule before starting: each mistake immediately removes one-third of Fiona's full energy bar (displayed as 33.3%), without a block chance. Three mistakes end a fresh bout. The next activity after a hit remains an attack, including any earned special. Correct answers, help, combos, and saved ice cream rewards retain their usual behavior.

All seven basic attacks are available at white belt: straight punch, front kick, roundhouse, side kick, axe kick, turning kick, and back kick. They each start at 14 damage and use a standard activity. Guarding and block chances are available from the start as well.

Each new belt earns one special with a harder activity and more damage:

| Earned belt | New special | Extra damage |
| --- | --- | --- |
| Yellow | Double kick | +10 |
| Orange | Jump front kick | +12 |
| Gold | Jump side kick | +15 |
| Green | Spinning hook kick | +17 |
| Blue | Tornado kick | +20 |
| Purple | Flying double kick | +22 |
| Brown | Whirlwind combo | +25 |
| Red | Jump roundhouse | +27 |
| Red-black | Spinning back kick | +29 |
| Black | Dragon finisher | +32 |

Selecting a special changes the unanswered activity: complete canonical hiragana or katakana words at kana belts, longer word reading at high belts, and verified compound kanji such as 星空 and 時計 at black belt. Kana words use only the stage's taught characters and available local stroke geometry, such as タコ, イカ, カニ, and トイレ. The challenge stays in the rival's script and learning mode and shows its difficulty and starting damage. A completed basic activity cannot be exchanged for special damage afterward. Blocks always use a standard activity; the selected attack returns for the next turn. Earned specials remain available when replaying earlier rivals.

Six separate ice cream rewards unlock after defeating the last opponent of hiragana reading (yellow), katakana reading (gold), hiragana writing (blue), katakana writing (brown), word reading (red-black), and kanji writing (black). Each reward stores its own claimed state and chosen flavour on the device. Beating the black-belt kanji challenge also earns the champion title. Earned belts can be replayed; a real replay win can earn an uncompleted section reward.

Reading requires a user-started microphone session through the browser's SpeechRecognition / webkitSpeechRecognition API in Japanese. Only final recognition results resolve an activity. There is no typed, choice, or self-awarded bypass. Permission, silence, unsupported browsers, and network errors leave the turn and energy unchanged. Recognition availability depends on the browser and its speech service; it may require internet access. Writing remains available offline after assets are cached. Speech matching uses exact normalized kana, canonical word spellings, and explicit kanji orthography aliases rather than permissive substring scoring.

**Hands-free reading:** tap **Start hands-free** once in a reading bout to automatically arm the microphone for each fresh question and advance between exchanges. Each answer uses a new recognition session and a frozen target, so a previous final result cannot grade the next prompt. Fast correct answers advance after 450 ms; other correct exchanges after 700 ms; mistakes allow 1600 ms for feedback before the block prompt. Pause and instructions stop recording and pending transitions; closing them resumes hands-free mode. Hiding/leaving the page, stopping the mode, or finishing a fight stops capture. Reload never silently turns the microphone back on. No-speech/no-match errors retry twice, then stop; service or permission errors stop immediately. None of these errors deals damage.

Clean hands-free reading attacks within two seconds of arming the prompt earn **Lightning +6 damage**; within four seconds earn **Quick +3**. Speed bonuses stack with streaks, combos, and earned specials. Slow responses have the normal damage and no penalty. Blocks, hints, mistakes, writing, and retried unclear speech earn no speed damage. Recognition-service latency counts toward the measured time. Speed rewards display a notification and play a shorter attack with cyan/gold trails and impact sparks. Calm motion suppresses the extra motion effects. The ordinary single-answer microphone control remains available.

## Existing systems and references

- `curriculum_y1.js` and `year1-review-data.js`: canonical Year 1, weeks 1–13 vocabulary, including established grammar-example words.
- `garden-material.js`: the garden's established 15 kanji word forms and readings, rather than a second dictionary.
- `kanjivg_data.js` and the approach in `writing.html`: local stroke geometry and bidirectional stroke/endpoint comparison. The new component also checks stroke direction, ordered samples, and reasonable length. KanjiVG attribution and CC BY-SA 3.0 links remain in the writing module.
- `R:\ATA\packages\shared\src\forms\poses.ts`, `skeleton.ts`, and `R:\ATA\packages\web\src\forms\Figure3D.tsx`: reference for articulated limb rotation, kick chamber/extension/re-chamber, front/side/round kick distinctions, and sole grounding. The runtime renderer is standalone native WebGL; it does not require that repository, React, or Three.js.
- `generate_sw.js`: new game page and five local assets join the existing course cache. Regenerate after content changes.

The game's rank ladder and learning/combat rules are original game progression. No ATA logo or branding is used.

## Files and persistence

- `taekwondo-engine.js`: pure question, damage, promotion, and reward rules.
- `taekwondo-writing.js`: pointer-based recall handwriting and KanjiVG checks.
- `taekwondo-voice.js`: user-started Japanese speech recognition, exact reading matching, and safe microphone lifecycle.
- `taekwondo-scene.js`: lit, articulated 3D fighters, dojo, animations, hit effects, and celebration.
- `taekwondo.js`, `taekwondo.html`, `taekwondo.css`: controller and responsive interface.

Local storage key: `fiona-taekwondo-v1`. This is separate from all existing lesson and review saves. Course version 2 expands the nine-belt course to eleven and records explicitly completed learning sections. Older saves retain their earned belt identities, techniques, original four rewards and flavours, and champion title. The two new katakana rewards require actual wins in their stages; advanced players can earn them through replays. An older active question remains available once even if its belt now teaches a new script; the next prompt uses the new course.

Active bouts replay their answer journal on restoration, and answered turns remain locked across repeated reloads. Fight rule version 6 preserves version 2–5 journal events under their original stage modes, move unlocks, damage, and speed timing. Migrated fights retain their old stage indices as replay metadata. Master Steif's immediate-hit rule remains active. An already queued counter in an earlier saved final match retains its one block opportunity; subsequent mistakes use the new rule. Earned ranks, reward flavours, HP, streaks, and queued blocks survive migration. Reloading a writing prompt clears the drawing pad and returns to the first character, preserving any help credit. Sound is opt-in; calm motion and the device's reduced-motion preference are supported. Device/browser storage is required for persistence. Microphone sessions cancel on pause, instructions, navigation, or hidden tabs.

## Verification

```sh
node validate_taekwondo.js
node validate_taekwondo_voice.js
node validate_taekwondo_browser.cjs
node generate_sw.js
```

The browser harness uses an isolated Edge profile and local HTTP server, with no real learner save changes. It plays UI bouts through all eleven stages using synthetic final SpeechRecognition events for reading and actual pointer strokes from the canonical SVG paths for hiragana, katakana, and kanji writing. It checks block chances, penalties, combos, help, retry, saves, all six rewards, WebGL pixels, desktop/mobile screenshots, and offline writing. Optional `BROWSER_PATH` and `AUDIT_OUTPUT` environment variables choose a browser and evidence directory. Synthetic recognition verifies integration, not live microphone capture, vendor recognition quality, or permission prompts. Automated path tracing verifies input/scoring integration; physical handwriting tolerance, touch feel, and audible sound still benefit from real learner/device playtesting.
