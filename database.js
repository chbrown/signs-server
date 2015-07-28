/// <reference path="type_declarations/index.d.ts" />
var path_1 = require('path');
var loge_1 = require('loge');
var sqlcmd = require('sqlcmd-pg');
exports.db = new sqlcmd.Connection({
    host: '127.0.0.1',
    port: '5432',
    user: 'postgres',
    database: 'signs',
});
// attach local logger to sqlcmd.Connection log events
exports.db.on('log', function (ev) {
    var args = [ev.format].concat(ev.args);
    loge_1.logger[ev.level].apply(loge_1.logger, args);
});
function initialize(callback) {
    exports.db.createDatabaseIfNotExists(function (error) {
        if (error)
            return callback(error);
        var migrations_dirpath = path_1.join(__dirname, 'migrations');
        exports.db.executePatches('_migrations', migrations_dirpath, callback);
    });
}
exports.initialize = initialize;
