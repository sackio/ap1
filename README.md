# ap1

Ap1 is an all-in-one frontend server, a kitchen sink of servers for receiving requests and issuing responses.

An instance includes an Express HTTP server, Socket.io websocket server, standard socket server, and incoming/outgoing email server, with modularity for adding other server types and protocols.

Incoming requests are received on a server, and normalized into an options object, including the following:

```javascript
{
  '$session': {} //object including stateful information about the session associated with the request/response
, '$request': {} //object including request data
, '$response': {} //object for responding to request
, '$server': {} //server that originated the request
}
```

Module includes a variety of go-to methods for performing different types of message transactions (i.e. email confirmations, payments, location lookups, file uploads).

## Getting Started
Install the module with: `npm install ap1`

```javascript
var ap1 = require('ap1');
```

## License
Copyright (c) 2015 Ben Sack
Licensed under the MIT license.
