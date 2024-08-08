

var i18n = require("../../../util").i18n; // TODO: separate module

var runtimeAPI;

function loadResource(lang, namespace) {
    var catalog = i18n.i.getResourceBundle(lang, namespace);
    if (!catalog) {
        var parts = lang.split("-");
        if (parts.length == 2) {
            var new_lang = parts[0];
            return i18n.i.getResourceBundle(new_lang, namespace);
        }
    }
    return catalog;
}

module.exports = {
    init: function(_runtimeAPI) {
        runtimeAPI = _runtimeAPI;
    },
    get: function(req,res) {
        var namespace = req.params[0];
        namespace = namespace.replace(/\.json$/,"");
        var lang = req.query.lng || i18n.defaultLang; //apiUtil.determineLangFromHeaders(req.acceptsLanguages() || []);
        if (/[^0-9a-z=\-\*]/i.test(lang)) {
            res.json({});
            return;
        }
        var prevLang = i18n.i.language;
        // Trigger a load from disk of the language if it is not the default
        i18n.i.changeLanguage(lang, function(){
            i18n.i.changeLanguage(prevLang, function() {
                var catalog = loadResource(lang, namespace);
                res.json(catalog||{});
            });
        });
    }
}
