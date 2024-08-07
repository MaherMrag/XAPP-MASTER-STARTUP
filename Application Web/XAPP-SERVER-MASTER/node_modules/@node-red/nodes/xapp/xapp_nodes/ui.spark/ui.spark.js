
module.exports = function (RED) {
    function SparkNode(config) {
        RED.nodes.createNode(this, config);

        var node = this;
        this.tag = config.tag;

    }
    RED.nodes.registerType("ui.spark", SparkNode);

};

