// Phone capture stopgap (Job 4.11): a lock-screen widget and a Control that open Record, which starts listening.
// Pilot convenience only, not part of the product story. See docs/phone-capture.md.
/** @type {import('@bacons/apple-targets/app.plugin').Config} */
module.exports = {
  type: 'widget',
  name: 'IvyCapture',
  displayName: 'Ivy Wolf',
  bundleIdentifier: '.capture',
  // Controls are iOS 18; the app itself still runs on 16.4, just without these.
  deploymentTarget: '18.0',
  frameworks: ['SwiftUI', 'WidgetKit', 'AppIntents'],
}
