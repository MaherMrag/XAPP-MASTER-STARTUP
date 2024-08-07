var when = require('when');
module.exports = (RED) => {
  function mBarChart(n) {
    RED.nodes.createNode(this, n);
    this.id = n.id;
    this.type = n.type;
    this.topic = n.topic;
    this.name = n.name;
    this.payload = n.payload;
  }
  RED.nodes.registerType('m.barchart', mBarChart);
  

};



