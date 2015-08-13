'use strict';

var _ = require('lodash');
var pkg = require('./package');

var plugin = pkg.name;

module.exports.register = function (server, options, next) {
  var cacheName = options.cacheName;

  // Intercept role:web,use:... to add Hapi caching.
  server.seneca.add({ role: 'web' }, function (args, done) {
    var seneca = this;
    var use = args.use;
    var rewrittenMappingArgs = seneca.util.argprops(
      { fatal$: false },
      _.cloneDeep(args),
      { role: args.role, cmd: args.cmd });

    function skipRewrite () {
      seneca.parent(rewrittenMappingArgs, done);
    }

    // Only intercept patterns with the use arg.
    if (!use) return skipRewrite();
    // Don't intercept when called with Express middleware.
    if (typeof use === 'function') return skipRewrite();
    // For some reason setting up a proxy for /auth (from seneca-auth) does not work.
    // TODO // Maybe because it uses { POST: function () {...} } or some other option.
    if (use.prefix === '/auth') return skipRewrite();

    var role = use.pin.role;
    var namePrefix = role.replace(/[-]/g, '_') + '_';

    // Overwrite the mapping role to use our proxied seneca actions.
    rewrittenMappingArgs.use.pin.role = plugin;

    // Recreate the mappings so the cmd names point to our proxied actions.
    rewrittenMappingArgs.use.map = {};
    _.each(use.map, function (mapping, cmd) {
      var expiresInWasSet = Number.isFinite(mapping.expiresIn);
      var expiresInMs = 0;
      var privacyWasSet = (mapping.privacy === 'public' || mapping.privacy === 'private');
      var privacy = mapping.privacy || 'private';
      var anySettingsWereSet = privacyWasSet || expiresInWasSet;
      var name = namePrefix + cmd.replace(/[-]/g, '_');
      var cache;

      rewrittenMappingArgs.use.map[name] = mapping;

      if (expiresInWasSet && mapping.expiresInMs > 0) {
        expiresInMs = mapping.expiresInMs;

        cache = server.cache({
          cache: cacheName,
          expiresIn: expiresInMs,
          segment: 'chairo_cache_' + name,
          generateFunc: function (key, next) {
            seneca.act(key, next);
          }
        });
      }

      // Create a proxy seneca action that checks the Hapi cache.
      seneca.add({ role: plugin, cmd: name }, function (args, done) {
        var proxiedActionArgs = seneca.util.argprops(
          {fatal$: false, req$: args.req$, res$: args.res$ },
          args,
          { role: role, cmd: cmd });

        var proxiedAction;

        if (cache) {
          proxiedAction = _.bind(cache.get, cache, proxiedActionArgs);
        }
        else {
          proxiedAction = _.bind(seneca.act, seneca, proxiedActionArgs);
        }

        proxiedAction(function (error, result) {
          if (error) return done(error);

          result = result || {};

          // Get the current values, removing privacy and max-age directives.
          var directives = _.chain(result)
            .get('http$.headers.Cache-Control', '')
            .split(/\s*,\s*/)
            .filter(_.identity)
            .value();

          if (anySettingsWereSet) {
            directives = _.filter(directives, function (item) {
              if (item === 'public') return false;
              if (item === 'private') return false;
              if (item === 'must-revalidate') return false;
              if (_.startsWith(item, 'max-age')) return false;
              return true;
            });

            directives.push(privacy);
            directives.push('must-revalidate');
            directives.push('max-age=' + Math.round(expiresInMs / 1000));
          }

          _.set(result, 'http$.headers.Cache-Control', directives.join(', '));

          done(null, result);
        });
      });
    });

    seneca.parent(rewrittenMappingArgs, done);
  });

  next();
};

module.exports.register.attributes = { pkg: pkg };
