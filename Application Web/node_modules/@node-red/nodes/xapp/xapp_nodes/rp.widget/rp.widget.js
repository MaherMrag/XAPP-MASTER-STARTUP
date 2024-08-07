var when = require('when')
module.exports = function (RED) {
    var ui = require('../ui')(RED);
    var ChartIdList = {};

    function rpWidget(config) {
        RED.nodes.createNode(this, config);
 
        var node = this;
        var group = RED.nodes.getNode(config.group);
        this.payload = config.payload;

        var tab = RED.nodes.getNode(group.config.tab);

        if (config.width === "0") { delete config.width; }
        if (config.height === "0") { delete config.height; }

    }
    RED.nodes.registerType("rp.widget", rpWidget);


    var progressBar = {
        findData: function (nn, date) {
            return new Promise(function (resolve, reject) {
                setTimeout(() => nn.findData(date,"sum", (data) => {
                    resolve(data);
                }), 200);
            })
        },
        getData: function (req, res) {
            var legend = [];
            var datasets = {};
            var backgroundColor = [];
            var data = [];
            var response = {}
            var id = req.params.id;
            var node = RED.nodes.getNode(id);

            var date = req.body;
            var promises = [];
            for (var id in node.payload) {
                if (node.payload.hasOwnProperty(id)) {
                    var id = node.payload[id].id;
                    var nn = RED.nodes.getNode(id);
                    legend.push(node.payload[id].name)
                    backgroundColor.push(node.payload[id].color);
                    promises.push(progressBar.findData(nn, date))
                }
            }

            when.settle(promises).then(function (result) {
                result.forEach(function (res) {
                    data.push({ value: res.value.value, name: res.value.name })

                })

                datasets = { data: data, backgroundColor: backgroundColor }
                response = { legend: legend, datasets: datasets }
                res.json(response);
            })
        },

    }



    //Get Data Line Chart By ID
    RED.httpAdmin.post("/progressBar/:id", progressBar.getData);


};

