/// <reference path="type_declarations/index.d.ts" />
import {join} from 'path';
import {logger} from 'loge';
var sqlcmd = require('sqlcmd-pg');

export var db = new sqlcmd.Connection({
  host: '127.0.0.1',
  port: '5432',
  user: 'postgres',
  database: 'signs',
});

// attach local logger to sqlcmd.Connection log events
db.on('log', function(ev) {
  var args = [ev.format].concat(ev.args);
  logger[ev.level].apply(logger, args);
});

export function initialize(callback: (error: Error) => void) {
  db.createDatabaseIfNotExists(error => {
    if (error) return callback(error);

    var migrations_dirpath = join(__dirname, 'migrations');
    db.executePatches('_migrations', migrations_dirpath, callback);
  });
}
