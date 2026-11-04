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
  const migrations = (await readdir('supabase/migrations')).filter(p => p.endsWith('.sql')).sort()
  for (const name of migrations) {
    await db.exec(await readFile(`supabase/migrations/${name}`, 'utf8'))
    console.log(`PASS migration: ${name}`)
  }
  await db.exec('begin')
  const results = await db.exec(await readFile('supabase/tests/assertions.sql', 'utf8'))
  const assertions = results.flatMap(result => result.rows).filter(row => row.assertion)
  for (const row of assertions) console.log(`PASS: ${row.assertion}`)
  if (assertions.length < 50) throw new Error('Database assertion suite did not run completely')
  await db.exec('rollback')
  console.log(`\n${assertions.length} PostgreSQL integrity / permission / RLS assertions passed.`)
  console.log('Limit: Auth/REST/Realtime services and hosted Supabase are not exercised by PGlite.')
} catch (error) {
  // Avoid dumping SQL bodies, query data or connection secrets in CI logs.
  console.error(`Database verification failed [${error.code ?? 'unknown'}]: ${error.message}`)
  process.exitCode = 1
} finally {
  await db.close()
}
