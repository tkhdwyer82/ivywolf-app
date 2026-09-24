# Phone capture — the pilot stopgap (Job 4.11)

Pilot convenience only, not part of the product story. Four ways to get from a locked phone to Ivy listening.
Each one opens `ivywolf://record`, and Record starts the mic as soon as it opens (⊕ listens and never asks).
If Record is already open and listening, opening the link again keeps the same take going.

Needs a build made after this step (`npx expo run:ios --device <udid>`). The widget, the Control and the Siri
shortcut are native, so a JS reload won't add them. The widget, the Control and Siri need iOS 18 or later; the app
still runs on 16.4 without them.

## Siri

"Hey Siri, **tell Ivy an idea**." Siri also answers to "tell Ivy Wolf an idea", "new idea in Ivy" and
"record in Ivy". Nothing to set up: once the app is installed, the shortcut appears in the Shortcuts app under
Ivy Wolf. If Siri doesn't recognise the phrase straight after installing, open the app once and wait a minute.

When you start by talking to Siri, the first second of the recording can clip while Siri lets go of the mic.
Pause for a beat before speaking.

## Lock-screen widget

Long-press the lock screen → **Customize** → **Lock Screen** → tap the widget row under the clock → **Ivy Wolf**.
There are two options: a round mic, and a line that reads "Tell Ivy an idea" (this one sits above the clock).
Tapping the widget unlocks the phone (Face ID) and opens Record.

## Control (lock-screen corners, Control Center)

Long-press the lock screen → **Customize** → **Lock Screen** → tap the torch or camera button in a bottom corner
→ remove it with **−** → **+** → search **Ivy** → **Tell Ivy an idea**. It's then one press from the lock screen.
You can also add it to Control Center: swipe down → **+** → **Add a Control** → Ivy Wolf.

This is the closest thing to the Action button on phones that don't have one. The pilot phone is an iPhone 14 Pro
Max, so this is what it should use.

## Action button (iPhone 15 Pro and later)

Settings → **Action Button** → swipe to **Controls** → **Choose a Control** → search **Ivy** →
**Tell Ivy an idea**. A press-and-hold then opens Ivy listening.

The Shortcut option works too (→ **Ivy Wolf** → **Tell Ivy an idea**), but the Control is one step fewer.

## Where it lives

- `apps/mobile/targets/capture/`: the widget extension (`@bacons/apple-targets`). `Capture.swift` has the
  widget and the Control; `_shared/RecordIdeaIntent.swift` is the intent both of them run, built into the app
  and the extension.
- `apps/mobile/plugins/withRecordShortcut.js` + `plugins/ios/IvyShortcuts.swift`: the Siri phrases, in the app
  target only, and "Ivy" as an alternative app name.
- After changing either, run `npx expo prebuild -p ios --clean`, then build.
