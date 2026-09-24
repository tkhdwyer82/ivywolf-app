// The lock-screen widget (a mic, or a line of text) and the Control (lock-screen corners, Control Center, the
// Action button). Each opens ivywolf://record, and Record starts listening on open.

import SwiftUI
import WidgetKit

private let recordURL = URL(string: "ivywolf://record")!

struct CaptureEntry: TimelineEntry {
  let date: Date
}

// Nothing on it changes, so one entry, never refreshed.
struct CaptureProvider: TimelineProvider {
  func placeholder(in context: Context) -> CaptureEntry { CaptureEntry(date: .now) }
  func getSnapshot(in context: Context, completion: @escaping (CaptureEntry) -> Void) { completion(CaptureEntry(date: .now)) }
  func getTimeline(in context: Context, completion: @escaping (Timeline<CaptureEntry>) -> Void) {
    completion(Timeline(entries: [CaptureEntry(date: .now)], policy: .never))
  }
}

struct CaptureView: View {
  @Environment(\.widgetFamily) private var family

  var body: some View {
    switch family {
    case .accessoryInline:
      Label("Tell Ivy an idea", systemImage: "mic.fill")
    default:
      ZStack {
        AccessoryWidgetBackground()
        Image(systemName: "mic.fill").font(.system(size: 24, weight: .semibold))
      }
      .accessibilityLabel("Tell Ivy an idea")
    }
  }
}

struct RecordWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "au.com.ivywolf.app.record", provider: CaptureProvider()) { _ in
      CaptureView()
        .containerBackground(for: .widget) { Color.clear }
        .widgetURL(recordURL)
    }
    .configurationDisplayName("Tell Ivy an idea")
    .description("Opens Ivy Wolf listening.")
    .supportedFamilies([.accessoryCircular, .accessoryInline])
  }
}

struct RecordControl: ControlWidget {
  var body: some ControlWidgetConfiguration {
    StaticControlConfiguration(kind: "au.com.ivywolf.app.record-control") {
      ControlWidgetButton(action: RecordIdeaIntent()) {
        Label("Tell Ivy an idea", systemImage: "mic.fill")
      }
    }
    .displayName("Tell Ivy an idea")
    .description("Opens Ivy Wolf listening.")
  }
}

@main
struct CaptureWidgets: WidgetBundle {
  var body: some Widget {
    RecordWidget()
    RecordControl()
  }
}
