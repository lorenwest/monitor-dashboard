(function(root){

  // Module loading
  var Monitor = root.Monitor || require('monitor'),
      UI = Monitor.UI,
      Backbone = Monitor.Backbone;

  // Define the app on first load
  UI.app.{{shortAppName}} = UI.app.{{shortAppName}} || {};

  /**
  * Sample view for the {{appName}} application
  *
  * @class {{shortAppName}}SampleView
  * @extends Backbone.View
  * @method initialize
  * @param options {Object} View initialization options
  *     @param options.el {$Selector} The view container element (.nm-cv-viewport)
  *     @param options.pageView {PageView} The singleton web page view object
  *     @param options.component {Component} The containing component data model object
  *     @param options.componentView {ComponentView} The containing component view object
  *     @param options.viewOptions {Object} View options set by the view settings form
  *     @param options.monitor {Monitor} The monitor defined by the view.
  *            Generally not in a connected state until this.render() is called.
  *            Each view is given one monitor.  It can choose to use it or not,
  *            or it can choose to create multiple monitors if necessary.
  */
  var SampleView = UI.app.{{shortAppName}}.SampleView = Backbone.View.extend({

    // Define the view
    name: '{{shortAppName}}SampleView',
    description: 'A sample view for the {{shortAppName}} app',
    icon: '',  // Add an image for the component picker: /image/my_image.jpg
    tags: [],  // Add your view to the categories listed in these tags

    // Called by the Backbone.View constructor
    initialize: function(options) {
      var t = this;
      t.options = options;
      t.monitor = options.monitor;

      // Call this to set the initial height/width to something
      // other than the size of the inner view elements.
      options.component.setDefaultSize({
        width: 400,
        height: 300
      });

      // Set monitor defaults.  If your view is for a specific probe,
      // then set the probeClass and any default probe initialization
      // parameters.
      if (!t.monitor.get('probeClass')) {
        t.monitor.set({
          probeClass: '{{shortAppName}}SampleProbe'
        });
      }

      // Update the view on monitor change.  The monitor isn't in
      // a connected state, so this will be called when connected.
      if (t.monitor != null) {
        t.monitor.on('change', t.onchange, t);
      }
    },

    // Called when the monitor state changes (after connect)
    onchange: function() {
      var t = this,
          probeData = t.options.monitor.toProbeJSON();

      // Render the monitor data
    },

    // Called to render the intial HTML view state.  Can be called by
    // onChange() as a heavyweight
    render: function(heading, title, data) {
      var t = this;

      // Render the view HTML here
      // t.options.el.html(...);
    }

  });

  /**
  * Settings page for the {{shortAppName}}SampleView view.
  *
  * This view is shown after the component title in the component settings dialog.
  *
  * @class {{shortAppName}}SampleView.SettingsView
  * @extends Backbone.View
  * @method initialize
  * @param options {Object} View initialization options
  *     @param options.model {Backbone.Model} Component viewOptions as a data model.
  *                          This can contain any data to persist along with the component.
  *     @param options.monitor {Monitor} This is the monitor associated with this view.
  *                          You can set elements such as hostName, probeClass,
  *                          initParams, or other Monitor model elements.
  *     @param options.pageView {PageView} The singleton web page view object
  *     @param options.component {Component} The containing component data model object
  *     @param options.componentView {ComponentView} The containing component view object
  */
  SampleView.SettingsView = Backbone.View.extend({

    // This is called when the settings page is opened.  The options element of this
    // view is set to the above options prior to calling render, so it doesn't have
    // to be set in an initialize method.
    render: function() {
      var t = this;

      // Append a monitor picker
      t.monitorPicker = new UI.MonitorPicker({
        el: t.$el,
        hideProbe: true,  // Set false for the user to select the probe class
        model: t.options.monitor
      });
      t.monitorPicker.render();
    }

  });

}(this));
