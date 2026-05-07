// mech plugin, server-side component
// These handlers are launched with the wiki server.

import * as fs from 'node:fs/promises'
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

  app.get('/plugin/coauthor/stats', cors, (req, res, next) => {
    return res.json({ count: ++count })
  })

  app.post('/plugin/coauthor/apply', cors, async (req, res, next) => {
    const todo = req.body
    const slug = todo[0].slug
    if (!slug.match(/[a-z-]+/)) return res.status(406).end()
    const page = await fs
      .readFile(`${argv.db}/${slug}`)
      .then(data => JSON.parse(data))
      .catch(err => {
        return res.status(406).end()
      })
    const date = page.journal.findLast(action => action != 'fork').date
    todo[0].age = `${((Date.now() - date) / (24 * 60 * 60 * 1000)).toFixed(2)} days`
    todo[1].count = ++count
    return res.json(todo)
  })
}

export { startServer }
