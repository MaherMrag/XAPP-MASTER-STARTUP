

var apiUtils = require("../util");

var runtimeAPI;

module.exports = {
    init: function(_runtimeAPI) {
        runtimeAPI = _runtimeAPI;
    },
    // getLibraryConfig: function(req,res) {
    //     var opts = {
    //         user: req.user,
    //         library: req.params.id
    //     }
    //     runtimeAPI.library.getConfig(opts).then(function(result) {
    //         res.json(result);
    //     }).catch(function(err) {
    //         apiUtils.rejectHandler(req,res,err);
    //     });
    // },
    getEntry: function(req,res) {
        var opts = {
            user: req.user,
            library: req.params[0],
            type: req.params[1],
            path: req.params[2]||""
        }
        runtimeAPI.library.getEntry(opts).then(function(result) {
            if (typeof result === "string") {
                if (opts.type === 'flows') {
                    res.writeHead(200, {'Content-Type': 'application/json'});
                } else {
                    res.writeHead(200, {'Content-Type': 'text/plain'});
                }
                res.write(result);
                res.end();
            } else {
                res.json(result);
            }
        }).catch(function(err) {
            apiUtils.rejectHandler(req,res,err);
        });
    },
    saveEntry: function(req,res) {
        var opts = {
            user: req.user,
            library: req.params[0],
            type: req.params[1],
            path: req.params[2]||""
        }
        // TODO: horrible inconsistencies between flows and all other types
        if (opts.type === "flows") {
            opts.meta = {};
            opts.body = JSON.stringify(req.body);
        } else {
            opts.meta = req.body;
            opts.body = opts.meta.text;
            delete opts.meta.text;
        }
        runtimeAPI.library.saveEntry(opts).then(function(result) {
            res.status(204).end();
        }).catch(function(err) {
            apiUtils.rejectHandler(req,res,err);
        });
    }
}
