(function(){
  var path = require('path');
  var r = require('@electron/remote');
  var appPath = '';
  try {
    appPath = (r.app && typeof r.app.getAppPath === 'function') ? r.app.getAppPath() : '';
  } catch(e) { appPath = ''; }
  if (typeof appPath !== 'string' || !appPath) {
    try {
      appPath = path.join(process.resourcesPath || '', 'app.asar');
    } catch(e) { appPath = ''; }
  }
  if (appPath && path.basename(appPath) === 'electron') {
    appPath = path.dirname(appPath);
  }
  globalThis.remote = r;
  globalThis.appPath = appPath;
  window.remote = r;
  window.appPath = appPath;
})();
window.$ = window.jQuery = require('../ui/lib/jquery-3.3.1.min.js');
