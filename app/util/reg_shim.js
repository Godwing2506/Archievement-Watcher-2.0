'use strict';

const { execSync, exec } = require('child_process');
const path = require('path');

// Helper to parse reg query output
const parseValue = (output, valueName) => {
    const lines = output.trim().split('\r\n');
    for (const line of lines) {
        if (line.trim().startsWith(valueName)) {
            const parts = line.trim().split(/\s{4,}/); // Split by 4 or more spaces
            if (parts.length >= 3) {
                return parts[2]; // Name, Type, Value
            }
        }
    }
    return null;
};

// Sync implementation using reg.exe
const regSync = {
    RegKeyExists: (root, key) => {
        try {
            execSync(`reg query "${root}\\${key}"`, { stdio: 'ignore' });
            return true;
        } catch {
            return false;
        }
    },
    RegListAllSubkeys: (root, key) => {
        try {
            const output = execSync(`reg query "${root}\\${key}"`).toString();
            const lines = output.trim().split('\r\n');
            const subkeys = [];
            const prefix = `${root}\\${key}\\`;
            for (const line of lines) {
                if (line.trim().startsWith(root) && line.trim().length > prefix.length) {
                    subkeys.push(path.basename(line.trim()));
                }
            }
            return subkeys;
        } catch {
            return [];
        }
    },
    RegQueryStringValue: (root, key, name) => {
        try {
            // Handle default value
            const cmd = name === "" ? `reg query "${root}\\${key}" /ve` : `reg query "${root}\\${key}" /v "${name}"`;
            const output = execSync(cmd).toString();
            // Parse output manually since format varies
            // Output usually: 
            // HKEY_CURRENT_USER\...\Key
            //    Name    REG_SZ    Value
            const lines = output.split('\r\n');
            for(let line of lines) {
                line = line.trim();
                if(name === "" && line.startsWith("@")) {
                     const parts = line.split(/\s{4,}/);
                     return parts.length >= 3 ? parts[parts.length-1] : "";
                } else if (line.startsWith(name)) {
                     const parts = line.split(/\s{4,}/);
                     return parts.length >= 3 ? parts[parts.length-1] : "";
                }
            }
            return "";
        } catch {
            return "";
        }
    },
    RegQueryIntegerValue: (root, key, name) => {
        try {
            const cmd = `reg query "${root}\\${key}" /v "${name}"`;
            const output = execSync(cmd).toString();
            const lines = output.split('\r\n');
             for(let line of lines) {
                line = line.trim();
                if (line.startsWith(name)) {
                     const parts = line.split(/\s{4,}/);
                     if(parts.length >= 3) {
                         // Value is usually 0x...
                         return parseInt(parts[parts.length-1], 16);
                     }
                }
            }
            return 0;
        } catch {
            return 0;
        }
    },
    RegWriteStringValue: (root, key, name, value) => {
        try {
            const cmd = name === "" 
                ? `reg add "${root}\\${key}" /ve /d "${value}" /f`
                : `reg add "${root}\\${key}" /v "${name}" /t REG_SZ /d "${value}" /f`;
            execSync(cmd);
            return true;
        } catch {
            return false;
        }
    },
    RegWriteDwordValue: (root, key, name, value) => {
        try {
            const cmd = `reg add "${root}\\${key}" /v "${name}" /t REG_DWORD /d ${value} /f`;
            execSync(cmd);
            return true;
        } catch {
            return false;
        }
    },
    RegQueryStringValueAndExpand: (root, key, name) => {
        const val = regSync.RegQueryStringValue(root, key, name);
        if (!val) return "";
        return val.replace(/%([^%]+)%/g, (_, n) => process.env[n] || _);
    }
};

// Async wrappers
const regPromises = {
    RegKeyExists: async (root, key) => regSync.RegKeyExists(root, key),
    RegListAllSubkeys: async (root, key) => regSync.RegListAllSubkeys(root, key),
    RegQueryStringValue: async (root, key, name) => regSync.RegQueryStringValue(root, key, name),
    RegQueryIntegerValue: async (root, key, name) => regSync.RegQueryIntegerValue(root, key, name),
    RegWriteStringValue: async (root, key, name, value) => regSync.RegWriteStringValue(root, key, name, value),
    RegWriteDwordValue: async (root, key, name, value) => regSync.RegWriteDwordValue(root, key, name, value),
    RegQueryStringValueAndExpand: async (root, key, name) => regSync.RegQueryStringValueAndExpand(root, key, name)
};

module.exports = {
    ...regSync,
    promises: regPromises
};
