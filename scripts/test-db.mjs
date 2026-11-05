import { readFile, readdir } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm'

// Real embedded PostgreSQL, not a SQL parser/mock. Only Supabase's host Auth
// schema/roles are bootstrapped here; the same assertions run against Supabase.
const db = new PGlite({ extensions: { pg_trgm } })
try {
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
        nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid;
    $$;
    grant usage on schema auth to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;
  `)
  let total = 0
  async function suite(name, minimum) {
    await db.exec('begin')
    const results = await db.exec(await readFile(`supabase/test-support/${name}`, 'utf8'))
    const assertions = results.flatMap(result => result.rows).filter(row => row.assertion)
    for (const row of assertions) console.log(`PASS: ${row.assertion}`)
    if (assertions.length < minimum) throw new Error(`Incomplete suite ${name}`)
    await db.exec('rollback')
    total += assertions.length
  }
  const migrations = (await readdir('supabase/migrations')).filter(p => p.endsWith('.sql')).sort()
  for (const name of migrations) {
    if (name === '20261105020000_account_memberships.sql') {
      // Keep historical contracts verified against the historical schema, then
      // exercise a real populated-database upgrade before current-model tests.
      for (const [file, minimum] of [['assertions.sql',90],['band-auth.sql',35],['song-catalog.sql',25]]) await suite(file, minimum)
      await db.exec(await readFile('supabase/test-support/account-migration-before.sql','utf8'))
    }
    await db.exec(await readFile(`supabase/migrations/${name}`, 'utf8'))
    console.log(`PASS migration: ${name}`)
  }
  await suite('account-migration-after.sql', 7)
  await suite('memberships.sql', 40)
  await suite('standalone-signup.sql', 21)
  await suite('song-engagement.sql', 26)
  await suite('rehearsals.sql', 41)
  await suite('legacy-votes.sql', 15)
  await suite('member-sessions.sql', 22)
  console.log(`\n${total} PostgreSQL historical / migration preservation / current membership assertions passed.`)
  console.log('Limit: Auth/REST/Realtime services and hosted Supabase are not exercised by PGlite.')
} catch (error) {
  // Avoid dumping SQL bodies, query data or connection secrets in CI logs.
  console.error(`Database verification failed [${error.code ?? 'unknown'}]: ${error.message}`)
  process.exitCode = 1
} finally {
  await db.close()
}
