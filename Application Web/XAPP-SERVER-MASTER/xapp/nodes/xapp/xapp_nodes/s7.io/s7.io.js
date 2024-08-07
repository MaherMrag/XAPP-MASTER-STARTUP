// System library
const util = require('util');

let logLevelNodeS7 = { debug: -1, silent: true };

function timestamp() {
  const myDate = new Date();
  let month = myDate.getMonth() + 1;

  switch (month) {
    case 1: month = 'Jan'; break;
    case 2: month = 'Feb'; break;
    case 3: month = 'Mar'; break;
    case 4: month = 'Apr'; break;
    case 5: month = 'May'; break;
    case 6: month = 'Jun'; break;
    case 7: month = 'Jul'; break;
    case 8: month = 'Aug'; break;
    case 9: month = 'Sep'; break;
    case 10: month = 'Oct'; break;
    case 11: month = 'Nov'; break;
    case 12: month = 'Dec'; break;
    default: month = 'Jan'; break;
  }
  return {
    format_Object: myDate,
    format_year: myDate.getFullYear() + '-' + (myDate.getMonth() + 1) + '-' + myDate.getDate(),
    format_time: myDate.getHours() + ':' + myDate.getMinutes() + ':' + myDate.getSeconds() + ':' + myDate.getMilliseconds(),
    format_year_time: myDate.getFullYear() + '-' + (myDate.getMonth() + 1) + '-' + myDate.getDate() + ', ' + myDate.getHours() + ':' + myDate.getMinutes() + ':' + myDate.getSeconds() + ':' + myDate.getMilliseconds(),
    format_XAPP: myDate.getDate() + ' ' + month + ' ' + myDate.getHours() + ':' + myDate.getMinutes() + ':' + myDate.getSeconds(),
  };
}

function outputLog(txt, debugLevel, id) {
  if (logLevelNodeS7.silent === true) return;
  let idtext = '';
  const time = timestamp().format_XAPP;

  if (typeof (id) === 'undefined') {
    idtext = '';
  } else {
    idtext = ' ' + id;
  }

  if (debugLevel) {
    switch (debugLevel) {
      case 0: console.log('' + time + idtext + ' - ' + util.format(txt).red.bold); break;
      case 1: console.log('' + time + idtext + ' - ' + util.format(txt).green.bold); break;
      case 2: console.log('' + time + idtext + ' - ' + util.format(txt).yellow.bold); break;
      case 3: console.log('' + time + idtext + ' - ' + util.format(txt).blue.bold); break; //info
      default: console.log('' + time + idtext + ' - ' + util.format(txt).green.bold); break;
    }
  }
}

var GetDateList = {
  GetMonthList: function (start, end) {
    var dt = new Date(start);
    var dateList = [];

    while (dt <= end) {
      var _date = new Date(dt);
      var format_date = _date.getFullYear() + '-' + (_date.getMonth() + 1);
      var date = new Date(format_date);
      var id = Date.parse(date);

      dateList.push({ id: id, date: date, value: 0, total: 0, count: 0 });
      dt.setMonth(dt.getMonth() + 1);
    }
    return dateList;
  },
  GetDaysList: function (start, end) {
    var dt = new Date(start);
    var dateList = [];

    while (dt <= end) {
      var _date = new Date(dt);
      var format_date = _date.getFullYear() + '-' + (_date.getMonth() + 1) + '-' + _date.getDate();
      //var date = new Date(_date.getFullYear(),(_date.getMonth() + 1), _date.getDate());
      var date = new Date(format_date);
      var id = Date.parse(date);

      dateList.push({ id: id, date: date, value: 0, total: 0, count: 0 });
      dt.setDate(dt.getDate() + 1);
    }
    return dateList;
  },
  GetHoursList: function (start, end) {
    var dt = new Date(start);
    var dateList = [];

    while (dt <= end) {
      var _date = new Date(dt);
      var format_date = _date.getFullYear() + '-' + (_date.getMonth() + 1) + '-' + _date.getDate() + ' ' + _date.getHours() + ':00';
      var date = new Date(format_date);
      var id = Date.parse(date);

      dateList.push({ id: id, date: date, value: 0, total: 0, count: 0 });
      dt.setHours(dt.getHours() + 1);
    }
    return dateList;
  },
  GetMinutesList: function (start, end) {
    var dt = new Date(start);
    var dateList = [];

    while (dt <= end) {
      var _date = new Date(dt);
      var format_date = _date.getFullYear() + '-' + (_date.getMonth() + 1) + '-' + _date.getDate() + ' ' + _date.getHours() + ':' + _date.getMinutes();
      var date = new Date(format_date);
      var id = Date.parse(date);

      dateList.push({ id: id, date: date, value: 0, total: 0, count: 0 });
      dt.setMinutes(dt.getMinutes() + 1);
    }
    return dateList;
  },
  GetSecondsList: function (start, end) {

    var dt = new Date(start);
    var dateList = [];

    while (dt <= end) {
      var _date = new Date(dt);
      var format_date = _date.getFullYear() + '-' + (_date.getMonth() + 1) + '-' + _date.getDate() + ' ' + _date.getHours() + ':' + _date.getMinutes() + ':' + _date.getSeconds();
      var date = new Date(format_date);
      var id = Date.parse(date);

      dateList.push({ id: id, date: date, value: 0, total: 0, count: 0 });
      dt.setSeconds(dt.getSeconds() + 1);

    }
    return dateList;
  }
}

module.exports = (RED) => {
  function S7io(n) {
    RED.nodes.createNode(this, n);
    outputLog('[s7-Warning] - Start a new s7 node: ' + n.id, 1);
    const node = this;
    node.id = n.id;
    node.connection = n.connection;
    node.type = n.type;
    node.topic = n.topic;
    node.name = n.name;
    node.payload = n.payload;
    node.value = 0.0;
    node.error = null;
    node.maxvalue = n.maxvalue;
    node.color = n.color;
    node.widgettype = n.widgettype;
    node.unit = n.unit;
    node.value = null;
    node.db = n.db;
    node.operation = n.operation;
    node.nodeTiming = {
      repeat: 2,//n.repeat || 1,
      intervalReading: n.none, // none=true => reading once; none=false means=> interval rading
      stateIntervalHandle: null,
      handleConfigTimeout: null,
      once: n.once,
      onceDelay: (n.onceDelay || 1) * 1000,
      onceTimeout: null,
      cronjob: null,
      crontab: null,
    };
    this.nodeDBTiming = {
      repeat: n.dbrepeat,
      once: n.dbonce, // none=true => reading once; none=false means=> interval rading
      stateIntervalHandle: null,
    };
    this.dataHandle = {
      rcvData: undefined,
    };

    function loadConfig() {
      node.NodeConfig = RED.nodes.getNode(node.connection);
      if (node.NodeConfig) {
        outputLog('[s7-info] - configuration ready ' + node.id, 3);
        node.repeaterSetup();
      } else {
        node.status({ fill: 'red', shape: 'dot', text: 'missing configuration' });
        outputLog('[s7-Warning] - waiting for load configuration ' + node.id, 1);
        node.nodeTiming.handleConfigTimeout = setTimeout(() => {
          clearTimeout(node.nodeTiming.handleConfigTimeout);
          node.nodeTiming.handleConfigTimeout = null;
          loadConfig();
        }, 100);
      }
    }

    node.repeaterSetup = () => {
      if (node.nodeTiming.repeat > 2147483) {
        node.error(RED._('repeat.errors.toolong', node));
        node.nodeTiming.repeat = 2147483;
      }

      if (node.nodeTiming.repeat && !isNaN(node.nodeTiming.repeat) && node.nodeTiming.repeat > 0) {
        if (node.payload !== undefined && node.payload !== '') {
          node.dataHandle.rcvData = node.payload //JSON.parse(node.payload);
        }
        node.nodeTiming.stateIntervalHandle = setInterval(() => {
          node.emit('input', {});
        }, node.nodeTiming.repeat * 1000);
      }

      // Set Data Base Timing 
      if (node.nodeDBTiming.repeat && !isNaN(node.nodeDBTiming.repeat) && node.nodeDBTiming.repeat > 0) {
        node.nodeDBTiming.repeat = node.nodeDBTiming.repeat * 1000;
        node.nodeDBTiming.stateIntervalHandle = setInterval(cyclicInsertData, node.nodeDBTiming.repeat);
      }
    };


    function cyclicInsertData() {
      if (!node.value) return;
      var db;
      var db = RED.nodes.getNode(node.operation);
      var payload = {
        id: node.id,
        value: node.value,
        datetime: new Date(),
      }
      if (db) {
        var msg = { _msgid: node.id, payload: payload, operation: 'insertOne' };
        db.do(msg, (result) => {
        })

      }
    }

    function parseValue(type, val) {
      var value;
      switch (type) {
        case 'R':
          value = parseFloat(val).toFixed(2);
          break;
        case 'D':
          value = parseInt(val);
          break;
        case 'X':
          // value = (val.toLowerCase() == 'true') || (val.toLowerCase() == '1') ? true : false;
          break;
        case 'W':
          value = parseInt(val);
          break;
      }
      return value;
    }
    node.on('input', (msg) => {
      if (!node.NodeConfig.state.connected) return;
      node.NodeConfig.readingComplete(node, (readJSON) => {
        if (readJSON.payload.error === 0) {
          //readJSON: { signal: 'name', path: 'DB10,WORD12', error: 0, value: [ 12 ] }
          node.value = parseValue(node.payload.S7_Datatype, readJSON.payload.value[0])
          node.error = false;
          // node.status({ fill: 'green', shape: 'dot', text: { s: 'connected', v: node.value, m: node.maxvalue, e: false } });
        } else {
          node.value = null;
          node.error = true;
          //  node.status({ fill: 'red', shape: 'dot', text: { s: 'error', v: node.value, m: node.maxvalue, e: true } });
        }
      });
    });

    node.on('close', (done) => {
      if (node.nodeTiming.handleConfigTimeout !== null) {
        clearTimeout(node.nodeTiming.handleConfigTimeout);
        node.nodeTiming.handleConfigTimeout = null;
      }

      if (node.nodeDBTiming.stateIntervalHandle !== null) {
        clearInterval(node.nodeDBTiming.stateIntervalHandle);
        node.nodeDBTiming.stateIntervalHandle = null;
      }

      if (node.nodeTiming.stateIntervalHandle !== null) {
        clearInterval(node.nodeTiming.stateIntervalHandle);
        node.nodeTiming.stateIntervalHandle = null;
      }

      if (node.nodeDBTiming.stateIntervalHandle !== null) {
        clearInterval(node.nodeDBTiming.stateIntervalHandle);
        node.nodeDBTiming.stateIntervalHandle = null;
      }

      if (node.NodeConfig) {
        node.NodeConfig.deregister(node, done);
      }

    })

    node.aggregate = (date, x_interval, agg_by, cb) => {
      var node_id = node.id;
      var node_name = node.name;
      var collection_id = node.operation;
      var startdate = new Date(date.startdate);
      var enddate = new Date(date.enddate);


      var x_interval = x_interval || 'days';
      switch (x_interval) {
        case 'years':
          break;
        case 'months':
          aggregateData.aggregateMonth(startdate, enddate, node_id, node_name, collection_id, agg_by, cb);
          break;
        case 'days':
          aggregateData.aggregateDays(startdate, enddate, node_id, node_name, collection_id, agg_by, cb);
          break;
        case 'hours':
          aggregateData.aggregateHours(startdate, enddate, node_id, node_name, collection_id, agg_by, cb);
          break;
        case 'minutes':
          aggregateData.aggregateMinutes(startdate, enddate, node_id, node_name, collection_id, agg_by, cb);
          break;
        case 'seconds':

          aggregateData.aggregateSeconds(startdate, enddate, node_id, node_name, collection_id, agg_by, cb);
          break;
        default:
          console.log(``);
      }
    };

    var aggregateData = {
      aggregateMonth: function (startdate, enddate, node_id, node_name, collection_id, agg_by, cb) {
        var datelist = GetDateList.GetMonthList(startdate, enddate);
        var result = datelist.reduce((obj, result) => { obj[result.id] = result; return obj }, {});

        var db = RED.nodes.getNode(collection_id);

        var request = [
          {
            $project: {
              _id: 0,
              id: 1,
              name: 1,
              value: 1,
              datetime: 1,
              year: { $year: '$datetime' },
              month: { $month: '$datetime' },
            }
          },
          { $match: { id: node_id, datetime: { $gte: startdate, $lte: enddate } } },
          {
            $group: {
              _id: {
                year: "$year", month: "$month"
              },

              total: { $sum: '$value' },
              count: { $sum: 1 },
            }
          },
          function (err, result) { }

        ];

        switch (agg_by) {
          case 'sum':
            request[2].$group.total = { $sum: '$value' };
            break;
          case 'min':
            request[2].$group.total = { $min: '$value' };
            break;
          case 'max':
            request[2].$group.total = { $max: '$value' };
            break;
          case 'avg':
            request[2].$group.total = { $avg: '$value' };
            break;
          default:
            request[2].$group.total = { $sum: '$value' };
        }

        var msg = { _msgid: node_id, payload: [request, { allowDiskUse: true }], topic: '', collection: collection_id, operation: 'aggregate.toArray' };

        if (db) {
          db.do(msg, (res) => {
            for (var id in res.payload) {
              if (res.payload.hasOwnProperty(id)) {
                var year = res.payload[id]._id.year;
                var month = res.payload[id]._id.month;

                var total = res.payload[id].total;
                var count = res.payload[id].count;

                var format_date = year + '-' + month;
                var date = new Date(format_date);
                var _id = Date.parse(date);

                if (result.hasOwnProperty(_id)) {
                  result[_id].value = total;
                  result[_id].total = total;
                  result[_id].count = count;
                }

              }
            }
            var ret = { id: node_id, name: node_name, result: result };
            cb(ret)
          });
        } else {
          var ret = { id: node_id, name: node_name, result: [] };
          cb(ret)
        }

      },
      aggregateDays: function (startdate, enddate, node_id, node_name, collection_id, agg_by, cb) {
        var datelist = GetDateList.GetDaysList(startdate, enddate);
        var result = datelist.reduce((obj, result) => { obj[result.id] = result; return obj }, {});

        var db = RED.nodes.getNode(collection_id);
        var request = [
          {
            $project: {
              _id: 0,
              id: 1,
              name: 1,
              value: 1,
              datetime: 1,
              year: { $year: '$datetime' },
              month: { $month: '$datetime' },
              day: { $dayOfMonth: '$datetime' },
            }
          },
          {
            $sort: {
              day: 1
            }
          },
          { $match: { id: node_id, datetime: { $gte: startdate, $lte: enddate } } },
          {
            $group: {
              _id: {
                year: "$year", month: "$month", day: "$day"
              },

              total: { $sum: '$value' },
              count: { $sum: 1 },
              /* month: { $avg: '$month' },
              day: { $avg: '$day' }, */
            }
          },
          function (err, result) { }

        ];

        switch (agg_by) {
          case 'sum':
            request[3].$group.total = { $sum: '$value' };
            break;
          case 'min':
            request[3].$group.total = { $min: '$value' };
            break;
          case 'max':
            request[3].$group.total = { $max: '$value' };
            break;
          case 'avg':
            request[3].$group.total = { $avg: '$value' };
            break;
          default:
            request[3].$group.total = { $sum: '$value' };
        }

        var msg = { _msgid: node_id, payload: [request, { allowDiskUse: true }], topic: '', collection: collection_id, operation: 'aggregate.toArray' };

        if (db) {
          db.do(msg, (res) => {
            for (var id in res.payload) {
              if (res.payload.hasOwnProperty(id)) {
                var year = res.payload[id]._id.year;
                var month = res.payload[id]._id.month;
                var day = res.payload[id]._id.day;
                var total = res.payload[id].total;
                var count = res.payload[id].count;

                var format_date = year + '-' + month + '-' + day;
                var date = new Date(format_date);
                var _id = Date.parse(date);

                if (result.hasOwnProperty(_id)) {
                  result[_id].value = total;
                  result[_id].total = total;
                  result[_id].count = count;
                }

              }
            }

            var ret = { id: node_id, name: node_name, result: result };
            cb(ret)
          });
        } else {
          var ret = { id: node_id, name: node_name, result: [] };
          cb(ret)
        }
      },
      aggregateHours: function (startdate, enddate, node_id, node_name, collection_id, agg_by, cb) {
        var datelist = GetDateList.GetHoursList(startdate, enddate);
        var result = datelist.reduce((obj, result) => { obj[result.id] = result; return obj }, {});

        var db = RED.nodes.getNode(collection_id);

        var request = [
          {
            $project: {
              _id: 0,
              id: 1,
              name: 1,
              value: 1,
              datetime: 1,
              year: { $year: '$datetime' },
              month: { $month: '$datetime' },
              day: { $dayOfMonth: '$datetime' },
              hour: { $hour: '$datetime' },
            }
          },
          { $match: { id: node_id, datetime: { $gte: startdate, $lte: enddate } } },
          {
            $group: {
              _id: {
                year: "$year", month: "$month", day: "$day", hour: "$hour"
              },
              total: { $sum: '$value' },
              count: { $sum: 1 },
            }
          },

          function (err, result) { }

        ];

        switch (agg_by) {
          case 'sum':
            request[2].$group.total = { $sum: '$value' };
            break;
          case 'min':
            request[2].$group.total = { $min: '$value' };
            break;
          case 'max':
            request[2].$group.total = { $max: '$value' };
            break;
          case 'avg':
            request[2].$group.total = { $avg: '$value' };
            break;
          default:
            request[2].$group.total = { $sum: '$value' };
        }

        var msg = { _msgid: node_id, payload: [request, { allowDiskUse: true }], topic: '', collection: collection_id, operation: 'aggregate.toArray' };

        if (db) {
          db.do(msg, (res) => {
            for (var id in res.payload) {
              if (res.payload.hasOwnProperty(id)) {
                var year = res.payload[id]._id.year;
                var month = res.payload[id]._id.month;
                var day = res.payload[id]._id.day;
                var hour = res.payload[id]._id.hour;

                var total = res.payload[id].total;
                var count = res.payload[id].count;

                var format_date = year + '-' + month + '-' + day + ' ' + hour + ':00';
                var date_timezone = new Date(format_date);
                var userTimezoneOffset = date_timezone.getTimezoneOffset() * 60000;
                var date = new Date(date_timezone.getTime() - userTimezoneOffset);
                var _id = Date.parse(date);

                if (result.hasOwnProperty(_id)) {
                  result[_id].value = total;
                  result[_id].total = total;
                  result[_id].count = count;
                }

              }
            }
            var ret = { id: node_id, name: node_name, result: result };
            cb(ret)
          });
        } else {
          var ret = { id: node_id, name: node_name, result: [] };
          cb(ret)
        }
      },
      aggregateMinutes: function (startdate, enddate, node_id, node_name, collection_id, agg_by, cb) {
        var datelist = GetDateList.GetMinutesList(startdate, enddate);
        var result = datelist.reduce((obj, result) => { obj[result.id] = result; return obj }, {});

        var db = RED.nodes.getNode(collection_id);

        var request = [
          {
            $project: {
              _id: 0,
              id: 1,
              name: 1,
              value: 1,
              datetime: 1,
              year: { $year: '$datetime' },
              month: { $month: '$datetime' },
              day: { $dayOfMonth: '$datetime' },
              hour: { $hour: '$datetime' },
              minute: { $minute: '$datetime' },
            }
          },
          { $match: { id: node_id, datetime: { $gte: startdate, $lte: enddate } } },
          {
            $group: {
              _id: {
                year: "$year", month: "$month", day: "$day", hour: "$hour", minute: "$minute"
              },

              total: { $sum: '$value' },
              count: { $sum: 1 },
            }
          },

          function (err, result) { }

        ];

        switch (agg_by) {
          case 'sum':
            request[2].$group.total = { $sum: '$value' };
            break;
          case 'min':
            request[2].$group.total = { $min: '$value' };
            break;
          case 'max':
            request[2].$group.total = { $max: '$value' };
            break;
          case 'avg':
            request[2].$group.total = { $avg: '$value' };
            break;
          default:
            request[2].$group.total = { $sum: '$value' };
        }

        var msg = { _msgid: node_id, payload: [request, { allowDiskUse: true }], topic: '', collection: collection_id, operation: 'aggregate.toArray' };

        if (db) {
          db.do(msg, (res) => {

            for (var id in res.payload) {
              if (res.payload.hasOwnProperty(id)) {
                var year = res.payload[id]._id.year;
                var month = res.payload[id]._id.month;
                var day = res.payload[id]._id.day;
                var hour = res.payload[id]._id.hour;
                var minute = res.payload[id]._id.minute;

                var total = res.payload[id].total;
                var count = res.payload[id].count;

                var format_date = year + '-' + month + '-' + day + ' ' + hour + ':' + minute;
                var date_timezone = new Date(format_date);
                var userTimezoneOffset = date_timezone.getTimezoneOffset() * 60000;
                var date = new Date(date_timezone.getTime() - userTimezoneOffset);
                var _id = Date.parse(date);

                if (result.hasOwnProperty(_id)) {
                  result[_id].value = total;
                  result[_id].total = total;
                  result[_id].count = count;
                }

              }
            }

            var ret = { id: node_id, name: node_name, result: result };

            cb(ret)
          });
        } else {
          var ret = { id: node_id, name: node_name, result: [] };
          cb(ret)
        }
      },
      aggregateSeconds: function (startdate, enddate, node_id, node_name, collection_id, agg_by, cb) {
        var datelist = GetDateList.GetSecondsList(startdate, enddate);
        var result = datelist.reduce((obj, result) => { obj[result.id] = result; return obj }, {});

        var db = RED.nodes.getNode(collection_id);

        var request = [
          {
            $project: {
              _id: 0,
              id: 1,
              name: 1,
              value: 1,
              datetime: 1,
              year: { $year: '$datetime' },
              month: { $month: '$datetime' },
              day: { $dayOfMonth: '$datetime' },
              hour: { $hour: '$datetime' },
              minute: { $minute: '$datetime' },
              second: { $second: '$datetime' },
            }
          },
          { $match: { id: node_id, datetime: { $gte: startdate, $lte: enddate } } },
          {
            $group: {
              _id: {
                year: "$year", month: "$month", day: "$day", hour: "$hour", minute: "$minute", second: "$second"
              },

              total: { $sum: '$value' },
              count: { $sum: 1 },
            }
          },

          function (err, rest) { }

        ];

        switch (agg_by) {
          case 'sum':
            request[2].$group.total = { $sum: '$value' };
            break;
          case 'min':
            request[2].$group.total = { $min: '$value' };
            break;
          case 'max':
            request[2].$group.total = { $max: '$value' };
            break;
          case 'avg':
            request[2].$group.total = { $avg: '$value' };
            break;
          default:
            request[2].$group.total = { $sum: '$value' };
        }
        console.log('agg_by :',agg_by,request[2].$group.total )
        var msg = { _msgid: node_id, payload: [request, { allowDiskUse: true }], topic: '', collection: collection_id, operation: 'aggregate.toArray' };

        if (db) {
          db.do(msg, (res) => {
            console.log('res.payload :', res.payload)
            for (var id in res.payload) {
              if (res.payload.hasOwnProperty(id)) {
                var year = res.payload[id]._id.year;
                var month = res.payload[id]._id.month;
                var day = res.payload[id]._id.day;
                var hour = res.payload[id]._id.hour;
                var minute = res.payload[id]._id.minute;
                var second = res.payload[id]._id.second;

                var total = res.payload[id].total;
                var count = res.payload[id].count;

                var format_date = year + '-' + month + '-' + day + ' ' + hour + ':' + minute + ':' + second;

                var date_timezone = new Date(format_date);
                var userTimezoneOffset = date_timezone.getTimezoneOffset() * 60000;
                var date = new Date(date_timezone.getTime() - userTimezoneOffset);
                var _id = Date.parse(date);

                if (result.hasOwnProperty(_id)) {
                  result[_id].value = total;
                  result[_id].total = total;
                  result[_id].count = count;
                }

              }
            }
            console.log('result :', result)
            var ret = { id: node_id, name: node_name, result: result };

            cb(ret)
          });
        } else {
          var ret = { id: node_id, name: node_name, result: [] };
          cb(ret)
        }
      },
    }


    node.findData = (data, operation, cb) => {
      var id = node.id;
      var id_collection = node.operation;

      startdate = new Date(data.startdate);
      enddate = new Date(data.enddate);

      var db = RED.nodes.getNode(id_collection);

      var request = [
        {
          $project: {
            _id: 0,
            id: 1,
            value: 1,
            datetime: 1,
          }
        },
        { $match: { id: id, datetime: { $gte: startdate, $lte: enddate } } },
        {
          $group: {
            _id: {
              id: "$id"
            },
            id: { $first: '$id' },
            total: { $sum: '$value' },
            count: { $sum: 1 },
          }
        },
        function (err, result) { }

      ];




      var msg = {};
      if (db) {
        var msg = { _msgid: id, payload: [request, { allowDiskUse: true }], operation: 'aggregate.toArray' };

        db.do(msg, (result) => {
          result.id = node.id;
          result.name = node.name;
          cb(result)

        })

      }
    };







    if (node.nodeTiming.once) {
      node.nodeTiming.onceTimeout = setTimeout(() => {
        loadConfig();
      }, node.nodeTiming.onceDelay);
    } else {
      loadConfig();
    }
  }
  RED.nodes.registerType('s7.io', S7io);
}