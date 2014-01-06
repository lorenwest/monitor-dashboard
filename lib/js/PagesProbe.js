// PagesProbe.js (c) 2010-2014 Loren West and other contributors
// May be freely distributed under the MIT license.
// For further details and documentation:
// http://github.com/lorenwest/monitor-dashboard
(function(root){

  // Module loading - this runs server-side only
  var Monitor = root.Monitor || require('monitor'),
      _ = Monitor._,
      UI = Monitor.UI,
      Path = require('path'),
      FS = require('fs'),
      TreeProbe = Monitor.TreeProbe,
      FileProbe = Monitor.FileProbe;

  // Define some constants
  var CONST = {
    objectClass: 'Page',
    appLabel: 'App Pages',
    appDescription: 'Application Pages'
  };

  /**
  * This probe represents the pages and directories of a single
  * node of the site.
  *
  * @class PagesProbe
  * @extends TreeProbe
  * @constructor
  * @param [initParams] - Probe initialization parameters
  *     @param [initParams.path=''] {String} Path to this node
  */
  var PagesProbe = Monitor.PagesProbe = TreeProbe.extend({

    probeClass: 'PagesProbe',

    /**
    * Constructor initialization.
    *
    * @method initialize
    */
    initialize: function(attributes, options){
      var t = this;
      t.fileWatchers = {};

      // Instance level constants (can be overridden in sub-classes)
      t.CONST = t.CONST || CONST;

      // Call parent constructor
      TreeProbe.prototype.initialize.apply(t, arguments);

      // Assume callback responsibility.
      options.asyncInit = true;
      var callback = options.callback;

      // Set the root path from the Server's DB
      t.rootPath = Path.join(UI.Server.currentServer.get('siteDbPath'), t.CONST.objectClass);

      // Build the full path to the directory, possibly routed to an app DB
      var path = t.get('path'),
          parts = path.replace(/^[\\\/]/,'').split('/'),
          appName = parts[0] === 'app' ? parts[1] : null;
      if (appName && UI.Server.currentServer.apps[appName]) {

        // Build the dirPath from the module DB
        var appDef = UI.Server.currentServer.apps[appName];
        parts.splice(0,2);
        t.dirPath = Path.join(appDef.moduleDir, 'site_db', t.CONST.objectClass, parts.join('/'));
      }
      else {

        // Normal path - under the site_db/Page directory
        t.dirPath = Path.join(t.rootPath, path);
      }

      // Go straight to sync (no stat/watch) if the path is the app directory
      if (t.get('path') === '/app') {
        return t.sync(callback);
      }

      // Watch the directory and synchronize objects in it.
      // This is called after the FS.stat (below)
      var watchSync = function() {
        t.dirWatcher = FS.watch(t.dirPath, {persistent:false}, function(type){
          t.sync();
        });

        // Synchronize this object with the directory.
        t.sync(callback);
      }

      // Make sure the directory exists
      FS.stat(t.dirPath, function(error, stat) {

        // Create the directory if it doesn't exist
        if (error && error.code == 'ENOENT') {
          FileProbe.mkdir_r(t.dirPath, '0777', function(error) {
            if (error) {
              return callback(error);
            }
            // Created
            return watchSync();
          });
          return;
        }

        // Other error than directory doesn't exist
        if (error) {
          return callback(error);
        }

        // This shouldn't happen
        if (!stat.isDirectory()) {
          return callback({err: 'Not a directory: ' + t.dirPath});
        }

        // Continue
        return watchSync();
      });
    },

    /**
    * Release probe resources
    */
    release: function() {
      var t = this;
      if (t.dirWatcher) {
        t.dirWatcher.close();
        t.dirWatcher = null;
      }
      for (var pageId in t.fileWatchers) {
        t.fileWatchers[pageId].close();
      }
      t.fileWatchers = {};
    },

    /**
    * Synchronize the directory with this object
    *
    * @method sync
    * @param callback {Function} Callback to call when complete
    *     @param callback.error {Mixed} Set if anything goes wrong
    */
    sync: function(callback) {
      var t = this,
          dirs = [],
          pages = [],
          thisAppName = UI.Server.currentServer.thisAppName;
      callback = callback || function(){};

      // Synchronize the virtual /app directory
      if (t.get('path') === '/app') {
        for (var appName in UI.Server.currentServer.apps) {
          // Don't add me to the /app directory if I'm an app
          if (appName !== thisAppName) {
            var app = UI.Server.currentServer.apps[appName];
            dirs.push({
              id: appName,
              label: app.label || app.description || appName,
              path: Path.join(app.moduleDir, 'site_db', t.CONST.objectClass)
            });
          }
        }

        // Trim directory branches that have no contents
        t.trimDirs(dirs, function(error, trimmed) {
          if (error) {
            callback(error);
          }
          t.set({
            leaves: pages,
            branches: trimmed
          });
          return callback();
        });
        return;
      }

      // Get the directory at this level
      FS.readdir(t.dirPath, function(error, fileNames) {

        // Process errors
        if (error) {
          console.error('TreeProbe readdir error', error);
          return callback(error);
        }

        // Don't show the main 404 page (it's too confusing)
        if (t.CONST.objectClass === 'Page') {
          fileNames = _.reject(fileNames, function(name){
            return name === '404.json';
          });
        }

        // Perform a stat on all files for meta-info
        t.statFiles(fileNames, function(error, fileStats) {

          // Process errors
          if (error) {
            console.error('TreeProbe statFiles error', error);
            return callback(error);
          }

          // Process each file, recording directories and pages
          for (var i = 0, l = fileStats.length; i < l; i++) {
            var name = fileNames[i],
                stat = fileStats[i],
                id = Path.basename(name, '.json'),
                page = {id:id};

            if (stat.isDirectory()) {
              page.path = Path.join(t.dirPath, name);
              dirs.push(page);
            }
            else if (stat.isFile() && Path.extname(name).toLowerCase() === '.json') {
              pages.push(page);
            }
            else {
              console.error('Not a file or directory: ' + name);
            }
          }

          // Read each page for the display label and description
          t.readPages(pages, function(error) {

            // Process errors
            if (error) {
              console.error('PagesProbe readPages error', error);
              return callback(error);
            }

            // Add the virtual /app directory to the root
            if (t.dirPath === t.rootPath) {
              dirs.push({
                id:'app',
                label: t.CONST.appLabel,
                description: t.CONST.appDescription,
                path: Path.dirname(t.dirPath)
              });
            }

            // Trim directory branches that have no contents
            t.trimDirs(dirs, function(error, trimmed) {
              if (error) {
                callback(error);
              }

              t.set({
                leaves: pages,
                branches: trimmed
              });
              return callback();
            });
          });

        });
      });

    },

    /**
    * Trim directories that have no content
    *
    * This accepts an array of objects, where each object must have a 'path' element.
    * If no content is at the path, the object will be trimmed from the array.
    *
    * The path element will be removed after checking.
    *
    * @method trimDirs
    * @param dirs {Object} An object that contains a 'path' element
    * @param callback {function(error, trimmed)} Called when complete (or error)
    */
    trimDirs: function(dirs, callback) {
      var t = this,
          numLeft = dirs.length,
          fileRegexp = /.json$/,
          trimmed = [];

      // Already trimmed
      if (numLeft === 0) {
        return callback(null, dirs);
      }

      // Process each directory
      dirs.forEach(function(dir) {
        t.hasContents(dir.path, fileRegexp, function(error, hasContents) {
          if (error) {
            numLeft = 0;
            return callback(error);
          }
          delete dir.path;
          if (hasContents) {
            trimmed.push(dir);
          }
          if (--numLeft === 0) {
            return callback(null, trimmed);
          }
        });
      });
    },


    /**
    * Determine if a directory has any contents.
    *
    * This will return true if any sub-directories with contents exist, or
    * if any files with the specified RegExp exist.
    *
    * @method hasContents
    * @param dirname {Path} Full path to the directory
    * @param fileRegexp {RegExp} Regular expression to test for files
    * @param callback {function(error, hasContents}} Regular expression to test for files
    */
    hasContents: function(dirname, fileRegexp, callback) {
      var t = this;

      // Get the directory at this level
      FS.readdir(dirname, function(error, fileNames) {

        // Process errors
        if (error) {
          console.error('Read dir error', error);
          return callback(error);
        }

        // Process sequentially until content is found.
        // If parallel, a deep scan would occur every time.
        var dirsToCheck = [];
        function checkNext() {

          // Done checking all filenames
          if (fileNames.length === 0) {

            // Check directories, and return true if any have content
            t.trimDirs(dirsToCheck, function(error, trimmed) {
              return callback(error, trimmed.length > 0);
            });
            return;
          }

          // Stat the next entry
          var filename = fileNames[0];
          fileNames.splice(0,1);
          var pathName = Path.join(dirname, filename);
          FS.stat(pathName, function(error, stat) {
            if (error) {
              return callback(error);
            }

            // Check for directory content or if a file should be included
            if (stat.isDirectory()) {
              dirsToCheck.push({path:pathName});
            }
            else {
              // There is content if a file exists and it matches an optional regexp
              if (!fileRegexp || fileRegexp.test(filename)) {
                return callback(null, true);
              }
            }

            // Check the next filename
            checkNext();
          });
        }

        // Kick off the first check
        checkNext();
      });
    },

    /**
    * Stat all the files, returning an array of file stats matching the
    * array of input files.
    *
    * @method statFiles
    * @param fileNames {Array} An array of filenames to stat (from this directory)
    * @param callback {Function(error, stats)}
    *     @param callback.error {Mixed} Set if an error occured
    *     @param callback.stats {Array of Stat} An array of fs.stats objects
    */
    statFiles: function(fileNames, callback) {
      var t = this,
          stats = [],
          didError = false,
          numLeft = fileNames.length;

      // No files to process
      if (fileNames.length === 0) {
        return callback(null, stats);
      }

      // Call stat on each file
      fileNames.forEach(function(fileName, index) {
        var fullPath = Path.join(t.dirPath, fileName);
        FS.stat(fullPath, function(error, stat) {

          // Process a stat error
          if (error) {
            didError = true;
            return callback(error);
          }

          // Do nothing if a prior error callback happened
          if (didError) {
            return;
          }

          // Set this stat item
          stats[index] = stat;

          // Callback if all stats are complete
          if (--numLeft === 0) {
            callback(null, stats);
          }
        });
      });

    },

    /**
    * Add title (label) and description to the specified page objects.
    *
    * @method readPages
    * @param pages {Array of Object} An array of objects with the id element set
    * @param callback {Function(error)}
    */
    readPages: function(pages, callback) {
      var t = this,
          didError = false,
          numLeft = pages.length;

      // Callback early if no pages to read
      if (pages.length === 0) {
        return callback();
      }

      // Read and parse each file for the title/description
      pages.forEach(function(page, index) {

        // Read the file
        var fullPath = Path.join(t.dirPath, page.id + '.json');
        FS.readFile(fullPath, 'utf8', function(error, file) {

          // Process a stat error
          if (error) {
            didError = true;
            return callback(error);
          }

          // Parse the JSON
          var parsed = null;
          try {
            parsed = JSON.parse(file);
          }
          catch (e) {
            didError = true;
            console.error('JSON error parsing page: ' + fullPath, e);
            return callback(e);
          }

          // Do nothing if a prior error callback happened
          if (didError) {
            return;
          }

          // Set the page title and description
          if (parsed.title) {
            page.label = parsed.title;
          }
          if (parsed.description) {
            page.description = parsed.description;
          }

          // Add a file watcher if not already watching
          if (!t.fileWatchers[page.id]) {
            t.fileWatchers[page.id] = new FS.watch(fullPath, {persistent:false}, function(type){
              t.sync();
            });
          }

          // Callback if all page reads are complete
          if (--numLeft === 0) {
            callback(null);
          }
        });
      });
    }

  });

}(this));
