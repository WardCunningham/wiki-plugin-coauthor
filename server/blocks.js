import * as fs from 'node:fs/promises'
import { Graph } from './graph.js'

// API

export const uniq = (value, index, self) => self.indexOf(value) === index

export const asSlug = title =>
  title
    .replace(/\s/g, '-')
    .replace(/[^A-Za-z0-9-]/g, '')
    .toLowerCase()

export function status(elem, message) {
  elem.status = message
}

export function trouble(elem, message) {
  elem.trouble = message
}

export function checks(elem, section) {
  if (!('items' in elem)) elem.items = []
  if (!elem.items.length) elem.items.push(`<h3>${section}`)
  return elem.items
}

// U T I L I T Y

export function ago(then, now = Date.now()) {
  let sign = then > now ? '-' : ''
  let msec = Math.abs(now - then)
  let sec = Math.floor(msec / 1000)
  if (sec < 2) return `${sign}${msec} msec`
  let min = Math.floor(sec / 60)
  if (min < 2) return `${sign}${sec} seconds`
  let hour = Math.floor(min / 60)
  if (hour < 2) return `${sign}${min} minutes`
  let day = Math.floor(hour / 24)
  if (day < 2) return `${sign}${hour} hours`
  let week = Math.floor(day / 7)
  if (week < 2) return `${sign}${day} days`
  let month = Math.floor(day / 30)
  if (month < 2) return `${sign}${week} weeks`
  let year = Math.floor(day / 365)
  if (year < 2) return `${sign}${month} months`
  return `${sign}${year} years`
}

// async function getPage(db, slug, fail) {
//   if (!slug.match(/^[a-z-]+$/)) return fail('bad slug')
//   const page = await fs
//     .readFile(`${db}/${slug}`)
//     .then(data => JSON.parse(data))
//     .catch(err => {
//       return fail('no page')
//     })
//   return page
// }
async function getPage(site, slug, fail) {
  const page = await fetch(`http://${site}/${slug}.json`)
    .then(res => res.json())
    .catch(err => {
      return fail(`Can't find page for "${slug}".`)
    })
  return page
}

// B L O C K S

function hello_emit({ elem, args, state }) {
  const world = args[0] == 'world' ? ' 🌎' : ' 😀'
  status(elem, world)
}

function uptime_emit({ elem, args, state }) {
  const uptime = process.uptime()
  status(elem, uptime)
}

async function from_emit({ elem, command, args, body, state }) {
  if (!args[0]) return trouble(elem, `FROM expects site/slug as way to federated wiki page.`)
  if (!body?.length) return trouble(elem, `FROM expects indented blocks to follow.`)
  const origin = new URL(state.context.argv.url).host
  let site, slug
  if (args[0].includes('/')) {
    ;[site, slug] = args[0].split(/\//)
  } else {
    ;[site, slug] = [origin, args[0]]
  }
  const page = await getPage(site, slug, err => trouble(elem, err))
  if (!page) return
  state.page = page
  state.site = site
  const date = page.journal?.findLast(item => item.type != 'fork' && item.date).date
  if (date) {
    const age = ago(date)
    status(elem, `${age} old`)
  }
  await state.context.run(body, state)
}

async function resolve_emit({ elem, args, body, state }) {
  const way = 'reference'
  const checking = `"RESOLVE ${way}" missing pages.`
  if (!body?.length) return trouble(elem, `FROM expects indented blocks to follow.`)
  const page = state.page
  const items = page.story.filter(item => item.type == 'reference')
  elem.resolved = 0
  for (const item of items) {
    const page = await getPage(state.site, item.slug, err => {
      checks(elem, checking).push(`No local page at [[${item.title}]].`)
      return null
    })
    if (!page) continue
    if (!(page.story || []).length) {
      checks(elem, checking).push(`Empty page at [[${page.title}]].`)
      continue
    }
    state.page = page
    elem.resolved++
    await state.context.run(body, state)
  }
  state.page = page
  if (elem.items?.length) status(elem, `${elem.resolved} pages, ${elem.items.length - 1} skipped.`)
  else status(elem, `${elem.resolved} pages`)
}

function count_emit({ elem, args, state }) {
  if (!args.length) return trouble(elem, `COUNT expects a way to count.`)
  const way = args[0]
  let count = 0
  switch (way) {
    case 'words':
      const words = (sum, each) => sum + each.text.split(/\W+/).length
      count = state.page.story.filter(item => 'text' in item).reduce(words, 0)
      break
    case 'items':
      count = state.page.story.length
      break
    default:
      return trouble(elem, `"${way}" is not a way to count.`)
  }
  elem.count = (elem.count ?? 0) + count
  status(elem, `${elem.count} ${way}`)
}

function audit_emit({ elem, args, body, state }) {
  if (args.length < 1) return trouble(elem, 'AUDIT expects a way to check each page.')
  const way = args[0]
  if (!('page' in state)) return trouble(elem, 'AUDIT expects state.page to be checked, as from RESOLVE')
  if (!('items' in elem)) elem.items = []
  const page = state.page
  const title = page.title
  const slug = asSlug(title)
  const story = page.story

  let links, count

  switch (way) {
    case 'next':
      if (elem.next && asSlug(elem.next) != slug) {
        if (!elem.items.length) elem.items.push(`<h3>"AUDIT ${way}" failed these checks.`)
        if (elem.next == 'Unspecified Next') elem.items.push(`No Next at [[${elem.prev}]], Want [[${title}]]`)
        else elem.items.push(`Wrong Next at [[${elem.prev}]], Want [[${title}]].`)
      }
      const item = story.findLast(item => item.type == 'paragraph')
      const m = item?.text && item.text.match(/Next.*?\[\[(.+?)\]\]/i)
      elem.prev = title
      elem.next = m ? m[1] : 'Unspecified Next'
      break
    case 'external':
      links = text => (text.match(/\[http.+? .+?\]/g) || []).length
      count = story.reduce((sum, each) => sum + links(each.text || ''), 0)
      if (count) {
        if (!elem.items.length) elem.items.push(`<h3>"AUDIT ${way}" failed these checks.`)
        elem.items.push(`External links (${count}) at [[${title}]].`)
      }
      break
    case 'links':
      links = text => text.match(/\[\[.+?\]\]/g) || []
      count = story.reduce((sum, each) => sum + links(each.text || '').length, 0)
      const seen = new Set()
      const full = story.map(item => item.text || '').join(' ')
      const dups = links(full)
        .filter(link => {
          const dup = seen.has(link)
          seen.add(link)
          return dup
        })
        .filter(uniq)
      const limits = (args[1] ?? '0').split('-')
      const min = Number(limits[0])
      const max = Number(limits[1] ?? limits[0])
      if (count < min || count > max || dups.length) {
        if (!elem.items.length) elem.items.push(`<h3>"AUDIT ${args.join(' ')}" failed these checks.`)
        if (count < min) elem.items.push(`Too few links (${count}) at [[${title}]].`)
        if (count > max) elem.items.push(`Too many links (${count}) at [[${title}]].`)
        if (dups.length) elem.items.push(`Duplicate links (${dups.join(', ')}) at [[${title}]]`)
      }
      break
    case 'markdown':
      const ok = text => {
        if (text.match(/[^_]_.+?_[^_]/)) return true
        if (text.match(/\*\*.+?\*\*/)) return true
        if (text.match(/^>/)) return true
        return false
      }
      const items = story.filter(item => item.type == 'markdown').filter(item => !ok(item.text))
      if (items.length) {
        if (!elem.items.length) elem.items.push(`<h3>"AUDIT ${way}" failed these checks.`)
        console.log('markdown', items)
        elem.items.push(`Unexpected items (${items.length})  at [[${title}]].`)
      }
      break
    case 'items':
      const allowed = ['paragraph']
      if (body) allowed.push(...body.map(tree => tree.command))
      const types = story
        .filter(item => !allowed.includes(item.type))
        .map(item => item.type)
        .filter(uniq)
      if (types.length) {
        if (!elem.items.length) elem.items.push(`<h3>"AUDIT ${way}" failed these checks.`)
        elem.items.push(`Unexpected items (${types.join(', ')}) at [[${title}]].`)
      }
      break
    default:
      if (!elem.items.length) elem.items.push(`<h3>"AUDIT ${way}" is not a way to check.`)
  }

  if (elem.items.length) {
    status(elem, `${elem.items.length - 1} failed checks`)
  } else status(elem, 'ok')
}

function garden_emit({ elem, args, body, state }) {
  if (!('page' in state)) return trouble(elem, 'GARDEN expects state.page to be a story, as from RESOLVE')
  if (!('items' in elem)) elem.items = []
  if (!('graph' in elem)) elem.graph = new Graph()
  if (!('aspect' in state)) state.aspect = []
  if (!('aspect' in elem)) {
    elem.aspect = { id: state.site, result: [{ name: elem.command, graph: elem.graph }] }
    state.aspect.push(elem.aspect)
  }
  const graph = elem.graph
  const page = state.page
  const site = state.site
  const title = page.title
  const name = title.replaceAll(/\s+/g, '\n')
  const slug = asSlug(title)
  // const site = location.host
  const story = page.story
  const nodes = graph.nodes.length ? graph.nodes.length : null
  const nid = graph.addNode('', { name, title, site, slug })
  if (nodes) graph.addRel('', nodes - 1, nid)
  status(elem, `${graph.nodes.length} nodes`)
  console.log({ elem, nodes: graph.nodes.length })
}

// C A T A L O G

export const blocks = {
  HELLO: { emit: hello_emit },
  UPTIME: { emit: uptime_emit },
  FROM: { emit: from_emit },
  RESOLVE: { emit: resolve_emit },
  COUNT: { emit: count_emit },
  AUDIT: { emit: audit_emit },
  GARDEN: { emit: garden_emit },
}
