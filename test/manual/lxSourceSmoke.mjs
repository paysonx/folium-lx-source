import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { scriptInfo, qualityOf, requestOptions, sourcesOf } from '../../mods/lxSource/protocol.mjs';

// Real-browser regression checks for the opaque worker; no third-party source is downloaded or executed.
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = fileURLToPath(new URL('../../mods/lxSource/', import.meta.url));
const server = createServer(async (request, response) => {
    try {
        const name = new URL(request.url, 'http://localhost').pathname.slice(1);
        if (!name) { response.end('<!doctype html><html lang="en"><body></body></html>'); return; }
        if (!/^[a-zA-Z]+\.mjs$/.test(name)) { response.writeHead(404).end(); return; }
        response.setHeader('Content-Type', 'text/javascript');
        response.end(await readFile(path.join(root, name)));
    } catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
    assert.throws(() => scriptInfo('{"lines":[]}'), /missing @name/);
    assert.throws(() => scriptInfo('a'.repeat(262145)), /256 KiB/);
    assert.equal(qualityOf('hires', ['128k', 'flac']), 'flac');
    assert.throws(() => qualityOf('standard', ['flac']), /not supported/);
    assert.equal(requestOptions({ form: { q: 'a b' } }).body, 'q=a+b');
    assert.throws(() => sourcesOf({ sources: {} }), /no compatible/);
    browser = await chromium.launch({ headless: true, ...(process.env.LX_BROWSER_CHANNEL ? { channel: process.env.LX_BROWSER_CHANNEL } : {}) });
    const page = await browser.newPage();
    page.on('pageerror', error => console.error('[LxSmoke] Browser error', error));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    const results = await page.evaluate(async () => {
        const { createRuntime } = await import('/runtime.mjs');
        const { createController } = await import('/controller.mjs');
        const { createProvider } = await import('/provider.mjs');
        const { default: activate } = await import('/client.mjs');
        const passed = [];
        const check = (condition, name) => { if (!condition) throw new Error(name); passed.push(name); };
        const rejects = async (operation, name) => {
            let failed = false;
            try { await operation(); } catch { failed = true; }
            check(failed, name);
        };
        const fixture = `/** @name Fixture */
            const { on, send, request, EVENT_NAMES } = lx;
            on(EVENT_NAMES.request, async ({ action, info }) => {
                if (action === 'inspect') return [typeof process, typeof require, typeof document, typeof electron];
                if (action === 'network') { try { await fetch('https://example.com'); return false; } catch { return true; } }
                if (action === 'hang') return new Promise(() => {});
                if (action === 'loop') { while (true) {} }
                if (action === 'storage') { try { indexedDB.open('private'); return false; } catch { return true; } }
                if (action === 'http') return new Promise((resolve, reject) => request('https://example.com/json', { method: 'POST', body: { a: 1 } }, (err, res) => err ? reject(err) : resolve(res.body)));
                return 'https://example.com/' + info.musicInfo.songmid + '.mp3';
            });
            send(EVENT_NAMES.inited, { sources: { wy: { type: 'music', actions: ['musicUrl'], qualitys: ['128k', '320k'] } } });`;
        const registrations = new Map();
        const commands = new Map();
        const data = new Map();
        const requests = [];
        const folium = {
            env: { context: 'main' }, host: { folium: { major: 1, minor: 7 } },
            registries: { commands: { register(def) { commands.set(def.id, def); } } },
            storage: { get: async key => data.get(key), set: async (key, value) => data.set(key, value), delete: async key => data.delete(key) },
            net: { fetch: async (url, options) => {
                requests.push({ url, options });
                return { ok: true, status: 200, statusText: 'OK', headers: {}, text: () => url.endsWith('/source.js') ? fixture : '{"url":"https://example.com/a.mp3"}' };
            } },
            omni: {
                listProviders: () => [{ providerId: 'netease', displayName: 'NetEase', origin: 'host', supports: { search: true } }],
                searchSongs: async (_query, options) => ({ items: [{ id: options.cursor ? '2' : '1', title: 'Song', artist: 'Singer' }], total: 2, nextCursor: options.cursor ? null : 'next' }),
                describeSong: () => ({ durationMs: 1000 }),
                resolveSongs: async keys => keys.map(key => ({ status: 'found', song: { ...key, title: 'Song', artist: 'Singer' } })),
                getLyrics: async () => ({ lines: [{ startTime: 0, endTime: 1, fullText: 'Hello', words: [{ startTime: 0, endTime: 1, text: 'Hello' }], translation: '你好' }], isWordByWord: true }),
            },
            experimental: { 'omni.providers': { register(def) {
                if (registrations.has(def.id)) throw new Error('duplicate provider');
                registrations.set(def.id, def);
                return { unregister: () => registrations.delete(def.id) };
            } } },
        };
        const runtime = createRuntime(folium, fixture, { timeoutMs: 2000 });
        const sources = await runtime.ready;
        check(sources.wy.qualitys.length === 2, 'initialization handshake');
        check((await runtime.call({ action: 'inspect' })).every(value => value === 'undefined'), 'no Node / Electron / DOM in script');
        check(await runtime.call({ action: 'network' }), 'CSP blocks direct script network');
        check(await runtime.call({ action: 'storage' }), 'opaque origin blocks IndexedDB');
        check((await runtime.call({ action: 'http' })).url === 'https://example.com/a.mp3', 'HTTP callback receives parsed JSON');
        check(requests[0].options.body === '{"a":1}', 'HTTP body bridge');
        const provider = createProvider(folium, runtime, 'wy', sources.wy, 'NetEase');
        const [first, second] = await Promise.all([provider.search('q', { limit: 1, offset: 0 }), provider.search('q', { limit: 1, offset: 1 })]);
        check(first.items[0].id === '1' && second.items[0].id === '2' && !second.hasMore, 'concurrent cursor pagination');
        check((await provider.getAudioUrl(first.items[0], 'high')).url.endsWith('/1.mp3'), 'search result routes through LX playback');
        check((await provider.getLyrics(first.items[0])).wordByWord.format === 'enhanced-lrc', 'word timing lyrics conversion');
        runtime.dispose();
        await rejects(() => runtime.call({}), 'disposed runtime rejects calls');
        const hanging = createRuntime(folium, fixture, { timeoutMs: 300, initTimeoutMs: 3000 });
        await hanging.ready;
        await rejects(() => hanging.call({ action: 'loop' }), 'busy worker is terminated on timeout');
        check(!hanging.active, 'timed-out runtime is inactive');
        const failed = createRuntime(folium, '/** @name Broken */ throw new Error("broken");', { timeoutMs: 500 });
        await rejects(() => failed.ready, 'script exception rejects initialization');
        check(document.querySelectorAll('iframe').length === 0, 'failed and stopped sandboxes removed');
        const controller = createController(folium);
        await controller.initialize();
        await controller.import(fixture);
        check(registrations.size === 1 && data.get('source').enabled, 'import registers and persists source');
        await rejects(() => controller.import('/** @name Broken */ throw new Error("broken");'), 'bad replacement rejected');
        check(registrations.size === 1 && data.get('source').rawScript === fixture, 'failed initialization keeps previous source');
        const persist = folium.storage.set;
        folium.storage.set = async () => { throw new Error('disk full'); };
        await rejects(() => controller.import(fixture.replace('Fixture', 'Replacement')), 'storage failure rejects replacement');
        folium.storage.set = persist;
        check(registrations.size === 1 && controller.status().startsWith('Fixture'), 'storage failure restores old provider');
        check((await registrations.get('wy').getAudioUrl({ id: '1', title: 'Song', artists: [] }, 'standard')).url.endsWith('/1.mp3'), 'restored provider still plays');
        await controller.disable();
        check(registrations.size === 0 && !data.get('source').enabled, 'disable persists and unregisters');
        await controller.enable();
        check(registrations.size === 1, 'saved script can be enabled again');
        await controller.remove();
        check(registrations.size === 0 && !data.has('source'), 'remove deletes saved script');
        controller.dispose();
        const stop = await activate(folium);
        check(commands.size === 6, 'all user commands registered');
        const beforeConsent = requests.length;
        await rejects(() => commands.get('import-url').run({ values: { url: 'https://example.com/source.js' } }), 'URL import requires explicit consent');
        await rejects(() => commands.get('import-file').run({ values: {} }), 'file import requires explicit consent');
        await rejects(() => commands.get('enable').run({ values: {} }), 'enable requires explicit consent');
        check(requests.length === beforeConsent && registrations.size === 0, 'no download or execution before consent');
        await commands.get('import-url').run({ values: { url: 'https://example.com/source.js', consent: true } });
        check(registrations.size === 1, 'URL import command activates source');
        stop();
        check(registrations.size === 0 && document.querySelectorAll('iframe').length === 0, 'mod teardown cleans providers and workers');
        const stopRestored = await activate(folium);
        check(registrations.size === 1, 'restart restores the saved script');
        stopRestored();
        data.set('source', { rawScript: fixture, enabled: true });
        const stopLegacy = await activate(folium);
        check(registrations.size === 0, 'legacy script waits for explicit consent');
        stopLegacy();
        return passed;
    });
    for (const name of results) console.log(`[LxSmoke] PASS ${name}`);
    console.log(`[LxSmoke] ${results.length} browser checks and 6 protocol checks passed`);
    for (const filename of process.argv.slice(2)) {
        const rawScript = await readFile(filename, 'utf8');
        const result = await page.evaluate(async raw => {
            const { createRuntime } = await import('/runtime.mjs');
            const runtime = createRuntime({ net: { fetch: async () => ({
                status: 200, statusText: 'OK', headers: {}, text: () => '{}',
            }) } }, raw, { timeoutMs: 3000 });
            try {
                const sources = await runtime.ready;
                return { name: runtime.info.name, platforms: Object.keys(sources) };
            } finally { runtime.dispose(); }
        }, rawScript);
        console.log(`[LxSmoke] INITIALIZED ${JSON.stringify(result)} (mock network; playback not tested)`);
    }
} finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
}

