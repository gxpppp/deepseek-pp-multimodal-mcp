# deepseek-pp-multimodal-mcp

Native Messaging MCP host for DeepSeek++ multimodal tools.

It provides:

- `vision_status` - checks OpenAI and Gemini configuration.
- `analyze_images` - analyzes one or more images with OpenAI image input format.
- `analyze_video` - analyzes a video with Gemini video input format.

Install the native host for a local DeepSeek++ extension:

```bash
npx deepseek-pp-multimodal-mcp install --browser chrome --extension-id <extension-id>
```

For local source development from this repository:

```bash
node bin/deepseek-pp-multimodal-mcp.mjs install --browser chrome --extension-id <extension-id>
```

Configure API keys on the DeepSeek++ MCP preset `Env` field or in the host process environment:

```text
OPENAI_API_KEY=...
GEMINI_API_KEY=...
OPENAI_IMAGE_MODEL=gpt-4.1-mini
GEMINI_VIDEO_MODEL=gemini-2.5-flash
OPENAI_BASE_URL=https://api.openai.com/v1
GEMINI_BASE_URL=https://generativelanguage.googleapis.com
```

When used from DeepSeek++, configure these values from the extension Settings page. `OPENAI_BASE_URL` should point at an OpenAI-compatible `/v1` base URL. `GEMINI_BASE_URL` should point at the Gemini API host; compatible proxies may include the API version in the URL.

The host does not mock model calls. Missing keys, inaccessible media, provider errors, and oversized inline media return explicit MCP errors.

## License

MIT
