var Path = require('path')
  , Optionall = require('optionall')
  , FSTK = require('fstk')
  , Async = require('async')
  , _ = require('underscore')
  , Belt = require('jsbelt')
  , Util = require('util')
  , Winston = require('winston')
  , Events = require('events')
;

module.exports = function(O){
  var Opts = O || new Optionall({
                                  '__dirname': Path.resolve(module.filename + '/../..')
                                , 'file_priority': ['package.json', 'environment.json', 'config.json']
                                });

  var S = {};

  var log = Opts.log || new Winston.Logger();
  if (!Opts.log) log.add(Winston.transports.Console, {'level': 'info', 'colorize': true, 'timestamp': false});

  /*
    standard responses with JSON
  */
  S['jsonRespond'] = function(err, data, options, callback){
    var a = Belt.argulint(arguments)
      , self = this;
    a.o = _.defaults(a.o, {
      'status': 200
    , 'event': a.o.$event
    });

    if (a.o.$type === 'http'){
      a.o.$response.status(a.o.status).json({'error': err, 'data': data, 'status': a.o.status});
    } else if (a.o.$type === 'ws'){
      a.o.$response.emit(a.o.event, {'error': err, 'data': data, 'status': a.o.status});
    } else if (a.o.$type === 'socket'){
      a.o.$response.write(Belt.stringify({'error': err, 'data': data, 'status': a.o.status, 'event': a.o.event}));
    } else if (a.o.$type === 'email'){
      return a.o.$response.send_email({
        'to': a.o.to || data.to || a.o.$from
      , 'from': this.settings.email.from_email
      , 'subject': a.o.subject || data.subject || ''
      , 'html': data.html || Belt.stringify(Belt.extend({'error': err, 'status': a.o.status, 'event': a.o.event}
                                                       , _.omit(data.body, ['subject', 'to', 'text'])))

      , 'text': data.text || Belt.stringify(Belt.extend({'error': err, 'status': a.o.status, 'event': a.o.event}
                                                       , _.omit(data.body, ['subject', 'to', 'html'])))
      }, a.cb);
    }

    return a.cb();
  };

  return S;
};
