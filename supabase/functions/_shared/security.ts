export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message) }
}
export function text(value: unknown, max = 200): string {
  if (typeof value !== 'string' || value.length > max) throw new HttpError(400, '입력 내용을 확인해주세요.')
  return value.trim()
}
export function nickname(value: unknown): string {
  const result = text(value, 30)
  if (!result || /[\p{Cc}\p{Cf}]/u.test(result)) throw new HttpError(400, '닉네임은 1~30자로 입력해주세요.')
  return result
}
export function loginId(value: unknown, newAccount = false): string {
  const result = text(value, 30)
  if (!result || /[\p{Cc}\p{Cf}]/u.test(result) || (newAccount && !/^[A-Za-z0-9][A-Za-z0-9_.-]{3,29}$/.test(result)))
    throw new HttpError(400, newAccount ? '아이디는 영문·숫자로 시작하는 4~30자의 영문·숫자·점·밑줄·하이픈으로 입력해주세요.' : '아이디를 확인해주세요.')
  return result
}
export function uuid(value: unknown): string {
  const result = text(value, 36)
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(result)) throw new HttpError(400, '밴드를 확인해주세요.')
  return result
}
export function pin(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9]{6,12}$/.test(value)) throw new HttpError(400, 'PIN은 숫자 6~12자리로 입력해주세요.')
  return value
}
export async function sha256(value: string): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), b => b.toString(16).padStart(2, '0')).join('')
}
export async function hmac(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value))), b => b.toString(16).padStart(2, '0')).join('')
}
export function randomCode(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(20)), b => b.toString(16).padStart(2, '0')).join('')
}
export async function readBody(req: Request): Promise<Record<string, unknown>> {
  if (!req.headers.get('content-type')?.includes('application/json')) throw new HttpError(415, 'JSON 요청만 사용할 수 있습니다.')
  const reader = req.body?.getReader()
  if (!reader) throw new HttpError(400, '입력 내용을 확인해주세요.')
  const chunks: Uint8Array[] = []; let length = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    length += value.length
    if (length > 8192) { await reader.cancel(); throw new HttpError(413, '요청이 너무 큽니다.') }
    chunks.push(value)
  }
  const bytes = new Uint8Array(length); let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
  let value: unknown
  try { value = JSON.parse(new TextDecoder().decode(bytes)) } catch { throw new HttpError(400, '입력 내용을 확인해주세요.') }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HttpError(400, '입력 내용을 확인해주세요.')
  return value as Record<string, unknown>
}
