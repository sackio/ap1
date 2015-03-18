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
    gb.sock = io.connect(document.location.protocol === 'https:' ? 'https://localhost:8000/' : 'http://localhost:7000/');

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

  test('regenerate session with http', function(done){
    return $.post('/regenerate', function(data){
      return $.getJSON('/session', function(data){
        assert.ok(!data.session.fab);
        assert.ok(!data.session.foo);
        assert.ok(data.id !== gb.http_session.id);
        gb.http_session = data;
        return done();
      });
    });
  });

  test('ensure new session with socket.io', function(done){
    gb.sock.disconnect();
    gb.sock.connect();

    this.timeout(10000);

    gb.sock.once('session', function(data){
      assert.ok(data.session.cookie);
      assert.ok(data.id === gb.http_session.id);

      return done();
    });

    return gb.sock.emit('session');
  });
});
