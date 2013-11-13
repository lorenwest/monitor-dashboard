var Monitor = require('monitor'),
    Probe = Monitor.Probe;

// Probes are Backbone models. They self-register when extending the Probe class.
Probe.extend({

  // A unique probe class name is required
  probeClass: '{{shortAppName}}SampleProbe',

  // Set the initial probe state
  initialize: function(){

    // Set the initial data
    // this.set(...);

    // Attach listeners to the things you're probing.
    // Changing the state of this probe will forward those
    // changes to all monitors connected to the probe.

  }
});
