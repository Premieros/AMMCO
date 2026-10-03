# AMMCO Remote Ollama

This stack runs Ollama behind a TLS reverse proxy that accepts the same Bearer token used by AMMCO.

## Requirements

- Linux cloud server
- Docker + Docker Compose
- NVIDIA GPU and NVIDIA Container Toolkit
- A DNS record pointing your chosen subdomain to the server

## Start

1. Copy `.env.example` to `.env`.
2. Set `OLLAMA_DOMAIN` and a long random `OLLAMA_API_KEY`.
3. Start the stack:

```bash
docker compose up -d
```

4. Pull a model inside the Ollama container:

```bash
docker compose exec ollama ollama pull qwen2.5-coder:7b
```

5. Verify the OpenAI-compatible endpoint:

```bash
curl https://YOUR_DOMAIN/v1/models \
  -H "Authorization: Bearer YOUR_SECRET"
```

## AMMCO Vercel variables

```text
AI_PROVIDER=ollama
AI_API_BASE_URL=https://YOUR_DOMAIN/v1
AI_API_KEY=YOUR_SECRET
AI_MODEL=qwen2.5-coder:7b
```

Keep the Ollama port 11434 private. Only Caddy should be exposed to the public internet.

## Model sizing

Start with a coding model that fits comfortably in the selected GPU memory. The model name above is only a default starter and can be changed later without changing AMMCO code.
