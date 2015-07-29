/// <reference path="../type_declarations/index.d.ts" />
import {join} from 'path';
import * as url from 'url';
import {createReadStream} from 'fs';
import {inflate} from 'zlib';
import {spawn, execFile} from 'child_process';
import Router = require('regex-router');

import {db} from '../database';

// async.d.ts isn't quite up to snuff for what I need
var async = require('async');

function storeMovie(jpegs: Buffer[], framerate: number, webm_filepath: string, callback: (error?: Error) => void) {
  var ffmpeg_args = ['-f', 'image2pipe', '-r', framerate.toString(), '-i', '-', '-b:v', '512K', webm_filepath];
  var ffmpeg = spawn('ffmpeg', ffmpeg_args);
  ffmpeg.stdout.on('data', (chunk) => console.log('ffmpeg stdout: %s', chunk));
  ffmpeg.stderr.on('data', (chunk) => console.log('ffmpeg stderr: %s', chunk));
  ffmpeg.on('exit', (code, signal) => {
    console.log('ffmpeg exit code=%d signal=%s', code, signal);
    return callback();
  });

  async.eachSeries(jpegs, (jpeg, callback) => {
    ffmpeg.stdin.write(jpeg, callback);
  }, (error) => {
    if (error) return callback(error);
    ffmpeg.stdin.end();
    console.log('finished writing stdin');
  });
}

var R = new Router();

R.get(/^\/signs(\?|$)/, (req, res: any) => {
  var urlObj = url.parse(req.url, true);

  var query = db.Select('sign INNER JOIN contributor ON contributor.id = sign.contributor_id')
  .add('sign.id', 'sign.gloss', 'sign.description', 'sign.contributor_id', 'contributor.email')
  .orderBy('sign.created DESC');

  if (urlObj.query.q) {
    var like_term = `%${urlObj.query.q}%`;
    query = query.where('(gloss ILIKE ?) OR (description ILIKE ?)', like_term, like_term);
  }

  var limit = Math.min(parseInt(urlObj.query.limit || 100, 10), 100);
  query = query.limit(limit);

  query.execute((error: Error, signs: any[]) => {
    if (error) return res.error(error);

    res.json(signs);
  });
});

R.post(/^\/signs$/, (req, res: any) => {
  async.auto({
    images: (callback) => {
      req.readData((error: Error, compressed_data: Buffer) => {
        if (error) return callback(error);
        inflate(compressed_data, (error, data: Buffer) => {
          if (error) return callback(error);
          // data should be a newline-separated list of strings (Data URLs)
          var images = data.toString('ascii').split('\n');
          callback(null, images);
        });
      });
    },
    sign: (callback) => {
      db.InsertOne('sign')
      .set({
        gloss: req.headers['x-sign-gloss'],
        description: req.headers['x-sign-description'],
      })
      .returning('*')
      .execute((error: Error, sign: any) => {
        if (error) return callback(error);

        console.log('inserted sign: %j', sign);

        callback(null, sign);
      });
    },
  }, (error, {images, sign}) => {
    if (error) {
      console.error('error!', error.message, error);
      return res.error(error);
    }
    // console.log('after:images', images);
    console.log('after:sign', sign);

    // slice off the Data URL MIME-type and decode the Base64 string
    var jpegs = images.map(image => new Buffer(image.slice(23), 'base64'));
    var framerate = parseFloat(req.headers['x-framerate']);
    var webm_filepath = join(process.env.UPLOADS_PATH, sign.id + '.webm');

    storeMovie(jpegs, framerate, webm_filepath, (error) => {
      if (error) return res.error(error);
      console.log('stored movie!');
      res.json(sign);
    });
  });
});

R.get(/^\/signs\/(\d+)\.webm$/, (req, res, m: RegExpMatchArray) => {
  res.setHeader('Cache-Control', 'max-age=600');
  res.setHeader('Content-Type', 'video/webm');
  var webm_filepath = join(process.env.UPLOADS_PATH, m[1] + '.webm');
  createReadStream(webm_filepath).pipe(res);
});

R.delete(/^\/signs\/(\d+)$/, (req, res, m: RegExpMatchArray) => {
  var token = req.headers['x-token'] || '';
  db.SelectOne('contributor, sign, session')
  .add('sign.*')
  .where('session.contributor_id = contributor.id')
  .where('sign.contributor_id = contributor.id')
  .whereEqual({
    'sign.id': m[1],
    token: token,
  })
  .execute((error: Error, sign) => {
    if (error) return res.die(error);
    if (!sign) {
      return res.status(403).json({
        message: 'Could not find movie to delete with your credentials'
      });
    }

    db.Delete('sign')
    .whereEqual({id: sign.id})
    .execute((error: Error, sign) => {
      if (error) return res.die(error);

      res.status(200).json({message: 'Deleted movie'});
    });
  });
});

export = R.route.bind(R);
