import * as fs from 'node:fs/promises'

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

async function getPage(db, slug, fail) {
  if (!slug.match(/[a-z-]+/)) return fail('bad slug')
  const page = await fs
    .readFile(`${db}/${slug}`)
    .then(data => JSON.parse(data))
    .catch(err => {
      return fail('no page')
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
  if (!args[0]) return trouble(elem, `FROM expects slug wiki page on this server.`)
  if (!body?.length) return trouble(elem, `FROM expects indented blocks to follow.`)
  const page = await getPage(state.context.argv.db, args[0], err => trouble(elem, err))
  state.page = page
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
    const page = await getPage(state.context.argv.db, item.slug, err => {
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
  if (elem.items.length) status(elem, `${elem.resolved} pages, ${elem.items.length - 1} skipped.`)
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
      const item = story[story.length - 1]
      const m = item.text && item.text.match(/Next.*?\[\[(.+?)\]\]/i)
      elem.prev = title
      elem.next = m ? m[1] : 'Unspecified Next'
      break
    case 'external':
      links = text => (text.match(/\[http.+? .+?\]/g) || []).length
      count = story.reduce((sum, each) => sum + links(each.text ?? ''), 0)
      if (count) {
        if (!elem.items.length) elem.items.push(`<h3>"AUDIT ${way}" failed these checks.`)
        elem.items.push(`External links (${count}) at [[${title}]].`)
      }
      break
    case 'links':
      links = text => (text.match(/\[\[.+?\]\]/g) || []).length
      count = story.reduce((sum, each) => sum + links(each.text ?? ''), 0)
      const limits = (args[1] ?? '0').split('-')
      const min = Number(limits[0])
      const max = Number(limits[1] ?? limits[0])
      if (count < min || count > max) {
        if (!elem.items.length) elem.items.push(`<h3>"AUDIT ${args.join(' ')}" failed these checks.`)
        if (count < min) elem.items.push(`Too few links (${count}) at [[${title}]].`)
        if (count > max) elem.items.push(`Too many links (${count}) at [[${title}]].`)
      }
      break
    case 'markdown':
      const items = story.filter(item => item.type == 'markdown')
      if (items.length) {
        if (!elem.items.length) elem.items.push(`<h3>"AUDIT ${way}" failed these checks.`)
        elem.items.push(`Unexpected items (${items.length})  at [[${title}]].`)
      }
      break
    case 'items':
      const allowed = ['paragraph']
      if (body) allowed.push(...body.map(tree => tree.command))
      const kinds = story
        .filter(item => !allowed.includes(item.type))
        .map(item => item.type)
        .filter(uniq)
      if (kinds.length) {
        if (!elem.items.length) elem.items.push(`<h3>"AUDIT ${way}" failed these checks.`)
        elem.items.push(`Unexpected items (${kinds.join(', ')}) at [[${title}]].`)
      }
      break
    default:
      if (!elem.items.length) elem.items.push(`<h3>"AUDIT ${way}" is not a way to check.`)
  }

  if (elem.items.length) {
    status(elem, `${elem.items.length - 1} failed checks`)
  } else status(elem, 'ok')
}

// C A T A L O G

export const blocks = {
  HELLO: { emit: hello_emit },
  UPTIME: { emit: uptime_emit },
  FROM: { emit: from_emit },
  RESOLVE: { emit: resolve_emit },
  COUNT: { emit: count_emit },
  AUDIT: { emit: audit_emit },
}
