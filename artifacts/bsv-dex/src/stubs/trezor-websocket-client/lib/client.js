function WebsocketClient() {}
WebsocketClient.prototype.open = function() { return Promise.resolve(); };
WebsocketClient.prototype.close = function() {};
WebsocketClient.prototype.request = function() { return Promise.resolve({}); };
WebsocketClient.prototype.on = function() {};
WebsocketClient.prototype.off = function() {};
module.exports = { WebsocketClient };
