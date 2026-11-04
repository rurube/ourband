# 우리의 합주 · My Band

밴드 희망곡 및 합주 관리 웹앱. **현재 Phase 1(프로젝트 초기화 및 화면 구조)만 구현**했습니다. 기존 저장소는 비어 있어 Google Apps Script 코드나 이전할 데이터는 제공되지 않았습니다.

## 실행

Node.js 22 이상과 npm을 사용합니다. 설치된 Node 22.3에서도 빌드할 수 있도록 Vite 6을 사용합니다.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

출력된 로컬 주소를 열어 확인합니다. 환경변수 없이도 모든 Phase 1 화면을 확인할 수 있습니다.

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
- 희망곡 화면: 인기곡 카드, 검색·정렬·보컬 필터 UI, 최근 추가곡 영역, 기본 접힘 확정곡 토글
- 합주 화면: 예정 / 지난 합주 탭, 일정 및 세션 배정 안내 영역
- Supabase 클라이언트 초기화 모듈 (환경변수가 둘 다 있을 때만 생성)
- GitHub Pages 저장소 하위 경로와 새로고침 지원 및 Actions 배포 설정

**실제 인증, 로그인 상태, 자동 로그인, 로그아웃, 데이터 조회·저장, 검색·정렬 결과, 투표, 댓글, 일정 편집은 아직 구현하지 않았습니다.** 폼 제출은 안내만 표시하며 PIN이나 초대 코드를 전송·저장하지 않습니다. 로그인 성공을 흉내 내거나 임의의 회원 정보를 만들지 않습니다. 미리보기 경로는 인증 없이 열리지만 실제 데이터가 없고 Supabase API도 호출하지 않습니다. Phase 3에서 데이터 페이지의 인증 보호를 연결해야 합니다.

## 주요 파일

| 파일 | 역할 |
| --- | --- |
| `src/main.tsx`, `src/App.tsx` | 앱 시작 및 라우팅 |
| `src/providers/AppProviders.tsx` | QueryClient 및 HashRouter |
| `src/components/Layout.tsx` | 헤더, 내비게이션, Phase 안내, 푸터 |
| `src/components/EmptyState.tsx` | 공통 빈 상태 및 미리보기 표시 |
| `src/pages/LoginPage.tsx` | 로그인·회원가입 UI |
| `src/pages/SongsPage.tsx` | 희망곡 기본 구조 |
| `src/pages/RehearsalsPage.tsx` | 합주 기본 구조 |
| `src/lib/supabase.ts` | 공개 환경변수를 이용한 클라이언트 초기화 |
| `src/styles.css` | Tailwind 및 반응형 스타일 |
| `vite.config.ts`, `tsconfig.json` | 빌드 및 타입 검사 설정 |
| `.env.example` | 공개 환경변수 예시 |
| `.github/workflows/deploy.yml` | GitHub Pages 배포 |

## 환경변수

| 변수 | 설명 |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase 프로젝트 URL, Phase 1에서는 비워도 됨 |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | 브라우저 공개용 publishable key, Phase 1에서는 비워도 됨 |
| `VITE_BASE_PATH` | 로컬 `/`, 수동 프로젝트 사이트 빌드 `/저장소이름/` |

모든 `VITE_` 변수는 빌드 결과에 공개됩니다. **service_role, 관리자 키, 실제 초대 코드, 내부 로그인 이메일을 절대 넣지 마세요.** `.env.local`은 Git에서 제외됩니다. 서버 비밀값은 이후 Supabase Edge Functions의 secrets로 설정합니다.

## GitHub Pages 배포

1. GitHub 저장소는 [rurube/ourband](https://github.com/rurube/ourband)입니다.
   배포 주소: https://rurube.github.io/ourband/#/login
2. GitHub 저장소 Settings → Pages → Source를 **GitHub Actions**로 설정합니다.
3. 필요할 때 Settings → Secrets and variables → Actions → Variables에 위 두 Supabase 공개 변수를 등록합니다. Phase 1에서는 생략 가능합니다.
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

## 다음 단계 — Phase 2

다음 단계는 사용자 확인 후 별도로 진행합니다.

- Supabase 프로젝트 생성 및 지역 선택, 로컬 Supabase CLI / Docker 준비
- SQL 마이그레이션: FK·UNIQUE·검색/날짜 인덱스·updated_at 처리
- 공개 프로필과 비공개 계정 매핑 분리
- 투표자 / 댓글 작성자 ID를 보호하는 조회 경로 및 집계 설계
- 비로그인 접근 차단과 본인 투표 정책을 포함한 RLS 및 정책 테스트

Phase 3에서 닉네임+PIN 인증, 초대 코드 서버 검증, 요청 제한, 계정 복구를 연결합니다. 실제 시트 CSV와 원본 프로젝트가 제공되면 Phase 8에서 곡 ID 보존과 기존 익명 투표 보존/초기화 방식을 정해 이전 도구와 가이드를 작성합니다. Phase 1에서는 SQL·Edge Function·이전 스크립트를 만들지 않습니다.

## Phase 1 검증 기록

- `npm install` 완료, 설치 시 npm audit 취약점 0건
- `npm run build` 성공 (strict TypeScript 검사 + Vite 프로덕션 빌드)
- `VITE_BASE_PATH=/ourband/ npm run build` 성공, 생성 HTML의 JS·CSS·favicon 경로와 실제 파일 존재 확인
- 이 실행 환경에는 연결 가능한 브라우저가 없어 데스크톱·모바일 시각 QA와 클릭 동작 검증은 미수행. 실제 배포 후에도 화면 및 이동을 확인해야 합니다.
- 원격 GitHub Pages 배포와 Supabase 연결 검증은 미수행
