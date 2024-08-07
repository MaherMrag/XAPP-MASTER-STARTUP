var when = require('when')
module.exports = function (RED) {
    var ui = require('../ui')(RED);
    var ChartIdList = {};

    function Inline(config) {
        RED.nodes.createNode(this, config);
 
        var node = this;
        var group = RED.nodes.getNode(config.group);
        this.payload = config.payload;

        var tab = RED.nodes.getNode(group.config.tab);

        if (config.width === "0") { delete config.width; }
        if (config.height === "0") { delete config.height; }

    }
    RED.nodes.registerType("ui.inline", Inline);



};

