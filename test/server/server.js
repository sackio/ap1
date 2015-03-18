var Belt = require('jsbelt')
  , Optionall = require('optionall')
  , Path = require('path')
  , OS = require('os')
  , FSTK = require('fstk')
  , O = new Optionall({'__dirname': Path.resolve(module.filename + '/../../..')
                     , 'file_priority': ['package.json', 'environment.json', 'config.json']})
  , Async = require('async')
  , _ = require('underscore')
  , Winston = require('winston')
  , API = require('../../lib/ap1.js');

var gb = {}
  , log = new Winston.Logger()
;

log.add(Winston.transports.Console, {'level': 'debug', 'colorize': true, 'timestamp': false});

gb.api = new API(O);

//static files
gb.api.http.addRoute(/^\/(bower_components|node_modules)/, function(o){
  return o.$response.sendFile(Path.join(gb.api.settings.__dirname, o.$url.pathname));
});

gb.api.http.addRoute('/server_tests.js', function(o){
  return o.$response.sendFile(Path.join(gb.api.settings.__dirname, '/test/server/server_tests.js'));
});

gb.api.http.addRoute(/\/.*\.json$/, function(o){
  return o.$response.sendFile(Path.join(gb.api.settings.__dirname, '.' + o.$url.pathname));
});
//end static files

//test routes
gb.api.http.addRoute('/session', function(o){
  return o.$session.reload(function(){
    return o.$response.status(200).json({'session': o.$request.session, 'id': o.$request.sessionID});
  });
});

gb.api.io.addRoute('session', function(o){
  var sock = this;
  return gb.api.sessionsStore.get(o.$request.$sessionID, function(err, sess){
    return sock.emit('session', {'session': sess, 'id': o.$request.$sessionID});
  });
});

gb.api.http.addRoute('/set', function(o){
  _.each(o.$data, function(v, k){ return o.$session[k] = v; });
  return o.$session.save(function(){
    return o.$response.status(200).json({'session': o.$request.session, 'id': o.$request.sessionID});
  });
}, {'method': 'post'});

gb.api.io.addRoute('set', function(o){
  _.each(o.$data, function(v, k){ return o.$session[k] = v; });
  var sock = this;
  return gb.api.sessionsStore.set(o.$request.$sessionID, o.$session, function(err, sess){
    return sock.emit('set', {'session': o.$session, 'id': o.$request.$sessionID});
  });
});

gb.api.http.addRoute('/regenerate', function(o){
  return o.$session.regenerate(function(err){
    return o.$response.status(200).json({'done': true});
  });
}, {'method': 'post'});
//end test routes

gb.api.http.addRoute('*', function(o){
  return o.$response.sendFile(Path.join(gb.api.settings.__dirname, '/test/server/index.html'));
});
