
var runtimeAPI;
var settings;
var theme = require("../editor/theme");
var clone = require("clone");

var i18n = require("../../../util").i18n

function extend(target, source) {
    var keys = Object.keys(source);
    var i = keys.length;
    while(i--) {
        var value = source[keys[i]]
        var type = typeof value;
        if (type === 'string' || type === 'number' || type === 'boolean' || Array.isArray(value)) {
            target[keys[i]] = value;
        } else if (value === null) {
            if (target.hasOwnProperty(keys[i])) {
                delete target[keys[i]];
            }
        } else {
            // Object
            if (target.hasOwnProperty(keys[i])) {
                target[keys[i]] = extend(target[keys[i]],value);
            } else {
                target[keys[i]] = value;
            }
        }
    }
    return target;
}

module.exports = {
    init: function(_settings,_runtimeAPI) {
        runtimeAPI = _runtimeAPI;
        settings = _settings;
    },
    runtimeSettings: function(req,res) {
        var opts = {
            user: req.user
        }
        runtimeAPI.settings.getRuntimeSettings(opts).then(function(result) {
            if (!settings.disableEditor) {
                result.editorTheme = result.editorTheme||{};
                var themeSettings = theme.settings();
                if (themeSettings) {
                    // result.editorTheme may already exist with the palette
                    // disabled. Need to merge that into the receive settings
                    result.editorTheme = extend(clone(themeSettings),result.editorTheme);
                }
                result.editorTheme.languages = i18n.availableLanguages("editor");
            }
            res.json(result);
        });
    },

}
