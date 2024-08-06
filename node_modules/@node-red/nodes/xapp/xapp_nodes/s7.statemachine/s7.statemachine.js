var when = require('when')
module.exports = (RED) => {
  function S7StateMachineNode(n) {
    RED.nodes.createNode(this, n);
    var node = this
    node.id = n.id;
    node.name = n.name;
    node.stateProperty = n.stateProperty || 'topic';
    node.statePropertyType = n.statePropertyType || 'msg';
    node.parentid = n.parentid;
    node.database = n.database;
    node.tag = n.tag;
    node.statemachineHandle = null;
    node.repeat = n.repeat || 1000;
    node.payload = n.payload;
    node.globalcounter = [];
    node.databasetiming = {
      stateIntervalHandle: null,
      repeat: n.dbrepeat * 1000,
      none: n.dbnone,
    }

    node.startdate = n.startdate;
    node.enddate = n.enddate;

    node.startbit = n.startbit;
    node.setpoint = n.setpoint;

    node.datapoints = [];
    node.list = [];
    node.realcount = {};
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

    node.startup = () => false;

    node.repeaterSetup = () => {
      console.log('last payload :', node.context().flow.get(node.id, node.payload));
      if (node.context().flow.get(node.id, node.payload))
        node.payload = node.context().flow.get(node.id, node.payload);
      node.statemachineHandle = setInterval(() => {
        /* node.status({ fill: "green", shape: "dot", text: 'started' }); */
        cyclicCheckstates();
      }, node.repeat);

      if (!node.databasetiming.none) {
        node.databasetiming.stateIntervalHandle = setInterval(() => {
          archivedata();
        }, node.databasetiming.repeat);
      }

    };

    //RED.events.on("nodes-started", node.startup);

    node.on('close', function () {
      node.context().flow.set(node.id, node.payload);

      RED.events.removeListener("nodes-started", node.startup);

      if (node.statemachineHandle !== null) {
        clearInterval(node.statemachineHandle);
      }
      if (node.databasetiming.stateIntervalHandle !== null) {
        clearInterval(node.databasetiming.stateIntervalHandle);
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


    function cyclicCheckstates() {
      var tag = RED.nodes.getNode(node.tag);
      var activestate;
      if (tag) {
        node.current = buildMessage(tag.value)
        for (id in node.payload) {
          if (node.payload.hasOwnProperty(id)) {
            if (node.current[id]) {
              activestate = id;
              if (!node.payload[id].count) node.payload[id].count = 0;
              node.payload[id].count++;
              if (node.globalcounter[node.payload[id].msg]) { node.globalcounter[node.payload[id].msg].count++ }
            };
          };
        };
        node.status({ fill: "green", shape: "dot", text: {activestate:activestate ,value :Object.values(node.globalcounter) }});
      };
    };





    function archivedata() {
      var database = RED.nodes.getNode(node.database);
      if (database) {
        var payload = [];
        for (id in node.payload) {
          if (node.payload.hasOwnProperty(id)) {
            payload.push({
              id: node.id,
              state: node.payload[id].msg,
              count: node.payload[id].count,
              datetime: new Date(),
            });
            node.payload[id].count = 0;
          };
        };

        var msg = { _msgid: node.id, payload: [payload], operation: 'insertMany' };
        database.do(msg, (result) => {
         /*  getdata(); */
        });
      };
    };

    function getdata() {
      var database = RED.nodes.getNode(node.database);

      if (node.startdate && node.enddate) {
        var startdate = new Date(node.startdate);
        var enddate = new Date(node.enddate);

        console.log(startdate, enddate)
        var request = [
          {
            $project: {
              _id: 0,
              id: 1,
              state: 1,
              count: 1,
              datetime: 1,
            }
          },
          { $match: { id: node.id, datetime: { $gte: startdate, $lte: enddate } } },
          {
            $group: {
              _id: {
                state: "$state"
              },
              state: { $first: '$state' },
              count: { $sum: '$count' },
            }
          },
          function (err, result) { }

        ];


        var msg = {};
        if (database) {

          var msg = { _msgid: id, payload: [request, { allowDiskUse: true }], operation: 'aggregate.toArray' };

          database.do(msg, (result) => {

            var payload = result.payload;
            for (id in result.payload) {
              console.log('result.payload :', result.payload[id])
            }

            /* _payload = payload.reduce((obj, payload) => { obj[payload.state] = {state:payload.state,count:payload.count}; return obj }, {});  */
            //var _payload = Object.keys(object);
            var _payload = Object.values(payload);

            node.status({ fill: "green", shape: "dot", text: _payload });

          });
        }
      }
    };
    function updatedata() {
      var database = RED.nodes.getNode(node.database);
      if (database) {
        var filter = { _id: node.data[node.startbit]._id };
        var update = { $set: { end: new Date(), batchstatus: false, } };
        var payload = [filter, update];
        var msg = { _msgid: node.id, payload: payload, operation: 'updateOne' };

        database.do(msg, (result) => {
          /* console.log('Batch Stoped =>> Result: ', result) */
        });
      }
    };

  }
  RED.nodes.registerType('s7.statemachine', S7StateMachineNode);


};