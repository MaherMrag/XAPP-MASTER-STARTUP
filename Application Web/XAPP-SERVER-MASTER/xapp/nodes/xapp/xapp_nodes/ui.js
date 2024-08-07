var inited = false;
var when = require('when');
var mustache = require('mustache');
module.exports = function (RED) {
    if (!inited) {
        inited = true;
        initserver(RED);
    }
    return {

    };
};

function initserver(RED) {

    RED.httpAdmin.post("/insertdates/", (req, res) => {
        var startdate = new Date('09-01-2020')
        var enddate = new Date('12-01-2020')

        var dateList = []
        function GetMinutesList(start, end) {
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
        }
        dateList = GetMinutesList(startdate, enddate)
        var count = 0;
        RED.nodes.eachNode(function (n) {

            if (n.type === 's7.io') {
                count = count + 1;
                if (count >= 20) { return; }
                var i = 0;
                var offset = Math.random() * 100;
                var node = RED.nodes.getNode(n.id)
                var payload = []
                dateList.forEach((dt) => {
                    i++;
                    if (i > 1440) {
                        i = 0;
                        offset = Math.random() * 100
                    }
                    var value = ((Math.random() * 100) * offset).toFixed(2) - 0;
                    payload.push({
                        id: node.id,
                        name: node.name,
                        value: value,
                        datetime: dt.date,
                    })
                })
                var database = RED.nodes.getNode(node.operation);
                var msg = { _msgid: node.id, payload: [payload], operation: 'insertMany' };
                if (database) {
                    database.do(msg, (result) => {
                        console.log('Done')
                    });
                }
            }
        });


        res.json({ value: 'ok' });
















    });
    //Template

    var template = {
        render: function (req, res) {
            var context = {};
            try {
                var data = req.body;
                var id = data.id;
                var maxvalue = data.maxvalue;
                var name = data.name;

                context.value = id + '-value';
                context.percent = id + '-percent';
                context.name = name
                context.color = '#26b99a'
                context.maxvalue = maxvalue;
                res.send(mustache.render(data.template, context));
            } catch (err) {
                res.sendStatus(500);
                console.log('eerr :', err)

            }
        }
    }
    RED.httpAdmin.post("/template/:id", template.render);

    //Pei chart
    var pieChart = {
        findData: function (nn, date) {
            return new Promise(function (resolve, reject) {
                setTimeout(() => nn.findData(date, "sum", (data) => {
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


            var date = req.body.date;
            var datapoints = req.body.datapoints;

            var promises = [];
            for (var id in datapoints) {
                if (datapoints.hasOwnProperty(id)) {
                    var _id = datapoints[id].id;
                    var nn = RED.nodes.getNode(_id);
                    legend.push(nn.name)
                    backgroundColor.push(nn.color);
                    promises.push(pieChart.findData(nn, date))
                }
            }

            when.settle(promises).then(function (result) {
                result.forEach(function (res) {
                    if (res.value.payload[0])
                        data.push({ value: res.value.payload[0].total, name: res.value.name })

                })

                datasets = { data: data, backgroundColor: backgroundColor }
                response = { legend: legend, datasets: datasets }
                res.json(response);
            })
        },

    }

    RED.httpAdmin.post("/peichart/:id", pieChart.getData);

    //S7 IO

    var io = {

        getData: function (req, res) {
            var legend = [];
            var response = {}
            var id = req.params.id;
            var node = RED.nodes.getNode(id);
            var date = req.body.date;
            var unit = req.body.unit;
            legend[0] = node.name;
            node.aggregate(date, unit, (data) => {
                response = { legend: legend, data: data }
                res.json(response);
            })
        },

    }

    RED.httpAdmin.post("/io/:id", io.getData);





    //Trend


    var trend = {
        findData: function (nn, date, x_interval, agg_by) {
            return new Promise(function (resolve, reject) {
                setTimeout(() => nn.aggregate(date, x_interval, agg_by, (data) => {
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
            var date = { startdate: Date.parse(req.body.date.startdate), enddate: Date.parse(req.body.date.enddate) };
            var x_interval = req.body.x_interval;
            var agg_by = req.body.agg_by;
            var datapoints = req.body.datapoints;




            var promises = [];

            if (node) {
                for (var id in datapoints) {
                    if (datapoints.hasOwnProperty(id)) {
                        var id = datapoints[id].id;
                        var nn = RED.nodes.getNode(id);
                        legend.push(nn.name)
                        backgroundColor.push(nn.color);
                        promises.push(trend.findData(nn, date, x_interval, agg_by))
                    }
                }
            }
            when.settle(promises).then(function (result) {
                result.forEach(function (res) {
                    data.push({ id: res.value.id, name: res.value.name, result: res.value.result });
                })

                datasets = { data: data, backgroundColor: backgroundColor }
                response = { legend: legend, datasets: datasets }
                res.json(response);
            })
        },

    }

    RED.httpAdmin.post("/trend/:id", trend.getData);


    //BarCHart
    var barChart = {
        findData: function (nn, date, x_interval, agg_by) {
            return new Promise(function (resolve, reject) {
                setTimeout(() => nn.aggregate(date, x_interval, agg_by, (data) => {
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
            var date = req.body.date;
            var x_interval = req.body.x_interval;
            var agg_by = req.body.agg_by;
            var datapoints = req.body.datapoints;

            var promises = [];

            if (node) {
                for (var id in datapoints) {
                    if (datapoints.hasOwnProperty(id)) {
                        var id = datapoints[id].id;
                        var nn = RED.nodes.getNode(id);
                        legend.push(nn.name)
                        backgroundColor.push(nn.color);
                        promises.push(barChart.findData(nn, date, x_interval, agg_by))
                    }
                }
            }
            when.settle(promises).then(function (result) {
                result.forEach(function (res) {
                    data.push({ id: res.value.id, name: res.value.name, result: res.value.result });
                })

                datasets = { data: data, backgroundColor: backgroundColor }
                response = { legend: legend, datasets: datasets }
                res.json(response);
            })
        },

    }

    RED.httpAdmin.post("/barchart/:id", barChart.getData);

   //Spark
    var spark = {

        getData: function (req, res) {
            var id = req.params.id;
            var node = RED.nodes.getNode(id);

            var data = req.body; 
            var date = { startdate: data.startdate, enddate: data.enddate }
            var tag_id = data.tag;
            var nn = RED.nodes.getNode(tag_id);
            if (nn){
                nn.aggregate(date, 'days','sum', (result) => {
                    res.json(result);
                });
            }else{
                res.json({})
            }
            
        },

    }
    RED.httpAdmin.post("/spark/:id", spark.getData);

    //Batch
    var batch = {
        findData: function (nn, batchid, date) {
            return new Promise(function (resolve, reject) {
                setTimeout(() => nn.getdata(date, batchid, (data) => {
                    resolve(data);
                }), 200);
            })
        },
        getData: function (req, res) {

            var id = req.params.id;
            var node = RED.nodes.getNode(id);
            var date = req.body;
            var database = RED.nodes.getNode(node.database);

            var startdate = new Date(date.startdate);
            var enddate = new Date(date.enddate);

            var promises = [];
            var datapoints = [];

            RED.nodes.eachNode(function (nn) {
                if (nn.parentid === node.id) {
                    datapoints.push(nn.id)
                }
            });


            var request = [{ id: id, start: { $gte: startdate, $lte: enddate } }, [{ $project: { _id: 0, id: 1, batchid: 1, batchstatus: 1, start: 1, end: 1 } }, { $sort: { start: 1 } }]];

            /* 
            var request = [
              {
                $project: {_id: 0, id: 1, batchid: 1, batchstatus: 1, start: 1, end: 1, }
              },
      
              { $match: {id: id, start: { $gte: startdate, $lte: enddate } } },
              {$sort: {start: 1}},
              function (err, result) { }
      
            ]; */


            var msg = {};
            if (database) {
                var value = 0.0;
                var msg = { _msgid: id, payload: request, operation: 'find.toArray' };

                database.do(msg, (result) => {

                    var payload = result.payload;

                    for (id in payload) {
                        if (payload.hasOwnProperty(id)) {

                            var batchid = payload[id].batchid;

                            datapoints.forEach((_id) => {
                                var nn = RED.nodes.getNode(_id);
                                if (nn && nn.type != 's7.trend') promises.push(batch.findData(nn, batchid))

                            });
                        }
                    }
                    var data = [];
                    var batchs = []
                    var _batch = {};
                    var batchkey;
                    when.settle(promises).then(function (result) {
                        for (id in payload) {
                            batchkey = payload[id].batchid;
                            //batchs[batchkey] = payload[id];
                            _batch['batch'] = payload[id];
                            result.forEach(function (res) {
                                if (Object.keys(res.value.payload).length != 0) {
                                    if (batchkey === res.value.payload[0].batchid) {
                                        var id = res.value.payload[0].id
                                        var key = id;
                                        _batch[key] = res.value.payload;
                                        // batchs[batchkey][key] = res.value.payload;
                                    }
                                }
                            })

                            batchs = [...batchs, _batch];
                            _batch = {};
                        }


                        response = {}
                        /* console.log('Batchs :', batchs) */
                        res.json(batchs);
                    })



                });
            }




            /*       var promises = [];
            
                  if (node) {
                    for (var id in datapoints) {
                      if (datapoints.hasOwnProperty(id)) {
                        var id = datapoints[id].id;
                        var nn = RED.nodes.getNode(id);
            
                        promises.push(barChart.findData(nn, unit, date))
                      }
                    }
                  }
                  when.settle(promises).then(function (result) {
                    result.forEach(function (res) {
                      data.push({ id: res.value.id, name: res.value.name, result: res.value.result });
                    })
            
                    datasets = { data: data, backgroundColor: backgroundColor }
                    response = { legend: legend, datasets: datasets }
                    res.json(response);
                  }) */

        },


    }
    RED.httpAdmin.post("/batch/:id", batch.getData);

    var tags = {

        writeData: function (req, res) {
            var node = RED.nodes.getNode(req.params.id);
            if (node) {
                try {
                    var msg = req.body;
                    node.NodeConfig.triggerSingleWriting(node, msg);
                    res.sendStatus(200);
                } catch (err) {
                    res.sendStatus(500);
                    node.error(RED._("inject.failed", { error: err.toString() }));
                }
            } else {
                res.sendStatus(404);
            }
        },

    }

    RED.httpAdmin.post("/tags/:id", tags.writeData);


    var statemachine = {
        findData: function (nn, batchid, date) {
          return new Promise(function (resolve, reject) {
            setTimeout(() => nn.getdata(batchid, (data) => {
              resolve(data);
            }), 200);
          })
        },
        getData: function (req, res) {
    
          var id = req.params.id;
          var node = RED.nodes.getNode(id);
          var date = req.body;
          var database = RED.nodes.getNode(node.database);
    
          var startdate = new Date(date.startdate);
          var enddate = new Date(date.enddate);
    
    
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
              var _payload = Object.values(payload);
              _payload.forEach((nn) => {
                node.globalcounter[nn.state] = { state: nn.state, count: nn.count }
              });
    
              res.json({})
            });
    
    
    
          }
        }
    
    
    
    
    
    
    
    
      }
    
    
    
    
    
    
      RED.httpAdmin.post("/statemachine/:id", statemachine.getData);
}