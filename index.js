/**
 * Session store for Express, backed by elasticsearch
 *
 * Usage:
 * var express = require('express')
 *   , session = require('express-session')
 *   , ESStore = require('express-elasticsearch-session')(session);
 *
 * Then:
 * server.use(session({
 *     secret : 'yoursecret',
 *     key : 'yoursessionkey',
 *     cookie : {
 *         path : '/',
 *         httpOnly : true,
 *         maxAge : 365 * 24 * 3600 * 1000   // One year for example
 *     },
 *     store : new ESStore()
 * }));
 */

"use strict";

var util = require("util"),
    elasticsearch = require('elasticsearch');

module.exports = function (session) {
  /**
   * Constructor
   * @param {String} options.host ElasticSearch host (default: "localhost:9200")
   * @param {String} options.index ElasticSearch's session index (default: "express")
   * @param {String} options.typeName ElasticSearch's session typename (default: "session")
   * @param {String} options.ttl (default: 1h)
   * @param {String} options.prefix (default: "")
   * @param {String} options.logLevel ElasticSearch log-level (default: "trace")
   */
  function ESStore(options) {
    var defaults = {
      host: "localhost:9200",
      index: "express",
      typeName: "session",
      ttl: 1000 * 60 * 60,
      prefix: "",
      logLevel: "trace"
    };

    this.options = util._extend(defaults, options || {});

    this.client = new elasticsearch.Client({
      host: this.options.host,
      log: this.options.logLevel
    });

    this.initialSessionTimeout()
  }

  util.inherits(ESStore, session.Store);

  ESStore.prototype.pSid = function(sid) {
    return (this.options.prefix) + sid;
  }

  /**
   * Get session data
   */
  ESStore.prototype.get = function (sid, cb) {
    this.client.get({
      index: this.options.index,
      type: this.options.typeName,
      id: this.pSid(sid)
    }, (e, r) => {
      if( typeof cb !== "function" ) {
        cb = () => {};
      }
      if ( e || typeof r === 'undefined' || new Date().getTime() - r._source.timestamp > this.options.ttl ) {
        return cb();
      }
      cb(null, r._source);
    })
  };


  /**
   * Set session data
   */
  ESStore.prototype.set = function (sid, sess, cb) {
    sess.timestamp = new Date().getTime();
    this.client.index({
      index: this.options.index,
      type: this.options.typeName,
      id: this.pSid(sid),
      body: sess
    }, function (e, r) {
      if( typeof cb === "function" ) {
        cb(e);
      }
    });
  };


  /**
   * Destroy a session's data
   */
  ESStore.prototype.destroy = function (sid, cb) {
    this.client.delete({
      index: this.options.index,
      type: this.options.typeName,
      id: this.pSid(sid)
    }, function (e, r) {
      if( typeof cb === "function" ) {
        cb(e, r);
      }
    });
  };

  /**
   * Set up initial timeout after service restart
   */
  ESStore.prototype.initialSessionTimeout = function () {
    var self = this
    this.timeouts = {};
    this.client.search({
      index: this.options.index,
      type: this.options.typeName,
      body: {
        query: {
          match_all: {}
        }
      },
      _source: false
    }, function (e, r) {
      if (e) {
        console.error(e)
      }

      var hits = r.hits.hits
      if (hits) {
        hits.forEach(function (hit) {
          self.sessionTimeout(hit._id)
        })
      }
    })
  }

  /**
   * Clear existing timeout for session deletion and refresh
   */
  ESStore.prototype.sessionTimeout = function (sid) {
    var self = this
    if ( this.timeouts[this.pSid(sid)] ) {
      clearTimeout(this.timeouts[this.pSid(sid)]);
    }
    this.timeouts[this.pSid(sid)] = setTimeout(function () {
      self.destroy(sid);
    }, this.options.ttl);
  };

  /**
   * Refresh a session's expiry
   */
  ESStore.prototype.touch = function (sid, sess, cb) {
    this.sessionTimeout(sid)
    this.client.update({
      index: this.options.index,
      type: this.options.typeName,
      id: this.pSid(sid),
      body: {
        script: {
          inline: "ctx._source.cookie.expires = Instant.ofEpochMilli(params.now).plusMillis(ctx._source.cookie.originalMaxAge).toString();",
          lang: "painless",
          params: { now: new Date().getTime() }
        }
      }
    }, function (e, r) {
      if ( typeof cb === "function" ) {
        cb(e, r);
      }
    });
  };

  return ESStore;
};
