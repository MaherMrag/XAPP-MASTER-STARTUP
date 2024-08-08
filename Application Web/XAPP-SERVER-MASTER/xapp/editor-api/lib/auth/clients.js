
var clients = [
    {id:"node-red-editor",secret:"not_available"},
    {id:"node-red-admin",secret:"not_available"}
];

module.exports = {
    get: function(id) {
        for (var i=0;i<clients.length;i++) {
            if (clients[i].id == id) {
                return Promise.resolve(clients[i]);
            }
        }
        return Promise.resolve(null);
    }
}
