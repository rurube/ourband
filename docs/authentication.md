# Phase 3 — 밴드 만들기, 초대, 닉네임·PIN 인증

이 문서는 최초 인증 도입 당시의 기록입니다. 현재 로그인 아이디·다중 밴드·밴드별 닉네임·동의 기반 PIN 초기화는 [현재 계정 가이드](accounts.md)를 따릅니다.

## 사용 흐름

- **밴드 만들기**: 초대 코드 없이 밴드 이름·닉네임·PIN(숫자 6~12자리)을 입력합니다. 새 밴드를 생성한 가입자가 해당 밴드의 리더입니다. 다른 밴드의 리더 권한을 얻는 기능은 아닙니다.
- **밴드 가입**: 리더에게 받은 밴드 코드와 본인의 닉네임·PIN으로 가입합니다. 역할은 서버에서 `member`로 고정합니다.
- **로그인**: 닉네임·PIN만 입력합니다. 닉네임은 서비스 전체에서 UNIQUE입니다. 현재 한 계정은 한 밴드에 소속됩니다. 여러 밴드를 사용하는 계정 전환은 이번 범위가 아닙니다.
- **밴드 설정**: 멤버 목록을 볼 수 있습니다. 리더는 초대 코드 재발급, 구성원 PIN 초기화, 본인 복구 키 재발급을 할 수 있습니다.

가입 완료 후 로그인합니다. 리더 가입 직후 **밴드 코드와 리더 복구 키를 한 번만 표시**하므로 로그인하기 전에 보관합니다. 밴드 코드는 구성원에게 공유하고 리더 복구 키는 공유하지 않습니다. 응답을 받지 못한 가입은 로그인을 먼저 확인하세요. 이미 가입됐다면 로그인 후 코드·복구 키를 재발급할 수 있습니다.

초대 코드는 160비트 무작위 값으로 30일간 유효합니다. 재발급 즉시 이전 코드는 사용할 수 없습니다. 서버에는 SHA-256 해시만 저장하므로 기존 원문 코드를 조회하는 API는 없습니다.

## 변경된 데이터 모델

Phase 2를 보존하는 후속 마이그레이션입니다. 적용한 이전 마이그레이션 파일은 변경하지 않았습니다.

- `20261104100000_band_auth.sql`: bands, 프로필의 band_id/band_role, 곡·일정의 band_id, 밴드별 제약·RLS, 비공개 초대/제한 테이블, 서버 RPC
- `20261104100100_band_scoped_rpc.sql`: 기존 댓글·투표·집계 RPC에 밴드 범위 검사 추가

곡의 제목+가수 중복과 일정 날짜 중복은 **밴드 내부**에서 검사합니다. 합주곡과 세션의 관계도 다른 밴드의 곡·멤버와 연결할 수 없습니다. band_id, 회원 역할, 프로필은 클라이언트가 변경할 수 없습니다.

기존 단일 밴드 데이터가 있는 DB에서는 하나의 ‘기존 밴드’에 보존하며 리더를 임의 지정하지 않습니다. 해당 경우 운영자가 기존 구성원 확인 후 리더와 복구 경로를 별도로 지정해야 합니다. 이 프로젝트의 Phase 3 적용 전 DB에는 실제 회원·곡이 없었습니다.

## 인증과 비밀값

Supabase Auth UUID가 실제 회원 ID입니다. 서비스 키로 Auth 계정을 만들고, DB 트랜잭션 안에서 밴드·프로필·비공개 매핑을 생성합니다. 프로비저닝에 실패하면 방금 생성한 Auth 계정을 삭제합니다. DB가 아닌 Auth 서비스와의 완전한 분산 트랜잭션은 아니므로 서비스 장애 중에는 고아 Auth 계정이 생길 가능성이 있습니다. 이 경우 로그에는 비밀값 없이 cleanup 실패 ID만 남깁니다. 프로필이 없는 계정은 어떤 밴드 데이터에도 접근할 수 없습니다.

사용자는 내부 이메일을 입력하지 않습니다. 서버가 UUID 기반 내부 이메일을 만들고 `private.account_mapping`에서 관리합니다. **Supabase SDK의 자기 세션/JWT에는 본인의 내부 이메일이 포함될 수 있습니다.** 다른 사람의 내부 이메일·인증 매핑은 조회할 수 없으며 UI에도 표시하지 않습니다.

PIN 원문은 DB·로그·브라우저 저장소에 저장하지 않습니다. Edge Function이 계정별 내부 이메일과 PIN을 서버 전용 HMAC-SHA256 pepper로 변환한 68자 비밀번호를 Supabase Auth에 전달하고, Auth가 비밀번호를 해시해 관리합니다. 따라서 내부 이메일을 아는 사용자도 짧은 PIN을 직접 Auth endpoint에 보내 서버의 요청 제한을 우회할 수 없습니다. PIN은 6자리부터 허용되는 소규모 커뮤니티용 인증으로 강한 사용자 비밀번호와 같은 수준으로 가정하지 않습니다.

Edge Functions에서 다음 설정을 사용합니다:

| 이름 | 보관 위치 / 의미 |
| --- | --- |
| SUPABASE_URL | Supabase가 Edge 런타임에 제공 |
| SUPABASE_SERVICE_ROLE_KEY | Supabase가 Edge 런타임에 제공. 프런트에 전달 금지 |
| AUTH_PIN_PEPPER | 서버 전용 무작위 비밀값. 가입 후 유지 필수 |
| ALLOWED_ORIGINS | 허용 브라우저 origin 목록. 경로를 포함하지 않음 |

`AUTH_PIN_PEPPER`는 코드나 GitHub Pages 빌드에 넣지 않습니다. **기존 계정 생성 후 바꾸거나 잃으면 기존 PIN 로그인이 중단**되며 각 계정의 복구/초기화가 필요합니다. 재배포 시 기존 값을 유지하세요. CLI의 secrets 목록은 원문을 반환하지 않습니다. 비밀값 보관 정책은 Supabase 프로젝트 운영 정책에 포함해야 합니다.

프런트에는 공개 URL과 publishable key만 설정합니다. `.env.local`과 GitHub Actions Variables의 이름은 기존과 같습니다. Supabase 서비스 키, PIN pepper, 초대 코드, 복구 키를 `VITE_` 변수에 넣지 않습니다.

## Edge API

`POST /functions/v1/band-auth`, JSON body `action`:

| action | 입력 | 인증/반환 |
| --- | --- | --- |
| create-band | nickname, pin, bandName | 공개 가입, 새 밴드의 리더 생성. bandCode/recoveryKey 일회성 반환 |
| join-band | nickname, pin, bandCode | 공개 가입, 코드 유효성 확인 후 member 생성 |
| login | nickname, pin | 정상 Auth access_token/refresh_token 반환 |
| recover | nickname, pin(새 PIN), recoveryKey | 리더 복구 키 검증·소비 후 새 키 반환 |
| rotate-invite | 없음 | 검증한 사용자 JWT + DB 리더 권한. 새 코드 반환 |
| reset-member-pin | memberId, pin(새 PIN), leaderPin | JWT + 리더 권한 + 현재 PIN 재확인, 같은 밴드 member만 가능 |
| rotate-recovery | leaderPin | JWT + 리더 권한 + 현재 PIN 재확인, 새 복구 키 반환 |

공개 로그인과 가입을 위해 gateway `verify_jwt=false`를 사용합니다. 이는 관리자 작업의 인증을 생략한다는 뜻이 아닙니다. 관리자 action은 `auth.getUser(token)`으로 매번 사용자 JWT를 검증하고 service-only RPC가 DB의 리더·밴드 관계를 재확인합니다. 브라우저 역할은 `auth_*` RPC를 직접 실행할 수 없습니다. `user_metadata`의 역할·band_id 값을 권한으로 신뢰하지 않습니다.

복구 키는 비교 후 CAS로 한 번만 소비하고 새 키로 바꿉니다. Auth 비밀번호 변경 실패 시 이전 해시를 복원하도록 시도합니다. 네트워크 장애로 최종 결과를 받지 못하면 새 PIN으로 로그인한 뒤 복구 키를 다시 발급하세요. PIN 변경 후 기존에 발급된 access JWT의 수명은 Supabase의 세션 정책에 따릅니다. 모든 기기의 access token을 즉시 무효화한다고 보장하지 않습니다.

## 서버 요청 제한

DB의 원자적 카운터를 사용하고 런타임 메모리 카운터에 의존하지 않습니다.

- 전역: 분당 300회
- IP 보조 제한: 15분당 60회
- 로그인 닉네임별: 15분당 12회
- 가입·복구 닉네임/action별: 15분당 5회
- 가입·복구 전체: 시간당 60회, IP별 시간당 10회
- 인증된 관리자 작업: 사용자별 15분당 10회 (틀린 PIN 재확인 포함)

IP 헤더를 단독 보안 근거로 삼지 않고, IP와 무관한 전역·계정별 제한을 함께 적용합니다. 닉네임·IP는 HMAC bucket으로만 저장하고 만료 카운터는 후속 요청에서 정리합니다. 제한된 요청은 429를 반환합니다. 이는 소규모 서비스의 추측 시도를 제한하며, 호출 전 단계의 DDoS/쿼터 방어를 대신하지는 않습니다.

가입 오류는 닉네임/코드 등 입력 확인을 요청하는 공통 메시지를 사용합니다. 로그인은 없는 계정에도 Auth 검증 요청을 수행하고 동일한 오류를 반환합니다. 닉네임 중복은 DB UNIQUE가 보장하며 공개 회원 검색·계정 존재 확인 API는 제공하지 않습니다.

## 실행·검증

```sh
npm ci
npm run test:db
npm run check:edge
npm run test:edge
npm run build
```

- DB: 기존 기능 92개 + 밴드·인증 권한 39개 = 131개 PostgreSQL 검증
- Edge: Deno 타입 검사, PIN/닉네임/무작위 토큰/해시/요청 크기 유틸리티 테스트 5개
- `scripts/test-auth-remote.mjs`: 명시적으로 실행하는 실제 Auth·Edge·REST·세션 통합 검증. 자격 증명은 프로세스 환경으로만 받으며 테스트 실행에서 만든 UUID와 밴드만 정리합니다. 자동 CI나 Pages 앱에서는 실행하지 않습니다.
- 프런트 로딩·저장 중 중복 요청 방지·오류 안내·재시도·인증 보호를 제공합니다. 곡·일정 편집은 Phase 4 이후 범위입니다.

마이그레이션/함수 배포:

```sh
npx supabase db push --remote --dry-run
npx supabase db push --remote
npx supabase functions deploy band-auth --use-api
npx supabase db lint --remote --schema public,private --level warning --fail-on warning
```

원격 Auth 설정은 직접 사용자 가입과 익명 가입을 차단하고 이메일 provider는 내부 로그인에 사용할 수 있게 유지해야 합니다. 리더 등록은 Edge의 관리자 계정 생성 경로로 처리하므로 일반 가입 차단과 양립합니다. 배포 origin은 `https://rurube.github.io`이며 `/ourband/` 경로는 CORS origin에 포함하지 않습니다.

## 이후 작업

Phase 4에서는 로그인한 밴드의 희망곡 목록·등록·수정·검색을 연결합니다. Phase 5~6에서 투표·댓글·합주 UI를 연결합니다. 기존 익명 곡/시트 데이터 이전은 Phase 8에서 밴드 소속과 이전 정책을 확인한 뒤 수행합니다.

참고: [Supabase Edge 인증](https://supabase.com/docs/guides/functions/auth-legacy-jwt), [인증 헤더](https://supabase.com/docs/guides/functions/auth-headers), [Auth 비밀번호 보안](https://supabase.com/docs/guides/auth/password-security).

## 이번 작업의 검증·배포 상태

- 로컬과 실제 원격 PostgreSQL에서 131개 검증 통과, 원격 fixture는 전부 롤백
- 원격 DB lint 오류·경고 없음, 11개 테이블 RLS 활성화
- Deno 타입 검사 및 보안 유틸리티 테스트 5개 통과, React/TypeScript 프로덕션 빌드 성공
- Supabase 공개 URL·publishable key를 로컬과 GitHub Actions Variables에 설정
- 직접 Auth 가입 차단·최소 비밀번호 길이 8·Pages 사이트 URL 설정 적용
- 2026-11-05 사용자 승인 후 서버 PIN pepper·허용 origin 설정 및 band-auth 함수 배포 완료. 비밀값은 원문 파일·명령 인자·로그에 남기지 않고 공식 Management API로 설정
- 실제 Auth·Edge·REST 통합 검증 31개 통과: 리더/멤버 가입, 밴드 격리, 두 번째 기기 로그인, 토큰 갱신, 초대 회전, PIN 초기화, 리더 복구, 복구 키 재사용 차단, 로그아웃, HTTP 429
- 원격 검증 도중 일시적인 503 응답이 한 번 관측되어 통합 검증을 다시 실행했고 전체 통과. 클라이언트는 연결 오류·시간 초과를 안내하며, 변동 요청의 응답을 받지 못했을 때 로그인으로 상태 확인 후 재시도
- 통합 검증에서 생성한 임시 회원·밴드는 모두 정리. 기존 데이터는 변경하지 않음
- 연결 가능한 브라우저가 없어 시각·클릭 QA는 미수행
