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

/* eslint-disable no-underscore-dangle */

import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest';
import {Backend} from '../ext/js/background/backend.js';

// eslint-disable-next-line @typescript-eslint/unbound-method
const onMessageExternal = Backend.prototype._onMessageExternal;

/**
 * @returns {{_prepareCompletePromise: Promise<void>}} Test backend context.
 */
function createContext() {
    return {
        _prepareCompletePromise: Promise.resolve(),
    };
}

const updateTab = vi.fn().mockResolvedValue({});

beforeEach(() => {
    updateTab.mockReset().mockResolvedValue({});
    vi.stubGlobal('chrome', {
        runtime: {getURL: (/** @type {string} */ path) => `safari-web-extension://test-id${path}`},
        tabs: {update: updateTab},
    });
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('external search bridge', () => {
    test.each([
        void 0,
        'invalid',
        'http://yomitan.ogiso.me/open/search',
        'https://yomitan.ogiso.me.evil.example/',
        'https://other.ogiso.me/',
    ])('rejects untrusted sender %s', async (url) => {
        const context = createContext();
        const respond = vi.fn();
        expect(onMessageExternal.call(context, {action: 'openSearchPage'}, {url}, respond)).toBe(false);
        await Promise.resolve();
        expect(respond).not.toHaveBeenCalled();
        expect(updateTab).not.toHaveBeenCalled();
    });

    test.each([null, {}, {action: 'getAllSettings'}, {action: 'openSearchPage', query: 42}])('rejects invalid requests %j', (message) => {
        const context = createContext();
        const respond = vi.fn();
        expect(onMessageExternal.call(context, message, {url: 'https://yomitan.ogiso.me/open/search'}, respond)).toBe(false);
        expect(respond).toHaveBeenCalledWith({ok: false, error: 'Invalid search request'});
        expect(updateTab).not.toHaveBeenCalled();
    });

    test('waits for initialization and preserves the query', async () => {
        const context = createContext();
        let ready = () => {};
        context._prepareCompletePromise = new Promise((resolve) => { ready = resolve; });
        const response = new Promise((resolve) => {
            expect(onMessageExternal.call(context, {action: 'openSearchPage', query: '日本語 & #?'}, {url: 'https://yomitan.ogiso.me/open/search', tab: {id: 42, index: 0, windowId: 1, active: true, highlighted: true, pinned: false, incognito: false, selected: true, discarded: false, autoDiscardable: true, groupId: -1}}, resolve)).toBe(true);
        });
        expect(updateTab).not.toHaveBeenCalled();
        ready();
        expect(await response).toEqual({ok: true});
        expect(updateTab).toHaveBeenCalledTimes(1);
        expect(updateTab).toHaveBeenCalledWith(42, {url: 'safari-web-extension://test-id/search.html?query=%E6%97%A5%E6%9C%AC%E8%AA%9E+%26+%23%3F'});
    });

    test('does not navigate an unrelated tab when sender has no tab', () => {
        const respond = vi.fn();
        expect(onMessageExternal.call(createContext(), {action: 'openSearchPage'}, {url: 'https://yomitan.ogiso.me/'}, respond)).toBe(false);
        expect(updateTab).not.toHaveBeenCalled();
        expect(respond).toHaveBeenCalledWith({ok: false, error: 'Missing source tab'});
    });

    test('opens without a query and reports failures', async () => {
        const context = createContext();
        updateTab.mockRejectedValue(new Error('Tab unavailable'));
        const response = await new Promise(/** @param {(value: unknown) => void} resolve */ (resolve) => {
            onMessageExternal.call(context, {action: 'openSearchPage'}, {url: 'https://yomitan.ogiso.me/', tab: {id: 42, index: 0, windowId: 1, active: true, highlighted: true, pinned: false, incognito: false, selected: true, discarded: false, autoDiscardable: true, groupId: -1}}, resolve);
        });
        expect(updateTab).toHaveBeenCalledWith(42, {url: 'safari-web-extension://test-id/search.html'});
        expect(response).toEqual({ok: false, error: 'Could not open search page'});
    });
});

/* eslint-enable no-underscore-dangle */
