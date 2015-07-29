/// <reference path="../type_declarations/index.d.ts" />
var path_1 = require('path');
var url = require('url');
var fs_1 = require('fs');
var zlib_1 = require('zlib');
var child_process_1 = require('child_process');
var Router = require('regex-router');
var database_1 = require('../database');
// async.d.ts isn't quite up to snuff for what I need
var async = require('async');
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
var R = new Router();
R.get(/^\/signs(\?|$)/, function (req, res) {
    var urlObj = url.parse(req.url, true);
    var query = database_1.db.Select('sign INNER JOIN contributor ON contributor.id = sign.contributor_id')
        .add('sign.id', 'sign.gloss', 'sign.description', 'sign.contributor_id', 'contributor.email')
        .orderBy('sign.created DESC');
    if (urlObj.query.q) {
        var like_term = "%" + urlObj.query.q + "%";
        query = query.where('(gloss ILIKE ?) OR (description ILIKE ?)', like_term, like_term);
    }
    var limit = Math.min(parseInt(urlObj.query.limit || 100, 10), 100);
    query = query.limit(limit);
    query.execute(function (error, signs) {
        if (error)
            return res.error(error);
        res.json(signs);
    });
});
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
            var token = req.headers['x-token'] || '';
            // try to authenticate the contributor
            database_1.db.SelectOne('contributor INNER JOIN session ON session.contributor_id = contributor.id')
                .add('contributor.*')
                .whereEqual({
                token: token,
            })
                .execute(function (error, contributor) {
                if (error)
                    return callback(error);
                database_1.db.InsertOne('sign')
                    .set({
                    gloss: req.headers['x-sign-gloss'],
                    description: req.headers['x-sign-description'],
                    contributor_id: contributor ? contributor.id : 0,
                })
                    .returning('*')
                    .execute(function (error, sign) {
                    if (error)
                        return callback(error);
                    console.log('inserted sign: %j', sign);
                    callback(null, sign);
                });
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
R.get(/^\/signs\/(\d+)\.webm$/, function (req, res, m) {
    res.setHeader('Cache-Control', 'max-age=600');
    res.setHeader('Content-Type', 'video/webm');
    var webm_filepath = path_1.join(process.env.UPLOADS_PATH, m[1] + '.webm');
    fs_1.createReadStream(webm_filepath).pipe(res);
});
R.delete(/^\/signs\/(\d+)$/, function (req, res, m) {
    var token = req.headers['x-token'] || '';
    database_1.db.SelectOne('contributor, sign, session')
        .add('sign.*')
        .where('session.contributor_id = contributor.id')
        .where('sign.contributor_id = contributor.id')
        .whereEqual({
        'sign.id': m[1],
        token: token,
    })
        .execute(function (error, sign) {
        if (error)
            return res.die(error);
        if (!sign) {
            return res.status(403).json({
                message: 'Could not find movie to delete with your credentials'
            });
        }
        database_1.db.Delete('sign')
            .whereEqual({ id: sign.id })
            .execute(function (error, sign) {
            if (error)
                return res.die(error);
            res.status(200).json({ message: 'Deleted movie' });
        });
    });
});
module.exports = R.route.bind(R);
