// NetworkMap.js (c) 2010-2014 Loren West and other contributors
// May be freely distributed under the MIT license.
// For further details and documentation:
// http://github.com/lorenwest/monitor-dashboard
(function(root){

  // Module loading - this runs server-side only
  var Monitor = root.Monitor || require('monitor'),
      _ = Monitor._,
      log = Monitor.getLogger('NetworkMap'),
      Probe = Monitor.Probe;

  /**
  * Probe for exposing and managing the map of servers known to this network.
  * This is designed to support client-side discovery for connecting a probe.
  *
  * The map looks like this:
  *
  *     hostName1: {
  *       appName1: {
  *         instances: [array, of, instance, ids],
  *         probeClasses: ['array','of','available','probe','classes']
  *       },
  *       appName2: {...}
  *     },
  *     hostName2: {...}
  *
  * The 'localhost' server in the map represents this server process.
  *
  * @class NetworkMap
  * @extends Probe
  * @constructor
  * @param [model] - Probe data model.
  *     @param model.map {Object} Site map (see above for definition)
  *
  */
  var NetworkMap = Monitor.NetworkMap = Probe.extend({

    probeClass: 'NetworkMap',
    defaults: {
      map: {}
    },

    initialize: function(attributes, options){
      var t = this,
          router = Monitor.getRouter();

      // Build the initial site map, updating as connections come and go
      t.updateSequence = 0,
      t.buildNetworkMap();
      router.on('connection:add connection:remove', t.buildNetworkMap, t);
    },

    /**
    * Attempt to add a server to the site map.
    *
    * This probe control is called to ping a montor server with the specified
    * host name.  If a monitor server is available on the specified host, it
    * will be added to the site map, causing the probe to be updated with the
    * server information.
    *
    * @method pingServer_control
    * @param hostName {String} Server host name
    * @param callback {Function(error)}
    *     @param callback.error {Mixed} Set if this couldn't connect with any
    *            monitor processes on the specified server.
    */
    pingServer_control: function(hostName, callback) {

      //
      // Monitor.getRouter().addHostConnections(hostName, function(error) {
      //   if (error) {callback(error);}
    },

    // This builds a new site map, and sets it into the map property
    // if it is different from the current map.
    buildNetworkMap: function() {
      var t = this,
          map = {},
          router = Monitor.getRouter(),
          hostName = Monitor.getRouter().getHostName(),
          appName = Monitor.Config.Monitor.appName,
          appInstance = process.env.NODE_APP_INSTANCE;

      // Add this process to the map
      map[hostName] = {};
      map[hostName][appName] = {
        instances: [appInstance],
        probeClasses: _.keys(Probe.classes)
      };

      // Process all known connections
      var connections = router.findConnections();
      connections.forEach(function(connection) {
        hostName = connection.get('hostName') || connection.get('remoteHostName');
        appName = connection.get('remoteAppName') || '';
        appInstance = connection.get('remoteAppInstance') || '';

        // Don't add to the map not yet connected
        if (connection.connecting || !connection.connected) {
          return;
        }

        // Add the hostname to the map
        var host = map[hostName];
        if (!host) {
          host = map[hostName] = {};
        }

        // Add the app to the map
        var app = host[appName];
        if (!app) {
          app = host[appName] = {
            instances: [appInstance],
            probeClasses: connection.get('remoteProbeClasses')
          };
        } else {
          app.instances.push(appInstance);
        }
      });
      log.info('buildMap', map);

      // Set the map if it's changed.  This method is called whenever
      // connections come and go - including firewalled connections which
      // aren't visible in the map.  Only update if the map has changed.
      if (!_.isEqual(map, t.get('map'))) {
        log.info('mapChanged');
        t.set({
          map: map,
          updateSequence: t.updateSequence++
        });
      } else {
        log.info('mapNotChanged');
      }
    },

    // Remove event handlers on probe release
    release: function() {
      var t = this,
          router = Monitor.getRouter();
      router.off('connection:add connection:remove', t.buildNetworkMap, t);
    }

  });

}(this));
