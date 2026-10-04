# Vercel 배포와 방 생성 권한

별도 상주 게임 서버나 데이터베이스 없이 Vercel의 **네이티브 WebSocket Functions**에서 실행합니다. 정적 화면·게임 데이터·브라우저 전투 모듈은 CDN에 배포합니다. 기존 `npm start` 방식도 유지됩니다.

## 배포

1. Vercel에서 이 저장소의 `dev` 브랜치를 가져옵니다. Framework Preset은 **Other**, Node.js는 **22.x 또는 24.x**를 선택합니다.
2. **Fluid compute를 켭니다.** 저장소의 `vercel.json`이 빌드 명령 `npm run build:vercel`, 출력 디렉터리 `dist`, 서울 리전 `icn1`, WebSocket `/ws`와 상태 확인 `/healthz` 경로를 설정합니다.
3. Project Settings → Environment Variables에 아래 옵션을 설정하고 배포합니다. 환경변수 변경 후에는 재배포합니다.
4. 배포 주소를 열고 닉네임을 입력합니다. 관리자 전용 모드에서는 로비의 관리자 키를 입력해 방을 만들고, 친구에게 방 코드나 초대 링크를 보냅니다.

| 환경변수 | 기본값 | 동작 |
|---|---|---|
| `SP_ROOM_CREATION` | `public` | `public`: 누구나 생성, `owner`: 관리자 키 필요, `disabled`: 새 방 생성 금지 |
| `SP_OWNER_KEY` | 없음 | `owner`에서 필수. 32–256자 비밀 키. 예: `openssl rand -hex 32`로 생성 |
| `SP_FETCH_ASSETS` | `0` | `1`이면 빌드 중 미술·음악 리소스 약 270 MB 다운로드. 다운로드 실패 시 빌드 실패. 기본값은 이미 있는 리소스 또는 대체 그래픽 사용 |

관리자 전용 예시:

```dotenv
SP_ROOM_CREATION=owner
SP_OWNER_KEY=<생성한 비밀 키>
SP_FETCH_ASSETS=1
```

`SP_OWNER_KEY`는 서버 환경변수에만 설정합니다. `PUBLIC_` 또는 `NEXT_PUBLIC_` 접두사를 붙이거나 소스에 넣지 않습니다. 브라우저에 키를 미리 배포하지 않으며, 관리자가 입력한 값은 HTTPS/WSS의 방 생성 요청으로만 전달됩니다. 로컬 스토리지·쿠키·초대 링크에 저장하지 않습니다. 키를 아는 사람이 관리자이므로 공유하지 마세요.

권한 검사는 **서버에서** 수행합니다. 1인·협동 모드 모두 적용됩니다. 일반 사용자의 기존 방 참가·준비·게임 플레이에는 키가 필요하지 않습니다. 게임 내 방장 권한과 서버 관리자 권한은 별개입니다. 잘못된 설정이나 `owner` 모드의 누락·짧은 키는 서버 시작을 실패시켜 공개 생성으로 우회되지 않게 합니다.

## 메모리 모드의 제약

요청대로 저장·복원이나 인스턴스 간 상태 공유를 추가하지 않았습니다.

- 함수 인스턴스 종료·재배포·콜드 스타트 시 기존 방과 대전이 사라질 수 있습니다. 재접속이 같은 살아 있는 인스턴스에 도달할 때만 기존 세션을 이어갈 수 있습니다.
- `maxDuration`은 모든 요금제에서 사용할 수 있는 **300초**로 설정했습니다. WebSocket은 함수 실행 시간 제한에 도달하면 끊어집니다. 프로젝트 요금제가 허용하면 이 값을 늘릴 수 있지만 영구 연결을 보장하지 않습니다.
- **협동 플레이는 참가자들이 같은 함수 인스턴스에 연결될 때만 가능합니다.** Vercel은 새 연결을 같은 인스턴스로 보장하지 않습니다. 리전을 하나로 설정해도 인스턴스는 여러 개가 될 수 있으므로, 유효한 방 코드로도 다른 인스턴스에서는 방을 찾지 못할 수 있습니다. 따라서 이 구성은 안정적인 장시간 협동 플레이를 보장하지 않습니다.
- 리소스 다운로드는 빌드 시에만 실행합니다. 함수 실행 중 파일을 쓰거나 다운로드하지 않습니다. 대용량 이미지·음악은 함수 번들에서 제외합니다.

플랫폼 근거: [Vercel WebSockets — 연결 수명과 인스턴스 상태](https://vercel.com/docs/functions/websockets), [함수 실행 시간 설정](https://vercel.com/docs/functions/configuring-functions/duration).

## 로컬 확인

```bash
npm ci
npm run build:vercel
cp .env.example .env
# .env의 모드와 키를 수정한 다음:
node --env-file=.env server/index.js
```

`npm start`는 셸 환경변수를 사용하며 `.env`를 자동으로 읽지 않습니다. 실제 Vercel 라우팅과 연결 분산은 배포 후 두 브라우저로 방 생성·참가를 확인해야 합니다.
