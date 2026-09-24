// expo-notifications adds the push entitlement (aps-environment). We only schedule local notifications (Remind me,
// P18), which don't need it, and a free Personal Team can't sign it, so take it out. Add it back if Ivy ever sends
// pushes, which needs the paid Apple Developer account.
//
// Listed *before* expo-notifications in app.json: mods run in reverse order, so this one runs after it.
const { withEntitlementsPlist } = require('expo/config-plugins');

module.exports = function withoutPush(config) {
  return withEntitlementsPlist(config, (cfg) => {
    delete cfg.modResults['aps-environment'];
    return cfg;
  });
};
