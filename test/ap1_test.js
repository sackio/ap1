'use strict';

var Belt = require('jsbelt')
  , Optionall = require('optionall')
  , Path = require('path')
  , OS = require('os')
  , Net = require('net')
  , FSTK = require('fstk')
  , O = new Optionall({'__dirname': Path.resolve(module.filename + '/../..')
                     , 'file_priority': ['package.json', 'environment.json', 'config.json']})
  , Async = require('async')
  , _ = require('underscore')
  , Winston = require('winston')
  , Yessir = require('yessir')
  , Request = require('request')
  , IO = require('socket.io-client')
  , WS = require('ws')
  , API = require('../lib/ap1.js');

var gb = {}
  , log = new Winston.Logger()
;

log.add(Winston.transports.Console, {'level': 'debug', 'colorize': true, 'timestamp': false});
gb.jar = Request.jar();

exports['servers'] = {
  'server startup': function(test){
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
, 'server-side socket.io route': function(test){
    var test_name = 'server-side socket.io route';
    log.debug(test_name);
    log.profile(test_name);

    gb.api.io.addRoute('session-transaction', function(data){
      return this.emit('session-transaction', _.omit(data, ['$request', '$response', '$server']));
    });

    gb.api.io.addRoute('set-session-transaction', function(data){
      data.$session.fab = 'baz';
      return gb.api.sessionsStore.set(data.$request.$sessionID, data.$session, function(err, sess){
        return data.$request.emit('set-session-transaction', _.omit(data, ['$request', '$response', '$server']));
      });
    });

    gb.sio = new IO('http://localhost:' + gb.api.settings.http.port);
    return gb.sio.on('connect', function(){
      test.ok(gb.sio);

      gb.sio.on('set-session-transaction', function(data){
        return this.emit('session-transaction', {'hello': 'world', 'url': '/1/transaction?test=true', 'sid': gb.sid});
      });

      gb.sio.on('session-transaction', function(data){
        test.ok(data.$type === 'io');
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
, 'basic socket route': function(test){
    var test_name = 'basic socket route';
    log.debug(test_name);
    log.profile(test_name);

    gb.api.socket.addRoute(function(data){
      return data.event === 'transaction';
    }, function(data){
      return this.write(Belt.stringify(_.omit(data, ['$request', '$response', '$server'])));
    });

    return gb.sock = Net.createConnection({'port': gb.api.settings.socket.port}, function(){
      test.ok(gb.sock);

      gb.sock.once('data', function(d){
        var data = Belt.parse(d);

        test.ok(data.$type === 'socket');
        test.ok(data.$url.pathname === '/1/transaction');
        test.ok(Belt.equal(data.$params, ['1']));
        test.ok(Belt.equal(data.$query, {test: 'true'}));
        test.ok(Belt.equal(data.$body, {event: 'transaction', hello: 'world', url: '/1/transaction?test=true'}));
        test.ok(Belt.equal(data.$data, {test: 'true', hello: 'world', url: '/1/transaction?test=true', event: 'transaction'}));
        test.ok(data.$event === 'transaction');

        log.profile(test_name);
        return test.done();
      });

      return gb.sock.write(Belt.stringify({'event': 'transaction', 'hello': 'world', 'url': '/1/transaction?test=true'}));
    });
  }
, 'session-based socket route setter': function(test){
    var test_name = 'session-based socket route setter';
    log.debug(test_name);
    log.profile(test_name);

    gb.api.socket.addRoute(function(data){
      return data.event === 'session';
    }, function(data){
      _.each(data.$body, function(v, k){ return data.$session[k] = v; });

      return gb.api.sessionsStore.set(data.$request.$sessionID, data.$session, function(err){
        return data.$request.write(Belt.stringify(_.omit(data, ['$request', '$response', '$server'])));
      });
    });

    return gb.sock = Net.createConnection({'port': gb.api.settings.socket.port}, function(){
      test.ok(gb.sock);

      gb.sock.once('data', function(d){
        var data = Belt.parse(d);

        test.ok(data.$type === 'socket');
        test.ok(data.$url.pathname === '/1/transaction');
        test.ok(Belt.equal(data.$params, ['1']));
        test.ok(Belt.equal(data.$query, {test: 'true'}));
        test.ok(Belt.equal(data.$body, {sid: gb.sid, event: 'session', hello: 'world', url: '/1/transaction?test=true'}));
        test.ok(Belt.equal(data.$data, {sid: gb.sid, test: 'true', hello: 'world', url: '/1/transaction?test=true', event: 'session'}));
        test.ok(data.$event === 'session');

        test.ok(data.$session.visited === 'true');
        test.ok(data.$session.foo === 'bar');
        test.ok(data.$session.fab === 'baz');

        test.ok(_.every(data.$body, function(v, k){
          return Belt.equal(data.$session[k], v);
        }));

        log.profile(test_name);
        return test.done();
      });

      return gb.sock.write(Belt.stringify({'sid': gb.sid, 'event': 'session', 'hello': 'world', 'url': '/1/transaction?test=true'}));
    });
  }
, 'get session from socket': function(test){
    var test_name = 'get session from socket';
    log.profile(test_name);

    gb.api.socket.addRoute(function(data){
      return data.event === 'get-session';
    }, function(data){
      return data.$request.write(Belt.stringify(data.$session));
    });

    return gb.sock = Net.createConnection({'port': gb.api.settings.socket.port}, function(){
      test.ok(gb.sock);

      gb.sock.once('data', function(d){
        var data = Belt.parse(d);

        test.ok(data.cookie.path === '/');
        test.ok(data.visited === 'true');
        test.ok(data.foo === 'bar');
        test.ok(data.fab === 'baz');
        test.ok(data.sid === gb.sid);
        test.ok(data.event === 'session')
        test.ok(data.hello === 'world');
        test.ok(data.url === '/1/transaction?test=true');

        log.profile(test_name);
        return test.done();
      });

      return gb.sock.write(Belt.stringify({'sid': gb.sid, 'event': 'get-session'}));
    });
  }
, 'ensure http session data has been updated': function(test){
    var test_name = 'ensure http session data has been updated';
    log.debug(test_name);
    log.profile(test_name);

    return Async.waterfall([
      function(cb){
        return Request({
          'url': 'http://localhost:' + O.http.port + '/1/2/transaction.json'
        , 'jar': gb.jar
        , 'json': true
        , 'method': 'POST'
        }, function(err, res, body){

          test.ok(body.$session.cookie.path === '/');
          test.ok(body.$session.visited === 'true');
          test.ok(body.$session.foo === 'bar');
          test.ok(body.$session.fab === 'baz');
          test.ok(body.$session.sid === gb.sid);
          test.ok(body.$session.event === 'session')
          test.ok(body.$session.hello === 'world');
          test.ok(body.$session.url === '/1/transaction?test=true');

          return cb();
        });
      }
    ], function(err){
      test.ok(!err);
      log.profile(test_name);
      return test.done();
    });
  }
, 'connect to ws server': function(test){
    var test_name = 'connect to ws server';
    log.debug(test_name);
    log.profile(test_name);

    gb.ws = new WS('ws://localhost:' + gb.api.settings.ws.port);

    return gb.ws.on('open', function(){
      test.ok(true);
      log.profile(test_name);
      return test.done();
    });
  }
, 'basic ws route': function(test){
    var test_name = 'basic ws route';
    log.debug(test_name);
    log.profile(test_name);

    gb.api.ws.addRoute(function(data){
      return data.event === 'transaction';
    }, function(data){
      return this.send(Belt.stringify(_.omit(data, ['$request', '$response', '$server'])));
    });

    gb.ws.once('message', function(d){
      var data = Belt.parse(d);

      test.ok(data.$type === 'ws');
      test.ok(data.$url.pathname === '/1/transaction');
      test.ok(Belt.equal(data.$params, ['1']));
      test.ok(Belt.equal(data.$query, {test: 'true'}));
      test.ok(Belt.equal(data.$body, {event: 'transaction', hello: 'world', url: '/1/transaction?test=true'}));
      test.ok(Belt.equal(data.$data, {test: 'true', hello: 'world', url: '/1/transaction?test=true', event: 'transaction'}));
      test.ok(data.$event === 'transaction');

      log.profile(test_name);
      return test.done();
    });

    return gb.ws.send(Belt.stringify({'event': 'transaction', 'hello': 'world', 'url': '/1/transaction?test=true'}));
  }
, 'session-based ws route setter': function(test){
    var test_name = 'session-based ws route setter';
    log.debug(test_name);
    log.profile(test_name);

    gb.api.ws.addRoute(function(data){
      return data.event === 'session';
    }, function(data){
      _.each(data.$body, function(v, k){ return data.$session[k] = v; });

      return gb.api.sessionsStore.set(data.$request.$sessionID, data.$session, function(err){
        return data.$request.send(Belt.stringify(_.omit(data, ['$request', '$response', '$server'])));
      });
    });

    gb.ws.once('message', function(d){
      var data = Belt.parse(d);
      test.ok(data.$type === 'ws');
      test.ok(data.$url.pathname === '/1/transaction');
      test.ok(Belt.equal(data.$params, ['1']));
      test.ok(Belt.equal(data.$query, {test: 'true'}));
      test.ok(Belt.equal(data.$body, {sid: gb.sid, event: 'session', hello: 'world', url: '/1/transaction?test=true'}));
      test.ok(Belt.equal(data.$data, {sid: gb.sid, test: 'true', hello: 'world', url: '/1/transaction?test=true', event: 'session'}));
      test.ok(data.$event === 'session');
      test.ok(data.$session.visited === 'true');
      test.ok(data.$session.foo === 'bar');
      test.ok(data.$session.fab === 'baz');
      test.ok(_.every(data.$body, function(v, k){
        return Belt.equal(data.$session[k], v);
      }));

      log.profile(test_name);
      return test.done();
    });

    return gb.ws.send(Belt.stringify({'sid': gb.sid, 'event': 'session', 'hello': 'world', 'url': '/1/transaction?test=true'}));
  }
, 'get session from ws': function(test){
    var test_name = 'get session from ws';
    log.profile(test_name);

    gb.api.ws.addRoute(function(data){
      return data.event === 'get-session';
    }, function(data){
      return data.$request.send(Belt.stringify(data.$session));
    });

    gb.ws.once('message', function(d){
      var data = Belt.parse(d);
      test.ok(data.cookie.path === '/');
      test.ok(data.visited === 'true');
      test.ok(data.foo === 'bar');
      test.ok(data.fab === 'baz');
      test.ok(data.sid === gb.sid);
      test.ok(data.event === 'session')
      test.ok(data.hello === 'world');
      test.ok(data.url === '/1/transaction?test=true');
      log.profile(test_name);
      return test.done();
    });

    return gb.ws.send(Belt.stringify({'sid': gb.sid, 'event': 'get-session'}));
  }
, 'ensure http session data has been updated - ws': function(test){
    var test_name = 'ensure http session data has been updated - ws';
    log.debug(test_name);
    log.profile(test_name);

    return Async.waterfall([
      function(cb){
        return Request({
          'url': 'http://localhost:' + O.http.port + '/1/2/transaction.json'
        , 'jar': gb.jar
        , 'json': true
        , 'method': 'POST'
        }, function(err, res, body){

          test.ok(body.$session.cookie.path === '/');
          test.ok(body.$session.visited === 'true');
          test.ok(body.$session.foo === 'bar');
          test.ok(body.$session.fab === 'baz');
          test.ok(body.$session.sid === gb.sid);
          test.ok(body.$session.event === 'session')
          test.ok(body.$session.hello === 'world');
          test.ok(body.$session.url === '/1/transaction?test=true');

          return cb();
        });
      }
    ], function(err){
      test.ok(!err);
      log.profile(test_name);
      return test.done();
    });
  }
, 'basic email route': function(test){
    var test_name = 'basic email route';
    log.debug(test_name);
    log.profile(test_name);

    gb.api.email.addRoute(function(email){
      return email.event === 'transaction';
    }, function(data){

      test.ok(data.$type === 'email');
      test.ok(data.$url.pathname === '/1/transaction');
      test.ok(Belt.equal(data.$params, ['1']));
      test.ok(Belt.equal(data.$query, {test: 'true'}));
      test.ok(data.$body.html === '<url>/1/transaction?test=true</url>');
      test.ok(data.$body.text === '<sid>' + gb.sid + '</sid>');
      test.ok(data.$event === 'transaction');

      test.ok(data.$session.cookie.path === '/');
      test.ok(data.$session.visited === 'true');
      test.ok(data.$session.foo === 'bar');
      test.ok(data.$session.fab === 'baz');
      test.ok(data.$session.sid === gb.sid);
      test.ok(data.$session.event === 'session')
      test.ok(data.$session.hello === 'world');
      test.ok(data.$session.url === '/1/transaction?test=true');

      log.profile(test_name);
      return test.done();
    });

    return gb.api.email.outgoing.send_email({
      'to':  gb.api.settings.email.to_email
    , 'from': gb.api.settings.email.from_email
    , 'subject': Belt.uuid() + '<event>transaction</event>'
    , 'html': '<url>/1/transaction?test=true</url>'
    , 'text': '<sid>' + gb.sid + '</sid>'
    }, function(err){
      return test.ok(!err);
    });
  }
, 'jsonRespond routes': function(test){
    var test_name = 'jsonRespond routes';
    log.debug(test_name);
    log.profile(test_name);

    gb.api.socket.addRoute(function(data){
      return data.event === 'json';
    }, function(data){
      return gb.api.plugins.jsonRespond(null, _.omit(data, ['$request', '$response', '$server']), data);
    });
    gb.api.email.addRoute(function(data){
      return data.event === 'json';
    }, function(data){
      return gb.api.plugins.jsonRespond(null, _.omit(data, ['$request', '$response', '$server']), data);
    });
    gb.api.io.addRoute('json', function(data){
      return gb.api.plugins.jsonRespond(null, _.omit(data, ['$request', '$response', '$server']), data);
    });
    gb.api.http.addRoute('/json', function(data){
      return gb.api.plugins.jsonRespond(null, _.omit(data, ['$request', '$response', '$server']), data);
    });

    return Async.waterfall([
      function(cb){
        return Request({
          'url': 'http://localhost:' + O.http.port + '/json'
        , 'jar': gb.jar
        , 'json': true
        }, function(err, res, body){
          test.ok(!err);
          test.ok(res.statusCode === 200);
          test.ok(body.data.$session.hello === 'world')
          test.ok(body.data.$url.pathname === '/json');
          return cb();
        });
      }
    , function(cb){
        return gb.sock = Net.createConnection({'port': gb.api.settings.socket.port}, function(){
          test.ok(gb.sock);

          gb.sock.once('data', function(d){
            var body = Belt.parse(d);

            test.ok(body.data.$session.hello === 'world')
            return cb()
          });

          return gb.sock.write(Belt.stringify({'sid': gb.sid, 'event': 'json'}));
        });
      }
    , function(cb){
        return gb.api.email.outgoing.send_email({
          'to': gb.api.settings.email.to_email
        , 'from': gb.api.settings.email.from_email
        , 'subject': '<event>json</event>' + Belt.uuid()
        , 'html': ''
        , 'text': ''
        }, Belt.cw(cb, 0));
      }
    , function(cb){
        return setTimeout(function(){ return cb(); }, 10000);
      }
    ], function(err){
      test.ok(!err);
      log.profile(test_name);
      return test.done();
    });
  }
};
