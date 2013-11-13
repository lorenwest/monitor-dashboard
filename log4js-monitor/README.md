log4js-monitor
==============

Log4js Monitor

Installing log4js-monitor
--------------

Install log4js-monitor globally so probes are available in your application, and custom views are discovered by node monitor.

  npm install -g log4js-monitor


Installing log4js-monitor Probes
--------------

log4js-monitor probes are placed in your application by including monitor and log4js-monitor in your package.json file:

    "dependencies": {
      "monitor": ">=0.6.0 <0.7.0",
      "log4js-monitor": ">=0.1.0 <0.2.0",
      ...

Then including them in your application startup:

    ...
    require('monitor').start();
    require('log4js-monitor');
    ...

Monitoring
--------------

Once running in your application, log4js-monitor can be viewed using the node monitor dashboard.

    npm install -g monitor-dashboard
    npm start monitor-dashboard

See [monitor-dashboard](http://lorenwest.github.io/monitor-dashboard) for more information about the node monitor dashboard.
