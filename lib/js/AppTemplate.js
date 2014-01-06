// AppTemplate.js (c) 2010-2014 Loren West and other contributors
// May be freely distributed under the MIT license.
// For further details and documentation:
// http://github.com/lorenwest/monitor-dashboard
(function(root){

  // Module loading
  var Monitor = root.Monitor || require('monitor'),
      logger = Monitor.getLogger('AppTemplate'),
      UI = Monitor.UI,
      Backbone = Monitor.Backbone,
      _ = Monitor._,
      FS = require('fs'),
      Path = require('path'),
      Template = UI.Template,
      appPath = process.argv[3],
      appName = Path.basename(appPath),
      shortAppName = Path.basename(appPath, '-monitor');

  // Log [INFO] to the console for this process
  Monitor.Log.on('info.*', Monitor.Log.console);

  /**
  * This module builds an application template on load.  It is *not* asynchronous
  * as it is designed to be run from the command line.
  */

  // Splash
  logger.info('Splash', 'Creating monitor-dashboard application: ' + appName);

  // Warn if the application doesn't end in -monitor
  if (appName === shortAppName) {
    logger.warn('Convention', 'By convention, monitor apps should be named {appName}-monitor');
    logger.warn('Convention', 'where appName is the thing being monitored.');
  }

  // Try creating the application directory
  try {
    FS.mkdirSync(appPath);
  } catch(e) {
    if (e.code === 'EEXIST') {
      logger.fatal('Mkdir', 'The application directory "' + appName + '" already exists.  Not overwriting.');
    }
    if (e.code === 'ENOENT') {
      logger.fatal('Mkdir', 'Cannot create app directory "' + appName + '".  Reason: directory "' + Path.dirname(appPath) + '" not found');
    }
    else {
      logger.fatal('Mkdir', 'Cannot create the directory "' + appName + '" for the application.  Reason:' + e.toString());
    }
    process.exit(1);
  }

  // Build the template parameters
  var templateParams = {
    appName: appName,
    appDescription: shortAppName.substr(0,1).toUpperCase() + shortAppName.substr(1) + ' Monitor',
    shortAppName: shortAppName
  };

  // Output the specified file from the template directory
  var outputFile = function(dirpath, file) {
    var templateFile = Path.join(__dirname, '../template/app', dirpath, file),
        outputFile = Path.join(appPath, dirpath, file);
    try {
      var template = new Template({text: FS.readFileSync(templateFile).toString(), watchFile:false});
      FS.writeFileSync(outputFile, template.apply(templateParams));
    } catch(e) {
      logger.fatal('Template', 'Cannot process template file: ' + templateFile + '. reason: ', e.toString());
      process.exit(1);
    }
  }

  // Traverse the app template directory, outputting all files
  var outputDir = function(dirpath) {
    try {

      // Make the directory under the app
      if (dirpath !== '/') {
        FS.mkdirSync(Path.join('.', appPath, dirpath));
      }

      // Read the template directory
      var templateDir = Path.join(__dirname, '../template/app', dirpath);
      var files = FS.readdirSync(templateDir);
      files.forEach(function(file) {
        var fullFile = Path.join(templateDir, file);
        var stat = FS.statSync(fullFile);
        if (stat.isDirectory()) {
          // Go into it
          outputDir(Path.join(dirpath, file));
        }
        else {
          outputFile(dirpath, file);
        }
      });

    } catch(e) {
      logger.fatal('Template', 'Cannot process template directory: ' + dirpath + '. reason: ', e.toString());
      process.exit(1);
    }
  }
  outputDir('/');

  // Success
  logger.info('Success', 'Created the monitor-dashboard app in directory: ' + appPath);
  logger.info('Success', 'To run the application:');
  logger.info('Success', '$ cd ' + appPath);
  logger.info('Success', '$ npm install');
  logger.info('Success', '$ node monitor');
  process.exit(0);

}(this));
