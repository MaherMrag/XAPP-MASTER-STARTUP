var apiUtils = require("../util");

var runtimeAPI;

module.exports = {
    init: function(_runtimeAPI) {
        runtimeAPI = _runtimeAPI;
    },
    getAll: function(req,res) {
        var opts = {
            user: req.user,
            req: apiUtils.getRequestLogObject(req)
        }
        if (req.get("accept") == "application/json") {
            runtimeAPI.nodes.getNodeList(opts).then(function(list) {
                res.json(list);
            })
        } else {
            opts.lang = apiUtils.determineLangFromHeaders(req.acceptsLanguages());
            if (/[^0-9a-z=\-\*]/i.test(opts.lang)) {
                opts.lang = "en-US";
            }
            runtimeAPI.nodes.getNodeConfigs(opts).then(function(configs) {
                res.send(configs);
            })
        }
    },

    post: function(req,res) {
        var opts = {
            user: req.user,
            module: req.body.module,
            version: req.body.version,
            url: req.body.url,
            tarball: undefined,
            req: apiUtils.getRequestLogObject(req)
        }
        if (!runtimeAPI.settings.editorTheme || !runtimeAPI.settings.editorTheme.palette || runtimeAPI.settings.editorTheme.palette.upload !== false) {
            if (req.file) {
                opts.tarball = {
                    name: req.file.originalname,
                    size: req.file.size,
                    buffer: req.file.buffer
                }
            }
        }
        runtimeAPI.nodes.addModule(opts).then(function(info) {
            res.json(info);
        }).catch(function(err) {
            console.log(err.stack);
            apiUtils.rejectHandler(req,res,err);
        })
    },

    delete: function(req,res) {
        var opts = {
            user: req.user,
            module: req.params[0],
            req: apiUtils.getRequestLogObject(req)
        }
        runtimeAPI.nodes.removeModule(opts).then(function() {
            res.status(204).end();
        }).catch(function(err) {
            apiUtils.rejectHandler(req,res,err);
        })
    },

    getSet: function(req,res) {
        var opts = {
            user: req.user,
            id: req.params[0] + "/" + req.params[2],
            req: apiUtils.getRequestLogObject(req)
        }
        if (req.get("accept") === "application/json") {
            runtimeAPI.nodes.getNodeInfo(opts).then(function(result) {
                res.send(result);
            }).catch(function(err) {
                apiUtils.rejectHandler(req,res,err);
            })
        } else {
            opts.lang = apiUtils.determineLangFromHeaders(req.acceptsLanguages());
            if (/[^0-9a-z=\-\*]/i.test(opts.lang)) {
                opts.lang = "en-US";
            }
            runtimeAPI.nodes.getNodeConfig(opts).then(function(result) {
                return res.send(result);
            }).catch(function(err) {
                apiUtils.rejectHandler(req,res,err);
            })
        }
    },

    getModule: function(req,res) {
        var opts = {
            user: req.user,
            module: req.params[0],
            req: apiUtils.getRequestLogObject(req)
        }
        runtimeAPI.nodes.getModuleInfo(opts).then(function(result) {
            res.send(result);
        }).catch(function(err) {
            apiUtils.rejectHandler(req,res,err);
        })
    },

    putSet: function(req,res) {
        var body = req.body;
        if (!body.hasOwnProperty("enabled")) {
            // log.audit({event: "nodes.module.set",error:"invalid_request"},req);
            res.status(400).json({code:"invalid_request", message:"Invalid request"});
            return;
        }
        var opts = {
            user: req.user,
            id: req.params[0] + "/" + req.params[2],
            enabled: body.enabled,
            req: apiUtils.getRequestLogObject(req)
        }
        runtimeAPI.nodes.setNodeSetState(opts).then(function(result) {
            res.send(result);
        }).catch(function(err) {
            apiUtils.rejectHandler(req,res,err);
        })
    },

    putModule: function(req,res) {
        var body = req.body;
        if (!body.hasOwnProperty("enabled")) {
            // log.audit({event: "nodes.module.set",error:"invalid_request"},req);
            res.status(400).json({code:"invalid_request", message:"Invalid request"});
            return;
        }
        var opts = {
            user: req.user,
            module: req.params[0],
            enabled: body.enabled,
            req: apiUtils.getRequestLogObject(req)
        }
        runtimeAPI.nodes.setModuleState(opts).then(function(result) {
            res.send(result);
        }).catch(function(err) {
            apiUtils.rejectHandler(req,res,err);
        })

    },

    getModuleCatalog: function(req,res) {
        var opts = {
            user: req.user,
            module: req.params[0],
            lang: req.query.lng,
            req: apiUtils.getRequestLogObject(req)
        }
        if (/[^0-9a-z=\-\*]/i.test(opts.lang)) {
            opts.lang = "en-US";
        }
        runtimeAPI.nodes.getModuleCatalog(opts).then(function(result) {
            res.json(result);
        }).catch(function(err) {
            console.log(err.stack);
            apiUtils.rejectHandler(req,res,err);
        })
    },

    getModuleCatalogs: function(req,res) {
        var opts = {
            user: req.user,
            lang: req.query.lng,
            req: apiUtils.getRequestLogObject(req)
        }
        if (/[^0-9a-z=\-\*]/i.test(opts.lang)) {
            opts.lang = "en-US";
        }
        runtimeAPI.nodes.getModuleCatalogs(opts).then(function(result) {
            res.json(result);
        }).catch(function(err) {
            console.log(err.stack);
            apiUtils.rejectHandler(req,res,err);
        })
    },

    getIcons: function(req,res) {
        var opts = {
            user: req.user,
            req: apiUtils.getRequestLogObject(req)
        }
        runtimeAPI.nodes.getIconList(opts).then(function(list) {
            res.json(list);
        });
    }
};
