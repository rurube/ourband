import { createClient } from 'npm:@supabase/supabase-js@2.118.0'
import { HttpError, text, nickname, loginId, uuid, pin, sha256, hmac, randomCode, readBody } from '../_shared/security.ts'

const url = Deno.env.get('SUPABASE_URL')!
const adminKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const pepper = Deno.env.get('AUTH_PIN_PEPPER') ?? ''
const origins = (Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').map(s => s.trim()).filter(Boolean)
const makeAdmin = () => createClient(url, adminKey, { auth: { persistSession: false, autoRefreshToken: false } })
const failure = '처리할 수 없습니다. 아이디·밴드 닉네임·입력 정보를 확인해주세요.'
const loginFailure = '아이디 또는 PIN을 확인해주세요.'
type Account = { user_id: string; internal_email: string; recovery_hash: string | null }

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
      if (error) throw new HttpError(400, error.code === '23505' ? '이미 사용 중인 아이디·밴드 닉네임이거나 이미 가입한 밴드입니다.' : failure)
      return data as T
    }
    const limit = async (bucket: string, max: number, seconds: number) => {
      if (!await rpc<boolean>('auth_take_attempt', { p_bucket: await hmac(pepper, `rate:${bucket}`), p_limit: max, p_seconds: seconds }))
        throw new HttpError(429, '시도가 많습니다. 잠시 후 다시 시도해주세요.')
    }
    const derive = async (email: string, value: string) => `Ba1!${await hmac(pepper, `pin:${email}:${value}`)}`
    await limit('global', 300, 60)
    const input = await readBody(req)
    const action = text(input.action, 30)
    const ip = req.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim() ?? 'unknown'
    await limit(`ip:${ip}`, 60, 900)
    if (['login','signup-create-band','signup-join-band','recover'].includes(action)) {
      const signup = action.startsWith('signup-')
      const id = loginId(input.loginId, signup)
      await limit(`account:${action}:${id.toLowerCase()}`, action === 'login' ? 12 : 5, 900)
      if (action !== 'login') { await limit('registration-and-recovery', 60, 3600); await limit(`signup-ip:${ip}`, 10, 3600) }
      const password = pin(input.pin)
      if (action === 'login' || action === 'recover') {
        const account = (await rpc<Account[]>('auth_account_lookup', { p_login_id: id }))[0]
        if (action === 'login') {
          const email = account?.internal_email ?? 'unavailable@accounts.ourband.invalid'
          const client = makeAdmin()
          const { data, error } = await client.auth.signInWithPassword({ email, password: await derive(email, password) })
          if (error || !data.session || !account) throw new HttpError(401, loginFailure)
          return respond({ session: { access_token: data.session.access_token, refresh_token: data.session.refresh_token } })
        }
        const oldHash = await sha256(text(input.recoveryKey, 100))
        if (!account || account.recovery_hash !== oldHash) throw new HttpError(400, failure)
        const recoveryKey = randomCode(); const nextHash = await sha256(recoveryKey)
        if (!await rpc<boolean>('auth_swap_recovery', { p_user: account.user_id, p_expected: oldHash, p_next: nextHash })) throw new HttpError(400, failure)
        const { error } = await admin.auth.admin.updateUserById(account.user_id, { password: await derive(account.internal_email, password) })
        if (error) {
          await rpc('auth_swap_recovery', { p_user: account.user_id, p_expected: nextHash, p_next: oldHash })
          throw new HttpError(400, failure)
        }
        return respond({ recoveryKey })
      }
      const name = nickname(input.nickname)
      const isLeader = action === 'signup-create-band'
      const bandName = isLeader ? text(input.bandName, 60) : null
      if (isLeader && !bandName) throw new HttpError(400, '밴드 이름을 입력해주세요.')
      const inviteHash = isLeader ? null : await sha256(text(input.bandCode, 100).toLowerCase())
      if (!isLeader && !await rpc<string|null>('auth_invite_band', { p_hash: inviteHash })) throw new HttpError(400, failure)
      const recoveryKey = randomCode(); const bandCode = isLeader ? randomCode() : null
      const email = `${crypto.randomUUID()}@accounts.ourband.invalid`
      const { data, error } = await admin.auth.admin.createUser({ email, password: await derive(email, password), email_confirm: true })
      if (error || !data.user) throw new HttpError(400, failure)
      try {
        await rpc('auth_signup', {
          p_user: data.user.id, p_email: email, p_login_id: id, p_nickname: name, p_band_name: bandName,
          p_invite_hash: inviteHash, p_recovery_hash: await sha256(recoveryKey), p_code_hash: bandCode ? await sha256(bandCode) : null,
        })
      } catch (error) {
        const removed = await admin.auth.admin.deleteUser(data.user.id)
        if (removed.error) console.error('Auth provisioning cleanup failed', data.user.id)
        throw error
      }
      return respond({ created: true, bandCode, recoveryKey })
    }
    const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
    if (!token) throw new HttpError(401, '로그인이 필요합니다.')
    const { data: verified, error: invalid } = await admin.auth.getUser(token)
    if (invalid || !verified.user) throw new HttpError(401, '다시 로그인해주세요.')
    const actor = verified.user.id
    await limit(`actor:${actor}`, 10, 900)
    if (action === 'create-band' || action === 'join-band') {
      const name = nickname(input.nickname)
      const creating = action === 'create-band'
      const bandName = creating ? text(input.bandName, 60) : null
      if (creating && !bandName) throw new HttpError(400, '밴드 이름을 입력해주세요.')
      const bandCode = creating ? randomCode() : null
      const bandId = await rpc<string>('auth_add_membership', {
        p_user: actor, p_nickname: name, p_band_name: bandName,
        p_invite_hash: creating ? null : await sha256(text(input.bandCode, 100).toLowerCase()),
        p_code_hash: bandCode ? await sha256(bandCode) : null,
      })
      return respond({ bandId, bandCode })
    }
    if (action === 'rotate-invite') {
      const bandCode = randomCode()
      await rpc('auth_invite_rotate', { p_actor: actor, p_band_id: uuid(input.bandId), p_hash: await sha256(bandCode) })
      return respond({ bandCode })
    }
    if (['reset-member-pin','rotate-recovery','change-login-id'].includes(action)) {
      const ownPin = pin(input.currentPin)
      const account = (await rpc<{internal_email: string}[]>('auth_account_by_user', { p_user: actor }))[0]
      if (!account) throw new HttpError(403, failure)
      const checkClient = makeAdmin()
      const { data: check, error } = await checkClient.auth.signInWithPassword({ email: account.internal_email, password: await derive(account.internal_email, ownPin) })
      if (error || !check.session) throw new HttpError(403, failure)
      await checkClient.auth.signOut({ scope: 'local' })
      if (action === 'change-login-id') {
        await rpc('auth_update_login_id', { p_user: actor, p_login_id: loginId(input.loginId, true) })
        return respond({ updated: true })
      }
      if (action === 'rotate-recovery') {
        const recoveryKey = randomCode()
        await rpc('auth_set_recovery', { p_actor: actor, p_hash: await sha256(recoveryKey) })
        return respond({ recoveryKey })
      }
      const target = uuid(input.memberId); const newPin = pin(input.pin)
      const claimed = (await rpc<{internal_email: string; request_id: string}[]>('auth_claim_member_reset', { p_actor: actor, p_band_id: uuid(input.bandId), p_target: target }))[0]
      if (!claimed) throw new HttpError(403, '구성원의 초기화 동의가 필요합니다.')
      const result = await admin.auth.admin.updateUserById(target, { password: await derive(claimed.internal_email, newPin) })
      if (result.error) {
        await rpc('auth_release_member_reset', { p_target: target, p_request: claimed.request_id })
        throw new HttpError(400, failure)
      }
      return respond({ updated: true })
    }
    throw new HttpError(400, '지원하지 않는 요청입니다.')
  } catch (error) {
    if (error instanceof HttpError) return respond({ error: error.message }, error.status)
    console.error('Unhandled authentication error')
    return respond({ error: '인증 서비스에 연결하지 못했습니다. 잠시 후 다시 시도해주세요.' }, 503)
  }
})
