

var apiUtils = require("../util");
var runtimeAPI;
var settings;

module.exports = {
    init: function(_settings, _runtimeAPI) {
        runtimeAPI = _runtimeAPI;
        settings = _settings;
    },
    app: function() {
        const app = apiUtils.createExpressApp(settings);

        // List all SSH keys
        app.get("/", function(req,res) {
            var opts = {
                user: req.user
            }
            runtimeAPI.settings.getUserKeys(opts).then(function(list) {
                res.json({
                    keys: list
                });
            }).catch(function(err) {
                apiUtils.rejectHandler(req,res,err);
            });
        });

        // Get SSH key detail
        app.get("/:id", function(req,res) {
            var opts = {
                user: req.user,
                id: req.params.id
            }
            runtimeAPI.settings.getUserKey(opts).then(function(data) {
                res.json({
                    publickey: data
                });
            }).catch(function(err) {
                apiUtils.rejectHandler(req,res,err);
            });
        });

        // Generate a SSH key
        app.post("/", function(req,res) {
            var opts = {
                user: req.user,
                id: req.params.id
            }
            // TODO: validate params
            opts.name = req.body.name;
            opts.password = req.body.password;
            opts.comment = req.body.comment;
            opts.size = req.body.size;

            runtimeAPI.settings.generateUserKey(opts).then(function(name) {
                res.json({
                    name: name
                });
            }).catch(function(err) {
                apiUtils.rejectHandler(req,res,err);
            });
        });

        // Delete a SSH key
        app.delete("/:id", function(req,res) {
            var opts = {
                user: req.user,
                id: req.params.id
            }
            runtimeAPI.settings.removeUserKey(opts).then(function(name) {
                res.status(204).end();
            }).catch(function(err) {
                apiUtils.rejectHandler(req,res,err);
            });
        });

        return app;
    }
}
