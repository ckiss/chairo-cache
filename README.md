# chairo-cache
Cache seneca-web route results using a Hapi cache.

## Example

Easy to add to your Hapi/Chairo front end:

```javascript

var server = new Hapi.Server({
  cache: [
    {
      name: 'memory-cache',
      engine: require('catbox-memory'),
      host: '127.0.0.1',
      partition: 'cache'
    }
  ]
});

server.register({ register: Chairo, options: options }, function (error) {
  if (error) throw error;

  server.register({ register: require('chairo-cache'), options: { cacheName: 'memory-cache' } }, function (error) {
    if (error) throw error;

    var seneca = server.seneca;
   
    // ....
  
  });
});

```

This plugin adds some extra options to seneca-web's use semantics:

```javascript

  var ONE_HR_MS = 1 * 60 * 60 * 100;

  seneca.act({ role: 'web', use: {
    prefix: '/api/1.0.0/cheeses',
    pin: { role: 'cheeses, cmd: '*' },
    map: {
      'wine_pairings': {GET: true, alias: 'wines', expiresIn: ONE_HR_MS },
      'beer_pairings': {GET: true, alias: 'beers', expiresIn: ONE_HR_MS, privacy: 'public' },
    }
  }});

```
