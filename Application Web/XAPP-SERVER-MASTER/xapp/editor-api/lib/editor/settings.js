
var apiUtils = require("../util");
var runtimeAPI;
var sshkeys = require("./sshkeys");

module.exports = {
    init: function(settings, _runtimeAPI) {
        runtimeAPI = _runtimeAPI;
        sshkeys.init(settings, runtimeAPI);
    },
    userSettings: function(req, res) {
        var opts = {
            user: req.user
        }
        runtimeAPI.settings.getUserSettings(opts).then(function(result) {
            res.json(result);
        });
    },
    updateUserSettings: function(req,res) {
        var opts = {
            user: req.user,
            settings: req.body
        }
        runtimeAPI.settings.updateUserSettings(opts).then(function(result) {
            res.status(204).end();
        }).catch(function(err) {
            apiUtils.rejectHandler(req,res,err);
        });
    },
    sshkeys: function() {
        return sshkeys.app()
    }
}
