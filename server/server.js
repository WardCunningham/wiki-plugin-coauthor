// mech plugin, server-side component
// These handlers are launched with the wiki server.

import * as fs from 'node:fs'
import * as path from 'node:path'
import * as process from 'node:process'

function cors(req, res, next) {
  res.header('Access-Control-Allow-Origin', '*')
  next()
}

let count = 0

function startServer(params) {
  var app = params.app,
    argv = params.argv

  return app.get('/plugin/coauthor/stats', cors, (req, res, next) => {
    return res.json({ count: ++count })
  })
}

export { startServer }
