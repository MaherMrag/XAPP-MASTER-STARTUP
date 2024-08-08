
module.exports = {
 
    uiPort: process.env.PORT || 1880,
 

    // Retry time in milliseconds for MQTT connections
    mqttReconnectTime: 15000,

    // Retry time in milliseconds for Serial port connections
    serialReconnectTime: 15000,

    // Retry time in milliseconds for TCP socket connections
    socketReconnectTime: 10000,
 
    debugMaxLength: 1000,

 
    adminAuth: {
        type: "credentials",
        users: [{
            username: "admin",
            password: "$2a$12$YGgAov4N0CV9vtATdlvFwOkjjYXqFU1YE9SzdvKgqrVrIhhnkf34e",
            permissions: "*"
        },{
            username: "user",
            password: "$2y$12$U2qiuQqj5yc9jBZF1a1Qh.gxNhJG4Xe7NKgBjDzqLkXNpsaR1/VKu",
            permissions: "*"
        },
    ]
    },

    
    functionGlobalContext: {
        // os:require('os'),
        // jfive:require("johnny-five"),
        // j5board:require("johnny-five").Board({repl:false})
    },
 
    exportGlobalContextKeys: false,


 
    logging: {
        // Only console logging is currently supported
        console: {
            // Level of logging to be recorded. Options are:
            // fatal - only those errors which make the application unusable should be recorded
            // error - record errors which are deemed fatal for a particular request + fatal errors
            // warn - record problems which are non fatal + errors + fatal errors
            // info - record information about the general running of the application + warn + error + fatal errors
            // debug - record information which is more verbose than info + info + warn + error + fatal errors
            // trace - record very detailed logging + debug + info + warn + error + fatal errors
            // off - turn off all logging (doesn't affect metrics or audit)
            level: "info",
            // Whether or not to include metric events in the log output
            metrics: false,
            // Whether or not to include audit events in the log output
            audit: false
        }
    },

    // Customising the editor
    editorTheme: { 
        page : {
            css:['template.css'],
            scripts:['template.js'],
        },
        projects: {
            // To enable the Projects feature, set this value to true
            enabled: true
        }
    }
}
