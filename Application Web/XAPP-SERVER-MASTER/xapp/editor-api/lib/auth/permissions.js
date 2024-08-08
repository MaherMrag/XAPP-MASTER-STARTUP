
var util = require('util');

var readRE = /^((.+)\.)?read$/
var writeRE = /^((.+)\.)?write$/

function hasPermission(userScope,permission) {
    if (permission === "") {
        return true;
    }
    var i;

    if (Array.isArray(permission)) {
        // Multiple permissions requested - check each one
        for (i=0;i<permission.length;i++) {
            if (!hasPermission(userScope,permission[i])) {
                return false;
            }
        }
        // All permissions check out
        return true;
    }

    if (Array.isArray(userScope)) {
        if (userScope.length === 0) {
            return false;
        }
        for (i=0;i<userScope.length;i++) {
            if (hasPermission(userScope[i],permission)) {
                return true;
            }
        }
        return false;
    }

    if (userScope === "*" || userScope === permission) {
        return true;
    }

    if (userScope === "read" || userScope === "*.read") {
        return readRE.test(permission);
    } else if (userScope === "write" || userScope === "*.write") {
        return writeRE.test(permission);
    }
    return false;
}

module.exports = {
    hasPermission: hasPermission,
}
