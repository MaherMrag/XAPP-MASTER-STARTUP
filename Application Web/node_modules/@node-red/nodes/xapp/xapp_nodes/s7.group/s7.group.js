module.exports = (RED) => {
  function S7Group(n) {
    RED.nodes.createNode(this, n);
    var node = this;
    node.id = n.id;
    node.connection = n.connection;
    node.type = n.type;
    node.topic = n.topic;
    node.name = n.name;

    node.nodeTiming = {
      repeat: 1,
      stateIntervalHandle: null,
    };

/*     node.nodeTiming.stateIntervalHandle = setInterval(() => {
      var count = 0;
      var check = false;
      RED.nodes.eachNode(function (n) {
        if ((node.id === n.group) && (n.type === 's7.io')) {
          var user = RED.nodes.getNode(n.id);
          if (user) {
            count++;
            if (user.error) check = true;
          }
        }
      });

      if (count > 0) {
        if (check) {
          node.status({ fill: 'red', shape: 'dot', text: 'error' });
        } else {
          node.status({ fill: 'green', shape: 'dot', text: 'ok' });
        }

      } else {
        node.status({ fill: 'blue', shape: 'dot', text: 'missing config' });
      }
    }, node.nodeTiming.repeat * 1000);



    node.on('close', (done) => {
      if (node.nodeTiming.stateIntervalHandle !== null) {
        clearInterval(node.nodeTiming.stateIntervalHandle);
        node.nodeTiming.stateIntervalHandle = null;
      }
    })
 */

  }

  RED.nodes.registerType('s7.group', S7Group);
};