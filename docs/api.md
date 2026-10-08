# API 목록

지금까지 구현된 백엔드(NestJS) API 전체 목록이다. 모듈: Auth, Photos, Discovery.
Engagement(좋아요/신고) 모듈은 아직 구현 전이라 이 문서에 없다.

- 모든 응답은 JSON (파일 업로드만 요청이 `multipart/form-data`).
- 로그인 세션은 httpOnly 쿠키(`session`, JWT)로 발급된다 — 요청 헤더에 토큰을 직접 넣는 방식이 아니라, 브라우저가 쿠키를 자동으로 들고 간다.
- "로그인 필요"는 `JwtAuthGuard`가 걸려 있다는 뜻 — 쿠키 없거나 유효하지 않으면 401.
- 쿼리 파라미터의 숫자/위경도 값은 전부 **문자열**로 받는다(`minLat=37.5` 같은 쿼리스트링 그대로) — 서버가 내부에서 `Number()`로 변환한다.

---

## Auth (`/auth`)

### `POST /auth/register`
- **로그인 필요**: 아니오
- **요청 body**:
  | 필드 | 타입 | 제약 |
  |---|---|---|
  | `email` | string | 이메일 형식 |
  | `password` | string | 8~72자 |
- **성공 응답**: `201`
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
- **성공 응답**: `200`, `{ "id": "uuid", "email": "user@example.com" }`
- **에러**: `401`(쿠키 없음/위조/만료)

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
    { "id": "uuid", "cameraRaw": "ILCE-7M4", "lensRaw": "FE 24-70mm F2.8 GM", "hasLocation": true },
    { "id": "uuid", "cameraRaw": null, "lensRaw": null, "hasLocation": false }
  ]
  ```
  - `cameraRaw`/`lensRaw`: EXIF에서 읽은 원문 (없으면 `null`, 예: 스크린샷)
  - `hasLocation`: EXIF에 GPS가 있어서 위치가 바로 저장됐는지 — `false`면 `PATCH /photos/:id/location`으로 수동 등록해야 지도에 노출됨
  - 배치 중 하나라도 디코딩에 실패하면 **전체 요청이 거부**되고 아무것도 저장되지 않음(부분 성공 없음)
- **에러**:
  - `400`: 파일 0개 / 이미지 디코딩 실패(내용이 손상됨) / 파일 개수 초과(multer 자체 에러)
  - `401`: 로그인 안 됨
  - `413`: 파일이 25MB 초과
  - `415`: 지원하지 않는 형식 (예: gif)

### `PATCH /photos/:id/location`
수동 위치 등록/수정 (PRD 기능 2). GPS 없는 사진은 이 호출이 필요하고, GPS 있는 사진도 다시 호출해 덮어쓸 수 있음.

- **로그인 필요**: 예 (본인 사진만 가능)
- **요청 body**: `{ "lat": number, "lng": number }` (위경도 범위 벗어나면 거부)
- **성공 응답**: `200`, 빈 body
  - 위치가 실제로 바뀌면 기존 fuzzy 오프셋은 리셋되고, 공개범위가 FUZZY면 새 오프셋이 자동으로 다시 생성됨
- **에러**: `400`(위경도 형식 오류) · `401` · `403`(본인 사진 아님) · `404`(사진 없음)

### `PATCH /photos/:id/visibility`
위치 공개범위 변경 (PRD 기능 3): `EXACT` / `FUZZY`(기본값) / `HIDDEN`.

- **로그인 필요**: 예 (본인 사진만 가능)
- **요청 body**: `{ "visibility": "EXACT" | "FUZZY" | "HIDDEN" }`
- **성공 응답**: `200`, 빈 body
  - `FUZZY`로 처음 전환되는 순간에만 오프셋이 생성되고, 이후로는 같은 오프셋을 재사용(재생성 안 함)
- **에러**: `400`(enum 값 아님) · `401` · `403`(본인 사진 아님) · `404`

### `GET /photos/:id`
사진 상세 (PRD 기능 5).

- **로그인 필요**: 아니오 (전면 공개 열람)
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
    "likeCount": 0
  }
  ```
  - `location`: 공개범위에 따라 투영된 좌표. `HIDDEN`이거나 아직 위치가 없으면 `null`
  - `locationLabel`: `"exact"` | `"approximate"`(fuzzy) | `"hidden"` — 프론트에서 "대략적 위치"/"위치 비공개" 안내에 그대로 쓰면 됨
- **에러**: `404`(없거나, 운영자 조치로 `status`가 `ACTIVE`가 아님 — 위치 공개범위의 `HIDDEN`과는 다른 개념)

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

## 아직 없는 것 (Engagement 모듈, 구현 전)

- 좋아요 토글 (PRD 기능 7)
- 사진 신고 (PRD 기능 9) — 운영자 조치는 MVP 범위상 어드민 API 없이 DB 직접 조회/수정으로 처리 (PRD 부록A)
