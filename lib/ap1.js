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
  , Rol = require('rol')
  , Pa1d = require('pa1d')
  , Locup = require('locup')
  , Winston = require('winston')
  , GeoIP = require('geoip-lite')
  , Events = require('events')
  , URL = require('url')
  , Querystring = require('querystring')

    //express and middleware
  , Express = require('express')
  , HTTP = require('http')
  , Sessions = require('express-session')
  , Redis_Sessions = require('connect-redis')(Sessions)
  , Multer = require('multer')
  , Morgan = require('morgan')
  , Serve_Favicon = require('serve-favicon')
  , Body_Parser = require('body-parser')
  , Cookie_Parser = require('cookie-parser')
  , Error_Handler = require('errorhandler')

    //socket
  , Net = require('net')

    //socket.io
  , IO = require('socket.io')
  , Sessions_IO = require('session.socket.io')

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
  , 'has_ws': true
  , 'has_socket': true
  , 'has_email': true
  , 'log_level': 'info'
  }, Opts);

  var log = Opts.log || new Winston.Logger();
  if (!Opts.log) log.add(Winston.transports.Console, {'level': S.settings.log_level, 'colorize': true, 'timestamp': false});

  S.servers = {};

  var rd = Number(S.settings.has_http) + Number(S.settings.has_ws) + Number(S.settings.has_email) + Number(S.settings.has_socket)
    , ready = _.after(rd, function(){ S.emit('ready'); });

  //////////////////////////////////////////////////////////////////////////////
  ////                        EXPRESS SERVER                                ////
  //////////////////////////////////////////////////////////////////////////////

  if (S.settings.has_http){

    S.settings.http = Belt.extend({
      'session_secret': Crypto.randomBytes(1024).toString('base64')
    , 'cookie_secret': Crypto.randomBytes(1024).toString('base64')
    , 'view_engine': 'ejs'
    , 'body_parser': {'limit': '500mb', 'extended': true}
    , 'paths': {}
    }, S.settings.http || {});

    if (!S.settings.http.do_not_normalize_paths)
      _.each(S.settings.http.paths, function(v, k){
        return S.settings.http.paths[k] = Path.join(S.settings.__dirname, v);
      });

    S['sessionsStore'] = new Redis_Sessions(S.settings.redis);

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
    }, S.settings.http);

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

    if (S.http.get('env') !== 'production') S.http.use(S.errorHandler);

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

    S.servers['http'] = HTTP.createServer(S.http).listen(S.http.get('port'), S.settings.http.on_start || function(){
      ready();
      log.info('[HTTP] Express server started');
      return log.info(Belt.stringify({
        'environment': S.settings.environment.toUpperCase()
      , 'port': S.http.get('port')
      , 'public_path': S.settings.http.paths.public
      , 'upload_path': S.settings.http.paths.uploads
      , 'view_path': S.settings.http.paths.views
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

  if (S.settings.has_ws){

    S.settings.ws = Belt.extend({

    }, S.settings.ws || {});

    S['_ws'] = IO(S.servers.http);
    S['ws'] = new Sessions_IO(S._ws, S.sessionsStore, S.cookieParser, S.settings.http.sessions.key);

    S.ws['$transaction'] = function(event, args, socket, next){
      var t = {
        '$request': socket
      , '$response': socket
      , '$next': next
      , '$session': Belt.get(socket, 'handshake.session')
      , '$server': S.ws
      , '$url': URL.parse(Belt.get(args, 'url') || event)
      , '$type': 'ws'
      , '$body': args
      , '$event': event
      };

      t['$params'] = t.$url.pathname.split('/');
      t.$params.pop();
      t.$params = _.compact(t.$params);

      t['$query'] = Querystring.parse(t.$url.query);
      t['$data'] = Belt.extend({}, t.$params || {}, t.$query || {}, t.$body || {});

      return t;
    };

    S.ws['$routes'] = [];
    S.ws['addRoute'] = function(route, method, options){
      var o = Belt.extend({
        'event': route
      , 'middleware': false
      }, options || {});

      if (o.middleware) return S.ws.use( function(socket, next){
        return method.call(this, S.ws.$transaction(route, {}, socket, next));
      });

      o.method = function(data){
        return method.call(this, S.ws.$transaction(route, data, this, undefined));
      };

      return S.ws.$routes.push(o);
    };

    S.ws.on('connection', function(err, socket, session){
console.log(err);
      return _.each(S.ws.$routes, function(r){
        return socket.on(r.event, r.method);
      });
    });

    ready();
    log.info('[WS] Socket.io server started');
    log.info(Belt.stringify({
      'environment': S.settings.environment.toUpperCase()
    , 'port': S.http.get('port')
    }));
  }

  //////////////////////////////////////////////////////////////////////////////
  ////                         EMAIL SERVER                                 ////
  //////////////////////////////////////////////////////////////////////////////

  if (S.settings.has_email){

    S.settings.email = Belt.extend({

    }, _.pick(S.settings, ['mailchimp', 'export_mailchimp']), S.settings.email || {});

    S['email'] = new Maild(S.settings.email);

    S.email['$transaction'] = function(email){
      var t = {
        '$request': S.email.incoming
      , '$response': S.email.outgoing
      //, '$session': 
      , '$server': S.email
      , '$url': URL.parse(Belt.get(email, 'subject'))
      , '$type': 'email'
      , '$body': email
      };

      t['$data'] = Belt.extend({}, t.$params || {}, t.$query || {}, t.$body || {});

      return t;
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
      var rt = _.find(S.email.$routes, function(r){
        return r.route.call(S, email);
      });

      if (rt) rt.method.call(S, S.email.$transaction(email));

      return;
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

    }, S.settings.socket || {});

    S['socket'] = new Net.Server(S.settings.socket);

    S.socket['$transaction'] = function(args, socket){
      var d = Belt.parse(args)
        , t = {
            '$request': socket
          , '$response': socket
        //, '$session':
          , '$server': S.socket
          , '$url': URL.parse(Belt.get(d, 'url'))
          , '$type': 'socket'
          , '$body': d
          };

      t['$query'] = Querystring.parse(t.$url.query);
      t['$data'] = Belt.extend({}, t.$params || {}, t.$query || {}, t.$body || {});

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
      return socket.on('data', function(data){
        var rt = _.find(S.socket.$routes, function(r){
          return r.route.call(S, data, socket);
        });

        if (rt) rt.method.call(S, S.socket.$transaction(data, socket));

        return;
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

  S['plugins'] = {};
  _.each(S.settings.plugins, function(p){
    S.plugins[p] = require(Path.join(S.settings.__dirname, p));
    if (_.isFunction(S.plugins[p])) S.plugins[p] = new S.plugins[p](S, S.settings);
  });

  return S;
};

if (require.main === module){
  var M = new module.exports();
}
