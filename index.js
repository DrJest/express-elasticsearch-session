/**
 * Session store for Express 4, backed by elasticsearch
 *
 * Usage:
 * var express = require('express')
 *   , session = require('express-session')
 *   , ESStore = require('connect-elasticsearch-session')(session);
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
 *     store : new ESStore({ filename : 'path_to_nedb_persistence_file' })
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
   * @param {String} options.pingInterval (default: 1000)
   * @param {String} options.timeout (default: 1000)
   * @param {String} options.prefix (default: "")
   * @param {String} options.logLevel ElasticSearch log-level (default: "trace")
   * @param {Function} cp Optional callback (useful when testing)
   */
  function ESStore(options, cb) {
    var callback = cb || function () {};
    var defaults = {
      host: "localhost:9200",
      index: "express",
      typeName: "session",
      pingInterval: 1000,
      timeout: 1000,
      prefix: "",
      logLevel: "trace"
    };

    let o = {};
    for(let i in defaults) {
      o[i] = options[i] !== undefined ? options[i] : defaults[i];
    }
    this.options = o;

    this.client = new elasticsearch.Client({
      host: this.options.host,
      log: this.options.logLevel
    });
  }

  // Inherit from session store
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
      type: this.options.typee,
      id: this.pSid(sid)
    }, function (e, r) {
      if ( typeof r == 'undefined' ) cb();
      else cb(null, r._source);
    })
  };


  /**
   * Set session data
   */
  ESStore.prototype.set = function (sid, sess, cb) {
    this.client.index({
      index: this.es.index,
      type: this.es.type,
      id: this.pSid(sid),
      body: sess
    }, function (e, r) {
      cb(e);
    });
  };


  /**
   * Destroy a session's data
   */
  ESStore.prototype.destroy = function (sid, cb) {
    this.client.delete({
      index: this.es.index,
      type: this.es.type,
      id: this.pSid(sid)
    }, function (e, r) {
      cb(e)
    });
  };


  return ESStore;
};