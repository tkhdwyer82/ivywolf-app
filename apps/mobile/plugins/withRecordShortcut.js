// Phone capture stopgap (Job 4.11): puts the Siri shortcut (plugins/ios/IvyShortcuts.swift) in the app target, and
// lets Siri answer to "Ivy" as well as "Ivy Wolf". The intent it runs and the widget come from targets/capture
// (@bacons/apple-targets). See docs/phone-capture.md.
const fs = require('fs');
const path = require('path');
const { IOSConfig, withDangerousMod, withInfoPlist, withXcodeProject } = require('expo/config-plugins');

const FILE = 'IvyShortcuts.swift';

function withShortcutFile(config) {
  config = withDangerousMod(config, [
    'ios',
    (cfg) => {
      const dir = path.join(cfg.modRequest.platformProjectRoot, cfg.modRequest.projectName);
      fs.copyFileSync(path.join(__dirname, 'ios', FILE), path.join(dir, FILE));
      return cfg;
    },
  ]);
  return withXcodeProject(config, (cfg) => {
    const name = cfg.modRequest.projectName;
    const filepath = `${name}/${FILE}`;
    if (!cfg.modResults.hasFile(filepath)) {
      IOSConfig.XcodeUtils.addBuildSourceFileToGroup({ filepath, groupName: name, project: cfg.modResults });
    }
    return cfg;
  });
}

function withAlternativeName(config) {
  return withInfoPlist(config, (cfg) => {
    cfg.modResults.INAlternativeAppNames = [{ INAlternativeAppName: 'Ivy' }];
    return cfg;
  });
}

module.exports = function withRecordShortcut(config) {
  return withAlternativeName(withShortcutFile(config));
};
