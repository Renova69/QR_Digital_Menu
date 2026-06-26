const { withAndroidManifest } = require('@expo/config-plugins');

module.exports = function withPrintAgentService(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;

    // 1. Ensure permissions
    const permissions = manifest['uses-permission'] || [];
    const requiredPermissions = [
      'android.permission.CAMERA',
      'android.permission.FOREGROUND_SERVICE',
      'android.permission.FOREGROUND_SERVICE_DATA_SYNC',
      'android.permission.FOREGROUND_SERVICE_SPECIAL_USE',
      'android.permission.POST_NOTIFICATIONS',
      'android.permission.WAKE_LOCK',
      'android.permission.RECEIVE_BOOT_COMPLETED',
      'android.permission.ACCESS_NETWORK_STATE',
      'android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS',
    ];

    requiredPermissions.forEach((permName) => {
      if (!permissions.find((p) => p.$['android:name'] === permName)) {
        permissions.push({
          $: { 'android:name': permName },
        });
      }
    });
    manifest['uses-permission'] = permissions;

    // Ensure <application> exists
    if (!manifest.application || !manifest.application[0]) {
      manifest.application = [{}];
    }
    const app = manifest.application[0];
    if (!app.$) app.$ = {};
    app.$['android:usesCleartextTraffic'] = 'true';

    // 2. Restore setup QR deep links. New QR codes target qrmenuprintagent://setup
    // so Android does not choose the legacy com.printeragent app; printagent://setup
    // remains supported as a fallback.
    if (!app.activity) app.activity = [];
    const mainActivity = app.activity.find((a) => a.$ && a.$['android:name'] === '.MainActivity');
    if (mainActivity) {
      if (!mainActivity['intent-filter']) mainActivity['intent-filter'] = [];
      const setupSchemes = ['qrmenuprintagent', 'printagent'];
      const existingSetupSchemes = new Set();
      mainActivity['intent-filter'].forEach((filter) => {
        (filter.data || []).forEach((data) => {
          if (data.$ && data.$['android:host'] === 'setup') {
            existingSetupSchemes.add(data.$['android:scheme']);
          }
        });
      });

      setupSchemes
        .filter((scheme) => !existingSetupSchemes.has(scheme))
        .forEach((scheme) => {
          mainActivity['intent-filter'].push({
            action: [{ $: { 'android:name': 'android.intent.action.VIEW' } }],
            category: [
              { $: { 'android:name': 'android.intent.category.DEFAULT' } },
              { $: { 'android:name': 'android.intent.category.BROWSABLE' } },
            ],
            data: [{ $: { 'android:scheme': scheme, 'android:host': 'setup' } }],
          });
        });
    }

    // 3. Add BootReceiver
    if (!app.receiver) app.receiver = [];
    const hasBootReceiver = app.receiver.find((r) => r.$ && r.$['android:name'] === '.BootReceiver');

    if (!hasBootReceiver) {
      app.receiver.push({
        $: {
          'android:name': '.BootReceiver',
          'android:enabled': 'true',
          'android:exported': 'true',
        },
        'intent-filter': [
          {
            action: [
              { $: { 'android:name': 'android.intent.action.BOOT_COMPLETED' } },
              { $: { 'android:name': 'android.intent.action.QUICKBOOT_POWERON' } },
            ],
          },
        ],
      });
    }

    // 4. Add PrintAgentForegroundService config if using a custom service
    // (Note: Since we use @supersami/rn-foreground-service, it creates its own service.
    // We need to make sure we add foregroundServiceType="specialUse" to it, or create our own.)
    if (!app.service) app.service = [];
    const supersamiService = app.service.find((s) => s.$ && s.$['android:name'] === 'com.supersami.foregroundservice.ForegroundService');

    if (supersamiService) {
      // If the supersami service is already in manifest (maybe added by its own plugin),
      // we inject specialUse into it.
      supersamiService.$['android:foregroundServiceType'] = 'dataSync|specialUse';
      if (!supersamiService['property']) supersamiService['property'] = [];
      const hasProperty = supersamiService['property'].find(p => p.$ && p.$['android:name'] === 'android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE');
      if (!hasProperty) {
        supersamiService['property'].push({
          $: {
            'android:name': 'android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE',
            'android:value': 'Maintains persistent connection to print server to receive and execute print jobs in real-time for restaurant operations'
          }
        });
      }
    } else {
      // If we don't find it, we'll define it so it gets the right type
      app.service.push({
        $: {
          'android:name': 'com.supersami.foregroundservice.ForegroundService',
          'android:foregroundServiceType': 'dataSync|specialUse',
        },
        'property': [
          {
            $: {
              'android:name': 'android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE',
              'android:value': 'Maintains persistent connection to print server to receive and execute print jobs in real-time for restaurant operations'
            }
          }
        ]
      });
      // Also add the headless task service from supersami just in case
      app.service.push({
        $: {
          'android:name': 'com.supersami.foregroundservice.ForegroundServiceTask',
        }
      });
    }

    return config;
  });
};
