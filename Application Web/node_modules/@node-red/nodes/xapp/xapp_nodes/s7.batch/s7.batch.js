var when = require('when')
module.exports = (RED) => {
  var ui = require('../ui')(RED);
  function S7Batch(n) {
    RED.nodes.createNode(this, n);
    var node = this
    node.id = n.id;
    node.name = n.name;
    node.stateProperty = n.stateProperty || 'topic';
    node.statePropertyType = n.statePropertyType || 'msg';
    node.parentid = n.parentid;
    node.database = n.database;
    node.tag = n.tag;
    node.startbit = n.startbit;
    node.payload = n.payload;
    node.setpoint = n.setpoint;
    node.datapoints = [];
    node.list = [];
    node.batch = {
      id: null,
      status: null,
    }
    node.data = [];
    this.nodeTiming = {
      repeat: n.repeat,
      intervalReading: n.none, // none=true => reading once; none=false means=> interval rading
      stateIntervalHandle: null,
      once: n.once || true,
      onceDelay: (n.onceDelay || 0.1) * 1000,
      onceTimeout: null,
      cronjob: null,
      crontab: null,
    };

    node.batchTiming = {
      repeat: n.repeat || 1000,
      batchstepsHandle: null,
      once: n.once,
      onceDelay: 5000,// (n.onceDelay || 0.1) * 1000,
      onceDelyTime: null,
      cronjob: null,
      crontab: null,
    };

    var buildMessage = (value) =>
      [
        (value & 1) !== 0,
        (value & 2) !== 0,
        (value & 4) !== 0,
        (value & 8) !== 0,
        (value & 16) !== 0,
        (value & 32) !== 0,
        (value & 64) !== 0,
        (value & 128) !== 0,
        (value & 256) !== 0,
        (value & 512) !== 0,
        (value & 1024) !== 0,
        (value & 2048) !== 0,
        (value & 4096) !== 0,
        (value & 8192) !== 0,
        (value & 16384) !== 0,
        (value & 32768) !== 0
      ]

    node.current = node.old = buildMessage(0)

    node.startup = function () {
      console.log('Step :', step);
      if (node.statePropertyType === 'msg') {

        msg = {};
        RED.util.setMessageProperty(msg, node.stateProperty, node.fsm.state);
        node.send(msg);
      }
    }

    node.repeaterSetup = () => {
      node.batchTiming.batchstepsHandle = setInterval(() => {
        node.status({ fill: "green", shape: "dot", text: 'started' });
        batchsteps();
      }, node.batchTiming.repeat);
    };

    //RED.events.on("nodes-started", node.startup);

    node.on('close', function () {
      RED.events.removeListener("nodes-started", node.startup);

      if (node.batchTiming.batchstepsHandle !== null) {
        clearInterval(node.batchTiming.batchstepsHandle);
      }

      if (node.nodeTiming.onceTimeout !== null) {
        clearTimeout(node.nodeTiming.onceTimeout);
      }

    });

    // Set up Timing
    if (node.nodeTiming.once) {
      node.nodeTiming.onceTimeout = setTimeout(() => {
        node.emit('input', {});
        node.repeaterSetup();
      }, node.nodeTiming.onceDelay);
    } else {
      node.repeaterSetup();
    }

    node.on('input', (msg) => {
      console.log('msg :', msg)
    });

    function genBatchID() {
      return (1 + Math.random() * 4294967295).toString(16);
    }

    var step = 0;
    var counter = 0;
    function batchsteps() {
      var tag = RED.nodes.getNode(node.tag);
      if (tag) {
        var lst = buildMessage(tag.value)
        var startbit = lst[node.startbit];

        switch (step) {
          case 0: //Waiting for starting batch
            if (startbit) step = 1;
            break;
          case 1: //Assurer que le bit est toujours à 1 pendant 5 sec
            counter++;
            if (!startbit) { step = 0; counter = 0; }
            if (counter === 5) { step = 2; counter = 0; }
            break;
          case 2: //Initialisation de batch
            node.batch.id = genBatchID();
            node.batch.status = true;
            node.batch.name = node.name;
            archivedata();
            startdatapoints(node.batch.id);
            step = 3;
            break;
          case 3://Batch started
            if (!startbit) step = 4;

            break;
          case 4:
            counter++;
            if (startbit) { step = 3; counter = 0; }
            if (counter === 5) { step = 5; counter = 0; }
            break;
          case 5:
            stopdatapoints();
            updatedata();
            step = 0;
            break;
          default:
            break;
        }
      }
    }

    function startdatapoints(batchid) {
      RED.nodes.eachNode(function (nn) {
        if (nn.parentid === node.id) {
          var n = RED.nodes.getNode(nn.id);
          if (n && n.type != 's7.trend') {
            if (!n.busy) n.start(batchid);
          }
        }
      });
    }

    function stopdatapoints() {
      RED.nodes.eachNode(function (nn) {
        if (nn.parentid === node.id) {
          var n = RED.nodes.getNode(nn.id)
          if (n && n.type != 's7.trend') {
            n.stop();
          }
        }
      });
    }

    function archivedata() {
      var database = RED.nodes.getNode(node.database);
      if (database) {
        var payload = {
          id: node.id,
          batchid: node.batch.id,
          batchstatus: node.batch.status,
          batchsetpoint: node.setpoint,
          start: new Date(),
          end: new Date(),
        }
        var msg = { _msgid: node.id, payload: payload, operation: 'insertOne' };

        database.do(msg, (result) => {
          node.data[node.startbit] = { _id: result.payload.insertedId }
          /* console.log('Batch started =>> Result: ', result) */
        });
      }
    }

    function updatedata() {
      var database = RED.nodes.getNode(node.database);
      if (database) {
        var filter = { _id: node.data[node.startbit]._id };
        var update = { $set: { end: new Date(), batchstatus: false, } }
        var payload = [filter, update]
        var msg = { _msgid: node.id, payload: payload, operation: 'updateOne' };

        database.do(msg, (result) => {
          /* console.log('Batch Stoped =>> Result: ', result) */
        });
      }
    }

  }
  RED.nodes.registerType('s7.batch', S7Batch);


};