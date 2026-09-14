/*
 * Copyright (C) 2023-2026  Yomitan Authors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import {readFileSync} from 'node:fs';
import {runInContext} from 'node:vm';
import {JSDOM} from 'jsdom';
import {describe, expect, test, vi} from 'vitest';

const base = new URL('../dev/safari/search-bridge/public/', import.meta.url);
const html = readFileSync(new URL('open/search.html', base), 'utf8');
const script = readFileSync(new URL('search.js', base), 'utf8');

/**
 * @param {string} suffix
 * @param {ReturnType<typeof vi.fn>|null} sendMessage
 * @returns {JSDOM}
 */
function loadPage(suffix, sendMessage) {
    const dom = new JSDOM(html, {url: `https://yomitan.ogiso.me/open/search${suffix}`, runScripts: 'outside-only'});
    if (sendMessage !== null) {
        Object.defineProperty(dom.window, 'browser', {value: {runtime: {sendMessage}}, configurable: true});
    }
    runInContext(script, dom.getInternalVMContext());
    return dom;
}

/** @returns {Promise<void>} */
async function flushMessages() {
    await new Promise((resolve) => { setImmediate(resolve); });
}

describe('Safari search website', () => {
    test('decodes the query once, displays it as text and sends a single release request', async () => {
        const query = '日本語 & #? <img src=x onerror=alert(1)> + %20';
        const sendMessage = vi.fn().mockResolvedValue({ok: true});
        const dom = loadPage(`?query=${encodeURIComponent(query)}`, sendMessage);
        try {
            await flushMessages();
            expect(sendMessage).toHaveBeenCalledExactlyOnceWith('dev.setsuna.yomitan.safari.extension (CL5HFM2K24)', {action: 'openSearchPage', query});
            expect(dom.window.document.getElementById('query')?.textContent).toBe(query);
            expect(dom.window.document.querySelector('img')).toBeNull();
            expect(dom.window.document.getElementById('status')?.textContent).toContain('搜索页已打开');
        } finally {
            dom.window.close();
        }
    });

    test('targets only the debug extension when explicitly requested', async () => {
        const sendMessage = vi.fn().mockResolvedValue({ok: true});
        const dom = loadPage('?build=debug', sendMessage);
        try {
            await flushMessages();
            expect(sendMessage).toHaveBeenCalledExactlyOnceWith('dev.setsuna.yomitan.safari.dev.extension (CL5HFM2K24)', {action: 'openSearchPage', query: ''});
        } finally {
            dom.window.close();
        }
    });

    test('shows setup help without messaging support and can retry after permission is granted', async () => {
        const dom = loadPage('', null);
        try {
            await flushMessages();
            expect(dom.window.document.getElementById('help')?.hidden).toBe(false);
            const sendMessage = vi.fn().mockResolvedValue({ok: true});
            Object.defineProperty(dom.window, 'browser', {value: {runtime: {sendMessage}}});
            dom.window.document.getElementById('open')?.click();
            await flushMessages();
            expect(sendMessage).toHaveBeenCalledTimes(1);
            expect(dom.window.document.getElementById('help')?.hidden).toBe(true);
        } finally {
            dom.window.close();
        }
    });

    test.each([void 0, {ok: false}, {other: true}])('does not claim success for response %j', async (response) => {
        const dom = loadPage('', vi.fn().mockResolvedValue(response));
        try {
            await flushMessages();
            expect(dom.window.document.getElementById('status')?.textContent).toContain('未能打开');
            expect(dom.window.document.getElementById('open')?.textContent).toBe('重试');
        } finally {
            dom.window.close();
        }
    });
});
