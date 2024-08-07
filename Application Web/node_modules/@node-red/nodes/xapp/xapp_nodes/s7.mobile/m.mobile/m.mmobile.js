var when = require('when');
module.exports = (RED) => {
  function mmMobile(n) {
    RED.nodes.createNode(this, n);
    this.id = n.id;
    this.type = n.type;
    this.topic = n.topic;
    this.name = n.name;
    this.payload = n.payload;
  }
  RED.nodes.registerType('m.mmobile', mmMobile);



  var mobile = {
    getWidgets: function (req, res) {

      var result = [];
      RED.nodes.eachNode(function (n) {
        if (n.type === 'm.widget') {
          var node = RED.nodes.getNode(n.id)
          if (node.payload) {
            for (var id in node.payload) {
              if (node.payload.hasOwnProperty(id)) {
                var id = node.payload[id].id;
                var nn = RED.nodes.getNode(id);
         
                result.push({ id: nn.id, name: nn.name, topic: nn.topic, value: '0.0', maxvalue: nn.maxvalue, path: 'assets/fitness_app/burned.png', color: nn.color, darkcolor: '#002450', whitecolor: '#8A98E8', unit: nn.unit,widgettype:nn.widgettype })




              }
            }
          }
        }
      });
      console.log('RESULT :',result);
      res.json(result);
    },

    getDashboard: function (req, res) {

      var result = [];
      var date = req.body;

      var promises = [];
      var response = {}
      var data = [];
      RED.nodes.eachNode(function (n) {
        if (n.type === 'm.barchart') {
          var node = RED.nodes.getNode(n.id)
          promises.push(barChart.getData(node, date))

        }
        if (n.type === 'm.piechart') {
          var node = RED.nodes.getNode(n.id)
            ;
          promises.push(pieChart.getData(node, date))
        }
      });

      when.settle(promises).then(function (result) {
        result.forEach(function (res) {


  console.log('RESSSSSSSSSSSS :',res);
 

            data.push({ result: res.value});

        })


        response = { data: data }
      

        res.json(response);
      })


      /*      res.json(result); */
    },




  }

  var barChart = {
    getData: function (node, date) {
      var legend = [];
      var datasets = {};
      var backgroundColor = [];
      var data = [];
      var response = {}
      var date = date;
      var promises = [];
      return new Promise(function (resolve, reject) {

        for (var id in node.payload) {
          if (node.payload.hasOwnProperty(id)) {
            var id = node.payload[id].id;
            var nn = RED.nodes.getNode(id);
            legend.push(node.payload[id].name)
            backgroundColor.push(node.payload[id].color);
            promises.push(barChart.findData(nn, date))
          }
        }

        when.settle(promises).then(function (result) {
          result.forEach(function (res) {

            arr = []

            for (var id in res.value.result) {
              if (res.value.result.hasOwnProperty(id)) {
                arr.push(res.value.result[id])


              }
            }
            console.log('res.value.result :', arr);
            data.push({ id: res.value.id, name: res.value.name, result: arr });
          })

          datasets = {type:'barChart',name:node.name, data: data, backgroundColor: backgroundColor }

          resolve(datasets);
        })


      })

    },

    findData: function (nn, date) {
      return new Promise(function (resolve, reject) {
        setTimeout(() => nn.aggregate(date, "barChart", (data) => {
          resolve(data);
        }), 200);
      })
    },

  }
  var pieChart = {
    findData: function (nn, date) {
      return new Promise(function (resolve, reject) {
        setTimeout(() => nn.findData(date, "sum", (data) => {
          resolve(data);
        }), 200);
      })
    },
    getData: function (node, date) {
      var legend = [];
      var datasets = {};
      var backgroundColor = [];
      var data = [];
      var response = {}
      var date = date;
      var promises = [];
      return new Promise(function (resolve, reject) {




        for (var id in node.payload) {
          if (node.payload.hasOwnProperty(id)) {
            var id = node.payload[id].id;
            var nn = RED.nodes.getNode(id);
            legend.push(node.payload[id].name)
            backgroundColor.push(node.payload[id].color);
            promises.push(pieChart.findData(nn, date))
          }
        }

        when.settle(promises).then(function (result) {
          result.forEach(function (res) {
            data.push({ value: res.value.value, name: res.value.name })

          })

          datasets = { type:'pieChart',name:node.name,data: data, backgroundColor: backgroundColor }

          resolve(datasets);
        })


      });
    },

  }



  RED.httpAdmin.get("/widgets", mobile.getWidgets);
  RED.httpAdmin.post("/dashboard", mobile.getDashboard);

};



