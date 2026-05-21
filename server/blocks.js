import * as fs from 'node:fs/promises'

// API

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
      return fail(err.message)
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
  if (!body?.length) return trouble(elem, `FROM expects indented blocks to follow.`)
  const page = state.page
  const items = page.story.filter(item => item.type == 'reference')
  let resolved = 0
  for (const item of items) {
    const page = await getPage(state.context.argv.db, item.slug, err => trouble(elem, err))
    state.page = page
    resolved++
    await state.context.run(body, state)
  }
  state.page = page
  status(elem, `${resolved} pages`)
}

function count_emit({ elem, args, state }) {
  const words = (sum, each) => sum + each.text.split(/\W+/).length
  const count = state.page.story.filter(item => 'text' in item).reduce(words, 0)
  state.words = (state.words ?? 0) + count
  status(elem, `${state.words} words`)
}

function audit_emit({ elem, args, state }) {
  if (args.length < 1) return trouble(elem, 'AUDIT expects a way to check each page.')
  const way = args[0]
  if (!('page' in state)) return trouble(elem, 'AUDIT expects state.page to be checked, as from RESOLVE')
  if (!('items' in elem)) elem.items = []
  const page = state.page
  const title = page.title
  const slug = asSlug(title)
  const story = page.story

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
    case 'markdown':
      const items = story.filter(item => item.type == 'markdown')
      if (items.length) {
        if (!elem.items.length) elem.items.push(`<h3>"AUDIT ${way}" failed these checks.`)
        elem.items.push(`Unexpected ${items.length} items at [[${title}]].`)
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
