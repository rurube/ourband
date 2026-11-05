# 우리의 합주 · My Band

밴드 희망곡 및 합주 관리 웹앱. **Phase 1~4: 밴드별 인증과 실제 희망곡 등록·수정·검색을 구현**했습니다. 투표·댓글·합주 UI는 다음 단계에서 연결합니다. 기존 저장소는 비어 있어 Google Apps Script 코드나 이전할 데이터는 제공되지 않았습니다.

## 실행

Node.js 22 이상과 npm을 사용합니다. 설치된 Node 22.3에서도 빌드할 수 있도록 Vite 6을 사용합니다.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

출력된 로컬 주소를 열어 확인합니다. 실제 로그인에는 Supabase 공개 환경변수와 배포된 band-auth 함수가 필요합니다. 환경변수가 없으면 로그인 화면에서 설정 안내를 표시합니다.

```sh
npm run build
npm run preview
```

`npm run build`는 TypeScript 검사와 프로덕션 빌드를 수행하며 결과는 `dist/`에 생성됩니다.

## 현재 구현 범위

- React 19 + TypeScript(strict) + Vite + Tailwind CSS 4
- React Router(HashRouter), TanStack Query 공통 Provider
- 파스텔 보라색 공통 헤더, 데스크톱 메뉴, 모바일 하단 내비게이션
- 로그인 / 회원가입 화면 전환, PIN 표시 전환 및 숫자 6~12자리 브라우저 입력 검증
- 희망곡: 실제 등록·수정·중복 방지·검색·정렬·보컬 필터·20곡 페이지 조회·최근 5곡·확정곡 조회. 인기곡 카드는 준비 중
- 합주 화면: 예정 / 지난 합주 탭, 일정 및 세션 배정 안내 영역
- Supabase 클라이언트 초기화 모듈 (환경변수가 둘 다 있을 때만 생성)
- GitHub Pages 저장소 하위 경로와 새로고침 지원 및 Actions 배포 설정

**밴드 리더는 초대 코드 없이 밴드를 만들고, 구성원은 리더가 발급한 밴드 코드로 가입합니다.** 닉네임·PIN 로그인, 세션 유지·갱신·로그아웃, 밴드별 접근 제한, 리더 계정 복구 및 구성원 PIN 초기화를 구현했습니다. 희망곡은 실제 데이터와 연결되어 있으며 합주 화면은 기본 구조입니다. 비로그인 사용자는 로그인 화면으로 이동합니다.

인증 구조·비밀값·운영·검증 방법은 [Phase 3 인증 가이드](docs/authentication.md)를 확인하세요.

## 주요 파일

| 파일 | 역할 |
| --- | --- |
| `src/main.tsx`, `src/App.tsx` | 앱 시작 및 라우팅 |
| `src/providers/AppProviders.tsx` | QueryClient 및 HashRouter |
| `src/components/Layout.tsx` | 헤더, 내비게이션, Phase 안내, 푸터 |
| `src/components/EmptyState.tsx` | 공통 빈 상태 및 미리보기 표시 |
| `src/pages/LoginPage.tsx` | 로그인·리더 가입·코드 가입·리더 복구 |
| `src/pages/BandPage.tsx` | 멤버 목록·초대·PIN 초기화 |
| `src/auth/` | Auth 상태·보호 라우트·Edge API 클라이언트 |
| `supabase/functions/band-auth/` | 서버 인증·가입·리더 관리 |
| `src/pages/SongsPage.tsx`, `src/songs/` | 희망곡 목록·등록·수정·검증·검색·페이지 조회 |
| `src/pages/RehearsalsPage.tsx` | 합주 기본 구조 |
| `src/lib/supabase.ts` | 공개 환경변수를 이용한 클라이언트 초기화 |
| `src/styles.css` | Tailwind 및 반응형 스타일 |
| `vite.config.ts`, `tsconfig.json` | 빌드 및 타입 검사 설정 |
| `.env.example` | 공개 환경변수 예시 |
| `.github/workflows/deploy.yml` | GitHub Pages 배포 |

## 환경변수

| 변수 | 설명 |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase 프로젝트 URL. 실제 인증에는 필수 |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | 브라우저 공개용 publishable key. 실제 인증에는 필수 |
| `VITE_BASE_PATH` | 로컬 `/`, 수동 프로젝트 사이트 빌드 `/저장소이름/` |

모든 `VITE_` 변수는 빌드 결과에 공개됩니다. **service_role, 관리자 키, 실제 초대 코드, 내부 로그인 이메일을 절대 넣지 마세요.** `.env.local`은 Git에서 제외됩니다. 서버 비밀값은 이후 Supabase Edge Functions의 secrets로 설정합니다.

## GitHub Pages 배포

1. GitHub 저장소는 [rurube/ourband](https://github.com/rurube/ourband)입니다.
   배포 주소: https://rurube.github.io/ourband/#/login
2. GitHub 저장소 Settings → Pages → Source를 **GitHub Actions**로 설정합니다.
3. 필요할 때 Settings → Secrets and variables → Actions → Variables에 위 두 Supabase 공개 변수를 등록합니다. Phase 3 실제 인증에는 두 공개 변수가 모두 필요합니다.
4. `main` 브랜치에 push하거나 Actions의 `Deploy to GitHub Pages`를 수동 실행합니다. 다른 기본 브랜치를 사용하면 workflow의 `branches`를 수정합니다.
5. 배포 job에 표시되는 URL을 확인합니다.

Actions는 `configure-pages`가 반환한 `base_path`를 Vite에 전달하므로 프로젝트 사이트와 사용자 사이트를 모두 지원합니다. URL은 `https://계정.github.io/저장소/#/login` 형태이며 `#/songs`, `#/rehearsals`로 이동합니다. HashRouter는 서버 rewrite 없이 새로고침이 가능합니다. 사용자 지정 도메인은 GitHub Pages에서 별도로 설정하세요.

로컬에서 하위 경로 빌드를 확인하려면:

```sh
VITE_BASE_PATH=/ourband/ npm run build
npm run preview
# http://localhost:4173/ourband/#/songs
```

구성 근거: [Vite GitHub Pages 배포](https://vite.dev/guide/static-deploy), [Tailwind Vite 설치](https://tailwindcss.com/docs/installation/using-vite).

## Phase 2 — 데이터베이스

테이블 8개, FK·UNIQUE·CHECK·인덱스·updated_at 트리거, RLS와 회원 전용 RPC 5개를 추가했습니다. 원본 투표·댓글 작성자·내부 인증 매핑은 비공개 스키마에 분리합니다. Phase 3에서 밴드별 RLS와 인증을 추가했으며 아래 가이드는 Phase 2 당시의 기본 구조를 설명합니다.

```sh
npm run test:db
```

Docker 없이 PostgreSQL 엔진에서 92개 권한·무결성·RLS 검증을 실행합니다. Supabase CLI 3과 로컬 pgTAP 테스트도 준비했습니다. 전체 구조·API 계약·테스트 한계·원격 적용 방법은 [데이터베이스 가이드](docs/database.md)를 참고하세요.

대상 프로젝트 `mspbmvjowvwtcwlporqa`에 마이그레이션 두 개를 적용했습니다. 원격 DB에서도 92개 검증을 임시 데이터로 실행 후 롤백했으며, DB lint 오류·경고가 없습니다. 재적용과 검증 방법은 위 가이드에 기록했습니다.

## Phase 3 — 밴드 초대 및 인증

- 밴드 생성자는 리더, 코드로 가입한 사용자는 해당 밴드 구성원
- 서비스 전체에서 닉네임 UNIQUE, 현재 계정당 밴드 하나
- Edge Function: 닉네임/PIN 인증, 서버 요청 제한, 초대·복구 키 해시 저장
- 정상 Supabase Auth 세션과 다른 기기 로그인·갱신·로그아웃
- 프로필·곡·일정·투표·댓글의 밴드별 RLS 격리
- 리더의 코드 재발급·구성원 PIN 초기화·본인 복구 키 재발급 화면

```sh
npm run test:db
npm run check:edge
npm run test:edge
npm run build
```

원격 인증 함수 배포 및 실제 인증 통합 검증 31개를 완료했습니다. 로컬/원격 DB 검증 131개, 보안 유틸리티 5개와 빌드도 통과했습니다. 전체 파일과 API 계약은 [인증 가이드](docs/authentication.md)에 정리했습니다.

## Phase 4 — 희망곡 관리

곡 등록·수정·검색·필터·정렬·페이지 조회를 실제 Supabase에 연결했습니다. 기존 ID·등록 시각·투표·댓글 관계를 보존하고 다른 멤버의 변경을 덮어쓰는 수정 충돌을 방지합니다. 최근 5곡과 확정곡도 조회할 수 있습니다.

```sh
npm run test:songs
npm run test:db
npm run build
```

DB 검증 160개, 곡 검증 6개, 실제 Auth/REST 통합 검증 22개 통과. 변경 파일·API·캐싱·실행 방법·검증 한계는 [희망곡 가이드](docs/songs.md)를 참고하세요.

## 다음 단계 — Phase 5

좋아요/별로예요 선택·취소·변경, 익명 댓글, 인기곡 대시보드, 합주 확정/해제 UI를 실제 데이터와 연결합니다.

## Phase 1 검증 기록

- `npm install` 완료, 설치 시 npm audit 취약점 0건
- `npm run build` 성공 (strict TypeScript 검사 + Vite 프로덕션 빌드)
- `VITE_BASE_PATH=/ourband/ npm run build` 성공, 생성 HTML의 JS·CSS·favicon 경로와 실제 파일 존재 확인
- 이 실행 환경에는 연결 가능한 브라우저가 없어 데스크톱·모바일 시각 QA와 클릭 동작 검증은 미수행. 실제 배포 후에도 화면 및 이동을 확인해야 합니다.
- Phase 1 초기 검증 이후 GitHub Pages 배포 완료. Phase 2에서 원격 Supabase 마이그레이션 및 DB 권한 검증 완료. Phase 3에서 프런트 인증을 추가했으며 곡·합주 데이터 UI 연결은 후속 단계
