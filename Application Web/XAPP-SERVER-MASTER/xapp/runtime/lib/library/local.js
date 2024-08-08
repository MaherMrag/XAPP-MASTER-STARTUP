

var runtime;
var storage;

function init(_runtime) {
    runtime = _runtime;
    storage = runtime.storage;
}

function getEntry(type,path) {
    return storage.getLibraryEntry(type,path);
}
function saveEntry(type,path,meta,body) {
    return storage.saveLibraryEntry(type,path,meta,body);
}

module.exports = {
    id: "local",
    label: "editor:library.types.local",
    icon: "font-awesome/fa-hdd-o",
    init: init,
    getEntry: getEntry,
    saveEntry: saveEntry
}
