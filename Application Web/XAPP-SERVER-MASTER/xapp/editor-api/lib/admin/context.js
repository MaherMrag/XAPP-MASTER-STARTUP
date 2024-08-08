var apiUtils = require("../util");

var runtimeAPI;


module.exports = {
    init: function(_runtimeAPI) {
        runtimeAPI = _runtimeAPI;
    },

    get: function(req,res) {
        var opts = {
            user: req.user,
            scope: req.params.scope,
            id: req.params.id,
            key: req.params[0],
            store: req.query['store'],
            req: apiUtils.getRequestLogObject(req)
        }
        if (req.query['keysOnly'] !== undefined) {
            opts.keysOnly = true
        }
        runtimeAPI.context.getValue(opts).then(function(result) {
            res.json(result);
        }).catch(function(err) {
            apiUtils.rejectHandler(req,res,err);
        })
    },

    delete: function(req,res) {
        var opts = {
            user: req.user,
            scope: req.params.scope,
            id: req.params.id,
            key: req.params[0],
            store: req.query['store'],
            req: apiUtils.getRequestLogObject(req)
        }
        runtimeAPI.context.delete(opts).then(function(result) {
            res.status(204).end();
        }).catch(function(err) {
            apiUtils.rejectHandler(req,res,err);
        })
    }
}
