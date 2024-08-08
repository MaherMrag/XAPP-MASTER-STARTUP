

const express = require("express");

const { log, i18n } = require("../../util");

module.exports = {
    errorHandler: function(err,req,res,next) {
        //TODO: why this when rejectHandler also?!

        if (err.message === "request entity too large") {
            log.error(err);
        } else {
            log.error(err.stack);
        }
        log.audit({event: "api.error",error:err.code||"unexpected_error",message:err.toString()},req);
        res.status(400).json({error:"unexpected_error", message:err.toString()});
    },

    determineLangFromHeaders: function(acceptedLanguages){
        var lang = i18n.defaultLang;
        acceptedLanguages = acceptedLanguages || [];
        if (acceptedLanguages.length >= 1) {
            lang = acceptedLanguages[0];
        }
        return lang;
    },
    rejectHandler: function(req,res,err) {
        //TODO: why this when errorHandler also?!
        log.audit({event: "api.error",error:err.code||"unexpected_error",message:err.message||err.toString()},req);
        if (!err.code) {
            // by definition, an unexpected_error to log
            log.error(err);
        }
        var response = {
            code: err.code||"unexpected_error",
            message: err.message||err.toString()
        };
        // Handle auth failures on a specific remote
        // TODO: don't hardcode this here - allow users of rejectHandler to identify extra props to send
        if (err.remote) {
            response.remote = err.remote;
        }
        res.status(err.status||400).json(response);
    },
    getRequestLogObject: function(req) {
        return {
            user: req.user,
            path: req.path,
            ip: (req.headers && req.headers['x-forwarded-for']) || (req.connection && req.connection.remoteAddress) || undefined
        }
    },
    createExpressApp: function(settings) {
        const app = express();
    
        const defaultServerSettings = {
            "x-powered-by": false
        }
        const serverSettings = Object.assign({},defaultServerSettings,settings.httpServerOptions||{});
        for (let eOption in serverSettings) {
            app.set(eOption, serverSettings[eOption]);
        }
        return app
    }
}
