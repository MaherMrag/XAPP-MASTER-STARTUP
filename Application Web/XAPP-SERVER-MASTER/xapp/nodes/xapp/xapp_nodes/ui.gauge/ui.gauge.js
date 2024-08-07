module.exports = function (RED) {
    function GaugeChart(n) {
        RED.nodes.createNode(this, n);
        var node = this
        node.id = n.id;
        node.name = n.name;
        node.parentid = n.parentid;
        node.tag = n.tag;

        this.nodeTiming = {
            repeat: n.repeat || 1000,
            intervalReading: n.none, // none=true => reading once; none=false means=> interval rading
            stateIntervalHandle: null,
            once: n.once || true,
            onceDelay: (n.onceDelay || 0.1) * 1000,
            onceTimeout: null,
            cronjob: null,
            crontab: null,
        };


        node.repeaterSetup = () => {
            node.nodeTiming.stateIntervalHandle = setInterval(() => {
                var tag = RED.nodes.getNode(node.tag);
                if (tag) {

                    node.status({ fill: "green", shape: "dot", text: { value: tag.value, maxvalue: tag.maxvalue } });
                }
            }, node.nodeTiming.repeat);
        };

        //RED.events.on("nodes-started", node.startup);

        node.on('close', function () {
              if (node.nodeTiming.stateIntervalHandle !== null) {
                clearInterval(node.nodeTiming.stateIntervalHandle);
            }
        });

        // Set up Timing
        if (node.nodeTiming.once) {
            node.nodeTiming.onceTimeout = setTimeout(() => {
                node.repeaterSetup();
            }, node.nodeTiming.onceDelay);
        } else {
            node.repeaterSetup();
        }



    }
    RED.nodes.registerType("ui.gauge", GaugeChart);


};

