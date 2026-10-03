# AMMCO Local Ollama Bridge

This bridge lets the Vercel-hosted AMMCO AI Developer use Ollama running on your own computer.

## How it works

```text
AMMCO on Vercel
      |
      | HTTPS + Bearer token
      v
Public tunnel
      |
      v
127.0.0.1:8787  (this bridge)
      |
      v
127.0.0.1:11434 (Ollama)
```

The bridge binds to localhost by default, so Ollama itself is never exposed directly.

## Windows quick start

Use `AMMCO-Ollama-Bridge.ps1`. It requires only Ollama and cloudflared, can offer to install them with winget, generates the bridge token automatically, checks the lightweight default model `qwen2.5-coder:1.5b`, starts the HTTPS tunnel, and prints the Vercel variables.

No Node.js or Git is required for the standalone Windows bridge.

## Requirements

- Windows: PowerShell + Ollama + cloudflared
- macOS/Linux fallback: Node.js 20+ bridge is still available
- A coding model in Ollama
- An HTTPS tunnel such as Cloudflare Tunnel or Tailscale Funnel

## 1. Configure

Copy `.env.example` to `.env` and set a long random `BRIDGE_TOKEN`.

Do not commit `.env`.

## 2. Start Ollama

Confirm Ollama is available locally:

```bash
curl http://127.0.0.1:11434/api/tags
```

## 3. Start the bridge

Windows PowerShell (recommended):

```powershell
powershell -ExecutionPolicy Bypass -File .\AMMCO-Ollama-Bridge.ps1
```

The Windows script prints the tunnel URL and all Vercel values automatically.

macOS/Linux:

```bash
cd tools/ollama-bridge
chmod +x start.sh
./start.sh
```

The bridge listens on:

```text
http://127.0.0.1:8787
```

## 4. Create an HTTPS tunnel

Point your tunnel at:

```text
http://127.0.0.1:8787
```

Example with Cloudflare Quick Tunnel:

```bash
cloudflared tunnel --url http://127.0.0.1:8787
```

It will print an HTTPS URL. Quick Tunnel URLs may change between sessions.

For a stable URL, use a named Cloudflare Tunnel or another tunnel provider with a persistent hostname.

## 5. Configure Vercel Preview

Set these variables on the AMMCO Preview environment:

```text
AI_PROVIDER=ollama
AI_API_BASE_URL=https://YOUR-TUNNEL-HOST/v1
AI_API_KEY=SAME_VALUE_AS_BRIDGE_TOKEN
AI_MODEL=YOUR_OLLAMA_MODEL
```

Example model names depend on what is installed in Ollama.

## Security

- Ollama port 11434 stays local.
- The bridge listens only on 127.0.0.1.
- Requests to model endpoints require the Bearer token.
- Do not commit the token.
- If the tunnel URL is temporary, update `AI_API_BASE_URL` in Vercel each time it changes.
