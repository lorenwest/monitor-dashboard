// AppTemplate.js (c) 2010-2013 Loren West and other contributors
// May be freely distributed under the MIT license.
// For further details and documentation:
// http://lorenwest.github.com/monitor-dashboard
(function(root){

  // Module loading
  var Monitor = root.Monitor || require('monitor'),
      UI = Monitor.UI,
      Backbone = Monitor.Backbone,
      _ = Monitor._,
      FS = require('fs'),
      Path = require('path'),
      appName = process.argv[3];

  /**
  * This module builds an application template on load.  It is *not* asynchronous
  * as it is designed to be run from the command line.
  */

  // Splash
  console.log('[INFO] Creating monitor-dashboard application: ' + appName);

  // Warn if the application doesn't end in -monitor
  if (appName.substr(-8) !== '-monitor') {
    console.warn('[WARN] By convention, monitor apps should be named {appName}-monitor');
    console.warn('[WARN] where appName is the thing being monitored.');
  }

  // Try creating the appName directory
  try {
    FS.mkdirSync(appName);
  } catch(e) {
    if (e.code === 'EEXIST') {
      console.error('[ERROR] The application directory "' + appName + '" already exists.  Not overwriting.');
    }
    else {
      console.error('[ERROR] Cannot create the directory "' + appName + '" for the application.  Reason:');
      console.error('[ERROR] ' + e.toString());
    }
    process.exit(1);
  }

  // Success
  console.log('[INFO] Created the monitor-dashboard app in directory: ./' + appName);
  console.log('[INFO] To run the application:');
  console.log('[INFO] $ cd ' + appName);
  console.log('[INFO] $ npm install');
  console.log('[INFO] $ node monitor');
  process.exit(0);

}(this));
