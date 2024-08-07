var when = require('when')
module.exports = function (RED) {

    function trendNode(config) {
        RED.nodes.createNode(this, config);
        this.chartType = config.chartType || "line";




    }
    RED.nodes.registerType("s7.trend", trendNode);





};

