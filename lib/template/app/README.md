{{appName}}
==============

{{appDescription}}

Installing {{appName}}
--------------

Install {{appName}} globally so probes are available in your application, and custom views are discovered by node monitor.

  npm install -g {{appName}}


Installing {{appName}} Probes
--------------

{{appName}} probes are placed in your application by including monitor and {{appName}} in your package.json file:

    "dependencies": {
      "monitor": ">=0.6.0 <0.7.0",
      "{{appName}}": ">=0.1.0 <0.2.0",
      ...

Then including them in your application startup:

    ...
    require('monitor').start();
    require('{{appName}}');
    ...

Monitoring
--------------

Once running in your application, {{appName}} can be viewed using the node monitor dashboard.

    npm install monitor-dashboard
    npm start monitor-dashboard

See [monitor-dashboard](http://github.com/lorenwest/monitor-dashboard) for more information about the node monitor dashboard.
