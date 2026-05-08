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

  const origin = argv.url.split(/\/\//)[1]

  app.get('/plugin/coauthor/stats', cors, (req, res, next) => {
    return res.json({ count: ++count })
  })

  app.post('/plugin/coauthor/apply', cors, async (req, res, next) => {
    const t0 = Date.now()
    const trouble = msg => res.status(406).end()
    const todo = req.body
    const reply = []
    const state = {}
    for (const row of todo) {
      reply.push(row)
      switch (row.type) {
        case 'story':
          const page = await getPage(row.slug)
          const date = page.journal.findLast(action => action != 'fork').date
          row.age = `${((Date.now() - date) / (24 * 60 * 60 * 1000)).toFixed(2)} days`
          state.items = page.story.filter(item => item.type == 'reference')
          reply.push({ type: 'perf', kind: 'story', pages: state.items.length })
          break
        case 'stats':
          let words = 0
          let remote = 0
          for (const item of state.items) {
            const here = item.site.split(/:/)[0]
            if (here != origin) {
              remote++
              continue
            }
            const page = await getPage(item.slug)
            const count = page.story
              .filter(item => 'text' in item)
              .reduce((sum, each) => sum + each.text.split(/\W+/).length, 0)
            words += count
          }
          row.count = words
          if (remote) {
            reply.push({ type: 'warning', kind: 'remote', count: remote })
          }
          break
        default:
          row.error = `can't ${row.type}`
      }
    }
    reply.push({ type: 'perf', kind: 'runtime', seconds: (Date.now() - t0) / 1000 })
    reply.push({ type: 'perf', kind: 'requests', count: ++count })
    return res.json(reply)

    async function getPage(slug) {
      if (!slug.match(/[a-z-]+/)) return trouble('bad slug')
      const page = await fs
        .readFile(`${argv.db}/${slug}`)
        .then(data => JSON.parse(data))
        .catch(err => {
          return trouble(`can't get: ${err.message}`)
        })
      return page
    }
  })
}

export { startServer }
