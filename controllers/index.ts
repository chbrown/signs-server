import {join} from 'path';
import {logger} from 'loge';
import Router from 'regex-router';

var send = require('send');

var package_json = require('../package.json');

var contributorsController = require('./contributors');
var signsController = require('./signs');

var R = new Router();

R.any(/^\/contributors/, contributorsController);
R.any(/^\/signs/, signsController);

R.get(/^\/ui(\?|$)/, (req, res: any) => {
  res.status(301).redirect('ui/');
});

R.get(/^\/ui(\/[^?]*)(\?|$)/, (req, res: any, m: RegExpMatchArray) => {
  var root = join(__dirname, '..', 'node_modules', 'signs');
  var pathname = m[1];
  send(req, pathname, {root: root})
    .on('error', function(err) {
      res.status(err.status || 500).die('send error: ' + err.message);
    })
    .on('directory', function() {
      res.status(404).die('No resource at: ' + req.url);
    })
    .pipe(res);
});

/** GET /info
Show signs-server package metadata
*/
R.get(/^\/info$/, (req, res: any, m) => {
  var info = {
    name: package_json.name,
    version: package_json.version,
    description: package_json.description,
    homepage: package_json.homepage,
    author: package_json.author,
    license: package_json.license,
  };
  res.json(info);
});

export = R.route.bind(R);
