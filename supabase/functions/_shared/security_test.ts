import { hmac, HttpError, nickname, loginId, uuid, pin, randomCode, readBody, sha256, text } from './security.ts'
function assert(value: boolean, message: string) { if (!value) throw new Error(message) }
function rejects(fn: () => unknown) { try { fn() } catch (error) { assert(error instanceof HttpError, 'expected controlled HTTP error'); return }; throw new Error('Expected rejection') }
Deno.test('PIN accepts 6–12 digits, preserves leading zeros, rejects whitespace and weak formats', () => {
  assert(pin('000123') === '000123', 'leading zero lost')
  assert(pin('123456789012').length === 12, 'maximum length')
  for (const value of ['12345','1234567890123','abcdef','１２３４５６',' 123456','123456 ',null,123456]) rejects(() => pin(value))
})
Deno.test('nickname normalization rejects invisible control characters and bounds input', () => {
  assert(nickname(' 하루 ') === '하루', 'trim failed')
  for (const value of ['', ' '.repeat(5), 'a'.repeat(31), 'ha\u200bru', 'a\nb', null]) rejects(() => nickname(value))
  rejects(() => text('a'.repeat(11),10))
})
Deno.test('invitation and recovery tokens have 160 bits of random entropy', () => {
  const tokens = new Set(Array.from({ length: 100 }, () => randomCode()))
  assert(tokens.size === 100 && [...tokens].every(token => /^[a-f0-9]{40}$/.test(token)), 'random token format')
})
Deno.test('SHA-256 uses a known answer and HMAC is domain-separated by purpose/email', async () => {
  assert(await sha256('abc') === 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad', 'SHA mismatch')
  const a = await hmac('test-secret', 'pin:a@internal.invalid:123456')
  const b = await hmac('test-secret', 'pin:b@internal.invalid:123456')
  assert(a.length === 64 && a !== b, 'HMAC must bind account')
  assert(a !== await hmac('different-secret','pin:a@internal.invalid:123456'), 'pepper not used')
})
Deno.test('request parsing rejects oversized bodies and non-object JSON', async () => {
  const make = (body: string) => new Request('http://localhost', { method: 'POST', headers: { 'content-type':'application/json' }, body })
  const data = await readBody(make('{"action":"login"}'))
  assert(data.action === 'login', 'valid JSON rejected')
  for (const body of ['[]','null','"str"','invalid','{"data":"'+'a'.repeat(8200)+'"}']) {
    let rejected = false
    try { await readBody(make(body)) } catch (error) { rejected = error instanceof HttpError }
    assert(rejected, 'unsafe request accepted')
  }
})

Deno.test('new login IDs are independent of Unicode legacy IDs and band nicknames', () => {
  assert(loginId(' USER.name-1 ', true) === 'USER.name-1', 'trim account ID')
  assert(loginId('이전닉네임') === '이전닉네임', 'legacy login must continue to work')
  for (const value of ['abc', 'a b c', '_abcd', '한글아이디', 'a'.repeat(31)]) rejects(() => loginId(value, true))
  assert(nickname('한글 별명') === '한글 별명', 'nickname independent of login ID syntax')
})
Deno.test('band IDs must be valid UUIDs before privileged actions', () => {
  assert(uuid('40000000-0000-0000-0000-000000000001').length === 36, 'valid band ID')
  for (const value of ['not-a-uuid', '', null, '40000000-0000-0000-0000-000000000001junk']) rejects(() => uuid(value))
})
