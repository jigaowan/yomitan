/*
 * Copyright (C) 2026  Yomitan Authors
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

import {initWasm, Resvg} from '@resvg/resvg-wasm';
import fs from 'fs';
import {createRequire} from 'module';
import path from 'path';

const require = createRequire(import.meta.url);
const rasterSize = 256;
const rasterDirectory = '/images/safari-mask';

/**
 * @param {string} imagePath
 * @returns {string}
 */
function getRasterImagePath(imagePath) {
    const extension = path.posix.extname(imagePath);
    const fileName = path.posix.basename(imagePath, extension);
    return `${rasterDirectory}/${fileName}.png`;
}

/**
 * @param {string} css
 * @param {Set<string>} imagePaths
 * @returns {string}
 */
function replaceDirectMaskImages(css, imagePaths) {
    const pattern = /((?:-webkit-)?mask-image:\s*)url\((\/images\/[^)]+\.svg)\)/g;

    /**
     * @param {string} _match
     * @param {string} prefix
     * @param {string} imagePath
     * @returns {string}
     */
    const replace = (_match, prefix, imagePath) => {
        imagePaths.add(imagePath);
        return `${prefix}url(${getRasterImagePath(imagePath)})`;
    };
    return css.replace(pattern, replace);
}

/**
 * @param {string} css
 * @returns {Map<string, string>}
 */
function getIconMaskImages(css) {
    const results = new Map();
    const pattern = /\.icon\[data-icon=([^\]]+)\][^{]*\{[^}]*--icon-image:\s*url\((\/images\/[^)]+\.svg)\)[^}]*\}/g;
    for (const match of css.matchAll(pattern)) {
        results.set(match[1], match[2]);
    }
    return results;
}

/**
 * @param {Map<string, string>} iconMaskImages
 * @returns {string}
 */
function createIconMaskOverrides(iconMaskImages) {
    const lines = [
        '',
        '',
        '/* Safari can corrupt pages which reuse external SVG masks. The raster',
        ' * mask sources below preserve CSS-controlled icon colors and states. */',
    ];
    for (const [icon, imagePath] of iconMaskImages) {
        lines.push(`.icon[data-icon=${icon}] { --icon-mask-image: url(${getRasterImagePath(imagePath)}); }`);
    }
    lines.push('');
    return lines.join('\n');
}

/**
 * @param {string} webExtensionDirectory
 * @param {Set<string>} imagePaths
 */
async function renderMaskImages(webExtensionDirectory, imagePaths) {
    const resvgDirectory = path.dirname(require.resolve('@resvg/resvg-wasm'));
    await initWasm(fs.readFileSync(path.join(resvgDirectory, 'index_bg.wasm')));

    const outputDirectory = path.join(webExtensionDirectory, rasterDirectory);
    fs.mkdirSync(outputDirectory, {recursive: true});

    for (const imagePath of imagePaths) {
        const source = fs.readFileSync(path.join(webExtensionDirectory, imagePath));
        const renderer = new Resvg(source, {
            fitTo: {mode: 'width', value: rasterSize},
            font: {loadSystemFonts: false},
            shapeRendering: 2,
        });
        const renderedImage = renderer.render();
        const png = renderedImage.asPng();
        renderedImage.free();
        renderer.free();
        fs.writeFileSync(
            path.join(webExtensionDirectory, getRasterImagePath(imagePath)),
            png,
        );
    }
}

/**
 * @param {string} webExtensionDirectory
 */
async function prepareWebExtension(webExtensionDirectory) {
    const materialCssPath = path.join(webExtensionDirectory, 'css/material.css');
    const displayCssPath = path.join(webExtensionDirectory, 'css/display.css');
    const imagePaths = /** @type {Set<string>} */ (new Set());

    let materialCss = fs.readFileSync(materialCssPath, {encoding: 'utf8'});
    const iconMaskImages = getIconMaskImages(materialCss);
    for (const imagePath of iconMaskImages.values()) {
        imagePaths.add(imagePath);
    }
    materialCss = replaceDirectMaskImages(materialCss, imagePaths);
    materialCss += createIconMaskOverrides(iconMaskImages);
    fs.writeFileSync(materialCssPath, materialCss);

    let displayCss = fs.readFileSync(displayCssPath, {encoding: 'utf8'});
    displayCss = replaceDirectMaskImages(displayCss, imagePaths);
    fs.writeFileSync(displayCssPath, displayCss);

    await renderMaskImages(webExtensionDirectory, imagePaths);
}

const webExtensionDirectory = process.argv[2];
if (typeof webExtensionDirectory !== 'string') {
    throw new Error('Usage: node prepare-web-extension.js <web-extension-directory>');
}
await prepareWebExtension(path.resolve(webExtensionDirectory));
