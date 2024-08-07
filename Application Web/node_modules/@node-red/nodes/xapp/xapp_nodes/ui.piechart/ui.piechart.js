var when = require('when')
module.exports = function (RED) {
    var ui = require('../ui')(RED);
    var ChartIdList = {};

    function PieChart(config) {
        RED.nodes.createNode(this, config);
        this.chartType = config.chartType || "line";
        

    }
    RED.nodes.registerType("ui.piechart", PieChart);

};

