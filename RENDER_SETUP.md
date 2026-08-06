# Render backend setup

## Blueprint deployment

1. Push this repository to GitHub or GitLab.
2. In Render, select **New > Blueprint**.
3. Connect the repository and select the branch containing `render.yaml`.
4. Confirm creation of the `videodownloader-api` web service.
5. Add values for any secret environment variables described below.
6. Deploy and wait for `/healthz` to return `{"status":"ok","engine":"active"}`.

The included `render.yaml` uses these commands:

```text
Build: pip install --upgrade pip && pip install -r backend/requirements.txt
Start: cd backend && uvicorn main:app --host 0.0.0.0 --port $PORT
Health check: /healthz
```

## Manual web-service deployment

Use these values if the service is created without the Blueprint. The important setting is **Root Directory: leave empty**. Your failed deploy had `backend` as the root directory, which caused Render to look for `backend/backend/requirements.txt`.

```text
Language: Python 3
Root Directory: leave empty (repository root)
Build command: pip install --upgrade pip && pip install -r backend/requirements.txt
Start command: cd backend && uvicorn main:app --host 0.0.0.0 --port $PORT
Health check path: /healthz
Auto-deploy: On commit
```

Use Python `3.12.8`. A paid Starter instance or larger is recommended because yt-dlp and FFmpeg downloads can exceed the memory, CPU, request-duration, and sleeping-service constraints of a free instance.

## Environment variables

Required/recommended:

```text
PYTHON_VERSION=3.12.8
MAX_CONCURRENT_JOBS=2
CORS_ORIGINS=*
```

Optional:

```text
PROXY_URL=https://user:password@your-authorized-proxy.example:port
YOUTUBE_COOKIES_TEXT=<Netscape-format cookie file contents>
YOUTUBE_PO_TOKEN_SPEC=mweb.gvs+TOKEN
YOUTUBE_VISITOR_DATA=<matching visitor data>
```

PO tokens must retain yt-dlp's `CLIENT.CONTEXT+TOKEN` format. Do not attach an `mweb` token to another client. Cookies and tokens expire and must be managed as secrets in Render, never committed to Git.

## Verification

Open these URLs after deployment:

```text
https://videodownloader-api-ze27.onrender.com/healthz
https://videodownloader-api-ze27.onrender.com/docs
```

After changing `.env`, stop Metro and restart it with:

```bash
npx expo start --clear
```

For an Android emulator talking to a backend running on the development computer, temporarily set:

```text
EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:10000
```

For a physical device, use the computer's LAN IP instead of `10.0.2.2`, ensure both devices are on the same network, and allow the backend port through the computer firewall.
