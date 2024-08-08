

var fs = require('fs-extra');
var fspath = require("path");

var log = require("../../../../util").log; // TODO: separate module

var util = require("./util");

var sessionsFile;
var settings;

module.exports = {
    init: function(_settings) {
        settings = _settings;
        sessionsFile = fspath.join(settings.userDir,".sessions.json");
    },
    getSessions: async function() {
        return new Promise(function(resolve,reject) {
            fs.readFile(sessionsFile,'utf8',function(err,data){
                if (!err) {
                    try {
                        return resolve(util.parseJSON(data));
                    } catch(err2) {
                        log.trace("Corrupted sessions file - resetting");
                    }
                }
                resolve({});
            })
        });
    },
    saveSessions: async function(sessions) {
        if (settings.readOnly) {
            return;
        }
        return util.writeFile(sessionsFile,JSON.stringify(sessions));
    }
}
