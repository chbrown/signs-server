/// <reference path="../type_declarations/index.d.ts" />
var lodash = require('lodash');
var crypto_1 = require('crypto');
var Router = require('regex-router');
var database_1 = require('../database');
function hashPassword(email, password) {
    var shasum = crypto_1.createHash('sha256');
    shasum.update(process.env.SALT, 'utf8');
    shasum.update(email, 'utf8');
    shasum.update(password, 'utf8');
    return shasum.digest('hex');
}
var alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
function createToken() {
    return lodash.sample(alphabet, 32).join('');
}
/**
The given password should be hashed.
*/
function findOrCreateContributor(email, password, callback) {
    database_1.db.SelectOne('contributor')
        .whereEqual({ email: email, password: password })
        .execute(function (error, contributor) {
        if (error)
            return callback(error);
        if (contributor)
            return callback(null, contributor);
        // okay, couldn't login; try to create a new contributor
        database_1.db.InsertOne('contributor')
            .set({ email: email, password: password })
            .returning('*')
            .execute(callback);
    });
}
var R = new Router();
/**
POST /contributors

Create a new contributor and return with session token.
*/
R.post(/^\/contributors$/, function (req, res) {
    req.readData(function (error, contributor) {
        if (error)
            return res.die(error);
        var password = hashPassword(contributor.email, contributor.password);
        findOrCreateContributor(contributor.email, password, function (error, contributor) {
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
            database_1.db.InsertOne('session')
                .set({
                contributor_id: contributor.id,
                token: createToken(),
            })
                .returning('*')
                .execute(function (error, session) {
                if (error)
                    return res.die(error);
                var result = {
                    id: contributor.id,
                    email: contributor.email,
                    token: session.token,
                };
                res.json(result);
            });
        });
    });
});
module.exports = R.route.bind(R);
