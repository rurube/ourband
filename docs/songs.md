# Phase 4 — 희망곡 등록·수정·조회

로그인한 밴드의 희망곡을 실제 Supabase 데이터로 조회·등록·수정합니다. 리더와 구성원의 곡 편집 권한은 같습니다. 다른 밴드의 데이터는 목록·검색·직접 ID 조회·수정 모두 RLS와 RPC 내부 밴드 검사로 차단합니다.

## 사용할 수 있는 기능

- 곡 등록: 제목·가수·보컬 구분 필수, BPM·YouTube 링크·특이사항 선택
- 기존 곡 수정: ID·등록 시각·등록자·확정 여부·기존 댓글/투표/합주 관계 보존
- 밴드 내부 제목+가수 중복 방지: DB의 공백 제거·소문자 UNIQUE 제약 사용
- 제목·가수 검색: 한국어·대소문자 무시 검색, 300ms 디바운스
- 보컬 필터: 여보컬·남보컬·혼성·연주곡
- 좋아요 많은 순·최신 등록 순·순추천순, 동률 시 최근 등록곡과 ID로 안정적으로 정렬
- 20곡씩 페이지 조회, 검색/필터 결과의 전체 곡 수 표시
- 최근 추가곡 5개, 등록 시간(Asia/Seoul), 확정 여부. 누르면 최신 곡 정보를 편집 창에서 확인
- 기본 접힘 합주 확정곡 목록은 실제 데이터 조회. 확정 여부 변경 UI는 다음 단계
- 로딩 스켈레톤, 오류/재시도, 빈 목록과 검색 결과 없음 구분, 저장 중 중복 제출 방지

투표 버튼·댓글 작성·인기곡 대시보드·합주 확정/해제는 **Phase 5** 범위입니다. 기존 좋아요/별로예요 집계는 읽기와 정렬에만 사용하고 투표자 ID는 반환하지 않습니다. 인기곡 카드는 ‘준비 중’으로 구분했습니다. 합주 관리 화면은 Phase 6까지 기본 구조입니다.

## 입력 처리

제목과 가수는 각각 공백 제거 후 1~200자, 특이사항은 최대 3000자입니다. BPM은 비워둘 수 있고 입력 시 1~400의 정수여야 합니다. 보컬 구분은 반드시 선택해야 합니다. 프런트는 Unicode 코드 포인트 기준 길이를 검사하고 DB CHECK도 검증합니다.

YouTube URL은 HTTPS의 youtube.com / www.youtube.com / m.youtube.com / youtu.be 영상 링크만 허용합니다. watch·공유·Shorts·embed 형식을 영상 ID 기반 watch URL로 정규화하고, 지원되는 시작 시간은 보존합니다. 채널·재생목록 링크, 임의 도메인, 사용자명/비밀번호가 붙은 URL, 다른 포트, 스크립트 URL은 거부합니다. 추적 파라미터는 저장하지 않습니다. 외부 링크는 새 탭으로 열며 `noopener noreferrer`를 사용합니다. 특이사항은 HTML이 아닌 텍스트로 렌더링합니다.

## 조회 API와 데이터 보호

새 마이그레이션: `supabase/migrations/20261105010000_song_catalog.sql`.

`list_song_catalog(p_search, p_vocal, p_sort, p_confirmed, p_limit, p_offset)`는 다음 구조를 반환합니다:

```json
{
  "songs": [],
  "total": 0,
  "confirmed_total": 0
}
```

songs의 필드: `id, title, artist, bpm, vocal_type, youtube_url, notes, is_confirmed, created_at, updated_at, likes, dislikes`.

- 기본 인자: 빈 검색어, 전체 보컬, likes 정렬, 미확정곡, 20개, offset 0
- p_sort는 `likes`, `recent`, `net`만 허용. 응답은 최대 100개, 검색어는 최대 200자, offset은 0~100000
- 클라이언트가 band_id나 user_id를 선택하는 인자는 없음. 로그인한 회원을 확인하고 DB에서 밴드 범위를 고정
- 비공개 투표 집계 때문에 SECURITY DEFINER를 사용하되 빈 search_path, 스키마 한정 이름, 명시적 authenticated 실행 권한, 회원 검사를 적용
- `%`, `_`, `!`를 SQL 와일드카드가 아닌 검색 문자로 처리. PostgREST의 `.or()` 문법에 검색어를 삽입하지 않음
- total은 현재 검색/보컬/확정 상태의 일치 곡 수. confirmed_total은 검색과 무관한 해당 밴드의 전체 확정곡 수
- 밴드·확정 상태·등록 시간용 인덱스를 추가하며 기존 pg_trgm 검색 인덱스와 투표 FK 인덱스 사용

## 수정 충돌과 캐싱

수정은 INSERT/DELETE로 재생성하지 않고 동일 ID의 메타데이터만 UPDATE합니다. 클라이언트는 ID·등록자·등록 시각·band_id·확정 상태를 쓰기 payload에 넣지 않습니다.

저장 시 편집을 시작한 시점의 `updated_at`도 조건에 넣습니다. 다른 멤버가 먼저 저장했으면 0행 UPDATE가 되어 덮어쓰지 않습니다. 입력값과 오류를 유지하고, 사용자가 **‘최신 내용으로 다시 열기 (입력값 교체)’**를 선택한 경우에만 서버 내용으로 편집 초안을 교체합니다. 일반 오류나 목록 재조회는 초안을 초기화하지 않습니다.

저장 성공 후 해당 밴드의 songs query만 무효화합니다. 활성 목록·최근곡·펼친 확정곡만 다시 조회하고 다른 화면이나 비활성 페이지를 즉시 재조회하지 않습니다. 기존 60초 Query 캐시와 창 활성화 시 재조회 설정을 사용하며 주기적 전체 폴링은 추가하지 않습니다. Realtime 알림은 Phase 7에서 연결합니다.

각 네트워크 요청은 20초로 제한하고 검색/페이지 전환 시 취소 신호를 전달합니다. 저장 요청은 자동 재시도하지 않습니다. 응답이 끊겨도 서버에서 저장됐을 수 있으므로 오류 시 목록을 다시 조회하고 초안을 유지합니다. 같은 곡이 이미 보이면 취소 후 확인할 수 있으며 중복 저장은 DB UNIQUE가 차단합니다.

## 주요 파일

| 파일 | 내용 |
| --- | --- |
| src/pages/SongsPage.tsx | 실제 목록·검색·필터·페이지·최근/확정곡·등록 창 |
| src/songs/model.ts | 타입·입력 검증·YouTube 정규화·한국 시간 표시 |
| src/songs/api.ts | Supabase 조회/저장·query key·오류 변환·시간 제한 |
| src/songs/SongEditor.tsx | native dialog, 입력 유지, 중복 제출 차단, 수정 충돌 처리 |
| src/songs/SongCard.tsx | 메타데이터·링크·읽기 전용 집계·수정 버튼·스켈레톤 |
| src/songs/model_test.ts | 입력·URL·편집 payload 테스트 |
| supabase/tests/song-catalog.sql | 검색·정렬·페이지·밴드/익명 접근 정책 검증 |
| scripts/test-songs-remote.mjs | 분리된 QA 밴드에서 실제 Auth/REST/곡 관계 통합 검증 |

## 실행 및 적용

```sh
npm ci
npm run dev
npm run test:songs
npm run test:db
npm run build
```

기존 `.env.local`의 공개 프로젝트 URL·publishable key를 그대로 사용합니다. 새 서버 비밀값은 필요하지 않습니다. 원격 적용:

```sh
npx supabase db push --remote --dry-run
npx supabase db push --remote
npx supabase db lint --remote --schema public,private --level warning --fail-on warning
```

## 검증 기록

- 내장 PostgreSQL: 기존 131개 + 카탈로그 29개 = 160개 통과
- Deno의 곡 입력/YouTube 검증: 6개 테스트 통과
- 실제 Supabase Auth/REST 통합: 22개 통과. 두 QA 밴드와 일반 구성원 계정을 임시 생성해 등록·중복·검색·정렬·페이지·수정 충돌·관계 보존·밴드 격리를 확인하고 이번 실행에서 만든 데이터만 정리
- 원격 DB lint 오류·경고 없음, TypeScript와 프로덕션 빌드 성공
- 네이티브 Chrome에서 로컬 데스크톱 목록 조회·새로고침·등록 창의 필수 입력/접근성 구조 확인. 실제 사용자 밴드에 테스트 곡을 저장하지 않음
- 모바일 실제 기기의 시각·터치 QA는 미수행. 760px 이하 반응형 CSS와 모달 스크롤을 적용

참고: [Supabase DB 함수 보안](https://supabase.com/docs/guides/database/functions), [요청 취소 신호](https://supabase.com/docs/reference/javascript/using-modifiers-abortsignal), [TanStack Query 무효화](https://tanstack.com/query/latest/docs/framework/react/guides/query-invalidation).
