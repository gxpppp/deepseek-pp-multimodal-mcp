import { basename, extname } from 'node:path';
import { readFileSync, statSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';

export const HOST_NAME = 'com.deepseek_pp.multimodal';
export const SERVER_NAME = 'deepseek-pp-multimodal';
export const MCP_PROTOCOL_VERSION = '2025-06-18';

const DEFAULT_OPENAI_IMAGE_MODEL = 'gpt-4.1-mini';
const DEFAULT_GEMINI_VIDEO_MODEL = 'gemini-2.5-flash';
const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com';
const DEFAULT_MAX_IMAGE_DATA_URL_BYTES = 8 * 1024 * 1024;
const DEFAULT_MAX_INLINE_VIDEO_BYTES = 20 * 1024 * 1024;
const DEFAULT_GEMINI_FILE_POLL_MS = 2_000;
const DEFAULT_GEMINI_FILE_POLL_ATTEMPTS = 60;
const DEFAULT_SILICONFLOW_BASE_URL = 'https://api.siliconflow.cn/v1';
const DEFAULT_SILICONFLOW_IMAGE_MODEL = 'Qwen/Qwen3-VL-30B-A3B-Instruct';
const DEFAULT_SILICONFLOW_VIDEO_MODEL = 'Qwen/Qwen3-Omni-30B-A3B-Instruct';
const MAX_NATIVE_MESSAGE_BYTES = 64 * 1024 * 1024;

const TOOL_DEFINITIONS = [
  {
    name: 'vision_status',
    title: 'Multimodal Vision Status',
    description: 'Report OpenAI image and Gemini video configuration for the DeepSeek++ multimodal native host. Does not upload media.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: {
        openai: { type: 'object' },
        gemini: { type: 'object' },
        limits: { type: 'object' },
      },
      additionalProperties: true,
    },
    annotations: { operation: 'read', risk: 'low' },
  },
  {
    name: 'analyze_images',
    title: 'Analyze Images',
    description: 'Analyze one or more images through OpenAI image inputs. Images use OpenAI input_image format with image_url data URLs, http(s) URLs, or file_id.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Question or task for the image analysis.' },
        images: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: ['input_image'] },
              image_url: { type: 'string', description: 'OpenAI image_url. Supports http(s) URLs and data:image/... URLs.' },
              file_id: { type: 'string', description: 'OpenAI file id for an uploaded image.' },
              detail: { type: 'string', enum: ['auto', 'low', 'high'] },
              label: { type: 'string', description: 'Optional stable label for multi-image analysis.' },
            },
            required: ['type'],
            additionalProperties: false,
          },
        },
        output_schema: {
          type: 'string',
          enum: ['general', 'ocr', 'ui', 'chart', 'compare'],
          description: 'Optional analysis style hint.',
        },
        model: { type: 'string', description: 'Optional OpenAI model override. Defaults to OPENAI_IMAGE_MODEL or gpt-4.1-mini.' },
        max_output_tokens: { type: 'integer', minimum: 1, maximum: 8192 },
      },
      required: ['prompt', 'images'],
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: {
        provider: { type: 'string' },
        model: { type: 'string' },
        text: { type: 'string' },
        imageCount: { type: 'integer' },
        labels: { type: 'array' },
      },
      additionalProperties: true,
    },
    annotations: { operation: 'read', risk: 'medium' },
  },
  {
    name: 'analyze_video',
    title: 'Analyze Video',
    description: 'Analyze a video through Gemini video inputs. Supports Gemini fileData, inlineData, a public URL, or a localPath uploaded by the native host.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Question or task for the video analysis.' },
        video: {
          type: 'object',
          properties: {
            fileData: {
              type: 'object',
              properties: {
                fileUri: { type: 'string' },
                mimeType: { type: 'string' },
              },
              required: ['fileUri'],
              additionalProperties: false,
            },
            inlineData: {
              type: 'object',
              properties: {
                data: { type: 'string', description: 'Base64 video bytes without a data: prefix.' },
                mimeType: { type: 'string' },
              },
              required: ['data', 'mimeType'],
              additionalProperties: false,
            },
            url: { type: 'string', description: 'Public video URL or YouTube URL. Converted to Gemini fileData.fileUri.' },
            localPath: { type: 'string', description: 'Absolute local video path. The native host uploads it through Gemini File API.' },
            mimeType: { type: 'string', description: 'MIME type for url or localPath.' },
            videoMetadata: {
              type: 'object',
              properties: {
                startOffset: { type: 'string', description: 'Gemini duration string, for example 10s.' },
                endOffset: { type: 'string', description: 'Gemini duration string, for example 40s.' },
                fps: { type: 'number' },
              },
              additionalProperties: false,
            },
          },
          additionalProperties: false,
        },
        output_schema: {
          type: 'string',
          enum: ['summary', 'timeline', 'qa', 'extract'],
          description: 'Optional analysis style hint.',
        },
        model: { type: 'string', description: 'Optional Gemini model override. Defaults to GEMINI_VIDEO_MODEL or gemini-2.5-flash.' },
        max_output_tokens: { type: 'integer', minimum: 1, maximum: 8192 },
        temperature: { type: 'number', minimum: 0, maximum: 2 },
      },
      required: ['prompt', 'video'],
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: {
        provider: { type: 'string' },
        model: { type: 'string' },
        text: { type: 'string' },
        videoSource: { type: 'string' },
        uploadedFile: { type: 'object' },
      },
      additionalProperties: true,
    },
    annotations: { operation: 'read', risk: 'medium' },
  },
  {
    name: 'analyze_images_siliconflow',
    title: 'Analyze Images (SiliconFlow)',
    description: 'Analyze one or more images through SiliconFlow chat completions API using standard image_url format.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Question or task for the image analysis.' },
        images: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: ['image_url'] },
              image_url: {
                type: 'object',
                properties: {
                  url: { type: 'string', description: 'Image URL (http/https) or data:image base64 URL.' },
                  detail: { type: 'string', enum: ['auto', 'low', 'high'] },
                },
                required: ['url'],
                additionalProperties: false,
              },
              localPath: { type: 'string', description: 'Absolute local image path. Encoded as base64 inline.' },
              label: { type: 'string', description: 'Optional stable label for multi-image analysis.' },
            },
            required: ['type'],
            additionalProperties: false,
          },
        },
        output_schema: {
          type: 'string',
          enum: ['general', 'ocr', 'ui', 'chart', 'compare'],
          description: 'Optional analysis style hint.',
        },
        model: { type: 'string', description: 'Optional model override. Defaults to Qwen/Qwen3-VL-30B-A3B-Instruct.' },
        max_tokens: { type: 'integer', minimum: 1, maximum: 8192 },
      },
      required: ['prompt', 'images'],
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: {
        provider: { type: 'string' },
        model: { type: 'string' },
        text: { type: 'string' },
        imageCount: { type: 'integer' },
        labels: { type: 'array' },
      },
      additionalProperties: true,
    },
    annotations: { operation: 'read', risk: 'medium' },
  },
  {
    name: 'analyze_video_siliconflow',
    title: 'Analyze Video (SiliconFlow)',
    description: 'Analyze a video through SiliconFlow chat completions API using standard video_url format. Supports HTTP URLs, data URLs, and local file paths.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Question or task for the video analysis.' },
        video: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'Public video URL (http/https) or data:video base64 URL.' },
            localPath: { type: 'string', description: 'Absolute local video path. Encoded as base64 inline.' },
            detail: { type: 'string', enum: ['auto', 'low', 'high'], description: 'Frame detail level.' },
            max_frames: { type: 'integer', minimum: 1, description: 'Maximum number of frames to extract.' },
            fps: { type: 'number', minimum: 0, description: 'Frames per second to extract.' },
            mimeType: { type: 'string', description: 'MIME type for localPath (e.g. video/mp4).' },
          },
          additionalProperties: false,
        },
        output_schema: {
          type: 'string',
          enum: ['summary', 'timeline', 'qa', 'extract'],
          description: 'Optional analysis style hint.',
        },
        model: { type: 'string', description: 'Optional model override. Defaults to Qwen/Qwen3-Omni-30B-A3B-Instruct.' },
        max_tokens: { type: 'integer', minimum: 1, maximum: 8192 },
        temperature: { type: 'number', minimum: 0, maximum: 2 },
      },
      required: ['prompt', 'video'],
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: {
        provider: { type: 'string' },
        model: { type: 'string' },
        text: { type: 'string' },
        videoSource: { type: 'string' },
      },
      additionalProperties: true,
    },
    annotations: { operation: 'read', risk: 'medium' },
  },
];

const PROVIDERS = [
  {
    name: 'openai',
    getKey: (env) => nonEmptyString(env.OPENAI_API_KEY),
    statusFields: (env) => ({
      model: env.OPENAI_IMAGE_MODEL || DEFAULT_OPENAI_IMAGE_MODEL,
      baseUrl: normalizeOpenAiBaseUrl(env.OPENAI_BASE_URL),
    }),
    handlers: { analyze_images: analyzeImages },
  },
  {
    name: 'gemini',
    getKey: (env) => nonEmptyString(env.GEMINI_API_KEY)
      || nonEmptyString(env.GOOGLE_API_KEY)
      || nonEmptyString(env.GOOGLE_GEMINI_API_KEY),
    statusFields: (env) => ({
      model: env.GEMINI_VIDEO_MODEL || DEFAULT_GEMINI_VIDEO_MODEL,
      baseUrl: env.GEMINI_BASE_URL || DEFAULT_GEMINI_BASE_URL,
      apiVersion: env.GEMINI_API_VERSION || 'v1beta',
    }),
    handlers: { analyze_video: analyzeVideo },
  },
  {
    name: 'siliconflow',
    getKey: (env) => nonEmptyString(env.SILICONFLOW_API_KEY),
    statusFields: (env) => ({
      imageModel: env.SILICONFLOW_IMAGE_MODEL || DEFAULT_SILICONFLOW_IMAGE_MODEL,
      videoModel: env.SILICONFLOW_VIDEO_MODEL || DEFAULT_SILICONFLOW_VIDEO_MODEL,
      baseUrl: normalizeSiliconFlowBaseUrl(env.SILICONFLOW_BASE_URL),
    }),
    handlers: {
      analyze_images_siliconflow: analyzeImagesSiliconFlow,
      analyze_video_siliconflow: analyzeVideoSiliconFlow,
    },
  },
];

export async function handleMcpMessage(message, options = {}) {
  if (!message || typeof message !== 'object' || message.jsonrpc !== '2.0') {
    return jsonRpcError(null, -32600, 'Invalid JSON-RPC request.');
  }

  if (!('id' in message)) {
    return null;
  }

  try {
    switch (message.method) {
      case 'initialize':
        return jsonRpcResult(message.id, {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: { name: SERVER_NAME, version: '0.1.0' },
          instructions: 'Use analyze_images for OpenAI, analyze_video for Gemini, analyze_images_siliconflow and analyze_video_siliconflow for SiliconFlow multimodal analysis. Do not pass large videos inline; prefer url or localPath.',
        });
      case 'tools/list':
        return jsonRpcResult(message.id, { tools: TOOL_DEFINITIONS });
      case 'tools/call':
        return jsonRpcResult(message.id, await callTool(message.params, createRuntimeEnv(options.env)));
      default:
        return jsonRpcError(message.id, -32601, `Unknown MCP method: ${message.method}`);
    }
  } catch (err) {
    return jsonRpcError(message.id, -32603, err instanceof Error ? err.message : String(err));
  }
}

export function startNativeMessagingHost() {
  let buffer = Buffer.alloc(0);
  const queue = [];
  let waiting = null;
  let stdinEnded = false;

  process.stdin.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length >= 4) {
      const len = buffer.readUInt32LE(0);
      if (len === 0 || len > MAX_NATIVE_MESSAGE_BYTES) {
        process.stderr.write(`[${SERVER_NAME}] Invalid native message length: ${len}\n`);
        process.exit(1);
      }
      if (buffer.length < 4 + len) break;
      const json = buffer.subarray(4, 4 + len).toString('utf8');
      buffer = buffer.subarray(4 + len);
      try {
        const parsed = JSON.parse(json);
        if (waiting) {
          const resolve = waiting;
          waiting = null;
          resolve(parsed);
        } else {
          queue.push(parsed);
        }
      } catch (err) {
        process.stderr.write(`[${SERVER_NAME}] JSON parse error: ${err instanceof Error ? err.message : String(err)}\n`);
      }
    }
  });

  process.stdin.on('end', () => {
    stdinEnded = true;
    if (waiting) {
      const resolve = waiting;
      waiting = null;
      resolve(null);
    }
  });

  process.stdin.on('error', () => {
    stdinEnded = true;
    if (waiting) {
      const resolve = waiting;
      waiting = null;
      resolve(null);
    }
  });

  const readMessage = () => {
    if (queue.length > 0) return Promise.resolve(queue.shift());
    if (stdinEnded) return Promise.resolve(null);
    return new Promise((resolve) => { waiting = resolve; });
  };

  (async () => {
    while (true) {
      const envelope = await readMessage();
      if (!envelope) break;
      const message = envelope?.message ?? envelope;
      const env = envelope?.server?.env && typeof envelope.server.env === 'object'
        ? envelope.server.env
        : {};
      const response = await handleMcpMessage(message, { env });
      if (response) await writeNativeMessage(response);
    }
  })().catch((err) => {
    process.stderr.write(`[${SERVER_NAME}] Fatal error: ${err instanceof Error ? err.stack || err.message : String(err)}\n`);
    process.exit(1);
  });
}

async function writeNativeMessage(message) {
  const payload = Buffer.from(JSON.stringify(message), 'utf8');
  if (payload.length > MAX_NATIVE_MESSAGE_BYTES) {
    throw new Error(`Native response exceeds ${MAX_NATIVE_MESSAGE_BYTES} bytes.`);
  }
  const header = Buffer.alloc(4);
  header.writeUInt32LE(payload.length, 0);
  await new Promise((resolve, reject) => {
    process.stdout.write(Buffer.concat([header, payload]), (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

async function callTool(params, env) {
  const name = params?.name;
  const args = params?.arguments ?? {};
  if (typeof name !== 'string') {
    return errorToolResult('invalid_tool_call', 'MCP tools/call requires a string tool name.');
  }

  try {
    if (name === 'vision_status') return successToolResult(await visionStatus(env));
    for (const provider of PROVIDERS) {
      if (Object.hasOwn(provider.handlers, name)) {
        const handler = provider.handlers[name];
        if (typeof handler === 'function') return successToolResult(await handler(args, env));
      }
    }
    return errorToolResult('unknown_tool', `Unknown multimodal tool: ${name}`);
  } catch (err) {
    return errorToolResult(
      err?.code || 'multimodal_tool_failed',
      err instanceof Error ? err.message : String(err),
      err?.details,
    );
  }
}

async function visionStatus(env) {
  const result = {
    provider: 'deepseek-pp-multimodal',
  };
  for (const provider of PROVIDERS) {
    result[provider.name] = {
      configured: Boolean(provider.getKey(env)),
      ...provider.statusFields(env),
    };
  }
  result.limits = {
    maxImageDataUrlBytes: numberEnv(env.MAX_IMAGE_DATA_URL_BYTES, DEFAULT_MAX_IMAGE_DATA_URL_BYTES),
    maxInlineVideoBytes: numberEnv(env.MAX_INLINE_VIDEO_BYTES, DEFAULT_MAX_INLINE_VIDEO_BYTES),
  };
  return result;
}

async function analyzeImages(args, env) {
  const prompt = requireNonEmptyString(args?.prompt, 'prompt');
  const images = normalizeImages(args?.images, env);
  const apiKey = requireOpenAiKey(env);
  const model = nonEmptyString(args?.model) || env.OPENAI_IMAGE_MODEL || DEFAULT_OPENAI_IMAGE_MODEL;
  const content = [
    {
      type: 'input_text',
      text: buildImagePrompt(prompt, images, args?.output_schema),
    },
    ...images.map((image) => {
      const part = { type: 'input_image' };
      if (image.image_url) part.image_url = image.image_url;
      if (image.file_id) part.file_id = image.file_id;
      if (image.detail) part.detail = image.detail;
      return part;
    }),
  ];
  const body = {
    model,
    input: [{ role: 'user', content }],
  };
  const maxOutputTokens = positiveInt(args?.max_output_tokens);
  if (maxOutputTokens) body.max_output_tokens = maxOutputTokens;

  const response = await fetch(`${normalizeOpenAiBaseUrl(env.OPENAI_BASE_URL)}/responses`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const json = await readJson(response);
  if (!response.ok) {
    throw providerError('openai_image_failed', `OpenAI image analysis failed: ${extractProviderError(json, response.statusText)}`, { status: response.status, response: json });
  }

  const text = extractOpenAiResponseText(json);
  return {
    provider: 'openai',
    model,
    text,
    imageCount: images.length,
    labels: images.map((image, index) => image.label || `image_${index + 1}`),
    rawId: typeof json.id === 'string' ? json.id : null,
  };
}

async function analyzeVideo(args, env) {
  const prompt = requireNonEmptyString(args?.prompt, 'prompt');
  const video = normalizeVideo(args?.video, env);
  const apiKey = requireGeminiKey(env);
  const model = nonEmptyString(args?.model) || env.GEMINI_VIDEO_MODEL || DEFAULT_GEMINI_VIDEO_MODEL;
  const apiVersion = env.GEMINI_API_VERSION || 'v1beta';
  const generationConfig = {};
  const maxOutputTokens = positiveInt(args?.max_output_tokens);
  if (maxOutputTokens) generationConfig.maxOutputTokens = maxOutputTokens;
  if (typeof args?.temperature === 'number' && Number.isFinite(args.temperature)) generationConfig.temperature = args.temperature;

  const { part, source, uploadedFile } = await createGeminiVideoPart(video, env, apiKey, apiVersion);
  const body = {
    contents: [
      {
        role: 'user',
        parts: [
          { text: buildVideoPrompt(prompt, args?.output_schema) },
          part,
        ],
      },
    ],
    ...(Object.keys(generationConfig).length > 0 ? { generationConfig } : {}),
  };
  const endpoint = `${buildGeminiUrl(env.GEMINI_BASE_URL, apiVersion, `/models/${encodeURIComponent(model)}:generateContent`)}?key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await readJson(response);
  if (!response.ok) {
    throw providerError('gemini_video_failed', `Gemini video analysis failed: ${extractProviderError(json, response.statusText)}`, { status: response.status, response: json });
  }

  return {
    provider: 'gemini',
    model,
    text: extractGeminiText(json),
    videoSource: source,
    uploadedFile,
  };
}

function normalizeImages(rawImages, env) {
  if (!Array.isArray(rawImages) || rawImages.length === 0) {
    throw validationError('images must be a non-empty array.');
  }
  const maxDataUrlBytes = numberEnv(env.MAX_IMAGE_DATA_URL_BYTES, DEFAULT_MAX_IMAGE_DATA_URL_BYTES);
  return rawImages.map((raw, index) => {
    if (!raw || typeof raw !== 'object') throw validationError(`images[${index}] must be an object.`);
    if (raw.type !== 'input_image') throw validationError(`images[${index}].type must be "input_image".`);
    const imageUrl = nonEmptyString(raw.image_url);
    const fileId = nonEmptyString(raw.file_id);
    if (!imageUrl && !fileId) throw validationError(`images[${index}] must include image_url or file_id.`);
    if (imageUrl) validateImageUrl(imageUrl, maxDataUrlBytes, `images[${index}].image_url`);
    const detail = raw.detail === 'auto' || raw.detail === 'low' || raw.detail === 'high' ? raw.detail : undefined;
    return {
      type: 'input_image',
      image_url: imageUrl,
      file_id: fileId,
      detail,
      label: nonEmptyString(raw.label),
    };
  });
}

function normalizeVideo(rawVideo, env) {
  if (!rawVideo || typeof rawVideo !== 'object') throw validationError('video must be an object.');
  const candidates = [
    rawVideo.fileData ? 'fileData' : null,
    rawVideo.inlineData ? 'inlineData' : null,
    nonEmptyString(rawVideo.url) ? 'url' : null,
    nonEmptyString(rawVideo.localPath) ? 'localPath' : null,
  ].filter(Boolean);
  if (candidates.length !== 1) {
    throw validationError('video must include exactly one of fileData, inlineData, url, or localPath.');
  }

  const videoMetadata = normalizeVideoMetadata(rawVideo.videoMetadata);
  if (rawVideo.fileData) {
    const fileUri = requireNonEmptyString(rawVideo.fileData.fileUri, 'video.fileData.fileUri');
    return {
      kind: 'fileData',
      fileData: { fileUri, mimeType: nonEmptyString(rawVideo.fileData.mimeType) },
      videoMetadata,
    };
  }
  if (rawVideo.inlineData) {
    const data = requireNonEmptyString(rawVideo.inlineData.data, 'video.inlineData.data');
    const mimeType = requireNonEmptyString(rawVideo.inlineData.mimeType, 'video.inlineData.mimeType');
    const maxInlineVideoBytes = numberEnv(env.MAX_INLINE_VIDEO_BYTES, DEFAULT_MAX_INLINE_VIDEO_BYTES);
    if (estimateBase64Bytes(data) > maxInlineVideoBytes) {
      throw validationError(`video.inlineData exceeds ${maxInlineVideoBytes} bytes. Use fileData, url, or localPath.`);
    }
    return {
      kind: 'inlineData',
      inlineData: { data, mimeType },
      videoMetadata,
    };
  }
  if (nonEmptyString(rawVideo.url)) {
    return {
      kind: 'url',
      url: requireHttpUrl(rawVideo.url, 'video.url'),
      mimeType: nonEmptyString(rawVideo.mimeType),
      videoMetadata,
    };
  }
  return {
    kind: 'localPath',
    localPath: requireNonEmptyString(rawVideo.localPath, 'video.localPath'),
    mimeType: nonEmptyString(rawVideo.mimeType),
    videoMetadata,
  };
}

async function createGeminiVideoPart(video, env, apiKey, apiVersion) {
  if (video.kind === 'fileData') {
    return {
      part: withVideoMetadata({ fileData: compact(video.fileData) }, video.videoMetadata),
      source: 'fileData',
      uploadedFile: null,
    };
  }
  if (video.kind === 'inlineData') {
    return {
      part: withVideoMetadata({ inlineData: video.inlineData }, video.videoMetadata),
      source: 'inlineData',
      uploadedFile: null,
    };
  }
  if (video.kind === 'url') {
    const fileData = compact({ fileUri: video.url, mimeType: video.mimeType });
    return {
      part: withVideoMetadata({ fileData }, video.videoMetadata),
      source: 'url',
      uploadedFile: null,
    };
  }
  const uploadedFile = await uploadGeminiFile(video.localPath, video.mimeType, env, apiKey, apiVersion);
  return {
    part: withVideoMetadata({
      fileData: compact({
        fileUri: uploadedFile.uri,
        mimeType: uploadedFile.mimeType,
      }),
    }, video.videoMetadata),
    source: 'localPath',
    uploadedFile,
  };
}

async function uploadGeminiFile(localPath, providedMimeType, env, apiKey, apiVersion) {
  const stat = statSync(localPath);
  if (!stat.isFile()) throw validationError(`video.localPath is not a file: ${localPath}`);
  const mimeType = providedMimeType || inferVideoMimeType(localPath);
  const displayName = basename(localPath);
  const startUrl = `${buildGeminiUploadUrl(env, apiVersion, '/files')}?key=${encodeURIComponent(apiKey)}`;
  const startResponse = await fetch(startUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-goog-upload-protocol': 'resumable',
      'x-goog-upload-command': 'start',
      'x-goog-upload-header-content-length': String(stat.size),
      'x-goog-upload-header-content-type': mimeType,
    },
    body: JSON.stringify({ file: { display_name: displayName } }),
  });
  if (!startResponse.ok) {
    const json = await readJson(startResponse);
    throw providerError('gemini_file_upload_start_failed', `Gemini File API upload start failed: ${extractProviderError(json, startResponse.statusText)}`, { status: startResponse.status, response: json });
  }
  const uploadUrl = startResponse.headers.get('x-goog-upload-url');
  if (!uploadUrl) throw providerError('gemini_file_upload_url_missing', 'Gemini File API did not return x-goog-upload-url.');

  const bytes = readFileSync(localPath);
  const uploadResponse = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'content-length': String(stat.size),
      'x-goog-upload-offset': '0',
      'x-goog-upload-command': 'upload, finalize',
    },
    body: bytes,
  });
  const uploadJson = await readJson(uploadResponse);
  if (!uploadResponse.ok) {
    throw providerError('gemini_file_upload_failed', `Gemini File API upload failed: ${extractProviderError(uploadJson, uploadResponse.statusText)}`, { status: uploadResponse.status, response: uploadJson });
  }
  const file = uploadJson.file;
  if (!file?.name || !file?.uri) {
    throw providerError('gemini_file_upload_invalid_response', 'Gemini File API upload response did not include file.name and file.uri.', { response: uploadJson });
  }

  const readyFile = await waitForGeminiFile(file, env, apiKey, apiVersion);
  return {
    name: readyFile.name,
    uri: readyFile.uri,
    mimeType: readyFile.mimeType || mimeType,
    state: readyFile.state || null,
    sizeBytes: stat.size,
  };
}

async function waitForGeminiFile(file, env, apiKey, apiVersion) {
  const attempts = numberEnv(env.GEMINI_FILE_POLL_ATTEMPTS, DEFAULT_GEMINI_FILE_POLL_ATTEMPTS);
  const intervalMs = numberEnv(env.GEMINI_FILE_POLL_MS, DEFAULT_GEMINI_FILE_POLL_MS);
  let current = file;
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (!current.state || current.state === 'ACTIVE') return current;
    if (current.state === 'FAILED') {
      throw providerError('gemini_file_processing_failed', `Gemini File API processing failed for ${current.name}.`, { file: current });
    }
    await delay(intervalMs);
    const response = await fetch(`${buildGeminiUrl(env.GEMINI_BASE_URL, apiVersion, `/${current.name}`)}?key=${encodeURIComponent(apiKey)}`);
    const json = await readJson(response);
    if (!response.ok) {
      throw providerError('gemini_file_poll_failed', `Gemini File API polling failed: ${extractProviderError(json, response.statusText)}`, { status: response.status, response: json });
    }
    current = json;
  }
  throw providerError('gemini_file_processing_timeout', `Gemini File API did not finish processing ${file.name} after ${attempts} attempts.`, { file });
}

function buildImagePrompt(prompt, images, outputSchema) {
  const lines = [prompt.trim()];
  if (outputSchema) lines.push(`Analysis style: ${outputSchema}.`);
  if (images.length > 1) {
    lines.push('Images are provided in order. Keep comparisons tied to image labels.');
    lines.push(...images.map((image, index) => `- image_${index + 1}: ${image.label || 'unlabeled'}`));
  }
  return lines.join('\n');
}

function buildVideoPrompt(prompt, outputSchema) {
  const lines = [prompt.trim()];
  if (outputSchema) lines.push(`Analysis style: ${outputSchema}.`);
  return lines.join('\n');
}

function validateImageUrl(value, maxDataUrlBytes, label) {
  if (value.startsWith('data:image/')) {
    if (Buffer.byteLength(value, 'utf8') > maxDataUrlBytes) {
      throw validationError(`${label} exceeds ${maxDataUrlBytes} bytes. Use a smaller image or an OpenAI file_id.`);
    }
    return;
  }
  requireHttpUrl(value, label);
}

function normalizeVideoMetadata(raw) {
  if (!raw) return undefined;
  if (typeof raw !== 'object') throw validationError('video.videoMetadata must be an object.');
  const result = {};
  if (nonEmptyString(raw.startOffset)) result.startOffset = raw.startOffset.trim();
  if (nonEmptyString(raw.endOffset)) result.endOffset = raw.endOffset.trim();
  if (typeof raw.fps === 'number' && Number.isFinite(raw.fps)) result.fps = raw.fps;
  return Object.keys(result).length > 0 ? result : undefined;
}

function withVideoMetadata(part, videoMetadata) {
  return videoMetadata ? { ...part, videoMetadata } : part;
}

function successToolResult(structuredContent) {
  const text = typeof structuredContent?.text === 'string'
    ? structuredContent.text
    : JSON.stringify(structuredContent, null, 2);
  return {
    content: [{ type: 'text', text }],
    structuredContent,
    isError: false,
  };
}

function errorToolResult(code, message, details) {
  return {
    content: [{ type: 'text', text: `${code}: ${message}` }],
    structuredContent: { error: compact({ code, message, details }) },
    isError: true,
  };
}

function jsonRpcResult(id, result) {
  return { jsonrpc: '2.0', id, result };
}

function jsonRpcError(id, code, message, data) {
  return { jsonrpc: '2.0', id, error: compact({ code, message, data }) };
}

function createRuntimeEnv(serverEnv) {
  const env = { ...process.env };
  for (const [key, value] of Object.entries(serverEnv || {})) {
    if (typeof value === 'string') env[key] = value;
  }
  return env;
}

function getOpenAiKey(env) {
  return nonEmptyString(env.OPENAI_API_KEY);
}

function requireOpenAiKey(env) {
  const key = getOpenAiKey(env);
  if (!key) throw providerError('openai_api_key_missing', 'OPENAI_API_KEY is required for analyze_images. Set it in the MCP server Env field or the native host environment.');
  return key;
}

function getGeminiKey(env) {
  return nonEmptyString(env.GEMINI_API_KEY) || nonEmptyString(env.GOOGLE_API_KEY) || nonEmptyString(env.GOOGLE_GEMINI_API_KEY);
}

function requireGeminiKey(env) {
  const key = getGeminiKey(env);
  if (!key) throw providerError('gemini_api_key_missing', 'GEMINI_API_KEY is required for analyze_video. Set it in the MCP server Env field or the native host environment.');
  return key;
}

function requireHttpUrl(value, label) {
  const text = requireNonEmptyString(value, label);
  let url;
  try {
    url = new URL(text);
  } catch {
    throw validationError(`${label} must be a valid http(s) URL.`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw validationError(`${label} must be a valid http(s) URL.`);
  }
  return text;
}

function requireNonEmptyString(value, label) {
  const text = nonEmptyString(value);
  if (!text) throw validationError(`${label} must be a non-empty string.`);
  return text;
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function positiveInt(value) {
  return Number.isInteger(value) && value > 0 ? value : null;
}

function numberEnv(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function estimateBase64Bytes(value) {
  return Math.floor(value.replace(/\s/g, '').length * 0.75);
}

function trimTrailingSlash(value) {
  return value.replace(/\/+$/, '');
}

function normalizeOpenAiBaseUrl(value) {
  return trimTrailingSlash(value || DEFAULT_OPENAI_BASE_URL);
}

function normalizeGeminiBaseUrl(value) {
  return trimTrailingSlash(value || DEFAULT_GEMINI_BASE_URL);
}

function buildGeminiUrl(baseUrl, apiVersion, path) {
  return buildVersionedGeminiUrl(normalizeGeminiBaseUrl(baseUrl), apiVersion, path);
}

function buildVersionedGeminiUrl(baseUrl, apiVersion, path) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  if (baseUrl.endsWith(`/${apiVersion}`)) return `${baseUrl}${normalizedPath}`;
  return `${baseUrl}/${apiVersion}${normalizedPath}`;
}

function buildGeminiUploadUrl(env, apiVersion, path) {
  const uploadBase = env.GEMINI_UPLOAD_BASE_URL
    ? normalizeGeminiBaseUrl(env.GEMINI_UPLOAD_BASE_URL)
    : `${geminiRootBaseUrl(env.GEMINI_BASE_URL, apiVersion)}/upload`;
  return buildVersionedGeminiUrl(uploadBase, apiVersion, path);
}

function geminiRootBaseUrl(baseUrl, apiVersion) {
  const normalized = normalizeGeminiBaseUrl(baseUrl);
  return normalized.endsWith(`/${apiVersion}`)
    ? normalized.slice(0, -apiVersion.length - 1)
    : normalized;
}

function compact(value) {
  const result = {};
  for (const [key, item] of Object.entries(value)) {
    if (item !== undefined && item !== null && item !== '') result[key] = item;
  }
  return result;
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { text };
  }
}

function extractProviderError(json, fallback) {
  if (typeof json?.error?.message === 'string') return json.error.message;
  if (typeof json?.error === 'string') return json.error;
  if (typeof json?.message === 'string') return json.message;
  if (typeof json?.text === 'string') return json.text.slice(0, 500);
  return fallback || 'provider_error';
}

function extractOpenAiResponseText(json) {
  if (typeof json.output_text === 'string' && json.output_text.trim()) return json.output_text.trim();
  const texts = [];
  for (const item of Array.isArray(json.output) ? json.output : []) {
    for (const content of Array.isArray(item?.content) ? item.content : []) {
      if (typeof content?.text === 'string') texts.push(content.text);
    }
  }
  const combined = texts.join('\n').trim();
  if (!combined) throw providerError('openai_image_empty_response', 'OpenAI returned no output text.', { response: json });
  return combined;
}

function extractGeminiText(json) {
  const texts = [];
  for (const candidate of Array.isArray(json.candidates) ? json.candidates : []) {
    for (const part of Array.isArray(candidate?.content?.parts) ? candidate.content.parts : []) {
      if (typeof part?.text === 'string') texts.push(part.text);
    }
  }
  const combined = texts.join('\n').trim();
  if (!combined) throw providerError('gemini_video_empty_response', 'Gemini returned no output text.', { response: json });
  return combined;
}

function inferVideoMimeType(filePath) {
  switch (extname(filePath).toLowerCase()) {
    case '.mov': return 'video/quicktime';
    case '.webm': return 'video/webm';
    case '.mkv': return 'video/x-matroska';
    case '.avi': return 'video/x-msvideo';
    case '.mpeg':
    case '.mpg': return 'video/mpeg';
    case '.mp4':
    default:
      return 'video/mp4';
  }
}

function getSiliconFlowKey(env) {
  return nonEmptyString(env.SILICONFLOW_API_KEY);
}

function requireSiliconFlowKey(env) {
  const key = getSiliconFlowKey(env);
  if (!key) throw providerError('siliconflow_api_key_missing', 'SILICONFLOW_API_KEY is required. Set it in the MCP server Env field or the native host environment.');
  return key;
}

function normalizeSiliconFlowBaseUrl(value) {
  return trimTrailingSlash(value || DEFAULT_SILICONFLOW_BASE_URL);
}

async function analyzeImagesSiliconFlow(args, env) {
  const prompt = requireNonEmptyString(args?.prompt, 'prompt');
  const images = normalizeSiliconFlowImages(args?.images, env);
  const apiKey = requireSiliconFlowKey(env);
  const model = nonEmptyString(args?.model) || env.SILICONFLOW_IMAGE_MODEL || DEFAULT_SILICONFLOW_IMAGE_MODEL;
  const content = [
    { type: 'text', text: buildImagePrompt(prompt, images, args?.output_schema) },
    ...images.map((image) => ({
      type: 'image_url',
      image_url: compact({ url: image.url, detail: image.detail }),
    })),
  ];
  const body = {
    model,
    messages: [{ role: 'user', content }],
  };
  const maxTokens = positiveInt(args?.max_tokens);
  if (maxTokens) body.max_tokens = maxTokens;

  const response = await fetch(`${normalizeSiliconFlowBaseUrl(env.SILICONFLOW_BASE_URL)}/chat/completions`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const json = await readJson(response);
  if (!response.ok) {
    throw providerError('siliconflow_image_failed', `SiliconFlow image analysis failed: ${extractProviderError(json, response.statusText)}`, { status: response.status, response: json });
  }

  const text = extractSiliconFlowText(json);
  return {
    provider: 'siliconflow',
    model,
    text,
    imageCount: images.length,
    labels: images.map((image, index) => image.label || `image_${index + 1}`),
    rawId: typeof json.id === 'string' ? json.id : null,
  };
}

function normalizeSiliconFlowImages(rawImages, env) {
  if (!Array.isArray(rawImages) || rawImages.length === 0) {
    throw validationError('images must be a non-empty array.');
  }
  const maxDataUrlBytes = numberEnv(env.MAX_IMAGE_DATA_URL_BYTES, DEFAULT_MAX_IMAGE_DATA_URL_BYTES);
  return rawImages.map((raw, index) => {
    if (!raw || typeof raw !== 'object') throw validationError(`images[${index}] must be an object.`);
    if (raw.type !== 'image_url') throw validationError(`images[${index}].type must be "image_url".`);
    const imageUrlObj = raw.image_url && typeof raw.image_url === 'object' ? raw.image_url : {};
    const localPath = nonEmptyString(raw.localPath);
    const imageUrl = nonEmptyString(imageUrlObj.url);
    if (localPath && imageUrl) {
      throw validationError(`images[${index}] must include either image_url.url or localPath, not both.`);
    }
    const detail = imageUrlObj.detail === 'auto' || imageUrlObj.detail === 'low' || imageUrlObj.detail === 'high' ? imageUrlObj.detail : undefined;
    let url;
    if (localPath) {
      const mimeType = inferImageMimeType(localPath);
      const stat = statSync(localPath);
      if (!stat.isFile()) throw validationError(`images[${index}].localPath is not a file: ${localPath}`);
      const dataPrefix = `data:${mimeType};base64,`;
      const encodedSize = Buffer.byteLength(dataPrefix) + 4 * Math.ceil(stat.size / 3);
      if (encodedSize > maxDataUrlBytes) {
        throw validationError(`images[${index}].localPath encoded data URL (${encodedSize} bytes) exceeds ${maxDataUrlBytes} bytes. Use an HTTP URL instead.`);
      }
      const bytes = readFileSync(localPath);
      url = `${dataPrefix}${bytes.toString('base64')}`;
    } else if (imageUrl) {
      url = imageUrl;
      if (url.startsWith('data:')) {
        if (Buffer.byteLength(url, 'utf8') > maxDataUrlBytes) {
          throw validationError(`images[${index}].image_url exceeds ${maxDataUrlBytes} bytes. Use a smaller image or an HTTP URL.`);
        }
      } else {
        requireHttpUrl(url, `images[${index}].image_url.url`);
      }
    } else {
      throw validationError(`images[${index}] must include image_url.url or localPath.`);
    }
    return {
      url,
      detail,
      label: nonEmptyString(raw.label),
    };
  });
}

async function analyzeVideoSiliconFlow(args, env) {
  const prompt = requireNonEmptyString(args?.prompt, 'prompt');
  const video = normalizeSiliconFlowVideo(args?.video, env);
  const apiKey = requireSiliconFlowKey(env);
  const model = nonEmptyString(args?.model) || env.SILICONFLOW_VIDEO_MODEL || DEFAULT_SILICONFLOW_VIDEO_MODEL;
  const videoUrlObj = compact({
    url: video.url,
    detail: video.detail,
    max_frames: video.max_frames,
    fps: video.fps,
  });
  const content = [
    { type: 'text', text: buildVideoPrompt(prompt, args?.output_schema) },
    { type: 'video_url', video_url: videoUrlObj },
  ];
  const body = {
    model,
    messages: [{ role: 'user', content }],
  };
  const maxTokens = positiveInt(args?.max_tokens);
  if (maxTokens) body.max_tokens = maxTokens;
  if (typeof args?.temperature === 'number' && Number.isFinite(args.temperature)) body.temperature = args.temperature;

  const response = await fetch(`${normalizeSiliconFlowBaseUrl(env.SILICONFLOW_BASE_URL)}/chat/completions`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const json = await readJson(response);
  if (!response.ok) {
    throw providerError('siliconflow_video_failed', `SiliconFlow video analysis failed: ${extractProviderError(json, response.statusText)}`, { status: response.status, response: json });
  }

  return {
    provider: 'siliconflow',
    model,
    text: extractSiliconFlowText(json),
    videoSource: video.source,
    rawId: typeof json.id === 'string' ? json.id : null,
  };
}

function normalizeSiliconFlowVideo(rawVideo, env) {
  if (!rawVideo || typeof rawVideo !== 'object') throw validationError('video must be an object.');
  const url = nonEmptyString(rawVideo.url);
  const localPath = nonEmptyString(rawVideo.localPath);
  if (url && localPath) {
    throw validationError('video must include either url or localPath, not both.');
  }
  if (!url && !localPath) {
    throw validationError('video must include url or localPath.');
  }
  const maxInlineVideoBytes = numberEnv(env.MAX_INLINE_VIDEO_BYTES, DEFAULT_MAX_INLINE_VIDEO_BYTES);
  let resolvedUrl;
  let source;
  if (localPath) {
    const mimeType = nonEmptyString(rawVideo.mimeType) || inferVideoMimeType(localPath);
    const stat = statSync(localPath);
    if (!stat.isFile()) throw validationError(`video.localPath is not a file: ${localPath}`);
    const dataPrefix = `data:${mimeType};base64,`;
    const encodedSize = Buffer.byteLength(dataPrefix) + 4 * Math.ceil(stat.size / 3);
    if (encodedSize > maxInlineVideoBytes) {
      throw validationError(`video.localPath encoded data URL (${encodedSize} bytes) exceeds ${maxInlineVideoBytes} bytes. Use an HTTP URL instead.`);
    }
    const bytes = readFileSync(localPath);
    resolvedUrl = `${dataPrefix}${bytes.toString('base64')}`;
    source = 'localPath';
  } else if (url.startsWith('data:')) {
    if (Buffer.byteLength(url, 'utf8') > maxInlineVideoBytes) {
      throw validationError(`video data URL exceeds ${maxInlineVideoBytes} bytes. Use an HTTP URL instead.`);
    }
    resolvedUrl = url;
    source = 'inlineData';
  } else {
    requireHttpUrl(url, 'video.url');
    resolvedUrl = url;
    source = 'url';
  }
  const detail = rawVideo.detail === 'auto' || rawVideo.detail === 'low' || rawVideo.detail === 'high' ? rawVideo.detail : undefined;
  const maxFrames = Number.isInteger(rawVideo.max_frames) && rawVideo.max_frames > 0 ? rawVideo.max_frames : undefined;
  const fps = typeof rawVideo.fps === 'number' && Number.isFinite(rawVideo.fps) && rawVideo.fps > 0 ? rawVideo.fps : undefined;
  return { url: resolvedUrl, detail, max_frames: maxFrames, fps, source };
}

function extractSiliconFlowText(json) {
  const texts = [];
  for (const choice of Array.isArray(json.choices) ? json.choices : []) {
    if (typeof choice?.message?.content === 'string') texts.push(choice.message.content);
  }
  const combined = texts.join('\n').trim();
  if (!combined) throw providerError('siliconflow_empty_response', 'SiliconFlow returned no output text.', { response: json });
  return combined;
}

function inferImageMimeType(filePath) {
  switch (extname(filePath).toLowerCase()) {
    case '.png': return 'image/png';
    case '.gif': return 'image/gif';
    case '.bmp': return 'image/bmp';
    case '.webp': return 'image/webp';
    case '.svg': return 'image/svg+xml';
    case '.jpg':
    case '.jpeg':
    default:
      return 'image/jpeg';
  }
}

function validationError(message) {
  return Object.assign(new Error(message), { code: 'invalid_media_input' });
}

function providerError(code, message, details) {
  return Object.assign(new Error(message), { code, details });
}
