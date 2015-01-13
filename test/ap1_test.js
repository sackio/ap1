'use strict';

var Belt = require('jsbelt')
  , Optionall = require('optionall')
  , Path = require('path')
  , O = new Optionall({'__dirname': Path.resolve(module.filename + '/../..')})
  , Async = require('async')
  , _ = require('underscore')
  , AP1 = new require('../lib/ap1.js')(O);

exports['http'] = {
  'test': function(test){
    var test_name = 'test';
    log.debug(test_name);
    log.profile(test_name);

    test.ok(true);

    log.profile(test_name);
    return test.done();
  }
}
