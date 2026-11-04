# Phase 2 — 데이터베이스와 권한

현재 구현은 단일 밴드용입니다. 프런트엔드는 Phase 1 미리보기 상태이고 실제 로그인 및 화면 조회는 연결하지 않습니다.

대상 프로젝트: `mspbmvjowvwtcwlporqa`  
Project URL: `https://mspbmvjowvwtcwlporqa.supabase.co`

## 적용 파일

다음 두 SQL 마이그레이션을 순서대로 적용합니다. 테스트 회원이나 예시 곡은 마이그레이션에 포함되지 않습니다.

1. `supabase/migrations/20261104090000_band_schema.sql`: 테이블·인덱스·트리거·권한·RLS
2. `supabase/migrations/20261104090100_member_rpc.sql`: 익명 댓글과 투표·집계의 제한된 API

`private` 스키마는 Data API의 Exposed schemas에 추가하지 마세요. `public`만 애플리케이션 API로 사용하고, `graphql_public`은 Supabase의 기본 설정을 유지합니다. 원본 투표·댓글·인증 매핑을 Realtime publication에 추가하지 않습니다. Phase 7에서 개인 ID를 포함하지 않는 회원 전용 변경 알림을 연결할 예정입니다.

## 원격 프로젝트에 적용

이 저장소에 Supabase CLI 3이 개발 의존성으로 고정되어 있습니다. **CLI 3은 DB 명령이 기본적으로 로컬을 대상으로 하므로 원격 적용에 `--remote`를 명시합니다.**

```sh
npm ci
npx supabase login
npx supabase link --project-ref mspbmvjowvwtcwlporqa
npx supabase db push --remote --dry-run
npx supabase db push --remote
```

로그인은 본인 터미널에서 진행합니다. 액세스 토큰과 DB 비밀번호는 채팅이나 코드·GitHub Variables에 붙여넣지 않습니다. CLI가 비밀번호를 요청하면 로컬 터미널의 비공개 프롬프트에서 입력합니다. 배포 대상과 dry-run에 표시된 마이그레이션 두 개를 확인한 뒤 적용하세요. GitHub Pages workflow는 DB를 자동 변경하지 않습니다.

이 SQL은 기존 테이블·기록을 삭제하지 않습니다. 이미 같은 이름의 테이블이 있는 프로젝트는 중복 오류가 나므로 먼저 기존 스키마를 검토해야 합니다. 적용한 마이그레이션은 재실행하거나 수정하지 않고 후속 마이그레이션으로 변경합니다.

CLI를 사용하기 어려우면 Supabase SQL Editor에서 위 두 파일을 순서대로 실행할 수 있습니다. 이 경우 CLI migration history가 기록되지 않습니다. 이후 CLI로 전환할 때는 **실제 적용 여부를 확인한 후** `supabase migration repair --help`에 따라 두 버전의 history를 맞춰야 하므로 CLI 적용을 권장합니다.

적용 후 확인:

```sh
npx supabase migration list --remote
```

SQL Editor에서 테이블 8개의 `rowsecurity`가 모두 `true`인지 확인할 수도 있습니다.

```sql
select schemaname, tablename, rowsecurity
from pg_tables
where (schemaname = 'public' and tablename in
  ('profiles','songs','rehearsals','rehearsal_songs','rehearsal_sessions'))
  or (schemaname = 'private' and tablename in ('account_mapping','votes','comments'))
order by schemaname, tablename;
```

SQL Editor는 관리자 권한이므로 여기서 곡이 보인다는 사실만으로 회원 RLS가 검증되지는 않습니다. 아래의 역할별 테스트를 사용합니다.

## 테이블 및 보존 규칙

| 위치 | 테이블 | 접근 및 주요 제약 |
| --- | --- | --- |
| public | profiles | Auth UUID를 PK/FK로 사용. 회원 목록 조회만 가능. 닉네임은 앞뒤 공백 제거 + 소문자 기준 UNIQUE |
| private | account_mapping | Auth UUID·내부 이메일·정규화 닉네임의 비공개 매핑. 복합 FK로 다른 회원 닉네임 연결 금지 |
| public | songs | 회원 조회·등록·수정. 제목+가수 정규화 UNIQUE. ID·작성자·등록 시각은 클라이언트 수정 금지 |
| private | votes | `(song_id,user_id)` PK, -1/1 CHECK, 본인 행만 허용하는 RLS 및 클라이언트 직접 접근 차단 |
| private | comments | 공백 제외 1~300자, 원본 작성자 ID 비공개. RPC는 작성자 정보 제외 |
| public | rehearsals | 날짜 UNIQUE. 회원 조회·등록·수정·삭제 |
| public | rehearsal_songs | 일정+곡 UNIQUE. FK·정렬 순서·메모 |
| public | rehearsal_sessions | 세션별 여러 회원/게스트. 실제 회원 배정 시 DB가 닉네임 스냅샷 생성 |

- 곡 ID는 `text`이며 새 곡은 UUID 문자열을 생성합니다. Phase 8에서 기존 시트 ID를 그대로 가져올 수 있습니다.
- 곡을 수정해도 ID·댓글·투표·합주 관계를 유지합니다. 곡 삭제 권한은 일반 회원에게 부여하지 않습니다. 기록에 연결된 곡은 관리자도 FK RESTRICT로 삭제가 제한됩니다.
- 일정 삭제는 해당 일정의 곡과 세션 배정을 함께 삭제합니다. 희망곡·투표·댓글은 유지합니다.
- Auth 계정을 삭제하면 프로필·매핑·개인 투표는 삭제되고, 댓글과 곡은 작성자 참조를 NULL로 바꿔 보존합니다. 세션은 회원 ID만 NULL로 바꾸고 닉네임 스냅샷을 유지합니다.
- 닉네임 변경·회원 생성·계정 복구는 일반 회원의 직접 테이블 쓰기로 허용하지 않습니다. Phase 3의 서버 경로로 구현합니다.
- BPM은 선택 값이며 입력 시 1~400, 곡 제목·가수는 각각 1~200자, 메모는 최대 3000자입니다.
- 보컬 enum 값: `female`, `male`, `mixed`, `instrumental`. 세션 값: `vocal`, `guitar1`, `guitar2`, `bass`, `drums`, `keyboard`, `other`.
- YouTube URL은 HTTPS의 `youtube.com/watch?v=`, `/shorts/`, `/embed/`, `youtu.be/` 형식을 검사합니다. 호스트 위장 및 임의 URL은 거부합니다. 외부 영상의 존재 여부는 검증하지 않습니다.
- 수정 가능한 테이블의 `updated_at`은 DB 트리거가 갱신합니다. 생성 이후 변경 기능이 없는 profiles/comments/account_mapping은 `created_at`만 가집니다.
- 날짜·FK·정렬 인덱스 및 제목/가수의 pg_trgm 인덱스를 제공합니다. 데이터 집계는 각 FK 인덱스를 이용해 DB에서 계산합니다.

## RLS와 API 계약

밴드 회원은 `auth.uid()`와 동일한 ID의 프로필이 있는 사용자입니다. 단순히 Supabase Auth에 가입했다고 권한을 얻지 못하며, 클라이언트는 프로필을 직접 만들 수 없습니다. Phase 3의 초대 코드 검증 경로만 회원을 생성해야 합니다.

비로그인 역할 `anon`은 모든 앱 테이블·RPC 접근을 거부합니다. `authenticated`도 프로필이 없으면 SELECT 결과가 없고 쓰기와 RPC는 거부됩니다. 공개 데이터라는 표현은 **로그인한 밴드 회원에게 공개**를 의미합니다.

| 회원용 RPC | 인자 | 반환 |
| --- | --- | --- |
| toggle_vote | p_song_id: text, p_vote_type: smallint (-1 또는 1) | 현재 투표값. 같은 버튼을 다시 선택하면 NULL(취소) |
| get_my_votes | p_song_ids: text[] (최대 100개) | song_id, vote_type — 자신의 값만 |
| get_song_stats | p_song_ids: text[] (최대 100개) | song_id, likes, dislikes, comment_count, rehearsal_count |
| get_comments | p_song_id, p_limit (기본 50, 최대 100), p_offset (기본 0, 최대 100000) | id, song_id, content, created_at |
| add_comment | p_song_id, p_content | id, song_id, content, created_at |

RPC는 사용자 ID를 인자로 받지 않습니다. 모든 SECURITY DEFINER 함수는 빈 `search_path`, 스키마 한정 이름, 명시적인 실행 권한 및 회원 검사를 사용합니다. 내부 트리거/검사 함수는 직접 실행할 수 없습니다. 단, RLS의 회원 확인 helper는 authenticated가 boolean 결과를 확인할 수 있으며 다른 회원 정보는 반환하지 않습니다.

`toggle_vote`는 사용자+곡 단위 transaction advisory lock으로 중복 요청을 직렬화하고 PK로 중복 투표를 차단합니다. 실제 다중 연결의 경쟁 부하 테스트는 별도 Supabase 환경에서 필요합니다. 집계 결과는 다른 회원의 개인 투표나 작성자 ID를 반환하지 않습니다.

`rehearsal_count`는 `Asia/Seoul`의 오늘보다 이전인 일정의 서로 다른 날짜 수입니다. 별도 누적 테이블은 없고 곡 ID가 같으면 제목 변경 후에도 횟수가 유지됩니다. 여/남보컬 인기곡, 정렬·검색의 프런트 연결 및 추가 목록 쿼리는 Phase 4~5에서 구현합니다.

`private.account_mapping`은 Data API에 노출하지 않습니다. Phase 3에서는 **service_role 전용 서버 RPC** 등을 추가하여 Edge Function에서 안전하게 조회·생성하고, 서비스 권한과 서버 비밀값을 검증해야 합니다. 아직 초대 코드·PIN·로그인용 내부 이메일을 생성하거나 저장하는 로직은 없습니다.

## 테스트

Docker 없이 실행:

```sh
npm run test:db
npm run build
```

PGlite의 실제 PostgreSQL 엔진에 마이그레이션을 적용하고 92개 권한·제약·RLS 검증을 수행합니다. Supabase의 `auth.users`와 `auth.uid()` 역할만 테스트 환경에서 구성합니다. 익명, 회원 2명, 프로필 없는 인증 사용자로 접근을 검증하며 fixture는 트랜잭션 종료 시 롤백됩니다. 브라우저나 Supabase Auth/REST/Realtime 서비스 전체를 검증하는 테스트는 아닙니다.

Docker Desktop이 실행 중일 때 Supabase 로컬 스택에서도 같은 SQL 검증을 실행할 수 있습니다:

```sh
npx supabase start
npx supabase db push
npx supabase test db supabase/tests/database/rls.test.sql
```

`supabase/tests/database/rls.test.sql`은 pgTAP wrapper로 같은 assertions를 포함합니다. **테스트는 로컬의 빈 개발 DB에서 실행**합니다. 운영 데이터가 있는 원격 프로젝트에 `test db --remote`를 실행하지 마세요. `npm run test:db`와 프런트 빌드는 GitHub의 `Database checks` workflow로도 실행됩니다.

2026-11-04 검증 결과:

- 내장 PostgreSQL에서 92개 검증 및 프런트 빌드 성공
- 지정 프로젝트에 마이그레이션 2개 적용 및 원격 history 일치 확인
- 데이터가 없는 새 원격 DB에서만 동일 92개 검증을 트랜잭션으로 실행하고 전체 롤백
- 원격 `db lint --remote --schema public,private --level warning --fail-on warning` 오류·경고 없음
- 후속 조회로 앱 테이블 8개 RLS 활성화, 테스트 데이터/회원 0건, 비공개 Realtime 테이블 0개 확인
- Docker가 중지되어 로컬 Supabase 전체 스택과 pgTAP wrapper 실행은 미수행. Supabase Auth/REST/Realtime 서비스의 종단간 검증은 이후 단계에서 진행

새 원격 DB의 일회성 검증은 사전에 빈 DB인지 검사했고, 테스트 fixture를 `BEGIN`/`ROLLBACK`으로 감쌌습니다. 기존 운영 프로젝트에 이 fixture 테스트를 반복 실행하지 않습니다. 이후 배포 시에는 아래 읽기 전용 검증을 사용하세요:

```sh
npx supabase db query --remote --read-only --file supabase/verify.sql
```

## Supabase 생성 후 설정

- 프로젝트가 준비 상태인지 확인합니다. Project Reference는 위에 기록했습니다.
- Dashboard의 Data API 설정에서 `private`가 Exposed schemas에 포함되지 않았는지 확인합니다.
- Phase 3 전에 Authentication 설정에서 일반 사용자 직접 가입과 익명 가입을 비활성화합니다. 로컬 `supabase/config.toml`에는 직접 가입 비활성화를 반영했지만 **이 파일이 원격 Auth 설정을 자동 변경하지는 않습니다.**
- Phase 3에서 공개 Project URL과 publishable key만 `.env.local` 및 GitHub Actions Variables에 설정합니다. 관리자 키·초대 코드·복구 비밀값은 Supabase Edge Function secrets에서 관리합니다.
- 프런트 로그인과 데이터 연결은 아직 미구현이므로 스키마를 적용해도 Pages 화면은 Phase 1 미리보기입니다.

설계 근거: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [DB 함수의 권한과 SECURITY DEFINER](https://supabase.com/docs/guides/database/functions), [Supabase DB 테스트](https://supabase.com/docs/guides/database/testing), [PGlite 확장](https://pglite.dev/extensions/).
