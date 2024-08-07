module.exports = (RED) => {
  function S7Phase(n) {
    RED.nodes.createNode(this, n);
    this.id = n.id;
    this.name = n.name;
    this.tag = n.tag;
    this.database = n.database;
    this.payload = n.payload;
    this.parentid = n.parentid;
    this.busy = false;
    this.list = [];

    this.checkInterval = null;
    this.checkIntervalTime = 1000;

    var _tag = null;
    var _database = null;
    var _data = [];
    var _batchid = null;
    var node = this

    this.buildMessage = (value) =>
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



    node.current = node.old = node.buildMessage(0)

    this.on('input', (msg) => {

    });

    node.start = (batchid) => {
      node.busy = true;
      _batchid = batchid;
      _tag = RED.nodes.getNode(node.tag);
      _database = RED.nodes.getNode(node.database);
      node.checkInterval = setInterval(cyclicCheck, node.checkIntervalTime);
    }

    node.stop = () => {
      if (node.checkInterval !== null) {
        clearTimeout(node.checkInterval);
        node.checkInterval = null;
      }
      node.busy = false;
      _tag = null;
      _database = null;
      _data = [];
      _batchid = null;
    }

    node.getdata = (date,batchid, cb) => {
      var id = node.id;
      var database = RED.nodes.getNode(node.database);
      var request = [{ id: id, parentid: node.parentid, batchid: batchid }, { _id: 0, id: 1, parentid: 1, batchid: 1, name: 1, type: 1, start: 1, end: 1 }];
      var msg = {};
      if (database) {
        var msg = { _msgid: id, payload: request, operation: 'find.toArray' };
        database.do(msg, (result) => {
          cb(result)
        });
      }
    };
    
    function cyclicCheck() {
      if (_tag) {
        node.current = node.buildMessage(_tag.value)
        for (id in node.payload) {
          if (node.payload.hasOwnProperty(id)) {
            if (node.current[id] !== node.old[id]) {
              if (node.current[id]) {
                insertdata(id);
              } else {
                updatedata(id);
              }
            }
          }
        }
        node.old = node.current;
      }
    }


    function insertdata(i) {
      if (_database) {
        var payload = {
          id: node.id,
          parentid: node.parentid,
          batchid: _batchid,
          name : node.payload[i].msg,
          type : 'phase',
          start: new Date(),
          end: new Date(),
        }
        var msg = { _msgid: node.payload[i].id, payload: payload, operation: 'insertOne' };
        _database.do(msg, (result) => {
          _data[result._msgid] = { _id: result.payload.insertedId }
        });
      }
    }

    function updatedata(i) {
      if (_database) {
        var filter = { _id: _data[i]._id };
        var update = { $set: { end: new Date() } }
        var payload = [filter, update]
        var msg = { _msgid: node.payload[i].id, payload: payload, operation: 'updateOne' };
        _database.do(msg, (result) => {

        });
      }
    }
  }
  RED.nodes.registerType('s7.phase', S7Phase);
};