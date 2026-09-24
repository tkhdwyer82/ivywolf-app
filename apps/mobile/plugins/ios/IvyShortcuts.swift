// The Siri shortcut: "Hey Siri, tell Ivy an idea" opens Record listening (RecordIdeaIntent, in
// targets/capture/_shared). App Shortcuts belong to the app, so this file is in the app target only
// (plugins/withRecordShortcut.js). It also shows up in the Shortcuts app, which is how the Action button reaches it.

import AppIntents

@available(iOS 18.0, *)
struct IvyShortcuts: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    AppShortcut(
      intent: RecordIdeaIntent(),
      phrases: [
        "Tell \(.applicationName) an idea",
        "New idea in \(.applicationName)",
        "Record in \(.applicationName)",
      ],
      shortTitle: "Tell Ivy an idea",
      systemImageName: "mic.fill"
    )
  }
}
