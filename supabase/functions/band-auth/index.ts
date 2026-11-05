import { createClient } from 'npm:@supabase/supabase-js@2.118.0'
import { HttpError, text, nickname, pin, sha256, hmac, randomCode, readBody } from '../_shared/security.ts'

const url = Deno.env.get('SUPABASE_URL')!
const adminKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const pepper = Deno.env.get('AUTH_PIN_PEPPER') ?? ''
const origins = (Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').map(s => s.trim()).filter(Boolean)
const makeAdmin = () => createClient(url, adminKey, { auth: { persistSession: false, autoRefreshToken: false } })
const failure = '처리할 수 없습니다. 닉네임과 입력 정보를 확인해주세요.'
const loginFailure = '닉네임 또는 PIN을 확인해주세요.'

Deno.serve(async req => {
  const origin = req.headers.get('origin')
  const allowed = !origin || origins.includes(origin)
  const headers: Record<string,string> = {
    'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Vary': 'Origin',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    ...(origin && allowed ? { 'Access-Control-Allow-Origin': origin } : {}),
  }
  const respond = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers })
  if (!allowed) return respond({ error: '허용되지 않은 요청입니다.' }, 403)
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers })
  if (req.method !== 'POST') return respond({ error: 'POST 요청만 사용할 수 있습니다.' }, 405)
  try {
    if (pepper.length < 32 || !origins.length) throw new HttpError(503, '인증 서비스 설정을 확인해주세요.')
    const admin = makeAdmin()
    const rpc = async <T>(name: string, args: Record<string,unknown>): Promise<T> => {
      const { data, error } = await admin.rpc(name, args)
      if (error) throw new HttpError(400, failure)
      return data as T
    }
    const limit = async (bucket: string, max: number, seconds: number) => {
      if (!await rpc<boolean>('auth_take_attempt', { p_bucket: await hmac(pepper, `rate:${bucket}`), p_limit: max, p_seconds: seconds }))
        throw new HttpError(429, '시도가 많습니다. 잠시 후 다시 시도해주세요.')
    }
    // A global limit remains effective even if an IP header is spoofed. Per-account
    // limits never depend on the client IP. IP is only an additional signal.
    await limit('global', 300, 60)
    const input = await readBody(req)
    const action = text(input.action, 30)
    const ip = req.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim() ?? 'unknown'
    await limit(`ip:${ip}`, 60, 900)
    if (action === 'login' || action === 'create-band' || action === 'join-band' || action === 'recover') {
      const name = nickname(input.nickname)
      const canonical = name.toLowerCase()
      await limit(`account:${action}:${canonical}`, action === 'login' ? 12 : 5, 900)
      if (action !== 'login') { await limit('registration-and-recovery', 60, 3600); await limit(`signup-ip:${ip}`, 10, 3600) }
      const password = pin(input.pin)
      type Account = { user_id: string; internal_email: string; band_id: string; band_role: string; recovery_hash: string | null }
      const lookup = async () => (await rpc<Account[]>('auth_lookup', { p_nickname: name }))[0]
      const derive = async (email: string, value: string) => `Ba1!${await hmac(pepper, `pin:${email}:${value}`)}`
      if (action === 'login') {
        const account = await lookup()
        const email = account?.internal_email ?? 'unavailable@accounts.ourband.invalid'
        const client = makeAdmin()
        const { data, error } = await client.auth.signInWithPassword({ email, password: await derive(email, password) })
        if (error || !data.session || !account) throw new HttpError(401, loginFailure)
        return respond({ session: { access_token: data.session.access_token, refresh_token: data.session.refresh_token } })
      }
      if (action === 'recover') {
        const account = await lookup()
        const recovery = text(input.recoveryKey, 100)
        const oldHash = await sha256(recovery)
        if (!account || account.band_role !== 'leader' || account.recovery_hash !== oldHash) throw new HttpError(400, failure)
        const nextKey = randomCode(); const nextHash = await sha256(nextKey)
        const claimed = await rpc<boolean>('auth_replace_recovery', { p_user: account.user_id, p_expected: oldHash, p_next: nextHash })
        if (!claimed) throw new HttpError(400, failure)
        const { error } = await admin.auth.admin.updateUserById(account.user_id, { password: await derive(account.internal_email, password) })
        if (error) {
          await rpc('auth_replace_recovery', { p_user: account.user_id, p_expected: nextHash, p_next: oldHash })
          throw new HttpError(400, failure)
        }
        return respond({ recoveryKey: nextKey })
      }
      const isLeader = action === 'create-band'
      const bandName = isLeader ? text(input.bandName, 60) : null
      if (isLeader && !bandName) throw new HttpError(400, '밴드 이름을 입력해주세요.')
      const inviteHash = isLeader ? null : await sha256(text(input.bandCode, 100).toLowerCase())
      // Validate invitation before creating any Auth account. Rechecked atomically
      // by auth_provision to handle code rotation during registration.
      if (!isLeader && !await rpc<string|null>('auth_invite_band', { p_hash: inviteHash })) throw new HttpError(400, failure)
      const recoveryKey = isLeader ? randomCode() : null
      const bandCode = isLeader ? randomCode() : null
      const email = `${crypto.randomUUID()}@accounts.ourband.invalid`
      const { data, error } = await admin.auth.admin.createUser({ email, password: await derive(email, password), email_confirm: true })
      if (error || !data.user) throw new HttpError(400, failure)
      try {
        await rpc('auth_provision', {
          p_user_id: data.user.id, p_email: email, p_nickname: name, p_band_name: bandName,
          p_invite_hash: inviteHash, p_recovery_hash: recoveryKey ? await sha256(recoveryKey) : null,
          p_code_hash: bandCode ? await sha256(bandCode) : null,
        })
      } catch (error) {
        const removed = await admin.auth.admin.deleteUser(data.user.id)
        if (removed.error) console.error('Auth provisioning cleanup failed', data.user.id)
        throw error
      }
      // Signup returns one-time leader credentials. User explicitly logs in next,
      // so a lost login response never discards the leader's recovery key.
      return respond({ created: true, bandCode, recoveryKey })
    }
    // Every privileged action explicitly verifies the user JWT with Auth. Gateway
    // verification is disabled because public nickname login has no user JWT yet.
    const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
    if (!token) throw new HttpError(401, '로그인이 필요합니다.')
    const { data: verified, error: invalid } = await admin.auth.getUser(token)
    if (invalid || !verified.user) throw new HttpError(401, '다시 로그인해주세요.')
    const actor = verified.user.id
    await limit(`actor:${actor}`, 10, 900)
    if (action === 'rotate-invite') {
      const bandCode = randomCode()
      await rpc('auth_rotate_invite', { p_actor: actor, p_hash: await sha256(bandCode) })
      return respond({ bandCode })
    }
    if (action === 'reset-member-pin' || action === 'rotate-recovery') {
      const ownPin = pin(input.leaderPin)
      const { data: own } = await admin.from('profiles').select('nickname,band_role').eq('id', actor).single()
      if (!own || own.band_role !== 'leader') throw new HttpError(403, failure)
      const accounts = await rpc<{ internal_email: string }[]>('auth_lookup', { p_nickname: own.nickname })
      if (!accounts[0]) throw new HttpError(403, failure)
      const checkClient = makeAdmin()
      const { data: check, error } = await checkClient.auth.signInWithPassword({ email: accounts[0].internal_email, password: `Ba1!${await hmac(pepper, `pin:${accounts[0].internal_email}:${ownPin}`)}` })
      if (error || !check.session) throw new HttpError(403, failure)
      await checkClient.auth.signOut({ scope: 'local' })
      if (action === 'rotate-recovery') {
        const recoveryKey = randomCode()
        await rpc('auth_rotate_recovery', { p_actor: actor, p_hash: await sha256(recoveryKey) })
        return respond({ recoveryKey })
      }
      const target = text(input.memberId, 36); const newPin = pin(input.pin)
      const email = await rpc<string>('auth_reset_target', { p_actor: actor, p_target: target })
      const result = await admin.auth.admin.updateUserById(target, { password: `Ba1!${await hmac(pepper, `pin:${email}:${newPin}`)}` })
      if (result.error) throw new HttpError(400, failure)
      return respond({ updated: true })
    }
    throw new HttpError(400, '지원하지 않는 요청입니다.')
  } catch (error) {
    if (error instanceof HttpError) return respond({ error: error.message }, error.status)
    console.error('Unhandled authentication error')
    return respond({ error: '인증 서비스에 연결하지 못했습니다. 잠시 후 다시 시도해주세요.' }, 503)
  }
})
