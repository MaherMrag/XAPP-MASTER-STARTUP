

var runtimeAPI;
var apiUtils = require("../util");

module.exports = {
    init: function(_runtimeAPI) {
        runtimeAPI = _runtimeAPI
    },
    get: function (req, res) {
        var opts = {
            user: req.user,
            type: req.params.type,
            id: req.params.id
        }
        runtimeAPI.flows.getNodeCredentials(opts).then(function(result) {
            res.json(result);
        }).catch(function(err) {
            apiUtils.rejectHandler(req,res,err);
        })
    }
}
