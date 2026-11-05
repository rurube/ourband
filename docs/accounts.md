# 공통 아이디와 밴드별 소속

## 이용 방법

- 로그인은 **아이디 + 공통 PIN**으로 합니다. 닉네임을 바꿔도 로그인 아이디는 바뀌지 않습니다.
- 한 계정은 여러 밴드에 참여할 수 있습니다. 같은 사람이 A 밴드에서는 리더, B 밴드에서는 멤버일 수 있습니다.
- 닉네임과 역할은 각 밴드의 소속에 저장합니다. 닉네임은 해당 밴드 안에서만 중복을 검사하므로 다른 밴드와 같아도 됩니다.
- 회원가입은 아이디와 PIN만 입력하며 밴드나 닉네임이 없어도 계정이 만들어집니다. 로그인 후 밴드 화면에서 밴드를 만들거나 초대 코드와 밴드 닉네임으로 참여합니다. 새 아이디는 영문·숫자로 시작하는 4~30자의 영문·숫자·점·밑줄·하이픈이며 대소문자를 구별하지 않습니다.
- 로그인 후 **내 계정과 밴드**에서 다른 밴드를 만들거나 초대 코드로 참여합니다. 새 계정을 다시 만들지 않습니다.
- 상단 **현재 밴드**에서 전환합니다. 선택은 계정별로 현재 브라우저에 저장하며 다른 기기의 밴드를 서버에서 강제로 바꾸지 않습니다. 이미 열린 다른 탭의 선택도 바꾸지 않습니다.
- 내 계정과 밴드 화면에서 공통 로그인 아이디와 선택한 밴드의 닉네임을 각각 변경할 수 있습니다. 로그인 아이디 변경은 현재 PIN을 재확인합니다.

## 기존 계정 이전

`20261105020000_account_memberships.sql`은 기존 값을 다음과 같이 옮깁니다.

| 기존 값 | 새 위치 |
| --- | --- |
| profiles.id / Auth UUID | 동일한 profiles.id와 band_memberships.user_id |
| profiles.nickname | 초기 profiles.login_id 및 기존 밴드의 membership.nickname |
| profiles.band_id, band_role | band_memberships.band_id, band_role |
| private.account_mapping.nickname_normalized | login_id_normalized로 이름 변경, FK 연동 유지 |
| 내부 이메일, Auth 비밀번호, PIN pepper, 복구 해시 | 변경 없음 |
| 곡·투표·댓글·합주·세션의 회원 ID 및 관계 | 변경 없음 |

**기존 사용자는 이전 닉네임을 초기 아이디로 입력하고 기존 PIN을 그대로 사용합니다.** 이전 닉네임이 한글이거나 4자 미만이어도 기존 아이디로 로그인할 수 있습니다. 로그인 후 원하는 새 아이디로 변경할 수 있습니다. 마이그레이션은 곡이나 Auth 계정을 재생성하지 않습니다.

세션 배정의 member_id는 기존처럼 공통 계정 UUID를 유지하고, 해당 합주 밴드의 membership에서 닉네임을 가져옵니다. 과거에 저장한 nickname_snapshot은 보존합니다.

## 데이터와 권한

- `profiles`: 공통 계정 ID·로그인 아이디·생성 시각. 브라우저 SELECT는 본인 행만 허용합니다.
- `band_memberships`: `(band_id,user_id)` PK, 밴드별 닉네임·역할·가입/수정 시각. `(band_id,nickname_normalized)` UNIQUE.
- 밴드 목록은 본인이 가입한 밴드만 보이고, 멤버 목록에서는 선택한 밴드의 닉네임·역할을 조회합니다. 다른 사람의 로그인 아이디·인증 매핑은 표시하지 않습니다.
- 브라우저는 소속의 역할을 직접 쓰거나 가입 행을 만들 수 없습니다. Edge Function은 검증한 Auth 사용자 ID로 새 밴드를 만들면 leader, 유효한 초대 코드로 참여하면 member로 고정합니다.
- 초대 코드를 다시 사용해 이미 소속된 밴드에 중복 가입하거나 역할을 바꿀 수 없습니다.

곡/합주 요청은 **각 요청에 고정된 `x-band-id` 헤더**를 사용합니다. DB는 헤더를 권한으로 신뢰하지 않고 auth.uid()의 실제 소속을 재검사합니다. 위조한 밴드나 잘못된 UUID는 허용하지 않습니다. 여러 밴드에 소속된 계정이 헤더를 생략하면 밴드 데이터 접근을 차단합니다. 기존 단일 밴드 요청만 호환성을 위해 유일한 밴드를 선택할 수 있습니다.

계정 자신의 소속 목록과 로그인 아이디를 읽는 부트스트랩 쿼리는 밴드 헤더가 없어도 동작합니다. 각 밴드의 CRUD 요청은 생성 시 헤더를 캡처하므로, 화면을 전환한 뒤 지연된 저장이 다른 밴드에 쓰이지 않습니다. 밴드 전환 시 이전 밴드 읽기 요청을 취소하고 곡 화면·편집기를 새 밴드 기준으로 다시 마운트합니다. 캐시는 계속 band_id로 분리합니다.

향후 Realtime 구현에서는 HTTP 헤더가 자동으로 WebSocket에 전달된다고 가정하지 않고 밴드별 private Broadcast 주제와 실제 소속 정책을 별도로 적용해야 합니다.

## 공통 PIN의 복구와 리더 도움

PIN은 밴드별 비밀번호가 아니라 전체 계정의 인증 수단입니다. 그래서 한 밴드의 리더 권한만으로 다른 사람의 공통 PIN을 변경할 수 없습니다.

- 모든 신규 계정에 **계정 복구 키**를 한 번 발급합니다. 일반 멤버도 복구 화면에서 본인의 PIN을 재설정할 수 있습니다.
- 기존 리더의 복구 키는 유지합니다. 기존 일반 구성원은 로그인 후 내 계정에서 현재 PIN을 확인하고 복구 키를 발급할 수 있습니다.
- 복구 키 재발급도 역할과 무관한 본인 계정 작업이며 현재 PIN이 필요합니다. 기존 키는 즉시 무효화됩니다.
- 로그인은 유지됐지만 PIN을 잊은 구성원은 특정 밴드 리더에게 **15분 동안 한 번만 초기화하도록 동의**할 수 있습니다. 화면은 모든 밴드 로그인에 영향을 준다는 점을 명시합니다.
- 리더는 요청 목록을 새로고침하고 유효한 동의를 확인한 뒤 본인 PIN을 재확인하여 초기화합니다. 요청은 원자적으로 소비되므로 재사용할 수 없습니다.
- 구성원은 자신의 초기화 동의를 취소할 수 있습니다. 동의는 계정당 한 밴드에만 유지하며 새 요청은 이전 요청을 교체합니다.

`private.pin_reset_requests`는 브라우저 직접 접근을 차단합니다. 요청 생성·취소는 auth.uid() 본인으로 고정하고, 리더 조회와 서버 초기화는 해당 밴드의 실제 역할·대상 소속·만료·소비 여부를 확인합니다. Auth 비밀번호 변경 실패 시 동일 요청만 다시 활성화하도록 시도합니다. 네트워크 경계의 불확실성과 이미 발급된 JWT 수명은 기존 Supabase 세션 정책을 따릅니다.

아이디·닉네임을 바꿔도 Auth 사용자 ID와 내부 이메일이 같으므로 PIN 파생 방식과 기존 비밀번호는 변경하지 않습니다. PIN pepper도 재발급하지 않습니다.

## 주요 구현

| 파일 | 내용 |
| --- | --- |
| supabase/migrations/20261105020000_account_memberships.sql | 소속 이전·전역 아이디·밴드별 RLS·동의 기반 복구 |
| supabase/functions/band-auth/index.ts | 아이디 로그인·계정 가입·기존 계정의 밴드 추가·계정 복구·아이디 변경 |
| src/auth/AuthProvider.tsx | 공통 계정·모든 소속·선택한 밴드의 상태 및 브라우저별 선택 |
| src/auth/RequireAuth.tsx | 계정 보호와 선택 밴드 보호 분리 |
| src/pages/LoginPage.tsx | 아이디·PIN만 받는 가입 및 로그인 |
| src/pages/BandPage.tsx | 밴드 목록·추가·닉네임·아이디·복구·초기화 동의 |
| src/components/Layout.tsx | 전역 밴드 선택기 |
| src/songs/api.ts | 모든 곡 요청의 명시적 밴드 헤더 |
| scripts/test-db.mjs | 이전 스키마 → 데이터가 있는 업그레이드 → 현재 스키마 검증 |
| scripts/test-auth-remote.mjs | 실제 아이디·다중 밴드·역할·복구 통합 검증 |

새 서버 비밀값이나 프런트 환경변수는 필요하지 않습니다. 기존 프로젝트 URL·publishable key·Edge secrets를 유지합니다. 계정 변경 후 화면이 예전 양식이면 페이지를 새로고침합니다.

## 검증

```sh
npm run test:db
npm run test:edge
npm run test:songs
npm run check:edge
npm run build
```

- DB 검증 **230개**: 이전 스키마 회귀 160개, 실제 데이터가 있는 마이그레이션 보존 7개, 현재 계정/다중 소속/권한 50개, 밴드 없는 가입 7개, 밴드명 수정 권한·입력 6개
- 보안 유틸리티 7개, 희망곡 입력 검증 6개, Edge 타입 검사와 프런트 빌드 통과
- 실제 Auth/REST 다중 밴드 검증 **43개**, 희망곡 회귀 **22개** 통과
- 전환 전에 실제로 만든 QA 계정이 같은 초기 아이디·PIN·Auth UUID·닉네임으로 전환 후 로그인되는 것을 확인
- 원격 적용 직전/직후 기존 회원·밴드·곡·댓글·투표·합주 건수 및 원래 소속 닉네임/역할 체크섬이 일치
- 검증에서 생성한 QA 계정·소속·밴드·곡만 정리. 기존 사용자 데이터는 정리 대상에 포함하지 않음

`supabase/test-support/`의 보조 SQL은 pgTAP 자동 검색 경로 밖에 둡니다. 과거 스키마 테스트는 내장 PostgreSQL에서 업그레이드 전에 실행하고, 현재 pgTAP 래퍼는 `supabase/tests/database/memberships.test.sql`입니다. Docker가 있을 때 로컬 개발 DB에서 실행합니다:

```sh
npx supabase test db supabase/tests/database/memberships.test.sql
```

실제 운영 DB에서 테스트 fixture SQL을 직접 실행하지 않습니다. 후속 배포의 읽기 전용 확인은 `supabase db query --remote --read-only --file supabase/verify.sql`을 사용합니다.

참고: [Supabase 요청별 헤더](https://supabase.com/docs/reference/javascript/using-modifiers-setheader), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [DB 함수 보안](https://supabase.com/docs/guides/database/functions).

밴드 리더는 밴드 화면의 **밴드 이름 수정**에서 현재 밴드명을 1~60자로 변경할 수 있습니다. 서버의 `rename_band` 함수가 실제 리더 소속을 확인하며, 멤버·비회원의 수정은 차단합니다. 이름을 바꿔도 초대 코드와 밴드 ID·곡·합주는 유지됩니다.
