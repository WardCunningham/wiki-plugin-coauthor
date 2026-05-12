// mech plugin, server-side component
// These handlers are launched with the wiki server.

import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as process from 'node:process'
import { status, trouble, blocks } from './blocks.js'

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

  app.get('/plugin/coauthor/perform', cors, (req, res, next) => {
    const todo = JSON.parse(atob(req.query.todo))
    console.log(todo)
    return res.json({ count: ++count })
  })

  app.get('/plugin/coauthor/mech', cors, (req, res, next) => {
    try {
      const mech = JSON.parse(atob(req.query.mech || 'W10='))
      const share = JSON.parse(atob(req.query.state || 'W10='))
      const context = { argv, run }
      const state = Object.assign(share, { context })
      run(mech, state)
        .then(() => {
          delete state.context
          return res.json({ mech, state })
        })
        .catch(err => {
          console.log(err)
          return res.json({ err: err.message + ' from promise' })
        })
    } catch (err) {
      return res.json({ err: err.message + ' from try' })
    }
  })

  // I N T E R P R E T E R

  async function run(nest, state = {}, mock) {
    // const scope = nest.slice()
    // while (scope.length) {
    for (let here = 0; here < nest.length; here++) {
      // const code = scope.shift()
      const code = nest[here]
      if ('command' in code) {
        const command = code.command
        const elem = code
        const [op, ...args] = code.command.split(/ +/)
        const next = nest[here + 1]
        const body = next && 'command' in next ? null : nest[++here]
        const stuff = { command, op, args, body, elem, state }
        if (state.debug) console.log(stuff)
        if (blocks[op]) await blocks[op].emit.apply(null, [stuff])
        else if (op.match(/^[A-Z]+$/)) trouble(elem, `${op} doesn't name a block we know.`)
        else if (code.command.match(/\S/)) trouble(elem, `Expected line to begin with all-caps keyword.`)
      } else if (Array.isArray(code)) {
        console.warn(`this can't happen.`)
        run(code, state) // when does this even happen?
      }
    }
  }
}

export { startServer }
