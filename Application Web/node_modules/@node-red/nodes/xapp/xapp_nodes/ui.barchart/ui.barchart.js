var when = require('when')
module.exports = function (RED) {
    var ui = require('../ui')(RED);
    var ChartIdList = {};

    function BarChart(config) {
        RED.nodes.createNode(this, config);
        this.chartType = config.chartType || "line";
        this.newStyle = (!config.hasOwnProperty("useOldStyle") || (config.useOldStyle === true)) ? false : true;
        var node = this;
        var group = RED.nodes.getNode(config.group);
        this.datapoints = config.datapoints;
        if (!group) { return; }
        var tab = RED.nodes.getNode(group.config.tab);
        if (!tab) { return; }
        if (config.width === "0") { delete config.width; }
        if (config.height === "0") { delete config.height; }
        // number of pixels wide the chart will be... 43 = sizes.sx - sizes.px
        var pixelsWide = ((config.width || group.config.width || 6) - 1) * 43 - 15;
        if (!tab || !group) { return; }
        var dnow = Date.now();

        this.Unit = config.Unit;
        this.xformat = config.xformat;

        var options = {
            emitOnlyNewValues: true,
            node: node,
            tab: tab,
            group: group,
            control: {
                type: 'chart',
                look: node.chartType,
                order: config.order,
                label: config.label,
                legend: config.legend || false,
                interpolate: config.interpolate,
                nodata: config.nodata,
                width: parseInt(config.width || group.config.width || 6),
                height: parseInt(config.height || group.config.width / 2 + 1 || 4),
                ymin: config.ymin,
                ymax: config.ymax,
                dot: config.dot || false,
                xformat: config.xformat || "HH:mm:ss",
                cutout: parseInt(config.cutout || 0),
                colors: config.colors,
                useOneColor: config.useOneColor || false,
                animation: false,
                spanGaps: false,
                options: {},
            },

        };




    }
    RED.nodes.registerType("ui.barchart", BarChart);





};

