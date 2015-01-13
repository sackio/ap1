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

gb.api.http.addRoute(/^\/(bower_components|node_modules)/, function(o){
  return o.$response.sendFile(Path.join(gb.api.settings.__dirname, o.$url.pathname));
});

gb.api.http.addRoute('*', function(o){
  return o.$response.sendFile(Path.join(gb.api.settings.__dirname, '/test/server/index.html'));
});
