/*global window document $ localStorage alert*/

// Server.js (c) 2010-2014 Loren West and other contributors
// May be freely distributed under the MIT license.
// For further details and documentation:
// http://github.com/lorenwest/monitor-dashboard
(function(root){

  // Module loading
  var Monitor = require('monitor'),
      UI = Monitor.UI,
      $ = UI.$,
      Backbone = Monitor.Backbone,
      _ = Monitor._,
      SyncProbe = Monitor.SyncProbe,
      Mustache = Monitor.commonJS ? require('../ext/mustache-0.7.0-dev.js') : root.Mustache;
      Page = UI.Page,
      pageCache = new Page.List(),
      Site = UI.Site,
      Connect = require('connect'),
      Config = require('config'),
      GruntConfig = require('../../grunt'),
      FS = require('fs'),
      OS = require('os'),
      Path = require('path'),
      URL = require('url'),
      log = Monitor.getLogger('Server'),
      Template = UI.Template;

  // Constants
  var PAGE_PARAMS = {},
      CSS_TEMPLATE   = Mustache.compile('\n    <link rel="stylesheet" type="text/css" href="{{{cssFile}}}">'),
      JS_TEMPLATE    = Mustache.compile('\n    <script type="text/javascript" src="{{{scriptFile}}}"></script>'),
      TMPL_TEMPLATE  = Mustache.compile('\n      <div id="nm-template-{{id}}">\n{{{text}}}      </div>'),
      PACKAGE_JSON   = JSON.parse(FS.readFileSync(__dirname + '/../../package.json'));

  /**
  * Server side support for the monitor UI.
  *
  * @module Server
  */

  /**
  * Monitor user interface Server
  *
  * Instances of this class build a UI server listening on a port.  The server
  * is created and set up during object initialization.
  *
  * @class Server
  * @extends Backbone.Model
  * @constructor
  * @param model - Initial data model.  Can be a JS object or another Model
  *   @param [model.port=4200] {Number} The server listens on this port
  *   @param [model.allowExtrnalConnections=false] {boolean} Allow connections
  *     from host processes outside this machine?
  *   @param [model.server] {ConnectServer} A custom connect or express server
  *   @param [model.templates] {Template.List} List of templates available to the server
  */
  var Server = UI.Server = Backbone.Model.extend({

    defaults: _.extend({
      port:4200,
      allowExternalConnections: false,
      siteDbPath: './site_db',
      server:null,
      templates:new Template.List()
    }, Config.Monitor),

    // Initialize the server
    initialize: function(params, options) {
      var t = this,
          port = t.get('port'),
          server = t.get('server'),
          templates = t.get('templates'),
          siteDbPath = t.get('siteDbPath'),
          parentPath = siteDbPath.indexOf('.') === 0 ? process.cwd() : '';

      // Distribute the site path to probes that need it
      t.set('siteDbPath', Path.join(parentPath, siteDbPath));

      // Initialize probes
      SyncProbe.Config.defaultProbe = 'FileSyncProbe';
      SyncProbe.FileSyncProbe.setRootPath(siteDbPath);

      // Expose the current instance so probes running
      // in this process can communicate with the server
      UI.Server.currentServer = t;

      // Internal (non-model) attributes
      t.apps = {};  // Hash appName -> app data
      t.site = null;   // Site model associated with the server

      // Create a connect server if no custom server was specified
      if (!server) {
        server = new Connect();
        t.set({server: server});
      }

      // Attach server components
      server.use(t.siteRoute.bind(t));
      server.use(Connect['static'](Path.join(__dirname, '/../..')));

      // Create a static server to the monitor distribution
      var monitorDistDir = require.resolve('monitor').replace(/lib[\\\/]index.js/, 'dist');
      t.monitorDist = Connect['static'](monitorDistDir);

      // Initialize the template library
      var gruntModules = GruntConfig.MODULE_DEF;
      gruntModules.templates.sort().forEach(function(template){
        var path = Path.normalize(__dirname + '/../../' + template);
        var id = Path.basename(path, '.html');
        templates.add({id:id, path:path});
      });

      // Build the page parameters from the config file
      var styles = "", scripts="";
      gruntModules.client_css.forEach(function(cssFile) {
        styles += CSS_TEMPLATE({cssFile: cssFile.replace('lib/','/static/')});
      });
      var clientScripts = gruntModules.client_ext.concat(gruntModules.shared_js.concat(gruntModules.client_js));
      clientScripts.forEach(function(file) {
        scripts += JS_TEMPLATE({scriptFile: file.replace('lib/','/static/')});
      });
      _.extend(PAGE_PARAMS, {
        styles: styles, scripts: scripts, version: PACKAGE_JSON.version
      });
    },

    /**
    * Internal route for all non-static site endpoints
    *
    * @method siteRoute
    * @param request {Connect.Request} The http request object
    * @param response {Connect.Response} The http response object
    * @param next {Function()} Function to pass control if this doesn't handle the url.
    */
    siteRoute: function(request, response, next) {
      var t = this;

      // URL rewrites
      var url = URL.resolve('', request.url);
      if (url === '/favicon.ico') {
        var faviconUrl = t.site.get('favicon');
        url = request.url = faviconUrl || request.url;
      }

      // Remove the leading slash for page manipulation
      url = url.substr(1);

      // Rewrite the url and forward if it points to static content
      var urlParts = url.split('/');
      if (urlParts[0] === 'static') {

        // Replace static with lib, and put the leading slash back in
        request.url = url.replace('static/', '/lib/');

        // Forward to the monitor distribution
        if (request.url.indexOf('monitor-all.js') > 0) {
          request.url = '/monitor-all.js';
          return t.monitorDist(request, response, next);
        }

        // Next is the static server
        return next();
      }

      // If it's an URL to an app, route to the app
      if (urlParts[0] === 'app') {
        var appName = urlParts[1],
            app = t.apps[appName];

        // Route to a monitor page if the app doesn't handle the request
        var appNext = function() {
          t._monitorPageRoute(request, response, next);
        };

        // Continue if the app isn't defined
        if (!app) {
          return appNext();
        }

        // Make the app request relative to the app
        var appUrl = '/' + url.split('/').slice(2).join('/'),
            appRequest = _.extend({}, request, {url: appUrl});

        // Forward the request to the app server
        var server = typeof app.server === 'function' ? app.server : app.staticServer;
        return server(appRequest, response, appNext);
      }

      // Forward to a monitor page
      t._monitorPageRoute(request, response, next);
    },

    /**
    * Route to a monitor page.
    *
    * @protected
    * @method _monitorPageRoute
    * @param request {Connect.Request} The http request object
    * @param response {Connect.Response} The http response object
    * @param next {Function()} Function to pass control if this doesn't handle the url.
    */
    _monitorPageRoute: function(request, response, next) {
      var t = this,
          url = request.url,
          searchStart = url.indexOf('?'),
          templates = t.get('templates');

      // Remove any URL params
      if (searchStart > 0) {
        url = url.substr(0, searchStart);
      }

      // Get the page model
      t._getPage(url, function(error, pageModel) {

        if (error) {
          return response.end('page error: ' + JSON.stringify(error));
        }

        // Build the object to put into the page template
        var page = _.extend({templates:''}, PAGE_PARAMS, t.site.toJSON(), pageModel.toJSON());
        page.pageParams = Template.indent(JSON.stringify(pageModel.toJSON({deep:true,trim:true}), null, 2), 8);

        // Add all watched templates except the main page
        templates.each(function(template) {
          if (template.id !== 'UI') {
            page.templates += TMPL_TEMPLATE({
              id:template.id,
              text:Template.indent(template.get('text'),8)
            });
          }
        });

        // Output the page
        response.writeHead(200, {'Content-Type': 'text/html'});
        var pageTemplate = templates.get('UI');
        return response.end(pageTemplate.apply(page));
      });
    },

    /**
    * Get the specified page from cache
    *
    * This retrieves the page from cache, or puts it there.
    *
    * @method _getPage
    * @param url {url} URL to the page
    * @param callback {function(error, pageModel)} Called when complete
    */
    _getPage: function(url, callback) {
      var t = this,
          originalUrl = url,
          page = null;

      // Change urls that end in / to /index
      if (url.substr(-1) === '/') {
        url = url + 'index';
      }

      // Return if it's in cache
      page = pageCache.get(url);
      if (page) {
        return callback(null, page);
      }

      // Read from storage
      page = new Page({id: url});
      page.fetch({liveSync: true, silenceErrors: true}, function(error) {

        // Process a 404.  This returns a transient page copied from
        // the default 404 page, with the id replaced by the specified url.
        if (error && error.code === 'NOTFOUND' && url !== '/app/core/404') {

          // Default the home page if notfound
          if (originalUrl === '/') {
            return t._getPage('/app/core/index', callback);
          }

          // Default the 404 page if notfound
          if (originalUrl === '/404') {
            return t._getPage('/app/core/404', callback);
          }

          // Otherwise it's a new page.  Create it.
          t._getPage('/404', function(error, page404) {
            if (error) {
              console.error("Error loading the 404 page", error);
              return callback('404 page load error');
            }

            // Copy the 404 page into a new page
            var newPage = new Page(JSON.parse(JSON.stringify(page404)));

            // Build a sane starting title.  TitleCase the last url element, separate words, replace underscores
            var title = $.titleCase(url.split('/').pop(), true).replace(/([A-Z])/g," $1").replace(/^ /,'').replace(/_/g,' ');
            var title = url.split('/').pop().replace(/([A-Z])/g," $1").replace(/^ /,'').replace(/_/g,' ');
            newPage.set({id:url, title:title, is404page:true});
            callback(null, newPage);
          });
          return;
        }

        // Process other errors
        if (error) {
          return callback(error);
        }

        // Assure the page model ID is correct on disk
        if (url !== page.get('id')) {
          page.set('id', url);
        }

        // Put the page into cache and return it
        pageCache.add(page);
        return callback(null, page);
      });
    },

    /**
    * Start the UI server
    *
    * This method starts listening for incoming UI requests.
    *
    * @method start
    * @param [callback] {Function(error)} - Called when the server has started
    */
    /**
    * The server has started
    *
    * This event is fired when the server has begun listening for incoming
    * web requests.
    *
    * @event start
    */
    /**
    * A client error has been detected
    *
    * This event is fired if an error has been detected in the underlying
    * transport.  It may indicate message loss.
    *
    * @event error
    */
    start: function(callback) {
      callback = callback || function(){};
      var t = this,
          server = t.get('server'),
          port = t.get('port'),
          allowExternalConnections = t.get('allowExternalConnections');

      // Allow connections from INADDR_ANY or LOCALHOST only
      var host = allowExternalConnections ? '0.0.0.0' : '127.0.0.1';

      // Start listening
      server.listen(port, host, function(){

        // Allow the UI server to be a Monitor gateway server
        t.monitorServer = new Monitor.Server({server:server, gateway: true});
        t.monitorServer.start(function(){

          // Called after the site object is loaded
          var onSiteLoad = function(error) {
            if (error) {
              return callback(error);
            }

            // Discover and initialize application modules
            t.loadApps();

            // Bind server events
            t._bindEvents(callback);
          };

          // Load and keep the web site object updated
          t.site = new Site();
          t.site.fetch({liveSync: true, silenceErrors:true}, function(error) {

            // Initialize the site if it's not found
            if (error && error.code === 'NOTFOUND') {
              t.site = new Site();
              t.site.id = null;  // This causes a create vs. update on save
              return t.site.save({}, {liveSync: true}, onSiteLoad);
            } else if (error) {
              return onSiteLoad(error);
            }

            // Bind server events once connected
            onSiteLoad();
          });
        });
      });
    },

    /**
    * Bind incoming socket events to the server
    *
    * @protected
    * @method _bindEvents
    * @param callback {Function(error)} - Called when all events are bound
    */
    _bindEvents: function(callback) {

      // Detect server errors
      var t = this, server = t.get('server');
      server.on('clientError', function(err){
        console.error('Client error detected on server', err);
        t.trigger('error', err);
      });
      server.on('close', function(err){
        server.hasEmittedClose = true;
        t.stop();
      });

      // Notify that we've started
      t.isListening = true;
      if (callback) {
        callback(null);
      }
      t.trigger('start');
    },

    /**
    * Discover and load all node_monitor application modules
    *
    * This is designed to run during server initialization, and is synchronous.
    *
    * @method loadApps
    */
    loadApps: function() {
      var t = this;

      // Test an app directory to see if it's a monitor app
      var testAppDir = function(dir) {

        // Load the package.json if it exists (and remove relative refs)
        var pkg;
        dir = Path.resolve(dir);
        try {
          pkg = JSON.parse(FS.readFileSync(dir + '/package.json', 'utf-8'));
        } catch (e) {
          // Report an error if the package.json has a parse problem.  This is
          // good during app development to show why we didn't discover the app.
          if (e.code !== "ENOENT") {
             console.error("Problem parsing " + dir + "/package.json");
          }
          return false;
        }

        // Is this a monitor-dashboard app?
        var isMonitorApp = pkg.dependencies && _.find(_.keys(pkg.dependencies), function(keyword){ return keyword === 'monitor-dashboard'; });
        if (!isMonitorApp) {
          return false;
        }

        // This is a monitor-dashboard app.
        return t.loadApp(dir, pkg);
      };

      // Process all apps under a node_modules directory
      var loadNodeModulesDir = function(dir) {

        // Return if the node_modules directory doesn't exist.
        try {
          FS.statSync(dir);
        } catch (e) {return;}

        // Check each direcory for a monitor-dashboard app
        FS.readdirSync(dir).forEach(function(moduleName) {

          // See if this is a monitor app, and load if it is
          // then load sub-modules
          var moduleDir = dir + '/' + moduleName;
          if (testAppDir(moduleDir) || moduleName === 'monitor') {

            // If it is a monitor-app, process any sub node_modules
            loadNodeModulesDir(moduleDir + '/node_modules');
          }
        });
      };

      // Test this app as a monitor app
      t.thisAppName = testAppDir('.');

      // Process all possible node_module directories in the require path.
      process.mainModule.paths.forEach(loadNodeModulesDir);

    },

    /**
    * Load the specified app
    *
    * This is designed to run during server initialization, and is synchronous.
    *
    * @method loadApp
    * @param moduleDir {String} The module directory that contains package.json
    * @param packageJson {Object} The contents of the package.json file
    */
    loadApp: function(moduleDir, packageJson) {
      var t = this,
          resolved = null,
          templates = t.get('templates');

      // Remove the -monitor portion of the app
      var appName = packageJson.name.replace(/-monitor$/,'');

      // Don't overwrite a more "locally" defined app
      if (t.apps[appName]) {
        return false;
      }

      // The app module must be found
      try {
        resolved = require.resolve(moduleDir);
      } catch (e) {
        console.error("Problem loading plug-in: " + moduleDir, e);
        return false;
      }

      // Clear module cache for reloads
      log.info('Loading app ' + appName + ' from ' + moduleDir);
      delete require.cache[resolved];

      // Load the module
      var server;
      try {
        server = require(resolved);
      } catch (e) {
        console.error('Problem loading the "' + appName + '" module: ', e.stack);
        return false;
      }

      var views = {}, // key: view name, value: {icon:'iconfile'}
          css = [],
          images = {}, // key: basename, value: filename
          appPath = '/app/' + appName + '/';

      // Add extensions
      try {
        FS.readdirSync(moduleDir + '/lib/ext').sort().forEach(function(filename) {
          var ext = Path.extname(filename).toLowerCase();
          var base = Path.basename(filename, ext);
          if (ext === '.js') {
            PAGE_PARAMS.scripts += JS_TEMPLATE({scriptFile: appPath + 'ext/' + filename});
          }
        });
      } catch (e) {
        if (e.code !== 'ENOENT') {
          console.error('Error reading ' + moduleDir + '/lib/ext', e);
        }
      }

      // Gather views to expose on the page
      try {
        FS.readdirSync(moduleDir + '/lib/view').sort().forEach(function(filename) {
          var ext = Path.extname(filename).toLowerCase();
          var base = Path.basename(filename, ext);
          if (ext === '.js') {
            views[base] = '';
            PAGE_PARAMS.scripts += JS_TEMPLATE({scriptFile: appPath + 'view/' + filename});
          }
        });
      } catch (e) {
        if (e.code !== 'ENOENT') {
          console.error('Error reading ' + moduleDir + '/lib/view', e);
        }
      }

      // Gather CSS to expose on the page
      try {
        FS.readdirSync(moduleDir + '/lib/css').sort().forEach(function(filename) {
          var ext = Path.extname(filename).toLowerCase();
          var base = Path.basename(filename, ext);
          if (ext === '.css') {
            css.push(filename);
            PAGE_PARAMS.styles += CSS_TEMPLATE({cssFile: appPath + 'css/' + filename});
          }
        });
      } catch (e) {
        if (e.code !== 'ENOENT') {
          console.error('Error reading ' + moduleDir + '/lib/css', e);
        }
      }

      // Gather templates to expose
      try {
        FS.readdirSync(moduleDir + '/lib/template').sort().forEach(function(filename) {
          var ext = Path.extname(filename).toLowerCase();
          var base = Path.basename(filename, ext);
          if (ext === '.html') {
            templates.add({id:appName + '-' + base, path:moduleDir + '/lib/template/' + filename});
          }
        });
      } catch (e) {
        if (e.code !== 'ENOENT') {
          console.error('Error reading ' + moduleDir + '/lib/template', e);
        }
      }

      // Gather images
      try {
        FS.readdirSync(moduleDir + '/lib/image').sort().forEach(function(filename) {
          var ext = Path.extname(filename).toLowerCase();
          var base = Path.basename(filename, ext);
          if (ext.match('\\.jpg|\\.jpeg|\\.ico|\\.bmp|\\.tif|\\.tiff|\\.gif')) {
            images[base] = appPath + 'image/' + filename;
          }
        });
      } catch (e) {
        if (e.code !== 'ENOENT') {
          console.error('Error reading ' + moduleDir + '/lib/image', e);
        }
      }

      // Match views to their icon image (if available)
      for (var viewName in views) {
        views[viewName] = {icon: images[viewName]};
      }

      // Record app information
      t.apps[appName] = {
        label: packageJson.label,
        description: packageJson.description,
        moduleDir: moduleDir,
        server: server,
        staticServer: Connect['static'](Path.join(moduleDir, '/view')),
        views: views,
        css: css
      };

      return appName;

    },

    /**
    * Stop processing inbound web and monitor traffic
    *
    * This method stops accepting new inbound monitor connections, and closes
    * all existing monitor connections associated with the server.
    *
    * @method stop
    * @param callback {Function(error)} - Called when the server has stopped
    */
    /**
    * The server has stopped
    *
    * This event is fired after the server has stopped accepting inbound
    * connections, and has closed all existing connections and released
    * associated resources.
    *
    * @event stop
    */
    stop: function(callback) {
      var t = this, server = t.get('server');
      callback = callback || function(){};

      // Unwatch all template files
      t.get('templates').forEach(function(template) {
        template.unWatchFile();
      });

      // Don't stop more than once.
      if (!t.isListening) {
        return callback();
      }

      // Shut down the server
      t.isListening = false;
      t.monitorServer.stop(function(error) {
        if (!error) {
          // Disregard close exception
          try {
            server.close();
          } catch (e) {}
          t.trigger('stop');
        }
        return callback(error);
      });
    }
  });

  /**
  * Constructor for a list of Server objects
  *
  *     var myList = new Server.List(initialElements);
  *
  * @static
  * @method List
  * @param [items] {Array} Initial list items.  These can be raw JS objects or Server data model objects.
  * @return {Backbone.Collection} Collection of Server data model objects
  */
  Server.List = Backbone.Collection.extend({model: Server});

  /**
  * Route application objects to their application site_db.
  *
  * This hooks FileSync.getFullPath to return the path to the object under the app DB
  */
  process.nextTick(function(){
    var proto = Monitor.SyncProbe.FileSyncProbe.prototype;
    proto.origGetFullPath = proto.getFullPath;
    proto.getFullPath = function(modelId, callback) {
      var t = this,
          fullPath = null;

      // Forward to the original version if not an app object
      if (modelId.indexOf('/app/') !== 0) {
        return t.origGetFullPath(modelId, callback);
      }

      // Process an /app/{appName} type modelId
      var parts = modelId.split('/'),
          appName = parts[2],
          appDef = UI.Server.currentServer.apps[appName];

      // No app with that name.  Use original path.
      if (!appDef) {
        return t.origGetFullPath(modelId, callback);
      }

      // Set a different dirPath & forward to the original method for processing
      parts.splice(1,2); // remove app/{appName} from the modelId
      var appModelId = parts.join('/');
      t.dirPath = Path.join(appDef.moduleDir, 'site_db', t.get('className'));
      return t.origGetFullPath(appModelId, callback);
    };
  });

}(this));
