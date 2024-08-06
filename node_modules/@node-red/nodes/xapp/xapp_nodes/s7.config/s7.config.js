// System library
const util = require('util');

// 3rd-party library
const Nodes7 = require('nodes7');
require('colors');

let logLevelNodeS7 = { debug: -1, silent: true };
let logLevelPlcS7 = { debug: -1, silent: true };

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
      case 3: console.log('' + time + idtext + ' - ' + util.format(txt).blue.bold); break;
      default: console.log('' + time + idtext + ' - ' + util.format(txt).green.bold); break;
    }
  }
}

let NetKeepAlive = null;
try {
  // Because net-keepalive depends on the OS
  NetKeepAlive = require('net-keepalive');
} catch (er) {
  console.log('' + timestamp().format_NodeRed + ' - ' + '[s7comm-Error] - Installation of Module net-keepalive failed because we might be on the wrong OS. OS=' + process.platform);
  NetKeepAlive = null;
}

/**
 * @description Creates an array with the length 'len' and fill it with 'val'
 * @param	{Number} - Length of the return Array
 * @param	{String|Number|Object|Array|bool|etc} - Value of each digit
 * @returns	{Array} Array with the length 'len' and fill it with 'val'
 * @example
 * FilledArray(3,'0');  //returns ['0','0','0']
 */
function FilledArray(len, val) {
  const array = [];
  for (let i = 0; i < len; i++) {
    array[i] = val;
  }
  return array;
}

function customStringify(v) {
  const cache = new Map();
  return JSON.stringify(v, (key, value) => {
    if (typeof value === 'object' && value !== null) {
      if (cache.has(value)) {
        // Circular reference found, discard key
        return;
      }
      // Store value in our map
      cache.set(value, true);
    }
    return value;
  });
}
/**
 * @description This function returns the minimum of an Array
 * @param {Array} - Array of numbers only
 * @returns {Number} - Minimum Value of the input Array
 * @examples
 * Array.min([1,2,3,4])
 * //returns 1
 */
Array.min = function (array) {
  return Math.min.apply(Math, array);
}


module.exports = (RED) => {
  var ui = require('../ui')(RED);
  function s7config(n) {
    RED.nodes.createNode(this, n);
    outputLog('[s7-Warning] - Start a new Configuration: ' + n.id, 1);
    const node = this;
    node.id = n.id;
    node.RFCParam = {
      port: n.port,
      host: n.ip,
      rack: n.rack,
      slot: n.slot,
    };
    node.users = {}; // a list of all nodes wich are using these Configuration
    node.plc = null; // handle for nodes7 instance

    node.payload = n.payload;

    node.state = {
      rwCyclError: false, // Patch. Flag can be removed when connectionError is fixed
      connected: null,
      connecting: null,
      reading: null,
      writing: null,
      keepAliveRunning: false,
      handleConnectionTimeout: null,
      handleStateInterval: null,
      handleLocalTimeout: null,
      readingInterval: null, // Handle for reading interval
      stateIntervalHandle: null,
      numOfReadNodes: 0,
      numOfReadIntervallNodes: 0,
      readCyclArray: [],
      readIntervalTime: 0,
      numOfWriteNodes: 0,
      busy: true,
    };

    node.readQueue = [];
    node.writeQueue = [];
    node.readJSON = {};// a Buffer for reading JSON
    node.writeJSON = {};// a Buffer for writing JSON
    node.readDataBuffer = { // Buffer for nodes7 response
      anythingBad: null,
      values: null,
    };
    node.readJSON = {};// a Buffer for reading JSON
    node.writeJSON = {};// a Buffer for writing JSON

    function printStatus() {
      const cli = {
        address: null,
        bufferSize: null,
        bytesRead: null,
        bytesWritten: null,
        connecting: null,
        destroyed: null,
        localAddress: null,
        localPort: null,
        remoteAddress: null,
        remoteFamily: null,
        remotePort: null,
      };
      const information = {
        connection: null,
        status: null,
        client: null,
      };
      let client = null;

      if (node.plc && node.plc.isoclient) {
        client = node.plc.isoclient;
        cli.address = client.address();
        cli.bufferSize = ((client.bufferSize) ? (client.bufferSize) : (null));
        cli.bytesRead = ((client.bytesRead) ? (client.bytesRead) : (null));
        cli.bytesWritten = ((client.bytesWritten) ? (client.bytesWritten) : (null));
        cli.connecting = ((client.connecting) ? (client.connecting) : (null));
        cli.destroyed = ((client.destroyed) ? (client.destroyed) : (null));
        cli.localAddress = ((client.localAddress) ? (client.localAddress) : (null));
        cli.localPort = ((client.localPort) ? (client.localPort) : (null));
        cli.remoteAddress = ((client.remoteAddress) ? (client.remoteAddress) : (null));
        cli.remoteFamily = ((client.remoteFamily) ? (client.remoteFamily) : (null));
        cli.remotePort = ((client.remotePort) ? (client.remotePort) : (null));
      }

      information.connection = node.RFCParam;
      information.status = node.state;
      information.client = cli;

      const ret = customStringify(information);
      // var ret = util.inspect(information);
      return ret;
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

    function getDataValues() {
      const data = node.readDataBuffer;
      var value, error,fill;
      var _data = [];
      if (data.values) {
        for (id in node.users) {
          if (node.users.hasOwnProperty(id)) {
            const wrappedData = wrapData(node.users[id].payload, 'data');
            var dataValues = data.values[wrappedData] ? data.values[wrappedData] : 0;
            if (dataValues === undefined || (typeof (dataValues) === 'string' && dataValues.search('BAD') === 0)) {
              error = true;
              value = null;
            } else {
              error = false;
              value = parseValue(node.users[id].payload.S7_Datatype, dataValues);
            }
            var maxvalue = node.users[id].maxvalue;
            _data.push({ id: node.users[id].id, v: value, m: maxvalue, e: error,fill:fill });
          }
        }

      }
      return _data;
    }
    function setStatus(sStatus) {
      outputLog('[s7comm-Function] - setStatus (New status:' + sStatus + '). Configuration:[' + node.id + '].', 3);
      if (typeof (sStatus) === 'string') {
        switch (sStatus) {
          case 'connected':
            var data = getDataValues();
            node.status({ fill: 'green', shape: 'dot', text: { status: 'connected', data: data } })
            break;
          case 'connecting':
            node.status({ fill: 'blue', shape: 'dot', text: { status:'connecting'}, })
            break;
          case 'disconnected':
            node.status({ fill: 'red', shape: 'dot', text: { status:'disconnected'}, });

            break;
          case 'error':
            var data = getDataValues();
            node.status({ fill: 'red', shape: 'dot', text: { status: 'error', data: data }, });

            break;
          case 'reconnection':
            node.status({ fill: 'red', shape: 'dot', text: { status: 'reconnection', data: data }, });

            break;

          default:
            node.status({ fill: 'red', shape: 'dot', text:{ status: 'unknown'}, });
            break;
        }
      } else {
        node.status({ fill: 'red', shape: 'dot', text: 'unknown', });
      }
    }

    function clearTimer(handle) {
      switch (handle) {
        case 'handleConnectionTimeout':
          if (node.state.handleConnectionTimeout !== null) {
            outputLog('[s7comm-Function] - Clear Timer: ' + handle, 3);
            clearTimeout(node.state.handleConnectionTimeout);
            node.state.handleConnectionTimeout = null;
          }
          break;
        case 'handleStateInterval':
          if (node.state.handleStateInterval !== null) {
            outputLog('[s7comm-Function] - Clear Timer: ' + handle, 3);
            clearInterval(node.state.handleStateInterval);
            // clearImmediate(node.state.handleStateInterval);
            node.state.handleStateInterval = null;
          }
          break;
        case 'handleLocalTimeout':
          if (node.state.handleLocalTimeout !== null) {
            outputLog('[s7comm-Function] - Clear Timer: ' + handle, 3);
            clearTimeout(node.state.handleLocalTimeout);
            node.state.handleStateInterval = null;
          }
          break;
        case 'readingInterval':
          if (node.state.readingInterval !== null) {
            outputLog('[s7comm-Function] - Clear Timer: ' + handle, 3);
            clearInterval(node.state.readingInterval);
            node.state.readingInterval = null;
          }
          break;
        default:
          outputLog('[s7comm-Error] - Error deleting Timer Handle. Unknown Handle: ' + handle, 0);
          break;
      }
    }
    function singleWriting() {
      outputLog('[s7comm-Function] - singleWriting. Configuration:[' + node.id + '].', 3);
      const nextElem = node.writeQueue.shift();
      if (nextElem) {
        outputLog('[s7comm-Info] - Writing now.', 2);
        //sendDebug({ id: node.id, name: node.name, topic: "connection status :", msg: '[s7comm-Info] - Writing now.', _path: "path" })
        node.state.writing = true;
        const myNode = nextElem.node;
        const myName = nextElem.name;
        const myValue = nextElem.val;
        const myError = nextElem.error;
        outputLog('[s7comm-Info] - Single writing process (PLC ' + node.RFCParam.host.toString() + ') is starting.', 2);
       // sendDebug({ id: node.id, name: node.name, topic: "connection status :", msg: '[s7comm-Info] - Single writing process (PLC ' + node.RFCParam.host.toString() + ') is starting.', _path: "path" })

        node.plc.writeItems(myName, myValue, (cb) => {
          outputLog('[s7comm-Info] - Single writing process (PLC ' + node.RFCParam.host.toString() + ') done.', 2);
          node.state.writing = false;
          // send the payload
          let err = -1;
          let value = null;

          if (cb === false) {
            err = 0;// the callback from the writing process
          }
          if (myNode.dataHandle.rcvData.S7_Quantity > 1) {
            if (myNode.dataHandle.rcvData.S7_Datatype === 'STRING' || myNode.dataHandle.rcvData.S7_Datatype === 'CHAR') {
              value = myValue;
            } else {
              value = myValue[0];
            }
          } else {
            value = myValue;
          }

          const wrappedPath = wrapData(myNode.dataHandle.rcvData, 'path');

          myNode.NodeConfig.writeJSON = getJSON(myNode, wrappedPath, err, value);
          myNode.send(myNode.NodeConfig.writeJSON);

          singleWriting();// trigger next writing
        });
        // node.state.writing = true;
      } else {
        outputLog('[s7comm-Info] - Writing Queue empty. Configuration:[' + node.id + '].', 2);
      }
    }

    function checkWritingValue(myNode, val) {
      // Input:  value.payload={'value':[1]}
      // Return: val= { error: false, value: [ 2 ] }
      outputLog('[s7comm-Function] - checkWritingValue. Configuration:[' + node.id + '].', 3);

      let ret = null;
      const tmp = [];
      let err = null;
      let fatalError = false;

      for (let i = 0; i < val.length; i++) {
        tmp[i] = val[i];
        err = false;

        if (myNode.dataHandle.rcvData.S7_Datatype === 'B' || myNode.dataHandle.rcvData.S7_Datatype === 'uint8') { // 0x00 <= Byte <= 255
          if (val[i] < 0x00) {
            tmp[i] = 0;
          } else {
            tmp[i] = val[i] % (255 + 1);
          }
        }
        if (myNode.dataHandle.rcvData.S7_Datatype === 'W' || myNode.dataHandle.rcvData.S7_Datatype === 'uint16') { // 0x0000 <= Word <= 65535
          if (val[i] < 0) {
            tmp[i] = 0;
          } else {
            tmp[i] = val[i] % (65535 + 1);
          }
        }
        if (myNode.dataHandle.rcvData.S7_Datatype === 'D' || myNode.dataHandle.rcvData.S7_Datatype === 'uint32') { // 0x00000000 <= DWord <= 4294967295
          if (val[i] < 0) {
            tmp[i] = 0;
          } else {
            tmp[i] = val[i] % (4294967295 + 1);
          }
        }
        if (myNode.dataHandle.rcvData.S7_Datatype === 'I' || myNode.dataHandle.rcvData.S7_Datatype === 'int16') { // -32768 <= INT <= 32767
          if (val[i] < 0) {
            tmp[i] = val[i] % (32768 + 1);
          } else if (val[i] > 0) {
            tmp[i] = val[i] % (32767 + 1);
          } else {
            tmp[i] = val[i] % (32767 + 1);
          }
        }
        if (myNode.dataHandle.rcvData.S7_Datatype === 'DI' || myNode.dataHandle.rcvData.S7_Datatype === 'int32') { // -2147483648 <= INT <= 2147483647	
          if (val[i] < 0) {
            tmp[i] = val[i] % (2147483648 + 1);
          } else if (val[i] > 0) {
            tmp[i] = val[i] % (2147483647 + 1);
          } else {
            tmp[i] = val[i] % (2147483647 + 1);
          }
        }
        if (myNode.dataHandle.rcvData.S7_Datatype === 'X') {
          if (typeof (val[i]) !== 'boolean') {
            fatalError = true;
          }
        }
        if (myNode.dataHandle.rcvData.S7_Datatype === 'CHAR') {
          let x = '';
          if (typeof (val[i]) !== 'string') {
            fatalError = true;
          } else {
            if ((val[i]).length > 1) {
              err = true;
              x = (val[i]).slice(0, 1);
            } else {
              x = val[i];
            }
            if (x === '') {
              tmp[i] = ' ';
            } else {
              tmp[i] = x;
            }
          }
        }
        if (myNode.dataHandle.rcvData.S7_Datatype === 'STRING') {
          if (typeof (val[i]) !== 'string') {
            fatalError = true;
          } else {
            if ((val[i]).length > myNode.dataHandle.rcvData.S7_Quantity) {
              err = true;
              tmp[i] = (val[i]).slice(0, myNode.dataHandle.rcvData.S7_Quantity);
            }
          }
        }
        if (myNode.dataHandle.rcvData.S7_Datatype === 'R') {
          if (isNumeric(val[i])) {
            tmp[i] = val[i];
          } else {
            tmp[i] = 0;
            err = true;
          }
        }
        if (myNode.dataHandle.rcvData.S7_Datatype === 'TIMER') {
          // TODO: Howto validate value
        }
        if (myNode.dataHandle.rcvData.S7_Datatype === 'COUNTER') {
          // TODO: Howto validate value
        }
      }
      if (fatalError === true) {
        ret = null;
      } else {
        // writingValue is always an array so redefine item
        if (myNode.dataHandle.rcvData.S7_Quantity > 1) {
          // cut off the overload of the array
          if (isNumeric(myNode.dataHandle.rcvData.S7_Quantity)) {
            ret = {
              'error': err,
              'value': [tmp.slice(0, parseInt(myNode.dataHandle.rcvData.S7_Quantity))],
            };
            if (myNode.dataHandle.rcvData.S7_Datatype == 'CHAR' || myNode.dataHandle.rcvData.S7_Datatype == 'STRING') {
              ret = { 'error': err, 'value': tmp };
            } else {
              ret = {
                'error': err,
                'value': [tmp.slice(0, parseInt(myNode.dataHandle.rcvData.S7_Quantity))],
              };
            }
          } else {
            // value of Quantity Field is not a number
            tmp[i] = 0;
            err = true;
          }
        } else {
          ret = { 'error': err, 'value': tmp };
        }
      }
      return ret;
    }
    /**
     * @description This function returns a JSON Object which is used for sending to the nodes output
     * @param {Object} node- A node object from the Node-RED Instance
     * @param {String} path- Name of the signal within S7-Object
     * @param {Number} err- Errorvalue of PLC response (comes from checkReceivedData)
     * @param {Array} val- Return value of PLC response(comes from checkReceivedData)
     * @returns {Object} JSON-Object of each Request
     * @example
     * var a=getJSON(node,'MB0...2', 0,[0,1,2]); //define data as JSON
     * var b=getJSON(node,null     ,-1,[null]);  //Errorobject
     */
    function getJSON(myNode, s7path, err, val) {
      const ret = {
        topic: myNode.topic,
        payload: {
          signal: myNode.dataHandle.rcvData.S7_Name,
          path: s7path,
          error: err,
          value: val,
        },
      };
      return ret;
    }

    /**
     * @description Give this function an S7 Object and it'll return the Datatype.
     * @param {Object} S7Object - The S7-Object that comes from the HTML-Page
     * @param {Number} choose -  Choose 0 or 1 for different format. 1 for using with DB, 0 for using with the rest
     * @returns {String} A string that shows the Datatype of the input Signal
     * @todo Extend this Function when using more Datatypes e.g Int,DInt ...
     * @example 
     * getDataTypeAsString(S7Object,1)  //S7Object={S7_Type:'' ,S7_DBnum:'0',S7_Datatype:'',S7_Offset:'0',S7_BitOffset:'0',S7_Quantity:'0',S7_Name:''}
     * //returns BYTE
     */
    function getDataTypeAsString(S7Object, choose) {
      let ret = '';
      // cases grabbed from HTML file. Object operators2 within oneditprepare in the configuration part!!
      switch (S7Object.S7_Datatype) {
        case 'X':
          ret = ((choose && choose === 'DB') ? ('X') : ('X'));
          break;
        case 'B':
        case 'uint8':
          ret = ((choose && choose === 'DB') ? ('BYTE') : ('B'));
          break;
        case 'W':
        case 'uint16':
          ret = ((choose && choose === 'DB') ? ('WORD') : ('W'));
          break;
        case 'D':
        case 'uint32':
          ret = ((choose && choose === 'DB') ? ('DWORD') : ('D'));
          break;
        case 'I':
        case 'int16':
          ret = ((choose && choose === 'DB') ? ('INT') : ('I'));
          break;
        case 'DI':
        case 'int32':
          ret = ((choose && choose === 'DB') ? ('DINT') : ('DI'));
          break;
        case 'CHAR':
          ret = ((choose && choose === 'DB') ? ('CHAR') : ('C'));
          break;
        case 'STRING':
          ret = ((choose && choose === 'DB') ? ('STRING') : ('S'));
          break;
        case 'R':
          ret = ((choose && choose === 'DB') ? ('REAL') : ('R'));
          break;
        case 'TIMER':
          ret = ((choose && choose === 'DB') ? ('TIMER') : ('TIMER'));// placeholder!
          break;
        case 'COUNTER':
          ret = ((choose && choose === 'DB') ? ('COUNTER') : ('COUNTER'));// placeholder!
          break;
        default:
          ret = undefined;
      }
      return ret;
    }

    /**
     * @description NodeS7 has it's own Syntax for a Request. This Function creates the Syntax for a NodeS7-Request.
     * @param {Object} S7Object - The S7-Object that comes from the HTML-Page
     * @param {String} choose - use 'data' for ... and 'path' for ...
     * @returns {String} A string that defines the Syntax for the Request
     * @todo Extend this Function when using more Datatypes e.g Int,DInt ...
     * @example
     * wrapData(S7Object)(S7Object)
     * //returns EB0 => S7Object={S7_Type:'' ,S7_DBnum:'0',S7_Datatype:'',S7_Offset:'0',S7_BitOffset:'0',S7_Quantity:'0',S7_Name:''}
     */
    function wrapData(S7Object, choose) {
      if (!S7Object) return;
      let ret = S7Object;
      switch (S7Object.S7_Type) {
        case 'I':
        case 'Q': // X,BYTE,WORD,DWORD,INT,DINT,CHAR,STRING,R,TIMER,COUNTER
        case 'M':
        case 'PI':
        case 'PQ':
          if (S7Object.S7_Datatype === 'X') {
            // Bool
            ret = S7Object.S7_Type + S7Object.S7_Offset + '.' + S7Object.S7_BitOffset;// I0.0
          } else if (S7Object.S7_Datatype === 'CHAR') {
            // CHAR
            ret = S7Object.S7_Type + getDataTypeAsString(S7Object) + S7Object.S7_Offset;// MC0
          } else {
            // BYTE,WORD,DWORD,INT,DINT,STRING,R,TIMER,COUNTER
            if (S7Object.S7_Quantity > 1) {
              if (choose === 'path') {
                // IB0-IBx into IB0..x
                ret = S7Object.S7_Type + getDataTypeAsString(S7Object) + S7Object.S7_Offset + '..' + (S7Object.S7_Quantity - 1);
              } else if (choose === 'data') {
                // IB0-IBx into IB0.x
                ret = S7Object.S7_Type + getDataTypeAsString(S7Object) + S7Object.S7_Offset + '.' + S7Object.S7_Quantity;
              } else {
                ret = null;
              }
            } else {
              ret = S7Object.S7_Type + getDataTypeAsString(S7Object) + S7Object.S7_Offset;	// IB0
            }
          }
          break;
        case 'DB':
          if (S7Object.S7_Datatype === 'X') {
            // Bool
            ret = S7Object.S7_Type + S7Object.S7_DBnum + ',' + getDataTypeAsString(S7Object, 'DB') + S7Object.S7_Offset + '.' + S7Object.S7_BitOffset;	// DB10.DBX0.1  into  DB10,X0.1
          } else if (S7Object.S7_Datatype === 'CHAR') {
            // CHAR
            ret = S7Object.S7_Type + S7Object.S7_DBnum + ',' + getDataTypeAsString(S7Object, 'DB') + S7Object.S7_Offset;// DB10.DBC0 into 'DB10,CHAR0'
          } else {
            // BYTE,WORD,DWORD,INT,DINT,STRING,R,TIMER,COUNTER
            if (S7Object.S7_Quantity > 1) {
              // Quantity >1 (array)
              if (choose === 'path') {
                ret = S7Object.S7_Type + S7Object.S7_DBnum + ',' + getDataTypeAsString(S7Object, 'DB') + S7Object.S7_Offset + '..' + (S7Object.S7_Quantity - 1);// DB10.DBW0-DB10.DBW2   into 'DB10,WORD1..2'
              } else if (choose === 'data') {
                ret = S7Object.S7_Type + S7Object.S7_DBnum + ',' + getDataTypeAsString(S7Object, 'DB') + S7Object.S7_Offset + '.' + S7Object.S7_Quantity;// DB10.DBW0-DB10.DBW2   into 'DB10,WORD1.2'
              } else {
                ret = null;// default
              }
            } else {
              ret = S7Object.S7_Type + S7Object.S7_DBnum + ',' + getDataTypeAsString(S7Object, 'DB') + S7Object.S7_Offset;// DB10.DBW0 into 'DB10,WORD1'
            }
          }
          break;
        case 'T':
          ret = S7Object.S7_Type + S7Object.S7_Offset;
          break;
        case 'C':
          ret = S7Object.S7_Type + S7Object.S7_Offset;
          break;
        default:
          ret = null;
      }
      return ret;
    }

    // Connection Management
    function disconnect(cb) {
      outputLog('[s7comm-Function] - disconnect. Configuration:[' + node.id + '], Status: ' + printStatus(), 3);

      stopWatchingStates();

      if (node.plc) {
        node.plc.dropConnection(() => {
          outputLog('[s7comm-Warning] - Connection to PLC ' + node.RFCParam.host.toString() + ' dropped. Configuration:[' + node.id + '], Status: ' + printStatus(), 1);
          setStatus('disconnected');
          node.state.connected = false;
          node.plc = null;
          cb();
        });
      } else {
        setStatus('disconnected');
        node.state.connected = false;
        process.nextTick(cb);
      }
    }

    function connect() {
      outputLog('[s7comm-Function] - connect. Configuration:[' + node.id + '].', 3);
      // Make shure to close a possible instance
      if (node.plc) {
        outputLog('[s7comm-Warning] - Disconnect a prior connection first.', 1);
        disconnect(connectNow);
      } else {
        process.nextTick(connectNow);
      }
    }

    function connectNow() {
      outputLog('[s7comm-Function] - connectNow. Configuration:[' + node.id + '], Status: ' + printStatus(), 3);
      // Create new NodeS7 Instance
      node.plc = new Nodes7(logLevelPlcS7);
      // Patch nodes7 for our purposes !
      node.plc.requestMaxParallel = 1;
      node.plc.maxParallel = 1;


      // Add Item here into the pollinglist
      let addr = [];
      for (var id in node.payload) {
        if (node.payload.hasOwnProperty(id)) {
          addr.push(wrapData(node.payload[id], 'data'));
        }
      }

      /* const addr = require('./addr.js'); */

      node.plc.addItems(addr);
      outputLog('[s7comm-Info] - New NodeS7 Instance created. Status: ' + printStatus(), 2);

      // Connect
      outputLog('[s7comm-Function] - initiateConnection @' + new Date(), 3);
      node.state.connecting = true;
      node.plc.initiateConnection(node.RFCParam, (err) => {
        outputLog('[s7comm-Info] - Connection Callback occured', 2);
        node.state.connecting = false;
        clearTimer('handleConnectionTimeout');

        if (err) {
          // On Error
          outputLog('[s7comm-Error] - Error occured during Connection Establishment.', 0);
          const myErr = ((typeof (err) === 'object') ? (JSON.stringify(err)) : (err));
          outputLog('[s7comm-Info] - Err: ' + myErr + ',State: -  ' + printStatus(), 2);

          stopWatchingStates();
          setStatus('error');
          node.state.connected = false;
          onConnectionError();
          return;
        }
        // Connected
        outputLog('[s7comm-Warning] - Connection established to PLC ' + node.RFCParam.host.toString() + ':' + node.RFCParam.port.toString(), 1);
        setStatus('connected');
        node.state.connected = true;
        startWatchingStates();

        // Trigger single Reading once, because if intervall reading is huge
        // and we get an external input we get an reading error.
        outputLog('[s7comm-Info] - Single reading once to init values (PLC ' + node.RFCParam.host.toString() + ').', 2);
        node.plc.readAllItems((anythingBad, values) => {
          node.state.reading = false;
          node.readDataBuffer.anythingBad = anythingBad;
          node.readDataBuffer.values = values;
        });

        // Trigger Interval Reading.
        if (node.state.numOfReadNodes >= 1 && node.state.numOfReadIntervallNodes >= 1) {
          node.triggerIntervalReading();
        }
      });
    }

    function stopWatchingStates() {
      outputLog('[s7comm-Function] - stopWatchingStates. Configuration:[' + node.id + '].', 3);
      node.plc.isoclient.setKeepAlive(false);
      node.state.keepAliveRunning = false;

      clearTimer('handleConnectionTimeout');
      clearTimer('handleStateInterval');
      clearTimer('handleLocalTimeout');
      clearTimer('readingInterval');
    }

    function startWatchingStates() {
      outputLog('[s7comm-Function] - startWatchingStates. Configuration:[' + node.id + '].', 3);

      // set KeepAlive
      outputLog('[s7comm-Info] - Enable KeepAlive.', 2);

      node.state.keepAliveRunning = true;
      // Only for process.platform == 'win32'!!
      // sets TCP_KEEPTIME = 3sec, TCP_KEEPINTVL  = 3sec (windows only!), TCP_KEEPPROBES = ?
      node.plc.isoclient.setKeepAlive(true, 3000);

      // For process.platform == 'linux' we use module net-keepalive
      if (NetKeepAlive && node.plc.isoclient) {
        outputLog('[s7comm-Info] - Set the keepalive parameter for linux system.', 2);
        // sets TCP_KEEPTIME = 3sec, TCP_KEEPINTVL  = 3sec, TCP_KEEPPROBES = 8
        const probeInterval = 3000; // after initialDuration send probes every 1 second
        const maxProbesBeforeFail = 3; // after 10 failed probes connection will be dropped
        NetKeepAlive.setKeepAliveInterval(node.plc.isoclient, probeInterval);
        NetKeepAlive.setKeepAliveProbes(node.plc.isoclient, maxProbesBeforeFail);
      }

      // watch States
      outputLog('[s7comm-Info] - Start Watching NodeS7 States.', 2);
      node.state.handleStateInterval = setInterval(() => {
        if (node.plc.isoConnectionState === 4 && node.state.numOfReadIntervallNodes > 0 && node.state.rwCyclError === true) {
          // In case of cyclic reading & pull of cable
          setStatus('error');
          // Don't set because it also can be a read write Error. We don't know it yet
          // node.state.connected = false;
        } else if (node.plc.isoConnectionState === 4) {
          setStatus('connected');
        } else {
          setStatus('disconnected');
          node.state.connected = false;
          stopWatchingStates();
          onConnectionError();
        }
      }, 1000);
    }

    function onConnectionError() {
      outputLog('[s7comm-Function] - onConnectionError. Configuration:[' + node.id + '].', 3);
      disconnect(() => {
        outputLog('[s7comm-Warning] - Reconnection after 3 sec.', 1);
        setStatus('reconnection');
        node.state.handleConnectionTimeout = setTimeout(() => {
          clearTimer('handleConnectionTimeout');
          connect(); // disconnection will be done within connect method
        }, 3000);
      });
    }

    function updatePlcAddr() {
      if (!node.plc) return;
      /* let arr = [];
      for (var id in node.payload) {
        if (node.payload.hasOwnProperty(id)) {
          arr.push(wrapData(node.payload[id], 'data'));
        }
      }
      node.plc.addItems(arr); */
      disconnect(connectNow);
    }
    function cyclicReading() {
      outputLog('[s7comm-Function] - cyclicReading. Configuration:[' + node.id + '].', 3);
      node.state.reading = true;
      node.plc.readAllItems((anythingBad, values) => {
        outputLog('[s7comm-Info] - Iteration of cyclic reading process from PLC ' + node.RFCParam.host.toString() + ' done.', 2);
        node.state.rwCyclError = anythingBad; // Patch. Can be removed when connection Establishment Issue is solved.
        node.state.reading = false;
        node.readDataBuffer.anythingBad = anythingBad;
        node.readDataBuffer.values = values;
        //console.log('values :', values);
      });
    }
    // trigger the intervall reading process
    node.triggerIntervalReading = () => {
      outputLog('[s7comm-Function] - triggerIntervalReading. Node:[' + node.id + '].', 3);
      outputLog('[s7comm-Info] - Trigger interval reading process of PLC ' + node.RFCParam.host.toString(), 2);

      if (!node.state.connected) {
        outputLog('[s7comm-Error] - Error during reading process. No Connection to ' + node.RFCParam.host.toString() + '.', 0);
        // node.readJSON = getJSON(node, null, 1, FilledArray(1, null));
        // node.send(node.readJSON);
      } else {
        // reset
        if (node.state.readingInterval !== null) {
          clearTimeout(node.state.readingInterval);
        }
        node.state.readingInterval = setInterval(cyclicReading, node.state.readIntervalTime);
      }
    };


    // trigger the single reading process
    node.triggerSingleReading = (myNode) => {
      outputLog('[s7comm-Function] - triggerSingleReading. Node:[' + myNode.id + '].', 3);
      outputLog('[s7comm-Info] - Trigger single reading process to PLC ' + myNode.NodeConfig.RFCParam.host.toString(), 2);

      const wrappedPath = wrapData(myNode.dataHandle.rcvData, 'path');

      if (!myNode.NodeConfig.state.connected) {
        outputLog('[s7comm-Error] - Error during reading process. No Connection to ' + node.RFCParam.host.toString() + '.', 0);
        //sendDebug({ id: node.id, name: node.name, topic: "connection status :", msg: '[s7comm-Error] - Error during reading process. No Connection to ' + node.RFCParam.host.toString() + '.', _path: "path" })
        /* eslint-disable-next-line */
        myNode.NodeConfig.readJSON = getJSON(myNode, wrappedPath, 1, FilledArray(myNode.dataHandle.rcvData.S7_Quantity, null));
        myNode.send(myNode.NodeConfig.readJSON);
      } else {
        node.readQueue.push(myNode);
        if (!node.state.reading) {
          singleReading();
        }
      }
    };

    // trigger the single writing process
    node.triggerSingleWriting = (myNode, value) => {
      outputLog('[s7comm-Function] - triggerSingleWriting. Node:[' + myNode.id + '].', 3);
      outputLog('[s7comm-Info] - Trigger single writing process to PLC ' + myNode.NodeConfig.RFCParam.host.toString(), 2);
      //sendDebug({ id: node.id, name: node.name, topic: "connection status :", msg: '[s7comm-Info] - Trigger single writing process to PLC ' + myNode.NodeConfig.RFCParam.host.toString(), _path: "path" })
      const wrappedData = wrapData(myNode.dataHandle.rcvData, 'data');// raw Item
      const wrappedPath = wrapData(myNode.dataHandle.rcvData, 'path');// formated Item (change format in case quantity >1)

      if (!myNode.NodeConfig.state.connected) {
        outputLog('[s7comm-Error] - Error during writing process. No Connection to ' + node.RFCParam.host.toString() + '.', 0);
        //sendDebug({ id: node.id, name: node.name, topic: "connection status :", msg: '[s7comm-Error] - Error during writing process. No Connection to ' + node.RFCParam.host.toString() + '.', _path: "path" })
        /* eslint-disable-next-line */
        myNode.NodeConfig.writeJSON = getJSON(myNode, wrappedPath, 1, FilledArray(1, null));
        myNode.send(myNode.NodeConfig.writeJSON);
      } else if (wrappedData === null) {
        outputLog('[s7comm-Error] - Error during writing process. Invalid Data', 0);
        //sendDebug({ id: node.id, name: node.name, topic: "connection status :", msg: '[s7comm-Error] - Error during writing process. Invalid Data', _path: "path" })
        /* eslint-disable-next-line */
        myNode.NodeConfig.writeJSON = getJSON(myNode, wrappedPath, -1, FilledArray(1, null));
        myNode.send(myNode.NodeConfig.writeJSON);
      } else if (typeof (value.payload) !== 'object' && value.payload.value) {
        outputLog('[s7comm-Error] - Error during writing process. Invalid writing Data. Data:' + value.payload, 0);
        //sendDebug({ id: node.id, name: node.name, topic: "connection status :", msg: '[s7comm-Error] - Error during writing process. Invalid writing Data. Data:' + value.payload, _path: "path" })
        /* eslint-disable-next-line */
        myNode.NodeConfig.writeJSON = getJSON(myNode, wrappedPath, -1, FilledArray(1, null));
        myNode.send(myNode.NodeConfig.writeJSON);
      } else {
        const val = checkWritingValue(myNode, value.payload.value);

        if (val === null) {
          outputLog('[s7comm-Error] - Error during writing process. Verified Data is null.', 0);
          //sendDebug({ id: node.id, name: node.name, topic: "connection status :", msg: '[s7comm-Error] - Error during writing process. Verified Data is null.', _path: "path" })
          /* eslint-disable-next-line */
          myNode.NodeConfig.writeJSON = getJSON(myNode, wrappedPath, -1, FilledArray(1, null));
          myNode.send(myNode.NodeConfig.writeJSON);
        } else {
          const element = {
            node: myNode,
            name: [wrappedData],
            val: val.value,
            error: val.error,
          };
          myNode.NodeConfig.writeQueue.push(element);
          if (!myNode.NodeConfig.state.writing) {
            singleWriting();
          }
        }
      }
    };

    // trigger the single reading process
    node.readingComplete = (myNode, done) => {
      outputLog('[s7comm-Function] - readingComplete. Node:[' + myNode.id + '].', 3);
      const wrappedData = wrapData(myNode.dataHandle.rcvData, 'data');
      const wrappedPath = wrapData(myNode.dataHandle.rcvData, 'path');
      if (wrappedData === null) {
        outputLog('[s7comm-Error] - No Signal selected within the reading node. WrappedData:' + wrappedData, 0);
        myNode.NodeConfig.readJSON = getJSON(myNode, wrappedPath, -1, FilledArray(myNode.dataHandle.rcvData.S7_Quantity, null));
      } else if (Object.keys(myNode.NodeConfig.readDataBuffer).length === 0 && myNode.NodeConfig.readDataBuffer.constructor === Object) {
        // No Data. Due to no Connection or anything else. This can happen during cyclic reading & No connection
        outputLog('[s7comm-Error] - No response values from reading request available. Wrong Buffer. ReadDataBuffer:' + myNode.NodeConfig.readDataBuffer, 0);
        /* eslint-disable-next-line */
        myNode.NodeConfig.readJSON = getJSON(myNode, wrappedPath, -1, FilledArray(myNode.dataHandle.rcvData.S7_Quantity, null));
      } else if (!myNode.NodeConfig.readDataBuffer.values) {
        // No Data. Due to no Connection or anything else. This can happen during cyclic reading & No connection
        outputLog('[s7comm-Error] - No response values from reading request available. No Buffer Value. Values:' + myNode.NodeConfig.readDataBuffer, 0);
        /* eslint-disable-next-line */
        myNode.NodeConfig.readJSON = getJSON(myNode, wrappedPath, -1, FilledArray(myNode.dataHandle.rcvData.S7_Quantity, null));
      } else {
        outputLog('[s7comm-Info] - Processing Response data of Reading Process.', 2);
        // Checks the return object of a reading process and sets quality and value in a defined form.
        // The Node-RED node contains a parameter which represent the return value of an reading process see example.
        // With obj={anythingBad: false,values:{ 'DB11102,BYTE14.4':[ 3, 2, 97, 98 ]}}
        // We return for each node {err:0,arr:[ 3, 2, 97, 98 ]}
        // A response value can either be a decimal value or string 'BAD x' if an Error occured
        // single Item or Array if the Quantity is >1

        const tmp = { err: -1, arr: [null] };// buffer for receiving val {anythingBad:bool,values: { MB1: 5, MW10: 4, etc }}


        const data = myNode.NodeConfig.readDataBuffer;

        const dataBadData = data.anythingBad;
        const dataValues = data.values[wrappedData];
        if (dataValues !== undefined || dataValues !== null) {
          if (dataBadData === false) {
            // no Error
            tmp.err = 0;
            tmp.arr = [null];
            if (!Array.isArray(dataValues)) {
              tmp.arr = [dataValues];// single value!
            } else {
              tmp.arr = dataValues;// array!
            }
          } else if (dataBadData === true) {
            // Error
            if (!Array.isArray(dataValues)) {
              tmp.err = 0;
              // single value!
              if (dataValues === undefined || (typeof (dataValues) === 'string' && dataValues.search('BAD') === 0)) {
                tmp.err = -1;
                tmp.arr = [null];
              } else {
                tmp.arr = [dataValues];
              }
            }
            if (Array.isArray(dataValues)) { // array!
              tmp.err = 0;
              for (var i in dataValues) {
                if (dataValues[i] === undefined || (typeof (dataValues[i]) === 'string' && dataValues[i].search('BAD') === 0)) {
                  tmp.err = -1;
                  tmp.arr[i] = null;
                } else {
                  tmp.arr[i] = dataValues[i];
                }
              }
            }
          }
          myNode.NodeConfig.readJSON = getJSON(myNode, wrappedPath, tmp.err, tmp.arr);
        } else {
          outputLog('[s7comm-Error] - No response values from reading request available. No Data. Error:' + dataBadData + ',Values:' + dataValues, 0);
          /* eslint-disable-next-line */
          myNode.NodeConfig.readJSON = getJSON(myNode, wrappedPath, -1, FilledArray(myNode.dataHandle.rcvData.S7_Quantity, null));
        }
        /* eslint-disable-next-line */
      }
      done(myNode.NodeConfig.readJSON)
    };

    node.register = (myNode, cb) => {
      node.users[myNode.id] = myNode;
      node.payload[myNode.id] = myNode.payload

      for (var i in node.users) {
        node.state.numOfWriteNodes++;
        node.state.numOfReadNodes++;
        if (node.users[i].nodeTiming.repeat && !isNaN(node.users[i].nodeTiming.repeat) && node.users[i].nodeTiming.repeat > 0) {
          node.state.numOfReadIntervallNodes++
          node.state.readCyclArray.push(node.users[i].nodeTiming.repeat);
          node.state.readIntervalTime = getMin(node.state.readCyclArray) / 2;// (Array.min(node.state.readCyclArray)) / 2;
          node.state.readIntervalTime = 300;
          if (node.state.readIntervalTime < 100) {
            node.state.readIntervalTime = 100;
          }
        }
      }

      if (Object.keys(node.users).length === 1) {
        connect(); // connect within s7comm
      }

      updatePlcAddr();
      console.log(`[s7-info] - Register Node : [${myNode.id}] - new ReadintervalTime : ${node.state.readIntervalTime} ms`)
      outputLog(`[s7-info] - Register Node : [${myNode.id}] - new ReadintervalTime : ${node.state.readIntervalTime} ms`, 3);
      cb();
    };


    // Deregister r/w node from list
    node.deregister = (myNode, cb) => {
      outputLog(`[s7-info] - Deregister Node : [${myNode.id}]`, 3);
      delete node.users[myNode.id];
      return cb();
    };
    node.startup = () => {
      RED.nodes.eachNode(function (n) {
        if ((node.id === n.connection) && (n.type === 's7.io')) {
          node.users[n.id] = RED.nodes.getNode(n.id);
          node.payload[n.id] = n.payload
        }
      });

      for (id in node.users) {
        if (node.users.hasOwnProperty(id)) {
          node.state.numOfWriteNodes++;
          node.state.numOfReadNodes++;
          if (node.users[id].nodeTiming.repeat && !isNaN(node.users[id].nodeTiming.repeat) && node.users[id].nodeTiming.repeat > 0) {
            node.state.numOfReadIntervallNodes++
            node.state.readCyclArray.push(node.users[id].nodeTiming.repeat);
            node.state.readIntervalTime = (Array.min(node.state.readCyclArray)) / 2;
            node.state.readIntervalTime = node.state.readIntervalTime * 1000;
            if (node.state.readIntervalTime < 100) {
              node.state.readIntervalTime = 100;
            }
          }
        }
      }

      if (Object.keys(node.users).length > 0) {
        connect(); // connect within s7comm
      }
    };


    node.on('close', () => {
      outputLog('[s7comm-Warning] - Closed Node event occured: ' + node.id, 1);
      outputLog('[s7comm-Function] - onNodeClose. Configuration:[' + node.id + '].', 3);
      clearTimer('readingInterval');

      stopWatchingStates();
      setStatus('disconnected');
      node.state.connected = false;

      // Only Disconnect. No manual reconnection. Will be done by Node-RED
      disconnect(() => {
        outputLog('[s7comm-Info] - Disconnection Done. Status: ' + printStatus(), 2);
      });

      RED.events.removeListener("flows:started", node.startup);
    });

    RED.events.on("flows:started", node.startup);


  }
  RED.nodes.registerType('s7.config', s7config);
}