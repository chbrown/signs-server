/// <reference path="../type_declarations/index.d.ts" />
var path_1 = require('path');
var Router = require('regex-router');
var send = require('send');
var package_json = require('../package.json');
var contributorsController = require('./contributors');
var signsController = require('./signs');
var R = new Router();
R.any(/^\/contributors/, contributorsController);
R.any(/^\/signs/, signsController);
R.get(/^\/ui(\?|$)/, function (req, res) {
    res.status(301).redirect('ui/');
});
R.get(/^\/ui(\/[^?]*)(\?|$)/, function (req, res, m) {
    var root = path_1.join(__dirname, '..', 'node_modules', 'signs');
    var pathname = m[1];
    send(req, pathname, { root: root })
        .on('error', function (err) {
        res.status(err.status || 500).die('send error: ' + err.message);
    })
        .on('directory', function () {
        res.status(404).die('No resource at: ' + req.url);
    })
        .pipe(res);
});
/** GET /info
Show signs-server package metadata
*/
R.get(/^\/info$/, function (req, res, m) {
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
module.exports = R.route.bind(R);
