const expand = text => {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*(.+?)\*/g, '<i>$1</i>')
}

let request

const emit = async ($item, item) => {
  const { report, todo } = parse(item.text)
  console.log({ report, todo })
  request = todo
  return $item.append(`
    <p style="background-color:#eee;padding:15px;">
      ${report.join('<br>')}<br>
      <button>doit</button>
      <div id=result></div>
    </p>`)
}

const bind = ($item, item) => {
  $item.dblclick(() => {
    return wiki.textEditor($item, item)
  })
  const div = $item.get(0)
  const button = div.querySelector('button')
  const result = div.querySelector('#result')
  button.addEventListener('click', async event => {
    button.disabled = true
    // result.innerText = await count()
    const reply = await apply(request)
    result.innerText = JSON.stringify(reply)
    button.disabled = false
  })
}

if (typeof window !== 'undefined') {
  window.plugins.coauthor = { emit, bind }
}

function parse(text) {
  const lines = text.split(/\n/)
  const report = []
  const todo = []
  for (const line of lines) {
    const arg = n => line.split(/\s+/)[n]
    if (!line.match(/\S/)) continue
    const word = line.match(/^[A-Z]+\b/)
    if (!word) {
      report.push(expand(line))
      continue
    }
    switch (word[0]) {
      case 'STORY':
        todo.push({ type: 'story', slug: arg(1) })
        break
      case 'STATS':
        todo.push({ type: 'stats', kind: arg(1) })
        break
      default:
        report.push(`Don't know: ${word}`)
    }
  }
  return { report, todo }
}

async function count() {
  const stats = await fetch('/plugin/coauthor/stats').then(res => res.json())
  return `${stats.count} counts`
}

async function apply(request) {
  const options = {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  }
  return await fetch('/plugin/coauthor/apply', options).then(res => res.json())
}

export const coauthor = typeof window == 'undefined' ? { expand } : undefined
