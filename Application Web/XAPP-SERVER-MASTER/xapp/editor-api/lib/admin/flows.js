var runtimeAPI;
var apiUtils = require("../util");

module.exports = {
    init: function(_runtimeAPI) {
        runtimeAPI = _runtimeAPI;
    },
    get: function(req,res) {
        var version = req.get("Node-RED-API-Version")||"v1";
        if (!/^v[12]$/.test(version)) {
            return res.status(400).json({code:"invalid_api_version", message:"Invalid API Version requested"});
        }
        var opts = {
            user: req.user,
            req: apiUtils.getRequestLogObject(req)
        }
        runtimeAPI.flows.getFlows(opts).then(function(result) {
            if (version === "v1") {
                res.json(result.flows);
            } else if (version === "v2") {
                res.json(result);
            }
        }).catch(function(err) {
            apiUtils.rejectHandler(req,res,err);
        })
    },
    post: function(req,res) {
        var version = req.get("Node-RED-API-Version")||"v1";
        if (!/^v[12]$/.test(version)) {
            return res.status(400).json({code:"invalid_api_version", message:"Invalid API Version requested"});
        }
        var opts = {
            user: req.user,
            deploymentType: req.get("Node-RED-Deployment-Type")||"full",
            req: apiUtils.getRequestLogObject(req)
        }

        if (opts.deploymentType !== 'reload') {
            if (version === "v1") {
                opts.flows = {flows: req.body}
            } else {
                opts.flows = req.body;
            }
        }

        runtimeAPI.flows.setFlows(opts).then(function(result) {
            if (version === "v1") {
                res.status(204).end();
            } else {
                res.json(result);
            }
        }).catch(function(err) {
            apiUtils.rejectHandler(req,res,err);
        })
    },
    getState: function(req,res) {
        const opts = {
            user: req.user,
            req: apiUtils.getRequestLogObject(req)
        }
        runtimeAPI.flows.getState(opts).then(function(result) {
            res.json(result);
        }).catch(function(err) {
            apiUtils.rejectHandler(req,res,err);
        })
    },
    postState: function(req,res) {
        const opts = {
            user: req.user,
            state: req.body.state || "",
            req: apiUtils.getRequestLogObject(req)
        }
        runtimeAPI.flows.setState(opts).then(function(result) {
            res.json(result);
        }).catch(function(err) {
            apiUtils.rejectHandler(req,res,err);
        })
    }
}
