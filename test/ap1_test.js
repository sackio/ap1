'use strict';

var Belt = require('jsbelt')
  , Optionall = require('optionall')
  , Path = require('path')
  , O = new Optionall({'__dirname': Path.resolve(module.filename + '/../..')
                     , 'file_priority': ['package.json', 'environment.json', 'config.json']})
  , Async = require('async')
  , _ = require('underscore')
  , Winston = require('winston')
  , Yessir = require('yessir')
  , Request = require('request')
  , IO = require('socket.io-client')
  , API = require('../lib/ap1.js');

console.log(O.http);
var gb = {}
  , log = new Winston.Logger()
;

log.add(Winston.transports.Console, {'level': 'debug', 'colorize': true, 'timestamp': false});
gb.jar = Request.jar();

exports['http'] = {
  'setUp': function(done){
    return done();
  }
, 'server startup': function(test){
    var test_name = 'server startup';
    log.debug(test_name);
    log.profile(test_name);

    gb.api = new API(O);
    return gb.api.on('ready', function(){
      test.ok(gb.api);
      log.profile(test_name);
      return test.done();
    });
  }
, 'add basic http route': function(test){
    var test_name = 'add basic http route';
    log.debug(test_name);
    log.profile(test_name);

    gb.api.http.addRoute('/route', function(o){
      return o.$response.status(200).json({'hello': 'world'});
    });

    return Request({
      'url': 'http://localhost:' + O.http.port + '/route'
    , 'jar': gb.jar
    , 'json': true
    }, function(err, res, body){
      test.ok(!err);
      test.ok(!body.error);
      test.ok(res.statusCode === 200);
      test.ok(Belt.equal(body, {'hello': 'world'}));

      log.profile(test_name);
      return test.done();
    });
  }
, 'add basic http middleware': function(test){
    var test_name = 'add basic http middleware';
    log.debug(test_name);
    log.profile(test_name);

    gb.api.http.addRoute('/authorized', function(o){
      if (o.$query.unauthorized) return o.$next(new Error('Not authorized'));
      return o.$next();
    }, {'middleware': true});

    gb.api.http.addRoute('/authorized', function(o){
      return o.$response.status(200).json({'hello': 'world'});
    });

    return Async.waterfall([
      function(cb){
        return Request({
          'url': 'http://localhost:' + O.http.port + '/authorized?unauthorized=true'
        , 'jar': gb.jar
        , 'json': false
        }, function(err, res, body){
          test.ok(!err);
          test.ok(res.statusCode === 500);
          test.ok(body.match(/Not authorized/));
          return cb();
        });
      }
    , function(cb){
        return Request({
          'url': 'http://localhost:' + O.http.port + '/authorized'
        , 'jar': gb.jar
        , 'json': true
        }, function(err, res, body){
          test.ok(!err);
          test.ok(!body.error);
          test.ok(res.statusCode === 200);
          test.ok(Belt.equal(body, {'hello': 'world'}));
          return cb();
        });
      }
    ], function(err){
      test.ok(!err);
      log.profile(test_name);
      return test.done();
    });
  }
, 'inspect http transaction object': function(test){
    var test_name = 'inspect http transaction object';
    log.debug(test_name);
    log.profile(test_name);

    gb.api.http.addRoute('/:test/:route/transaction.json', function(o){
      return o.$response.status(200).json(_.omit(o, ['$response', '$request', '$server']));
    }, {'method': 'post'});

    return Request({
      'url': 'http://localhost:' + O.http.port + '/1/2/transaction.json?good=bye&hi=there'
    , 'jar': gb.jar
    , 'json': true
    , 'method': 'POST'
    , 'body': {'hello': 'world'}
    }, function(err, res, body){
      test.ok(!err);
      test.ok(res.statusCode === 200);
      test.ok(body.$session.cookie.path === '/');
      test.ok(body.$url.pathname === '/1/2/transaction.json');
      test.ok(body.$type === 'http');
      test.ok(Belt.equal(body.$query, {good: 'bye', hi: 'there'}));
      test.ok(Belt.equal(body.$body, {hello: 'world'}));
      test.ok(Belt.equal(body.$params, {test: '1', route: '2'}));
      test.ok(Belt.equal(body.$data, {test: '1', route: '2', good: 'bye', hi: 'there', hello: 'world'}));

      log.profile(test_name);
      return test.done();
    });
  }
, 'http session data': function(test){
    var test_name = 'http session data';
    log.debug(test_name);
    log.profile(test_name);

    gb.api.http.addRoute('/session/set.json', function(o){
      _.each(o.$data, function(v, k){ return o.$request.session[k] = v; });
      return o.$response.status(200).end();
    }, {'method': 'post'});

    return Async.waterfall([
      function(cb){
        return Request({
          'url': 'http://localhost:' + O.http.port + '/session/set.json?visited=true'
        , 'jar': gb.jar
        , 'json': true
        , 'method': 'post'
        , 'body': {foo: 'bar'}
        }, function(err, res, body){
          test.ok(!err);
          test.ok(res.statusCode === 200);
          return cb();
        });
      }
    , function(cb){
        return Request({
          'url': 'http://localhost:' + O.http.port + '/1/2/transaction.json?'
        , 'jar': gb.jar
        , 'json': true
        , 'method': 'POST'
        , 'body': {'foo': 'bar'}
        }, function(err, res, body){
          test.ok(body.$session.foo === 'bar');
          test.ok(body.$session.visited === 'true');
          return cb();
        });
      }
    ], function(err){
      test.ok(!err);
      log.profile(test_name);
      return test.done();
    });
  }
};
