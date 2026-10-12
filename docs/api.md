# API 목록

지금까지 구현된 백엔드(NestJS) API 전체 목록이다. 모듈: Auth, Photos, Discovery, Engagement.

- 모든 응답은 JSON (파일 업로드만 요청이 `multipart/form-data`).
- "로그인 필요"는 `JwtAuthGuard`가 걸려 있다는 뜻 — 쿠키 없거나 유효하지 않으면 401.
- 쿼리 파라미터의 숫자/위경도 값은 전부 **문자열**로 받는다(`minLat=37.5` 같은 쿼리스트링 그대로) — 서버가 내부에서 `Number()`로 변환한다.

## 인증 방식
- **쿠키 기반**(토큰을 헤더에 직접 넣는 방식 아님). `POST /auth/login` 성공 시 `Set-Cookie: session=<JWT>` (httpOnly, 7일)로 발급되고, 이후 요청은 브라우저가 자동으로 쿠키를 들고 간다.
- 프론트에서 호출할 때 `fetch`/`axios` 모두 `credentials: 'include'` (또는 동급 옵션)을 켜야 쿠키가 같이 전송된다 — 꺼져 있으면 로그인했는데도 401이 난다.
- 커스텀 예외 필터가 없어서 모든 에러가 NestJS 기본 포맷을 그대로 따른다:
  ```json
  { "statusCode": 404, "message": "사진을 찾을 수 없습니다.", "error": "Not Found" }
  ```
  - `message`는 보통 문자열이지만, **class-validator 검증 실패(400)일 때는 문자열 배열**이다 — 한 요청에서 여러 필드가 동시에 틀리면 여러 개가 들어있을 수 있음:
    ```json
    { "statusCode": 400, "message": ["email must be an email", "password must be longer than or equal to 8 characters"], "error": "Bad Request" }
    ```
    프론트는 `message`가 string인지 string[]인지 둘 다 처리해야 한다.
  - 이 문서 전체에서 쓰는 상태코드: `400`(검증 실패) · `401`(비로그인/세션 만료) · `403`(본인 소유 아님) · `404`(리소스 없음) · `409`(중복) · `413`(파일 용량 초과) · `415`(지원 안 하는 파일 형식).

### CORS/쿠키 — 웹과 API가 다른 origin일 때 (2026-10-12 메모)

**현재 상태**: `src/main.ts`에 CORS 설정이 전혀 없다(`app.enableCors()` 없음). 쿠키는 `domain` 속성 없이 발급된다(`SESSION_COOKIE_OPTIONS`, `auth.controller.ts`).

**로컬 개발(웹 `localhost:3001` / API `localhost:3000`)에서 문제가 되는 것**:
- CORS: 지금 상태로는 포트가 다른 두 origin 간 요청을 브라우저가 막는다. 프론트가 실제로 호출하려면 백엔드에 `app.enableCors({ origin: <웹 URL>, credentials: true })`가 **반드시** 필요하다 — `origin`에 와일드카드(`*`)는 쓸 수 없다(브라우저가 `credentials: true`와 와일드카드 origin의 조합을 거부함).
- 쿠키: `domain`을 안 정해도 `localhost:3000`이 심은 쿠키는 `localhost:3001`에도 보인다 — 쿠키의 스코프는 **호스트명 기준**이고 포트는 구분하지 않기 때문. 로컬 개발에서는 이 부분이 문제 없다.

**배포 시 웹/API가 다른 호스트명(서브도메인 포함)이면 달라지는 것**:
- 쿠키가 전혀 안 보일 수 있다. `domain` 미지정 쿠키는 발급한 "정확한 호스트명"에만 묶인다 — 예를 들어 API가 `api.shuttermap.com`에서 쿠키를 심으면, `app.shuttermap.com`(Next.js)에 오는 요청에는 그 쿠키가 실리지 않는다. Next.js의 `proxy.ts`(아래 참고)가 하는 "쿠키 존재 확인"은 **API 서버로 가는 요청**에만 의미가 있고, Next.js 자신에게 온 요청의 쿠키 유무로는 판단할 수 없다는 뜻이다.
- 해결책: 웹/API를 같은 루트 도메인의 서브도메인으로 배포하고, 쿠키에 `domain: '.shuttermap.com'`을 명시해서 두 서브도메인에 공유되게 한다. 그래야 `sameSite: 'lax'`도 그대로 유지할 수 있다(서브도메인끼리는 "같은 site"로 취급됨).
- `sameSite: 'none'` + `secure: true`로 완전 크로스사이트를 허용하는 방법도 있지만, 그래도 `domain`을 공유하지 않으면 애초에 쿠키가 안 보이는 문제는 해결 안 된다 — 서브도메인 공유가 먼저다.

**이 메모는 기록용이다** — 실제 `app.enableCors()` 추가는 프론트 1단계 플랜(`docs/superpowers/plans/2026-10-12-frontend-scaffold-auth.md`) Task 0에서 다룬다.

---

## Auth (`/auth`)

### `POST /auth/register`
가입 즉시 로그인 상태가 된다(PRD 기능6 수용기준) — `login`을 따로 호출할 필요 없음.

- **로그인 필요**: 아니오
- **요청 body**:
  | 필드 | 타입 | 제약 |
  |---|---|---|
  | `email` | string | 이메일 형식 |
  | `password` | string | 8~72자 |
- **성공 응답**: `201`, `Set-Cookie: session=<JWT>` (httpOnly, 7일 — `login`과 동일)
  ```json
  { "id": "uuid", "email": "user@example.com" }
  ```
- **에러**: `400`(형식 오류) · `409`(이미 가입된 이메일, LOCAL provider 기준)

### `POST /auth/login`
- **로그인 필요**: 아니오
- **요청 body**: `{ "email": string, "password": string }`
- **성공 응답**: `200`, `{ "ok": true }` + `Set-Cookie: session=<JWT>` (httpOnly, 7일)
- **에러**: `401`(이메일 또는 비밀번호 불일치 — 어느 쪽이 틀렸는지는 구분해서 알려주지 않음)

### `GET /auth/me`
- **로그인 필요**: 예
- **요청**: 없음 (쿠키만)
- **성공 응답**: `200`
  ```json
  { "id": "uuid", "email": "user@example.com", "ownedCameraName": "ILCE-7M4", "ownedCameraRaw": "ILCE-7M4" }
  ```
  - `ownedCameraName`/`ownedCameraRaw`: 보유 장비. 첫 업로드 전에는 둘 다 `null`, 첫 업로드 시 EXIF 카메라로 자동 설정됨(아직 사용자 확인 전 — `PATCH /auth/me`로 확인/수정)
- **에러**: `401`(쿠키 없음/위조/만료)

### `PATCH /auth/me`
보유 장비 확인/변경 (PRD 부록A: "첫 업로드 시 EXIF로 미리 채워 확인받는다"). `ownedCameraRaw`(EXIF 원문 관측값)는 이 엔드포인트로 바뀌지 않음 — `ownedCameraName`만 갱신.

- **로그인 필요**: 예
- **요청 body**: `{ "ownedCameraName": string }` (1~200자, 빈 문자열 불가)
- **성공 응답**: `200`, 빈 body
- **에러**: `400`(빈 문자열/200자 초과) · `401`

### `POST /auth/logout`
- **로그인 필요**: 아니오 (로그인 안 된 상태로 호출해도 그냥 200)
- **요청**: 없음
- **성공 응답**: `200`, `{ "ok": true }` + 쿠키 삭제

### `GET /auth/kakao`
- **로그인 필요**: 아니오
- 카카오 로그인 페이지로 302 리다이렉트. 브라우저에서 링크 이동용 — fetch로 호출하는 용도가 아님.

### `GET /auth/kakao/callback`
- 카카오가 인증 후 호출하는 콜백. 계정 없으면 생성, 세션 쿠키 발급 후 `/`로 302 리다이렉트.

### `GET /auth/google` / `GET /auth/google/callback`
- 카카오와 동일한 패턴, 구글 OAuth.

---

## Photos (`/photos`)

### `POST /photos`
사진 업로드 + EXIF 자동 파싱 (PRD 기능 1).

- **로그인 필요**: 예
- **요청**: `multipart/form-data`
  | 필드 | 설명 | 제약 |
  |---|---|---|
  | `files` | 이미지 파일 (여러 개 첨부 가능) | 1~10장, 파일당 최대 25MB, `image/jpeg`\|`image/png`\|`image/heic`\|`image/heif`만 허용 |
- **성공 응답**: `201`
  ```json
  [
    {
      "id": "uuid",
      "cameraRaw": "ILCE-7M4",
      "lensRaw": "FE 24-70mm F2.8 GM",
      "hasLocation": true,
      "focalLength": 70,
      "aperture": 1.8,
      "shutterSpeed": "1/100",
      "iso": 400,
      "takenAt": "2026-03-10T00:00:00.000Z",
      "location": { "lat": 37.5, "lng": 127.0 }
    },
    { "id": "uuid", "cameraRaw": null, "lensRaw": null, "hasLocation": false, "focalLength": null, "aperture": null, "shutterSpeed": null, "iso": null, "takenAt": null, "location": null }
  ]
  ```
  - `cameraRaw`/`lensRaw`: EXIF에서 읽은 원문 (없으면 `null`, 예: 스크린샷)
  - `hasLocation`: EXIF에 GPS가 있어서 위치가 바로 저장됐는지 — `false`면 `PATCH /photos/:id/location`으로 수동 등록해야 지도에 노출됨
  - `focalLength`/`aperture`/`shutterSpeed`/`iso`/`takenAt`/`location`: 업로드 **미리보기**용 — 아직 공개범위를 선택하기 전이라 `location`은 공개범위 투영(fuzzy/hidden) 없이 원본 그대로 반환됨(본인만 보는 값). EXIF에 없으면 각각 `null` — 미리보기에서 빈 칸으로 보여주고 `PATCH /photos/:id/metadata`로 사용자가 채울 수 있음
  - 배치 중 하나라도 디코딩에 실패하면 **전체 요청이 거부**되고 아무것도 저장되지 않음(부분 성공 없음)
- **에러**:
  - `400`: 파일 0개 / 이미지 디코딩 실패(내용이 손상됨) / 파일 개수 초과(multer 자체 에러)
  - `401`: 로그인 안 됨
  - `413`: 파일이 25MB 초과
  - `415`: 지원하지 않는 형식 (예: gif)

### `GET /photos/me`
내 사진 목록(마이페이지용). `status`가 `ACTIVE`/`HIDDEN`인 본인 사진만 반환(`DELETED`는 제외) — `HIDDEN`은 운영자가 비공개 처리한 것도 본인은 볼 수 있게 포함. Discovery의 공개 조회(`status=ACTIVE` 하드코딩)와는 분리된 별도 경로.

- **로그인 필요**: 예
- **요청 query** (전부 선택):
  | 파라미터 | 기본값 | 설명 |
  |---|---|---|
  | `cursor` | 없음 | 이전 응답의 `nextCursor` 값을 그대로 전달 |
  | `limit` | `20` | 1 이상 정수, 최대 `50` |
- **성공 응답**: `200`
  ```json
  {
    "items": [
      {
        "id": "uuid",
        "cameraName": "ILCE-7M4",
        "lensName": "FE 24-70mm F2.8 GM",
        "thumbnailUrl": "https://.../thumbnail.jpg",
        "status": "ACTIVE",
        "visibility": "FUZZY",
        "likeCount": 2,
        "createdAt": "2026-03-10T00:00:00.000Z"
      }
    ],
    "nextCursor": "uuid-or-null"
  }
  ```
  - `status`가 `HIDDEN`이면 운영자가 비공개 처리했다는 뜻 — 프론트에서 "비공개 처리됨" 배지 등으로 안내
- **에러**: `400`(`limit` 형식 오류) · `401`

### `PATCH /photos/:id/location`
수동 위치 등록/수정 (PRD 기능 2). GPS 없는 사진은 이 호출이 필요하고, GPS 있는 사진도 다시 호출해 덮어쓸 수 있음.

- **로그인 필요**: 예 (본인 사진만 가능)
- **요청 body**: `{ "lat": number, "lng": number }` (위경도 범위 벗어나면 거부)
- **성공 응답**: `200`, 빈 body
  - 위치가 실제로 바뀌면 기존 fuzzy 오프셋은 리셋되고, 공개범위가 FUZZY면 새 오프셋이 자동으로 다시 생성됨
- **에러**: `400`(위경도 형식 오류) · `401` · `403`(본인 사진 아님) · `404`(사진 없음)

### `PATCH /photos/:id/metadata`
EXIF 파싱값 수정 + 사용자 메모(`note`) 작성 (PRD 기능1 수용기준: "렌즈 필드가 비어 있으면 직접 입력할 수 있다"). 보낸 필드만 부분 업데이트.

- **로그인 필요**: 예 (본인 사진만 가능)
- **요청 body** (전부 선택, 보낸 필드만 수정됨):
  | 필드 | 타입 | 제약 |
  |---|---|---|
  | `cameraName` | string | 1자 이상 |
  | `lensName` | string | 1자 이상 |
  | `focalLength` | number | |
  | `aperture` | number | |
  | `shutterSpeed` | string | 1자 이상 (예: `"1/100"`) |
  | `iso` | number | |
  | `takenAt` | string | ISO 8601 날짜 |
  | `note` | string | 1000자 이하. **빈 문자열은 허용**(메모 지우기 용도) |
- **성공 응답**: `200`, 빈 body
- **에러**: `400`(타입 오류, 또는 `cameraName`/`lensName`/`shutterSpeed`가 빈 문자열) · `401` · `403`(본인 사진 아님) · `404`

### `PATCH /photos/:id/visibility`
위치 공개범위 변경 (PRD 기능 3): `EXACT` / `FUZZY`(기본값) / `HIDDEN`.

- **로그인 필요**: 예 (본인 사진만 가능)
- **요청 body**: `{ "visibility": "EXACT" | "FUZZY" | "HIDDEN" }`
- **성공 응답**: `200`, 빈 body
  - `FUZZY`로 처음 전환되는 순간에만 오프셋이 생성되고, 이후로는 같은 오프셋을 재사용(재생성 안 함)
- **에러**: `400`(enum 값 아님) · `401` · `403`(본인 사진 아님) · `404`

### `GET /photos/:id`
사진 상세 (PRD 기능 5).

- **로그인 필요**: 아니오 (전면 공개 열람). 단, 로그인 상태면(쿠키가 있으면) 그 사용자 기준 `likedByMe`가 같이 내려감 — 쿠키가 없거나 유효하지 않아도 401이 아니라 그냥 `likedByMe: false`로 응답(`OptionalJwtAuthGuard`)
- **요청**: 없음 (path의 `:id`만)
- **성공 응답**: `200`
  ```json
  {
    "id": "uuid",
    "cameraName": "ILCE-7M4",
    "lensName": "FE 24-70mm F2.8 GM",
    "focalLength": 70,
    "aperture": 1.8,
    "shutterSpeed": "1/100",
    "iso": 400,
    "takenAt": "2026-03-10T00:00:00.000Z",
    "note": null,
    "location": { "lat": 37.5, "lng": 127.0 },
    "locationLabel": "exact",
    "servingUrl": "https://.../serving.jpg",
    "thumbnailUrl": "https://.../thumbnail.jpg",
    "userId": "uuid",
    "likeCount": 0,
    "likedByMe": false
  }
  ```
  - `location`: 공개범위에 따라 투영된 좌표. `HIDDEN`이거나 아직 위치가 없으면 `null`
  - `locationLabel`: `"exact"` | `"approximate"`(fuzzy) | `"hidden"` — 프론트에서 "대략적 위치"/"위치 비공개" 안내에 그대로 쓰면 됨
  - `likedByMe`: 비로그인이거나 로그인했지만 안 눌렀으면 `false`. 좋아요 버튼의 활성/비활성 초기 상태에 그대로 쓰면 됨
- **에러**: `404`(없거나, 운영자 조치로 `status`가 `ACTIVE`가 아님 — 위치 공개범위의 `HIDDEN`과는 다른 개념)

### `DELETE /photos/:id`
사진 삭제 (소프트 삭제 — `status`를 `DELETED`로 바꿀 뿐, DB row/R2 파일은 그대로 남는다). 삭제된 사진은 지도·갤러리·상세조회에서 `ACTIVE` 사진만 보여주는 기존 필터 덕분에 즉시 안 보이게 된다. 수정 기능은 없고, 삭제 후 재업로드로 대체하는 설계.

- **로그인 필요**: 예 (본인 사진만 가능)
- **요청**: 없음 (path의 `:id`만)
- **성공 응답**: `200`, 빈 body
- **에러**: `401` · `403`(본인 사진 아님) · `404`(사진 없음)

---

## Discovery (`/discovery`)

지도와 갤러리는 카메라/렌즈/초점거리/조리개 필터를 공유한다(아래 "공유 필터"). 지역(bbox) 필터는 **지도에만 있고 갤러리에는 없음** — 지도 미노출 사진의 위치가 갤러리 필터로 유추되는 걸 막기 위한 의도적 설계(PRD 기능8).

**공유 필터 쿼리 파라미터** (둘 다 선택):
| 파라미터 | 설명 |
|---|---|
| `cameraName` | 카메라 표시명 정확히 일치 |
| `lensName` | 렌즈 표시명 정확히 일치 |
| `minFocalLength`, `maxFocalLength` | 초점거리(mm) 범위, 양쪽 포함 |
| `minAperture`, `maxAperture` | 조리개(F값) 범위, 양쪽 포함 |

### `GET /discovery/equipment`
등록된 카메라/렌즈 표시명 distinct 목록 (PRD 기능8 특이사항: "필터 선택지는 DB의 표시명 DISTINCT 목록에서 가져온다"). 업로드 미리보기의 자동완성, 지도/갤러리 필터 드롭다운에 쓴다.

- **로그인 필요**: 아니오
- **요청**: 없음
- **성공 응답**: `200`
  ```json
  { "cameraNames": ["ILCE-7M4", "X100VI"], "lensNames": ["FE 24-70mm F2.8 GM"] }
  ```
  - 다른 discovery 엔드포인트와 동일하게 `status: 'ACTIVE'`인 사진의 이름만 집계 — 비공개/삭제된 사진에만 있는 장비명은 노출 안 됨
  - 둘 다 알파벳 정렬된 배열, 페이지네이션 없음(개인/소규모 사용 규모 기준)

### `GET /discovery/map`
지도 탐색 (PRD 기능 4). 클러스터링은 프론트(supercluster)의 책임 — 이 API는 뷰포트 안의 원시 핀 목록만 반환한다.

- **로그인 필요**: 아니오
- **요청 query**:
  | 파라미터 | 필수 | 설명 |
  |---|---|---|
  | `minLat`, `maxLat` | 예 | 위도 범위 (`minLat < maxLat`) |
  | `minLng`, `maxLng` | 예 | 경도 범위 (`minLng < maxLng`) |
  | `month` | 아니오 | 촬영월 1~12 (`takenAt` 기준) |
  | (+ 공유 필터) | 아니오 | 위 표 참고 |
- **성공 응답**: `200`
  ```json
  [{ "id": "uuid", "lat": 37.5, "lng": 127.0 }, ...]
  ```
  - 좌표는 공개범위가 반영된 값(EXACT=실제, FUZZY=저장된 오프셋)이고, `HIDDEN`인 사진과 운영자가 비공개 처리한 사진은 결과에서 제외됨
  - 최대 2000개까지, 최신순으로 자름(그 이상은 잘린다는 표시가 응답에 없음 — 프론트에서 지나치게 넓은 뷰포트는 주의)
  - 조건에 맞는 핀이 없으면 빈 배열(`[]`), 에러 아님
- **에러**: `400`(위경도 형식 오류, 또는 `min >= max`인 뒤집힌 범위)

### `GET /discovery/gallery`
갤러리 (PRD 기능 8). 위치 공개범위와 무관하게(지도 미노출 사진 포함) 전부 노출.

- **로그인 필요**: 아니오
- **요청 query** (전부 선택):
  | 파라미터 | 기본값 | 설명 |
  |---|---|---|
  | `sort` | `latest` | `latest`(최신순) \| `likes`(좋아요순) |
  | `cursor` | 없음 | 이전 응답의 `nextCursor` 값을 그대로 전달 (무한 스크롤) |
  | `limit` | `20` | 1 이상 정수, 최대 `50`(그 이상은 서버가 50으로 줄여서 반환) |
  | (+ 공유 필터) | | 위 표 참고. **지역(bbox) 필터는 없음** — 보내도 무시됨 |
- **성공 응답**: `200`
  ```json
  {
    "items": [
      {
        "id": "uuid",
        "cameraName": "ILCE-7M4",
        "lensName": "FE 24-70mm F2.8 GM",
        "thumbnailUrl": "https://.../thumbnail.jpg",
        "likeCount": 3,
        "createdAt": "2026-03-10T00:00:00.000Z"
      }
    ],
    "nextCursor": "uuid-or-null"
  }
  ```
  - `nextCursor`가 `null`이면 마지막 페이지 — 다음 요청의 `cursor`로 그 값을 그대로 보내면 다음 페이지
  - 조건에 맞는 사진이 없으면 `items: []`, `nextCursor: null`
- **에러**: `400`(`limit`이 양의 정수 형식이 아님, 예: `0`/`-1`/`1.5`)

---

## Engagement (`/photos/:id/...`)
좋아요(PRD 기능 7)와 사진 신고(PRD 기능 9). URL은 `/photos` 하위지만 소유 모듈은 `EngagementModule`로 분리돼 있다.

### `POST /photos/:id/like`
좋아요 토글 — 누른 적 없으면 좋아요로 전환, 이미 눌렀으면 취소.

- **로그인 필요**: 예
- **요청 body**: 없음
- **성공 응답**: `201`
  ```json
  { "liked": true, "likeCount": 4 }
  ```
  - `liked`가 `true`→`false`로 바뀌면 취소된 것, `likeCount`는 항상 그 시점의 실제 좋아요 수(캐시 아님)
- **에러**: `401`(비로그인) · `404`(사진이 없거나 `ACTIVE` 상태가 아님 — 사진 상세 조회와 동일한 열람 규칙)

### `POST /photos/:id/reports`
사진 신고 제출. 운영자 조치(비공개/삭제)는 MVP 범위상 어드민 API 없이 운영자가 DB(Prisma Studio 등)를 직접 조회·수정해서 처리한다(PRD 부록A) — 이 엔드포인트는 신고 접수까지만 담당한다.

- **로그인 필요**: 예
- **요청 body**:
  | 필드 | 타입 | 제약 |
  |---|---|---|
  | `reason` | string | `PRIVACY` \| `INAPPROPRIATE` \| `COPYRIGHT` \| `OTHER` |
  | `detail` | string | 선택. 1000자 이하 문자열. `reason`이 `OTHER`면 공백만 있는 값 제외 필수 |
- **성공 응답**: `201`
  ```json
  { "id": "uuid", "photoId": "uuid", "reason": "PRIVACY", "status": "PENDING", "createdAt": "2026-03-10T00:00:00.000Z" }
  ```
  - `status`는 항상 `PENDING`으로 시작 (`REVIEWED`/`ACTIONED`는 운영자가 DB에서 직접 바꿀 때만 바뀜)
  - 신고 대상 사진은 `HIDDEN`/`DELETED` 상태여도 접수됨 (좋아요와 달리 존재 여부만 확인 — 이미 조치된 사진에 대한 추가 신고도 유효할 수 있어서)
  - 같은 사진에 같은 사용자가 여러 번 신고할 수 있음 (중복 방지 없음)
- **에러**: `400`(`reason`이 enum 값이 아님, 또는 `OTHER`인데 `detail`이 없거나 공백뿐이거나 문자열이 아님) · `401`(비로그인) · `404`(사진 자체가 없음)
