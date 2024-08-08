



var runtime;

var api = module.exports = {
    init: function(_runtime) {
        runtime = _runtime;
        api.comms.init(runtime);
        api.flows.init(runtime);
        api.nodes.init(runtime);
        api.settings.init(runtime);
        api.library.init(runtime);
        api.projects.init(runtime);
        api.context.init(runtime);
        api.plugins.init(runtime);
        api.diagnostics.init(runtime);
    },

    comms: require("./comms"),
    flows: require("./flows"),
    library: require("./library"),
    nodes: require("./nodes"),
    settings: require("./settings"),
    projects: require("./projects"),
    context: require("./context"),
    plugins: require("./plugins"),
    diagnostics: require("./diagnostics"),

    isStarted: async function(opts) {
        return runtime.isStarted();
    },
    version: async function(opts) {
        return runtime.version();
    }
}
