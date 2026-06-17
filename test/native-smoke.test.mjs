import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleMcpMessage, HOST_NAME, SERVER_NAME } from '../lib/server.mjs';

test('initializes as an MCP server', async () => {
  const response = await handleMcpMessage({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {},
  });

  assert.equal(response.jsonrpc, '2.0');
  assert.equal(response.id, 1);
  assert.equal(response.result.serverInfo.name, SERVER_NAME);
});

test('native messaging host writes framed initialize responses', async (t) => {
  const hostPath = fileURLToPath(new URL('../native/multimodal-mcp-host.mjs', import.meta.url));
  const child = spawn(process.execPath, [hostPath], { stdio: ['pipe', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  t.after(() => {
    child.kill();
  });

  child.stdin.write(nativeFrame({
    protocol: 'deepseek-pp-mcp-native',
    version: 1,
    server: { env: {} },
    message: {
      jsonrpc: '2.0',
      id: 11,
      method: 'initialize',
      params: {},
    },
  }));

  const response = await readNativeFrame(child.stdout);
  assert.equal(stderr, '');
  assert.equal(response.jsonrpc, '2.0');
  assert.equal(response.id, 11);
  assert.equal(response.result.serverInfo.name, SERVER_NAME);
});

test('lists multimodal tools', async () => {
  const response = await handleMcpMessage({
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/list',
  });

  const toolNames = response.result.tools.map((tool) => tool.name);
  assert.deepEqual(toolNames, ['vision_status', 'analyze_images', 'analyze_video']);
});

test('reports status without uploading media', async () => {
  const response = await handleMcpMessage({
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: { name: 'vision_status', arguments: {} },
  }, {
    env: {
      OPENAI_API_KEY: 'test-openai',
      GEMINI_API_KEY: 'test-gemini',
    },
  });

  assert.equal(response.result.isError, false);
  assert.equal(response.result.structuredContent.openai.configured, true);
  assert.equal(response.result.structuredContent.gemini.configured, true);
});

test('fails image calls clearly when OpenAI key is missing', async () => {
  const response = await handleMcpMessage({
    jsonrpc: '2.0',
    id: 4,
    method: 'tools/call',
    params: {
      name: 'analyze_images',
      arguments: {
        prompt: 'Describe this.',
        images: [{ type: 'input_image', image_url: 'https://example.com/image.png' }],
      },
    },
  });

  assert.equal(response.result.isError, true);
  assert.equal(response.result.structuredContent.error.code, 'openai_api_key_missing');
});

test('rejects empty image arrays before provider calls', async () => {
  const response = await handleMcpMessage({
    jsonrpc: '2.0',
    id: 5,
    method: 'tools/call',
    params: {
      name: 'analyze_images',
      arguments: {
        prompt: 'Describe this.',
        images: [],
      },
    },
  }, {
    env: { OPENAI_API_KEY: 'test-openai' },
  });

  assert.equal(response.result.isError, true);
  assert.equal(response.result.structuredContent.error.code, 'invalid_media_input');
});

test('rejects ambiguous video sources before provider calls', async () => {
  const response = await handleMcpMessage({
    jsonrpc: '2.0',
    id: 6,
    method: 'tools/call',
    params: {
      name: 'analyze_video',
      arguments: {
        prompt: 'Summarize this.',
        video: {
          url: 'https://example.com/video.mp4',
          fileData: { fileUri: 'https://example.com/other.mp4' },
        },
      },
    },
  }, {
    env: { GEMINI_API_KEY: 'test-gemini' },
  });

  assert.equal(response.result.isError, true);
  assert.equal(response.result.structuredContent.error.code, 'invalid_media_input');
});

test('fails video calls clearly when Gemini key is missing', async () => {
  const response = await handleMcpMessage({
    jsonrpc: '2.0',
    id: 7,
    method: 'tools/call',
    params: {
      name: 'analyze_video',
      arguments: {
        prompt: 'Summarize this.',
        video: { url: 'https://example.com/video.mp4' },
      },
    },
  });

  assert.equal(response.result.isError, true);
  assert.equal(response.result.structuredContent.error.code, 'gemini_api_key_missing');
});

test('uses custom OpenAI base URL for image analysis', async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = '';
  globalThis.fetch = async (url) => {
    requestedUrl = String(url);
    return new Response(JSON.stringify({ output_text: 'custom openai ok' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  try {
    const response = await handleMcpMessage({
      jsonrpc: '2.0',
      id: 8,
      method: 'tools/call',
      params: {
        name: 'analyze_images',
        arguments: {
          prompt: 'Describe this.',
          images: [{ type: 'input_image', image_url: 'https://example.com/image.png' }],
        },
      },
    }, {
      env: {
        OPENAI_API_KEY: 'test-openai',
        OPENAI_BASE_URL: 'https://openai-proxy.example/v1',
      },
    });

    assert.equal(response.result.isError, false);
    assert.equal(requestedUrl, 'https://openai-proxy.example/v1/responses');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('uses custom Gemini base URL for video analysis', async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = '';
  globalThis.fetch = async (url) => {
    requestedUrl = String(url);
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'custom gemini ok' }] } }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  try {
    const response = await handleMcpMessage({
      jsonrpc: '2.0',
      id: 9,
      method: 'tools/call',
      params: {
        name: 'analyze_video',
        arguments: {
          prompt: 'Summarize this.',
          video: { url: 'https://example.com/video.mp4' },
        },
      },
    }, {
      env: {
        GEMINI_API_KEY: 'test-gemini',
        GEMINI_BASE_URL: 'https://gemini-proxy.example/v1beta',
      },
    });

    assert.equal(response.result.isError, false);
    assert.equal(requestedUrl, 'https://gemini-proxy.example/v1beta/models/gemini-2.5-flash:generateContent?key=test-gemini');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('uses custom Gemini base URL for local video upload', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'deepseek-pp-multimodal-'));
  const videoPath = join(tmp, 'clip.mp4');
  writeFileSync(videoPath, Buffer.from('fake-video'));

  const originalFetch = globalThis.fetch;
  const requestedUrls = [];
  globalThis.fetch = async (url) => {
    requestedUrls.push(String(url));
    if (requestedUrls.length === 1) {
      return new Response('', {
        status: 200,
        headers: { 'x-goog-upload-url': 'https://upload-session.example/session' },
      });
    }
    if (requestedUrls.length === 2) {
      return new Response(JSON.stringify({
        file: {
          name: 'files/video-1',
          uri: 'https://files.example/video-1',
          mimeType: 'video/mp4',
          state: 'ACTIVE',
        },
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'custom gemini upload ok' }] } }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  try {
    const response = await handleMcpMessage({
      jsonrpc: '2.0',
      id: 10,
      method: 'tools/call',
      params: {
        name: 'analyze_video',
        arguments: {
          prompt: 'Summarize this.',
          video: { localPath: videoPath, mimeType: 'video/mp4' },
        },
      },
    }, {
      env: {
        GEMINI_API_KEY: 'test-gemini',
        GEMINI_BASE_URL: 'https://gemini-proxy.example/v1beta',
      },
    });

    assert.equal(response.result.isError, false);
    assert.deepEqual(requestedUrls, [
      'https://gemini-proxy.example/upload/v1beta/files?key=test-gemini',
      'https://upload-session.example/session',
      'https://gemini-proxy.example/v1beta/models/gemini-2.5-flash:generateContent?key=test-gemini',
    ]);
  } finally {
    globalThis.fetch = originalFetch;
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('exports the native host name expected by DeepSeek++', () => {
  assert.equal(HOST_NAME, 'com.deepseek_pp.multimodal');
});

function nativeFrame(message) {
  const payload = Buffer.from(JSON.stringify(message), 'utf8');
  const frame = Buffer.alloc(4 + payload.length);
  frame.writeUInt32LE(payload.length, 0);
  payload.copy(frame, 4);
  return frame;
}

function readNativeFrame(stream) {
  return new Promise((resolve, reject) => {
    let buffer = Buffer.alloc(0);
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Timed out waiting for native host response.'));
    }, 2_000);
    const onData = (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      if (buffer.length < 4) return;
      const length = buffer.readUInt32LE(0);
      if (buffer.length < 4 + length) return;
      cleanup();
      try {
        resolve(JSON.parse(buffer.subarray(4, 4 + length).toString('utf8')));
      } catch (err) {
        reject(err);
      }
    };
    const onError = (err) => {
      cleanup();
      reject(err);
    };
    const cleanup = () => {
      clearTimeout(timer);
      stream.off('data', onData);
      stream.off('error', onError);
    };
    stream.on('data', onData);
    stream.on('error', onError);
  });
}
