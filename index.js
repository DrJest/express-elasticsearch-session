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
   * Update a session's expiry
   */
  ESStore.prototype.touch = function (sid, sess, cb) {
    var now = new Date()
    this.client.update({
      index: this.options.index,
      type: this.options.typeName,
      id: this.pSid(sid),
      body: {
        script: {
          inline: "ctx._source.cookie.expires = Instant.parse(params.now).plusMillis(ctx._source.cookie.originalMaxAge).toString();",
          lang: "painless",
          params: { now: new Date().toISOString() }
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