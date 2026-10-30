import { describe, expect, it, vi } from 'vitest';
import { httpUrl, musicInfoOf, qualityOf, requestOptions, scriptInfo, sourcesOf } from '../../../mods/lxSource/protocol.mjs';
import { createProvider } from '../../../mods/lxSource/provider.mjs';

// Regression coverage for LX identities, quality negotiation and host-catalog pagination.
describe('LX source adapter', () => {
    it('rejects QingMusic JSON and oversized scripts', () => {
        expect(() => scriptInfo('{"lines":[]}')).toThrow('missing @name');
        expect(() => scriptInfo('a'.repeat(262145))).toThrow('256 KiB');
        expect(scriptInfo('/**\n * @name Test source\n */\nconst a = 1;').name).toBe('Test source');
    });
    it('only registers mapped platforms with declared playback and supported qualities', () => {
        expect(sourcesOf({ sources: {
            wy: { type: 'music', actions: ['musicUrl'], qualitys: ['128k', 'flac', 'master'] },
            kw: { type: 'music', actions: ['musicUrl'], qualitys: ['128k'] },
            tx: { type: 'music', actions: ['lyric'], qualitys: ['128k'] },
        } })).toEqual({ wy: { actions: ['musicUrl'], qualitys: ['128k', 'flac'] } });
        expect(() => sourcesOf({ status: false, sources: {} })).toThrow();
    });
    it('negotiates only declared qualities without upgrading a low-quality request', () => {
        expect(qualityOf('hires', ['128k', 'flac', 'hires'])).toBe('hires');
        expect(qualityOf('lossless', ['128k', '320k'])).toBe('320k');
        expect(() => qualityOf('standard', ['flac'])).toThrow('not supported');
    });
    it('preserves QQ mids and Kugou hashes without numeric conversion', () => {
        const song = { id: '001AbC', title: 'Song', artists: ['Artist'] };
        expect(musicInfoOf('tx', song).songmid).toBe('001AbC');
        expect(musicInfoOf('kg', song).hash).toBe('001AbC');
    });
    it('rejects executable URLs and embedded credentials', () => {
        expect(() => httpUrl('file:///secret')).toThrow();
        expect(() => httpUrl('https://user:password@example.com')).toThrow();
        expect(httpUrl('https://example.com/a.mp3')).toBe('https://example.com/a.mp3');
    });
    it('converts JSON and form requests with bounded timeouts', () => {
        expect(requestOptions({ method: 'post', body: { id: 1 }, timeout: 999999 })).toMatchObject({
            method: 'POST', body: '{"id":1}', timeoutMs: 30000, headers: { 'Content-Type': 'application/json' },
        });
        expect(requestOptions({ form: { q: 'a b' } }).body).toBe('q=a+b');
        expect(() => requestOptions({ formData: {} })).toThrow('not supported');
    });
    it('serializes concurrent pages and routes catalog reads to the original platform', async () => {
        const searchSongs = vi.fn()
            .mockResolvedValueOnce({ items: [{ id: '1', title: 'One', artist: 'A' }], nextCursor: 'cursor2', total: 2 })
            .mockResolvedValueOnce({ items: [{ id: '2', title: 'Two', artist: 'B' }], nextCursor: null, total: 2 });
        const runtime = { call: vi.fn().mockResolvedValue('https://example.com/music.mp3') };
        const folium = { omni: { searchSongs, describeSong: () => null } };
        const provider = createProvider(folium, runtime, 'tx', { qualitys: ['128k'] }, 'QQ', undefined);
        const [first, second] = await Promise.all([
            provider.search('test', { limit: 1, offset: 0 }), provider.search('test', { limit: 1, offset: 1 }),
        ]);
        expect(first.items[0].id).toBe('1');
        expect(second.items[0].id).toBe('2');
        expect(second.hasMore).toBe(false);
        expect(searchSongs.mock.calls[1][1]).toMatchObject({ providerId: 'qq', cursor: 'cursor2' });
        await provider.getAudioUrl(first.items[0], 'standard');
        expect(runtime.call).toHaveBeenCalledWith(expect.objectContaining({ source: 'tx', info: expect.objectContaining({ type: '128k' }) }));
    });
    it('does not accept a script returning a local file as audio', async () => {
        const provider = createProvider({}, { call: async () => 'file:///private.mp3' }, 'wy', { qualitys: ['128k'] }, 'N', undefined);
        await expect(provider.getAudioUrl({ id: '1', title: 'A', artists: [] }, 'standard')).rejects.toThrow();
    });
});

