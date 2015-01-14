var gb = {}
  , Async = async;


suite('browser-based tests', function(){
  setup(function(){
    return;
  });
  teardown(function(){
    return;
  });

  test('load json data', function(done){
    return Async.waterfall([
      function(cb){
        return $.getJSON('/package.json', Belt.cs(cb, gb, 'pkg', 0))
      }
    , function(cb){
        return $.getJSON('/environment.json', Belt.cs(cb, gb, 'env', 0))
      }
    , function(cb){
        return $.getJSON('/config.json', Belt.cs(cb, gb, 'cfg', 0))
      }
    , function(cb){
        return $.getJSON('/bower.json', Belt.cs(cb, gb, 'bow', 0))
      }
    ], function(err){
      assert.ok(!err);
      gb.opts = Belt.extend({}, gb.pkg, gb.env, gb.bow, gb.cfg);
      return done();
    });
  });

  test('ensure http session', function(done){
    return $.getJSON('/session', function(data){
      gb.http_session = data;

      assert.ok(gb.http_session.session.cookie);
      assert.ok(gb.http_session.id);

      return done();
    });
  });

  test('connect to socket.io and ensure session', function(done){
    gb.sock = io.connect('/');

    gb.sock.once('session', function(data){
      gb.sock_session = data;

      assert.ok(gb.sock_session.session.cookie);
      assert.ok(gb.sock_session.id === gb.http_session.id);

      return done();
    });

    return gb.sock.emit('session');
  });

  test('set session data with http', function(done){
    return $.post('/set', {'foo': 'bar'}, function(data){
      assert.ok(data.session.foo === 'bar');
      return done();
    });
  });

  test('get session data with http', function(done){
    return $.getJSON('/session', function(data){
      assert.ok(data.session.foo === 'bar');
      return done();
    });
  });

  test('get session data with socket.io, after having set with http', function(done){
    gb.sock.once('session', function(data){
      assert.ok(data.session.foo === 'bar');
      return done();
    });

    return gb.sock.emit('session');
  });

  test('set session data with socket.io', function(done){
    gb.sock.once('set', function(data){
      assert.ok(data.session.fab === 'baz');
      assert.ok(data.session.foo === 'bar');
      return done();
    });

    return gb.sock.emit('set', {'fab': 'baz'});
  });

  test('get session data with socket.io', function(done){
    gb.sock.once('session', function(data){
      assert.ok(data.session.fab === 'baz');
      assert.ok(data.session.foo === 'bar');
      return done();
    });

    return gb.sock.emit('session');
  });

  test('get session data with http after having set with socket.io', function(done){
    return $.getJSON('/session', function(data){
      assert.ok(data.session.fab === 'baz');
      assert.ok(data.session.foo === 'bar');
      return done();
    });
  });

});
