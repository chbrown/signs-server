import * as lodash from 'lodash';
import {logger} from 'loge';
import {createHash} from 'crypto';
import Router from 'regex-router';

import {db} from '../database';

interface Contributor {
  id?: number;
  email: string;
  password: string;
}

interface Session {
  id: number;
  contributor_id: number;
  token: string;
}

function hashPassword(email: string, password: string): string {
  var shasum = createHash('sha256');
  shasum.update(process.env.SALT, 'utf8');
  shasum.update(email, 'utf8');
  shasum.update(password, 'utf8');
  return shasum.digest('hex');
}

const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

function createToken(): string {
  return lodash.sample(alphabet, 32).join('');
}

/**
The given password should be hashed.
*/
function findOrCreateContributor(email: string, password: string,
                                 callback: (error: Error, contributor?: Contributor) => void) {
  db.SelectOne('contributor')
  .whereEqual({email, password})
  .execute((error: Error, contributor: Contributor) => {
    if (error) return callback(error);
    if (contributor) return callback(null, contributor);
    // okay, couldn't login; try to create a new contributor
    db.InsertOne('contributor')
    .set({email, password})
    .returning('*')
    .execute(callback);
  });
}

var R = new Router();

/**
POST /contributors

Create a new contributor and return with session token.
*/
R.post(/^\/contributors$/, (req, res: any) => {
  req.readData((error: Error, contributor: Contributor) => {
    if (error) return res.die(error);

    var password = hashPassword(contributor.email, contributor.password);
    findOrCreateContributor(contributor.email, password, (error, contributor) => {
      if (error && error['code'] === '23505') {
        // okay, that email exists, but the password didn't work
        return res.status(404).json({
          message: 'Account exists, but that password did not match.'
        });
      }
      else if (error) {
        return res.die(error);
      }
      // oh cool, it worked, either they logged in or created a new account
      db.InsertOne('session')
      .set({
        contributor_id: contributor.id,
        token: createToken(),
      })
      .returning('*')
      .execute((error, session) => {
        if (error) return res.die(error);

        var result = {
          id: contributor.id,
          email: contributor.email,
          token: session.token,
        };
        res.json(result)
      });
    });
  });
});

export = R.route.bind(R);
