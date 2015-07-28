/// <reference path="../type_declarations/index.d.ts" />
var url = require('url');
var path_1 = require('path');
var fs_1 = require('fs');
var zlib_1 = require('zlib');
var child_process_1 = require('child_process');
var loge_1 = require('loge');
var Router = require('regex-router');
// async.d.ts isn't quite up to snuff for what I need
var async = require('async');
var send = require('send');
var database_1 = require('../database');
var package_json = require('../package.json');
var R = new Router();
R.get(/^\/ui(\?|$)/, function (req, res) {
    res.status(301).redirect('ui/');
});
R.get(/^\/ui(\/[^?]*)(\?|$)/, function (req, res, m) {
    var root = path_1.join(__dirname, '..', 'node_modules', 'signs');
    var pathname = m[1];
    loge_1.logger.info('static send: %j %j', root, pathname);
    send(req, pathname, { root: root })
        .on('error', function (err) {
        res.status(err.status || 500).die('send error: ' + err.message);
    })
        .on('directory', function () {
        res.status(404).die('No resource at: ' + req.url);
    })
        .pipe(res);
});
R.get(/^\/signs(\?|$)/, function (req, res) {
    var urlObj = url.parse(req.url, true);
    var query = database_1.db.Select('sign INNER JOIN contributor ON contributor.id = sign.contributor_id')
        .add('sign.id', 'sign.gloss', 'sign.description', 'contributor.email')
        .orderBy('sign.created DESC');
    var limit = Math.min(parseInt(urlObj.query.limit || 100, 10), 100);
    query = query.limit(limit);
    query.execute(function (error, signs) {
        if (error)
            return res.error(error);
        res.json(signs);
    });
});
R.get(/^\/uploads\/(\d+)\.webm$/, function (req, res, m) {
    res.setHeader('Cache-Control', 'max-age=600');
    res.setHeader('Content-Type', 'video/webm');
    var webm_filepath = path_1.join(process.env.UPLOADS_PATH, m[1] + '.webm');
    fs_1.createReadStream(webm_filepath).pipe(res);
});
function storeMovie(jpegs, framerate, webm_filepath, callback) {
    var ffmpeg_args = ['-f', 'image2pipe', '-r', framerate.toString(), '-i', '-', '-b:v', '512K', webm_filepath];
    var ffmpeg = child_process_1.spawn('ffmpeg', ffmpeg_args);
    ffmpeg.stdout.on('data', function (chunk) { return console.log('ffmpeg stdout: %s', chunk); });
    ffmpeg.stderr.on('data', function (chunk) { return console.log('ffmpeg stderr: %s', chunk); });
    ffmpeg.on('exit', function (code, signal) {
        console.log('ffmpeg exit code=%d signal=%s', code, signal);
        return callback();
    });
    async.eachSeries(jpegs, function (jpeg, callback) {
        ffmpeg.stdin.write(jpeg, callback);
    }, function (error) {
        if (error)
            return callback(error);
        ffmpeg.stdin.end();
        console.log('finished writing stdin');
    });
}
R.post(/^\/signs$/, function (req, res) {
    async.auto({
        images: function (callback) {
            req.readData(function (error, compressed_data) {
                if (error)
                    return callback(error);
                zlib_1.inflate(compressed_data, function (error, data) {
                    if (error)
                        return callback(error);
                    // data should be a newline-separated list of strings (Data URLs)
                    var images = data.toString('ascii').split('\n');
                    callback(null, images);
                });
            });
        },
        sign: function (callback) {
            database_1.db.InsertOne('sign')
                .set({
                gloss: req.headers['x-sign-gloss'],
                description: req.headers['x-sign-description'],
            })
                .returning('*')
                .execute(function (error, sign) {
                if (error)
                    return callback(error);
                console.log('inserted sign: %j', sign);
                callback(null, sign);
            });
        },
    }, function (error, _a) {
        var images = _a.images, sign = _a.sign;
        if (error) {
            console.error('error!', error.message, error);
            return res.error(error);
        }
        // console.log('after:images', images);
        console.log('after:sign', sign);
        // slice off the Data URL MIME-type and decode the Base64 string
        var jpegs = images.map(function (image) { return new Buffer(image.slice(23), 'base64'); });
        var framerate = parseFloat(req.headers['x-framerate']);
        var webm_filepath = path_1.join(process.env.UPLOADS_PATH, sign.id + '.webm');
        storeMovie(jpegs, framerate, webm_filepath, function (error) {
            if (error)
                return res.error(error);
            console.log('stored movie!');
            res.json(sign);
        });
    });
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
