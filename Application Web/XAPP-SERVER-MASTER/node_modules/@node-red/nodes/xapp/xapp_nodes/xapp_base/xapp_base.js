module.exports = function (RED) {
    var ui = require('../ui')(RED);
    var path= require('path');
    var node;

    function XappBaseNode(n) {
        RED.nodes.createNode(this, n);
        
        node = this;

        this.send(msg);

        // respond to inputs....
        this.on('input', function (msg) {
            node.warn("I saw a payload: "+msg.payload);
            // in this example just send it straight on... should process it here really
            node.send(msg);
        });

        this.on("close", function() {
            // Called when the node is shutdown - eg on redeploy.
            // Allows ports to be closed, connections dropped etc.
            // eg: node.client.disconnect();
        });
        
    }
    RED.nodes.registerType("xapp_base", XappBaseNode);

    RED.httpAdmin.get('/xapp_base/js/*', function(req, res) {
        var filename = path.join(__dirname , '../xapp_assets/js', req.params[0]);
        res.sendFile(filename, function (err) {
            if (err) {
                if (node) {
                    node.warn(filename + " not found. Maybe running in dev mode.");
                }
                else {
                    console.log("xapp_base - error:",err);
                }
            }
        });
    });

    RED.httpAdmin.get('/xapp_base/css/*', function(req, res) {
        var filename = path.join(__dirname , '../xapp_assets/css', req.params[0]);
        res.sendFile(filename, function (err) {
            if (err) {
                if (node) {
                    node.warn(filename + " not found. Maybe running in dev mode.");
                }
                else {
                    console.log("xapp_base - error:",err);
                }
            }
        });
    });
}