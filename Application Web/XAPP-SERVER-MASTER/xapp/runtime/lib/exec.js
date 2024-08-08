

const child_process = require('child_process');
const { util } = require('../../util');

var events;

function logLines(id,type,data) {
    events.emit("event-log", {id:id,payload:{ts: Date.now(),data:data,type:type}});
}

module.exports = {
    init: function(_runtime) {
        events = _runtime.events;
    },
    run: function(command,args,options,emit) {
        var invocationId = util.generateId();

        emit && events.emit("event-log", {ts: Date.now(),id:invocationId,payload:{ts: Date.now(),data:command+" "+args.join(" ")}});

        return new Promise((resolve, reject) => {
            let stdout = "";
            let stderr = "";
            const child = child_process.spawn(command,args,options);
            child.stdout.on('data', (data) => {
                const str = ""+data;
                stdout += str;
                emit && logLines(invocationId,"out",str);
            });
            child.stderr.on('data', (data) => {
                const str = ""+data;
                stderr += str;
                emit && logLines(invocationId,"err",str);
            });
            child.on('error', function(err) {
                stderr = err.toString();
                emit && logLines(invocationId,"err",stderr);
            })
            child.on('close', (code) => {
                let result = {
                    code: code,
                    stdout: stdout,
                    stderr: stderr
                }
                emit && events.emit("event-log", {id:invocationId,payload:{ts: Date.now(),data:"rc="+code}});

                if (code === 0) {
                    resolve(result)
                } else {
                    reject(result);
                }
            });
        })
    }
}
