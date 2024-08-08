
var fs = require('fs');

var runtime;

function init(_runtime) {
    runtime = _runtime;
}

function getEntry(type,path) {
    var examples = runtime.nodes.getNodeExampleFlows()||{};
    var result = [];
    if (path === "") {
        return Promise.resolve(Object.keys(examples));
    } else {
        path = path.replace(/\/$/,"");
        var parts = path.split("/");
        var module = parts.shift();
        if (module[0] === "@") {
            module = module+"/"+parts.shift();
        }
        if (examples.hasOwnProperty(module)) {
            examples = examples[module];
            examples = parts.reduce(function(ex,k) {
                if (ex) {
                    if (ex.d && ex.d[k]) {
                        return ex.d[k]
                    }
                    if (ex.f && ex.f.indexOf(k) > -1) {
                        return runtime.nodes.getNodeExampleFlowPath(module,parts.join("/"));
                    }
                } else {
                    return null;
                }
            },examples);

            if (!examples) {
                return new Promise(function (resolve,reject) {
                    var error = new Error("not_found");
                    error.code = "not_found";
                    return reject(error);
                });
            } else if (typeof examples === 'string') {
                return new Promise(function(resolve,reject) {
                    try {
                        fs.readFile(examples,'utf8',function(err, data) {
                            runtime.log.audit({event: "library.get",library:"_examples",type:"flow",path:path});
                            if (err) {
                                return reject(err);
                            }
                            return resolve(data);
                        })
                    } catch(err) {
                        return reject(err);
                    }
                });
            } else {
                if (examples.d) {
                    for (var d in examples.d) {
                        if (examples.d.hasOwnProperty(d)) {
                            result.push(d);
                        }
                    }
                }
                if (examples.f) {
                    examples.f.forEach(function(f) {
                        result.push({fn:f})
                    })
                }
                return Promise.resolve(result);
            }
        } else {
            return new Promise(function (resolve,reject) {
                var error = new Error("not_found");
                error.code = "not_found";
                return reject(error);
            });
        }
    }
}

module.exports = {
    id: "examples",
    label: "editor:library.types.examples",
    icon: "font-awesome/fa-life-ring",
    types: ["flows"],
    readOnly: true,
    init: init,
    getEntry: getEntry
}
