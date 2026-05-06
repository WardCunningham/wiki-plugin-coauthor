import { coauthor } from '../src/client/coauthor.js'
import { suite, test } from 'node:test'
import assert from 'node:assert'

suite('coauthor plugin', () => {
  suite('expand', () => {
    test('can escape html markup characters', () => {
      const result = coauthor.expand('try < & >')
      assert.equal(result, 'try &lt; &amp; &gt;')
    })
  })
})
