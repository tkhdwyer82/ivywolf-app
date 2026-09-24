// Opens Ivy Wolf on Record, which starts listening — the ⊕ listens and never asks. The Control and the Siri
// shortcut both run it. It's in the app and the widget extension (this _shared folder), as an intent that opens
// the app has to be for a Control to work.

import AppIntents
import Foundation

@available(iOS 18.0, *)
struct RecordIdeaIntent: AppIntent {
  static let title: LocalizedStringResource = "Tell Ivy an idea"
  static let description = IntentDescription("Opens Ivy Wolf listening.")
  static let openAppWhenRun = true
  static let isDiscoverable = true

  @MainActor
  func perform() async throws -> some IntentResult & OpensIntent {
    .result(opensIntent: OpenURLIntent(URL(string: "ivywolf://record")!))
  }
}
