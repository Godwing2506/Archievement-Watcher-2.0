"use strict";

// Wrapper for watchdog that handles native module errors  

// Helper function to safely require modules
function safeRequire(modPath, optional = false) {
  try {
    return require(modPath);
  } catch(err) {
    if (optional || err.code === 'MODULE_NOT_FOUND') {
      console.error(`[WARNING] Failed to load optional module: ${modPath}`);
      return null;
    }
    throw err;
  }
}

// Backup original require
const Module = require('module');
const originalRequire = Module.prototype.require;

// Override require to catch native module errors
Module.prototype.require = function(id) {
  try {
    return originalRequire.apply(this, arguments);
  } catch (err) {
    // Handle native module binding errors
    if (err.message && err.message.includes('Could not locate the bindings file')) {
      console.error(`[WARNING] Native module binding not found for: ${id}`);
      console.error(`Original error: ${err.message}`);
      return null;
    }
    
    if (err.message && err.message.includes('EINVAL')) {
      console.error(`[WARNING] Cannot load native module: ${id}`);
      return null;
    }
    
    throw err;
  }
};

// Now require and start the main watchdog
try {
  require('./watchdog.js');
} catch (err) {
  if (err.message && (
    err.message.includes('Could not locate the bindings file') || 
    err.message.includes('EINVAL') ||
    err.message.includes('win-screen-resolution')
  )) {
    console.error('[ERROR] Failed to start watchdog due to native module issues');
    console.error(`Error: ${err.message}`);
    console.error('\nAttempting to start with limited functionality...');
    
    // Try to require watchdog.js but catch the error
    try {
      delete require.cache[require.resolve('./watchdog.js')];
      require('./watchdog.js');
    } catch (retryErr) {
      console.error('[FATAL] Could not start watchdog');
      process.exit(1);
    }
  } else {
    throw err;
  }
}
