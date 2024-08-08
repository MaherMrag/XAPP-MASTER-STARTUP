var runtimeAPI;
var apiUtils = require("../util");

module.exports = {
    init: function(_runtimeAPI) {
        runtimeAPI = _runtimeAPI;
    },
    get: function(req,res) {
        var opts = {
            user: req.user,
            id: req.params.id,
            req: apiUtils.getRequestLogObject(req)
        }
        runtimeAPI.flows.getFlow(opts).then(function(result) {
            return res.json(result);
        }).catch(function(err) {
            apiUtils.rejectHandler(req,res,err);
        })
    },
    post: function(req,res) {
        var opts = {
            user: req.user,
            flow: req.body,
            req: apiUtils.getRequestLogObject(req)
        }
        runtimeAPI.flows.addFlow(opts).then(function(id) {
            return res.json({id:id});
        }).catch(function(err) {
            apiUtils.rejectHandler(req,res,err);
        })
    },
    put: function(req,res) {
        var opts = {
            user: req.user,
            id: req.params.id,
            flow: req.body,
            req: apiUtils.getRequestLogObject(req)
        }
        runtimeAPI.flows.updateFlow(opts).then(function(id) {
            return res.json({id:id});
        }).catch(function(err) {
            apiUtils.rejectHandler(req,res,err);
        })
    },
    delete: function(req,res) {
        var opts = {
            user: req.user,
            id: req.params.id,
            req: apiUtils.getRequestLogObject(req)
        }
        runtimeAPI.flows.deleteFlow(opts).then(function() {
            res.status(204).end();
        }).catch(function(err) {
            apiUtils.rejectHandler(req,res,err);
        })
    }
}
