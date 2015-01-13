'use strict';

var Belt = require('jsbelt')
  , Optionall = require('optionall')
  , Path = require('path')
  , OS = require('os')
  , FSTK = require('fstk')
  , O = new Optionall({'__dirname': Path.resolve(module.filename + '/../..')
                     , 'file_priority': ['package.json', 'environment.json', 'config.json']})
  , Async = require('async')
  , _ = require('underscore')
  , Winston = require('winston')
  , Yessir = require('yessir')
  , Request = require('request')
  , IO = require('socket.io-client')
  , API = require('../lib/ap1.js');

var gb = {}
  , log = new Winston.Logger()
;

log.add(Winston.transports.Console, {'level': 'debug', 'colorize': true, 'timestamp': false});
gb.jar = Request.jar();

exports['servers'] = {
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
      return o.$response.status(200).json({'id': o.$request.sessionID});
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
          gb.sid = body.id;
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
, 'http file uploads': function(test){
    var test_name = 'http file uploads';
    log.debug(test_name);
    log.profile(test_name);

    var fd = {'media': [
      FSTK._fs.createReadStream('/dev/urandom', {'start': 10, 'end': 609})
    , FSTK._fs.createReadStream('/dev/urandom', {'start': 10, 'end': 609})
    , FSTK._fs.createReadStream('/dev/urandom', {'start': 10, 'end': 609})
    ]};

    return Request({
      'url': 'http://localhost:' + O.http.port + '/1/2/transaction.json'
    , 'jar': gb.jar
    , 'json': true
    , 'method': 'POST'
    , 'formData': fd
    }, function(err, res, body){
      test.ok(!err);
      test.ok(res.statusCode === 200);
      test.ok(_.keys(body.$files).length === 1);
      test.ok(body.$files.media.length === 3);
      test.ok(_.every(body.$files.media, function(f){
        return f.fieldname === 'media' && f.size === 600 
        && f.path.match(new RegExp('^' + Path.resolve(gb.api.settings.http.paths.uploads).replace(/\//g, '\\/')));
      }));

      log.profile(test_name);
      return test.done();
    });
  }
/*, 'basic socket.io route': function(test){
    var test_name = 'basic socket.io route';
    log.debug(test_name);
    log.profile(test_name);

    gb.api.ws.addRoute('transaction', function(data){
      return this.emit('transaction', _.omit(data, ['$request', '$response', '$server']));
    });

    gb.sio = new IO('http://localhost:' + gb.api.settings.http.port);
    return gb.sio.on('connect', function(){
      test.ok(gb.sio);

       gb.sio.on('transaction', function(data){
        test.ok(data.$type === 'ws');
        test.ok(data.$url.pathname === '/1/transaction');
        test.ok(Belt.equal(data.$params, ['1']));
        test.ok(Belt.equal(data.$query, {test: 'true'}));
        test.ok(Belt.equal(data.$body, {hello: 'world', url: '/1/transaction?test=true'}));
        test.ok(Belt.equal(data.$data, {test: 'true', hello: 'world', url: '/1/transaction?test=true'}));
        test.ok(data.$event === 'transaction');
        test.ok(Belt.equal(data.$session, undefined));

        log.profile(test_name);
        return test.done();
      });

      return gb.sio.emit('transaction', {'hello': 'world', 'url': '/1/transaction?test=true'});
    });
  }*/
, 'sessioned socket.io route': function(test){
    var test_name = 'sessioned socket.io route';
    log.debug(test_name);
    log.profile(test_name);

    gb.api.ws.addRoute('session-transaction', function(data){
      return this.emit('session-transaction', _.omit(data, ['$request', '$response', '$server']));
    });

    gb.api.ws.addRoute('set-session-transaction', function(data){
      data.$session.fab = 'baz';
      return this.emit('set-session-transaction', _.omit(data, ['$request', '$response', '$server']));
    });

    gb.sio = new IO('http://localhost:' + gb.api.settings.http.port);
    return gb.sio.on('connect', function(){
      test.ok(gb.sio);

      gb.sio.on('set-session-transaction', function(data){
        return this.emit('session-transaction', {'hello': 'world', 'url': '/1/transaction?test=true', 'sid': gb.sid});
      });

      gb.sio.on('session-transaction', function(data){
        test.ok(data.$type === 'ws');
        test.ok(data.$url.pathname === '/1/transaction');
        test.ok(Belt.equal(data.$params, ['1']));
        test.ok(Belt.equal(data.$query, {test: 'true'}));
        test.ok(Belt.equal(data.$body, {hello: 'world', url: '/1/transaction?test=true', sid: gb.sid}));
        test.ok(Belt.equal(data.$data, {test: 'true', hello: 'world', url: '/1/transaction?test=true', sid: gb.sid}));
        test.ok(data.$event === 'session-transaction');
        test.ok(data.$session.visited === 'true');
        test.ok(data.$session.foo === 'bar');
        test.ok(data.$session.fab === 'baz');

        log.profile(test_name);
        return test.done();
      });

      return gb.sio.emit('set-session-transaction', {'hello': 'world', 'url': '/1/transaction?test=true', 'sid': gb.sid});
    });
  }
};
