const { withAndroidManifest } = require("expo/config-plugins");

module.exports = function withLanHttp(config) {
  return withAndroidManifest(config, (config) => {
    // The companion server runs over HTTP on the user's private LAN.
    config.modResults.manifest.application[0].$["android:usesCleartextTraffic"] = "true";
    return config;
  });
};