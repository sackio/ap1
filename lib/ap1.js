/*
 * ap1
 * https://github.com/sackio/ap1
 *
 * Copyright (c) 2015 Ben Sack
 * Licensed under the MIT license.
 */

var Path = require('path')
  , Optionall = require('optionall')
  , Crypto = require('crypto')
  , FSTK = require('fstk')
  , Async = require('async')
  , _ = require('underscore')
  , Belt = require('jsbelt')
  , Util = require('util')
  //, Pa1d = require('pa1d')
  //, Locup = require('locup')
  , Winston = require('winston')
  //, GeoIP = require('geoip-lite')
  , Events = require('events')
  , URL = require('url')
  , Querystring = require('querystring')

    //express and middleware
  , Express = require('express')
  , HTTP = require('http')
  , HTTPS = require('https')
  , Sessions = require('express-session')
  , Redis_Sessions = require('connect-redis')(Sessions)
  , Multer = require('multer')
  , Morgan = require('morgan')
  , Serve_Favicon = require('serve-favicon')
  , Body_Parser = require('body-parser')
  , Cookie = require('cookie')
  , Cookie_Parser = require('cookie-parser')
  , Error_Handler = require('errorhandler')

    //socket
  , Net = require('net')

    //socket.io
  , IO = require('socket.io')

    //websocket
  , WS = require('ws')

    //maild
  , Maild = require('maild')

;

module.exports = function(O){
  var Opts = O || new Optionall({
                                  '__dirname': Path.resolve(module.filename + '/../..')
                                , 'file_priority': ['package.json', 'environment.json', 'config.json']
                                });

  var S = new (Events.EventEmitter.bind({}))();
  S.settings = Belt.extend({
    'has_http': true
  , 'has_io': true
  , 'has_ws': true
  , 'has_socket': true
  , 'has_email': true
  , 'log_level': 'info'
  , 'plugins': []
  }, Opts);

  var log = Opts.log || new Winston.Logger();
  if (!Opts.log) log.add(Winston.transports.Console, {'level': S.settings.log_level, 'colorize': true, 'timestamp': false});

  S.servers = {};

  var rd = Number(S.settings.has_http) + Number(S.settings.has_io) + Number(S.settings.has_ws)
                                       + Number(S.settings.has_email) + Number(S.settings.has_socket)
    , ready = _.after(rd, function(){ S.emit('ready'); });

  //////////////////////////////////////////////////////////////////////////////
  ////                         UTILITIES                                    ////
  //////////////////////////////////////////////////////////////////////////////

  /*
    parse strings as JSON, with exception and fragment handling
  */
  S['$messages'] = {}; //registry of message fragments
  S['$parseMessage'] = function(options){
    var o = options || {}
      , buf = this.$messages[o.channel] || ''
      , obj;
    try {
      //try to parse string + any previous buffer
      obj = Belt.parse(buf + o.string);
    } catch(e) {
      //an error occured, try parsing just the new string
      try {
        obj = Belt.parse(o.string);
      } catch(_e) {
        //another error, concatenate new string to buffer and return null
        this.$messages[o.channel] = buf + o.string;
        return null;
      }
        //string was json, clear buffer and return object
        delete this.$messages[o.channel];
        return obj;
    }
    //we have json, clear buffer and return object
    delete this.$messages[o.channel];
    return obj;
  };

  //////////////////////////////////////////////////////////////////////////////
  ////                           SESSIONS                                   ////
  //////////////////////////////////////////////////////////////////////////////

  S['sessionsStore'] = new Redis_Sessions(S.settings.redis);
  S['sessions'] = S.sessionsStore; //alias
  //documentation on manually handling sessions: https://github.com/expressjs/session

  //////////////////////////////////////////////////////////////////////////////
  ////                        EXPRESS SERVER                                ////
  //////////////////////////////////////////////////////////////////////////////

  if (S.settings.has_http){

    S.settings.http = Belt.extend({
      'session_secret': Crypto.randomBytes(1024).toString('base64')
    , 'cookie_secret': Crypto.randomBytes(1024).toString('base64')
    , 'view_engine': 'ejs'
    , 'body_parser': {'limit': '500mb', 'parameterLimit': 10000, 'extended': true}
    , 'paths': {}
    }, _.pick(S.settings, ['paths', 'port', 'ssl']), S.settings.http || {});

    if (!S.settings.http.do_not_normalize_paths)
      _.each(S.settings.http.paths, function(v, k){
        return S.settings.http.paths[k] = Path.join(S.settings.__dirname, v);
      });

    S.settings.http = Belt.extend({
      'express_settings': {
        'env': S.settings.environment
      , 'port': S.settings.http.port
      , 'views': S.settings.http.paths.views
      }
    , 'sessions': {
        'store': S.sessionsStore
      , 'secret': S.settings.http.session_secret
      , 'cookie': {'maxAge': 60000000}
      , 'key': S.settings.http.session_key
      , 'saveUninitialized': true
      , 'resave': true
      }
    , 'uploads': {
        'dest': S.settings.http.paths.uploads
      }
    }, S.settings.http, S.settings.port ? {'express_settings': {'port': S.settings.port}} : {});

    S['http'] = Express();

    _.each(S.settings.http.express_settings, function(v, k){
      return S.http.set(k, v);
    });

    S['errorHandler'] = Error_Handler();
    S['logger'] = S.settings.environment === 'production' 
      ? Morgan('common', {'skip': function(req, res) { return res.statusCode < 400; }})
      : Morgan('dev');
    S['bodyParserJSON'] = Body_Parser.json(S.settings.http.body_parser);
    S['bodyParserURLEncoded'] = Body_Parser.urlencoded(S.settings.http.body_parser);
    S['cookieParser'] = Cookie_Parser(S.settings.http.cookie_secret);
    S['sessions'] = Sessions(S.settings.http.sessions);

    if (!S.settings.http.no_error_handler && S.http.get('env') !== 'production') S.http.use(S.errorHandler);

    S.http.use(S.logger);
    S.http.use(S.bodyParserJSON);
    S.http.use(S.bodyParserURLEncoded);
    S.http.use(S.cookieParser);
    S.http.use(S.sessions);

    if (S.settings.http.uploads){
      S['uploads'] = Multer(S.settings.http.uploads);
      S.http.use(S.uploads);
      if (!S.settings.http.do_not_clear_uploads) FSTK.emptyDir(S.settings.http.paths.uploads, Belt.np);
    }

    if (S.settings.http.ssl){
      S.settings.http.ssl = Belt.extend({
        'key': FSTK._fs.readFileSync(Path.join(S.settings.__dirname, S.settings.http.ssl.key_path))
      , 'cert': FSTK._fs.readFileSync(Path.join(S.settings.__dirname, S.settings.http.ssl.crt_path))
      , 'requestCert': false
      , 'rejectUnauthorized': false
      }, S.settings.http.ssl);
    }

    S.servers['http'] = (S.settings.http.ssl ? HTTPS : HTTP).createServer(
      S.settings.http.ssl ? S.settings.http.ssl : S.http
    , S.settings.http.ssl ? S.http : undefined
    ).listen(S.http.get('port'), S.settings.http.on_start || function(){
      ready();
      log.info('[HTTP' + (S.settings.http.ssl ? 'S' : '') + '] Express server started');
      return log.info(Belt.stringify({
        'environment': S.settings.environment.toUpperCase()
      , 'port': S.http.get('port')
      , 'public_path': S.settings.http.paths['public']
      , 'upload_path': S.settings.http.paths.uploads
      , 'view_path': S.settings.http.paths.views
      , 'ssl': S.settings.http.ssl ? true : false
      }));
    });

    S.http['$transaction'] = function(request, response, next){
      var t = {
        '$request': request
      , '$response': response
      , '$next': next
      , '$session': Belt.get(request, 'session')
      , '$server': S.http
      , '$url': URL.parse(Belt.get(request, 'url'))
      , '$type': 'http'
      , '$query': Belt.get(request, 'query')
      , '$body': Belt.get(request, 'body')
      , '$files': Belt.get(request, 'files')
      , '$params': Belt.get(request, 'params')
      };

      t['$data'] = Belt.extend({}, t.$params || {}, t.$query || {}, t.$body || {});

      return t;
    };

    S.http['addRoute'] = function(route, method, options){
      var o = _.defaults(options || {}, {
        'method': 'get'
      , 'middleware': false
      });

      return S.http[o.method](route, function(request, response, next){
        return method.call(S, S.http.$transaction(request, response, o.middleware ? next : undefined));
      });
    };

  }

  //////////////////////////////////////////////////////////////////////////////
  ////                         SOCKET.IO                                    ////
  //////////////////////////////////////////////////////////////////////////////

  if (S.settings.has_io){

    S.settings.io = Belt.extend({

    }, S.settings.io || {});

    S['io'] = IO(S.servers.http);

    S['socket_sessions'] = {};

    S.io['$transaction'] = function(event, args, socket, next, cb){
      var t = {
        '$request': socket
      , '$response': socket
      , '$next': next
      //, '$session': Belt.get(socket, '$session')
      , '$server': S.io
      , '$url': URL.parse(Belt.get(args, 'url') || event)
      , '$type': 'io'
      , '$body': args
      , '$event': event
      };

      t['$params'] = t.$url.pathname.split('/');
      t.$params.pop();
      t.$params = _.compact(t.$params);

      t['$query'] = Querystring.parse(t.$url.query);
      t['$data'] = Belt.extend({}, t.$params || {}, t.$query || {}, t.$body || {});

      if (!socket.$sessionID) return cb(t);

      socket['$uuid'] = socket.$uuid || Belt.uuid();
      S.socket_sessions[socket.$sessionID] = socket;

      return S.sessionsStore.get(socket.$sessionID, function(err, sess){
        t.$session = sess;
        return cb(t);
      });
    };

    S.io['$routes'] = [];
    S.io['addRoute'] = function(route, method, options){
      var o = Belt.extend({
        'event': route
      , 'middleware': false
      }, options || {});

      if (o.middleware) return S.io.use( function(socket, next){
        var sock = this;
        return S.io.$transaction(route, undefined, sock, next, function(d){
          return method.call(sock, d);
        });
      });

      o.method = function(data){
        var sock = this;
        return S.io.$transaction(route, data, sock, undefined, function(d){
          return method.call(sock, d);
        });
      };

      return S.io.$routes.push(o);
    };

    //session middleware
    S.io.use(function(socket, next){
      var gb = {};
      return Async.waterfall([
        function(cb){
          gb.cookie = Belt.get(socket, 'handshake.headers.cookie');
          if (!gb.cookie) return cb();

          gb.cookie = (Cookie.parse(gb.cookie) || {})[S.settings.http.sessions.key];

          socket.$sessionID = Belt.chain(gb, ['cookie.match', /^(?:s:)(.+)\..*$/], '1') || undefined;

          //socket.$sessionID = (gb.cookie.match(/^(?:s:)(.+)\..*$/) || [])[1] || undefined;

          if (!socket.$sessionID) return cb();

          socket['$uuid'] = socket.$uuid || Belt.uuid();
          S.socket_sessions[socket.$sessionID] = socket;

          return S.sessionsStore.get(socket.$sessionID, Belt.cs(cb, socket, '$session', 1));
        }
      ], function(err){
        return next(err);
      });
    });

    S.io.on('connection', function(socket){
      return _.each(S.io.$routes, function(r){
        return socket.on(r.event, function(d){
          if (socket.$session) return r.method.apply(socket, arguments);

          var gb = {'args': arguments};

          return Async.waterfall([
            function(cb){
              gb.sid = Belt.get(d, 'sid');
              if (!gb.sid) return cb();

              socket.$sessionID = gb.sid;

              socket['$uuid'] = socket.$uuid || Belt.uuid();
              S.socket_sessions[socket.$sessionID] = socket;

              return S.sessionsStore.get(socket.$sessionID, Belt.cs(cb, socket, '$session', 1));
            }
          ], function(err){
            return r.method.apply(socket, gb.args);
          });
        });
      });
    });

    ready();

    log.info('[IO] Socket.io server started');
    log.info(Belt.stringify({
      'environment': S.settings.environment.toUpperCase()
    , 'port': S.http.get('port')
    }));
  }

  //////////////////////////////////////////////////////////////////////////////
  ////                         WEB SOCKET SERVER                            ////
  //////////////////////////////////////////////////////////////////////////////

  if (S.settings.has_ws){
    S.settings.ws = Belt.extend({
      'port': S.settings.ws_port
    , 'ssl': S.settings.ssl
    }
    , S.settings.ws || {}
    , S.settings.ws_port ? {'port': S.settings.ws_port} : {});

    if (S.settings.ws.ssl){
      S.settings.ws.ssl = Belt.extend({
        'key': FSTK._fs.readFileSync(Path.join(S.settings.__dirname, S.settings.ws.ssl.key_path))
      , 'cert': FSTK._fs.readFileSync(Path.join(S.settings.__dirname, S.settings.ws.ssl.crt_path))
      }, S.settings.ws.ssl);
    }

    S.servers['ws'] = (S.settings.ws.ssl ? HTTPS : HTTP).createServer(
      S.settings.ws.ssl ? S.settings.ws.ssl : undefined
    ).listen(S.settings.ws.port, function(){
      ready();
      log.info('[WS' + (S.settings.ws.ssl ? 'S' : '') + '] WebSocket server started');
      return log.info(Belt.stringify({
        'environment': S.settings.environment.toUpperCase()
      , 'port': S.settings.ws.port
      , 'ssl': S.settings.ws.ssl ? true : false
      }));
    });

    S['ws'] = new WS.Server({'server': S.servers.ws});

    S.ws['getClient'] = function(uuid){
      return _.find(S.ws.clients, function(c){ return c.uuid === uuid; });
    };

    S.ws['$transaction'] = function(args, socket){
      var d = args
        , t = {
            '$request': socket
          , '$response': socket
          , '$server': S.ws
          , '$session': socket.$session
          , '$url': URL.parse(Belt.get(d, 'url') || '')
          , '$type': 'ws'
          , '$body': d
          };

      t['$params'] = Belt.call(t, '$url.pathname.split', '/') || [];
      t.$params.pop();
      t.$params = _.compact(t.$params);

      t['$query'] = Querystring.parse(Belt.get(t, '$url.query') || '');
      t['$data'] = Belt.extend({}, t.$params || {}, t.$query || {}, t.$body || {});
      t['$event'] = t.$data.event;

      return t;
    };

    S.ws['$routes'] = [];
    S.ws['addRoute'] = function(route, method, options){
      var o = Belt.extend({
        'route': route
      , 'method': method
      }, options || {});

      return S.ws.$routes.push(o);
    };

    S.ws.on('connection', function(socket){
      socket.uuid = Belt.uuid();

      return socket.on('message', function(_data){
        var data = S.$parseMessage({'channel': this.uuid, 'string': _data.toString()});

        if (!data) return;

        var rt = _.find(S.ws.$routes, function(r){
          return r.route.call(socket, data);
        });

        if (!rt) return;

        var gb = {};
        return Async.waterfall([
          function(cb){
            gb.sid = Belt.get(data, 'sid') || socket.$sessionID;
            if (!gb.sid) return cb();
            socket.$sessionID = gb.sid;
            return S.sessionsStore.get(socket.$sessionID, Belt.cs(cb, socket, '$session', 1));
          }
        ], function(err){
          return rt.method.call(socket, S.ws.$transaction(data, socket));
        });
      });
    });

  }

  //////////////////////////////////////////////////////////////////////////////
  ////                         EMAIL SERVER                                 ////
  //////////////////////////////////////////////////////////////////////////////

  if (S.settings.has_email){

    S.settings.email = Belt.extend({
      'aws_key': Belt.get(S, 'settings.aws.key') || Belt.get(S, 'settings.aws.accessKeyId')
    , 'aws_secret': Belt.get(S, 'settings.aws.secret') || Belt.get(S, 'settings.aws.secretAccessKey')
    }, _.pick(S.settings, ['mailchimp', 'export_mailchimp', 'aws']), S.settings.aws || {}, S.settings.email || {});

    S['email'] = new Maild(S.settings.email);

    S.email['$transaction'] = function(email){
      var t = {
        '$request': S.email.incoming
      , '$response': S.email.outgoing
      , '$server': S.email
      , '$session': email.$session
      , '$url': URL.parse(Belt.get(email, 'url') || '')
      , '$type': 'email'
      , '$body': email
      };

      t['$params'] = Belt.call(t, '$url.pathname.split', '/') || [];
      t.$params.pop();
      t.$params = _.compact(t.$params);

      t['$query'] = Querystring.parse(email.query || Belt.get(t, '$url.query') || '');
      t['$data'] = Belt.extend({}, t.$params || {}, t.$query || {}, t.$body || {});
      t['$event'] = t.$data.event;

      return t;
    };

    S.email['$parse'] = function(email, keys){
      var ky = Belt.toArray(keys)
        , msg = (email.subject || '') + (email.html || '') + (email.text || '');

      _.each(ky, function(k){
        return email[k] = Belt.chain(msg, ['split', '<' + k + '>'], ['1.split', '</' + k + '>'], '0');
      });

      return email;
    };

    S.email['$routes'] = [];
    S.email['addRoute'] = function(route, method, options){
      var o = Belt.extend({
        'route': route
      , 'method': method
      }, options || {});

      return S.email.$routes.push(o);
    };

    S.email.incoming.on('email', function(email){
      S.email.$parse(email, ['url', 'sid', 'query', 'event']);
      
      var rt = _.find(S.email.$routes, function(r){
        return r.route.call(S, email);
      });

      if (!rt) return;

      var gb = {};
      return Async.waterfall([
        function(cb){
          gb.sid = Belt.get(email, 'sid');
          if (!gb.sid) return cb();
          email.$sessionID = gb.sid;
          return S.sessionsStore.get(email.$sessionID, Belt.cs(cb, email, '$session', 1));
        }
      ], function(err){
        return rt.method.call(S, S.email.$transaction(email));
      });
    });

    S.email.incoming.on('ready', ready);

    log.info('[EMAIL] Maild server started');
    log.info(Belt.stringify({
      'environment': S.settings.environment.toUpperCase()
    , 'listening_on': Belt.get(S, 'settings.email.imap.user')
    , 'sending_from': Belt.get(S, 'settings.email.from_email')
    }));
  }

  //////////////////////////////////////////////////////////////////////////////
  ////                         SOCKET SERVER                                ////
  //////////////////////////////////////////////////////////////////////////////

  if (S.settings.has_socket){

    S.settings.socket = Belt.extend({
      'port': S.settings.socket_port
    , 'path': S.settings.socket_path
    }, S.settings.socket || {}, S.settings.socket_port ?
    {'port': S.settings.socket_port} : {}, S.settings.socket_path ?
    {'path': S.settings.socket_path} : {});

    S['socket'] = new Net.Server(S.settings.socket);

    S.socket['$transaction'] = function(args, socket){
      var d = args
        , t = {
            '$request': socket
          , '$response': socket
          , '$server': S.socket
          , '$session': socket.$session
          , '$url': URL.parse(Belt.get(d, 'url') || '')
          , '$type': 'socket'
          , '$body': d
          };

      t['$params'] = Belt.call(t, '$url.pathname.split', '/') || [];
      t.$params.pop();
      t.$params = _.compact(t.$params);

      t['$query'] = Querystring.parse(Belt.get(t, '$url.query') || '');
      t['$data'] = Belt.extend({}, t.$params || {}, t.$query || {}, t.$body || {});
      t['$event'] = t.$data.event;

      return t;
    };

    S.socket['$routes'] = [];
    S.socket['addRoute'] = function(route, method, options){
      var o = Belt.extend({
        'route': route
      , 'method': method
      }, options || {});

      return S.socket.$routes.push(o);
    };

    S.socket.on('connection', function(socket){
      socket.uuid = Belt.uuid();

      return socket.on('data', function(_data){
        var data;
        data = S.$parseMessage({'channel': this.uuid, 'string': _data.toString()});

        if (!data) return;

        var rt = _.find(S.socket.$routes, function(r){
          return r.route.call(socket, data);
        });

        if (!rt) return;

        var gb = {};
        return Async.waterfall([
          function(cb){
            gb.sid = Belt.get(data, 'sid') || socket.$sessionID;
            if (!gb.sid) return cb();
            socket.$sessionID = gb.sid;
            return S.sessionsStore.get(socket.$sessionID, Belt.cs(cb, socket, '$session', 1));
          }
        ], function(err){
          return rt.method.call(socket, S.socket.$transaction(data, socket));
        });
      });
    });

    S.socket.listen(S.settings.socket.port || S.settings.socket.path, function(){
      ready();
      log.info('[SOCKET] Socket server started');
      return log.info(Belt.stringify({
        'environment': S.settings.environment.toUpperCase()
      , 'port': Belt.get(S, 'settings.socket.port')
      , 'path': Belt.get(S, 'settings.socket.path')
      }));
    });
  }

  //////////////////////////////////////////////////////////////////////////////
  ////                           PLUGINS                                    ////
  //////////////////////////////////////////////////////////////////////////////

  S.settings.plugins.unshift('./plugins.js');

  S['plugins'] = {};
  _.each(S.settings.plugins, function(p, i){
    var _p = new require(i === 0 ? p : Path.join(S.settings.__dirname, p))(S.settings);
    return _.each(_p, function(v, k){
      if (_.isFunction(v)) S.plugins[k] = _.bind(v, S);
      return;
    });
  });

  return S;
};

if (require.main === module){
  var M = new module.exports();
}
