

var i18n = require("../../../../../util").i18n;

module.exports = {
    "package.json": function(project) {
        var packageDetails = {
            "name": project.name,
            "description": project.summary||i18n._("storage.localfilesystem.projects.summary"),
            "version": "0.0.1",
            "dependencies": {},
            "node-red": {
                "settings": {
                }
            }
        };
        if (project.files) {
            if (project.files.flow) {
                packageDetails['node-red'].settings.flowFile = project.files.flow;
                packageDetails['node-red'].settings.credentialsFile = project.files.credentials;
            }
        }
        return JSON.stringify(packageDetails,"",4);
    },
    "README.md": function(project) {
        var content = project.name+"\n"+("=".repeat(project.name.length))+"\n\n";
        if (project.summary) {
            content += project.summary+"\n\n";
        }
        content += i18n._("storage.localfilesystem.projects.readme");
        return content;
    },
    ".gitignore": function() { return "*.backup" ;}
}
