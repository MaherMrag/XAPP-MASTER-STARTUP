

var fs = require('fs-extra');
var fspath = require("path");

var log = require("../../../../util").log; // TODO: separate module

var util = require("./util");
var library = require("./library");
var sessions = require("./sessions");
var runtimeSettings = require("./settings");
var projects = require("./projects");

var initialFlowLoadComplete = false;
var settings;

function checkForConfigFile(dir) {
    return fs.existsSync(fspath.join(dir,".config.json")) ||
           fs.existsSync(fspath.join(dir,".config.nodes.json"))
}

var localfilesystem = {
    init: async function(_settings, runtime) {
        settings = _settings;

        if (!settings.userDir) {
            if (checkForConfigFile(process.env.NODE_RED_HOME)) {
                settings.userDir = process.env.NODE_RED_HOME
            } else if (process.env.HOMEPATH && checkForConfigFile(fspath.join(process.env.HOMEPATH,".node-red"))) {
                settings.userDir = fspath.join(process.env.HOMEPATH,".node-red");
            } else {
                settings.userDir = fspath.join(process.env.HOME || process.env.USERPROFILE || process.env.HOMEPATH || process.env.NODE_RED_HOME,".node-red");
            }
        }
        if (!settings.readOnly) {
            await fs.ensureDir(fspath.join(settings.userDir,"node_modules"));
        }
        sessions.init(settings);
        await runtimeSettings.init(settings);
        await library.init(settings);
        await projects.init(settings, runtime);

        var packageFile = fspath.join(settings.userDir,"package.json");

        if (!settings.readOnly) {
            try {
                fs.statSync(packageFile);
            } catch(err) {
                var defaultPackage = {
                    "name": "node-red-project",
                    "description": "A Node-RED Project",
                    "version": "0.0.1",
                    "private": true
                };
                return util.writeFile(packageFile,JSON.stringify(defaultPackage,"",4));
            }
        }
    },


    getFlows: projects.getFlows,
    saveFlows: projects.saveFlows,
    getCredentials: projects.getCredentials,
    saveCredentials: projects.saveCredentials,

    getSettings: runtimeSettings.getSettings,
    saveSettings: runtimeSettings.saveSettings,
    getSessions: sessions.getSessions,
    saveSessions: sessions.saveSessions,
    getLibraryEntry: library.getLibraryEntry,
    saveLibraryEntry: library.saveLibraryEntry,
    projects: projects
};

module.exports = localfilesystem;
