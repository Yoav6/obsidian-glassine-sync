import { TFile, type App } from 'obsidian';
import type { GlassineClient } from './api';
import { extractLocalImageEmbeds, extractPlainImageEmbeds, markdownEmbed } from './embeds';

function dirname(path: string): string {
	const idx = path.lastIndexOf('/');
	return idx === -1 ? '' : path.slice(0, idx);
}

async function ensureFolder(app: App, path: string): Promise<void> {
	if (!path || app.vault.getAbstractFileByPath(path)) return;
	await app.vault.createFolder(path).catch(() => {
		/* another sync may have just created it */
	});
}

function bytesEqual(a: ArrayBuffer, b: ArrayBuffer): boolean {
	if (a.byteLength !== b.byteLength) return false;
	const x = new Uint8Array(a);
	const y = new Uint8Array(b);
	for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
	return true;
}

function contentTypeFor(extension: string): string {
	switch (extension.toLowerCase()) {
		case 'jpg':
		case 'jpeg':
			return 'image/jpeg';
		case 'svg':
			return 'image/svg+xml';
		case 'ico':
			return 'image/x-icon';
		default:
			return `image/${extension.toLowerCase()}`;
	}
}

/**
 * Uploads every local image a note embeds — wiki- or markdown-style — and
 * rewrites the *outgoing* text to Glassine's own plain markdown embed syntax,
 * the only form its renderer understands. The local file itself, and its own
 * embed syntax, are never touched.
 */
export async function resolveOutgoingImages(
	app: App,
	sourcePath: string,
	content: string,
	client: GlassineClient
): Promise<string> {
	const embeds = extractLocalImageEmbeds(content);
	if (!embeds.length) return content;
	let next = content;
	for (const embed of embeds) {
		const target = app.metadataCache.getFirstLinkpathDest(embed.linkpath, sourcePath);
		if (!(target instanceof TFile)) continue;
		const data = await app.vault.readBinary(target);
		await client.pushAsset(target.path, data, contentTypeFor(target.extension));
		next = next.split(embed.raw).join(markdownEmbed(target.path, embed.alias));
	}
	return next;
}

/**
 * Downloads every local image a pulled document embeds, writing or updating
 * it at the vault-relative path Glassine's markdown already names. A failed
 * download for one embed (e.g. a stale/unresolvable reference) is skipped
 * rather than failing the whole pull.
 */
export async function applyIncomingImages(app: App, content: string, client: GlassineClient): Promise<void> {
	for (const embed of extractPlainImageEmbeds(content)) {
		const path = embed.linkpath.replace(/^\/+/, '');
		let data: ArrayBuffer;
		try {
			data = await client.pullAsset(path);
		} catch {
			continue;
		}
		const existing = app.vault.getAbstractFileByPath(path);
		if (existing instanceof TFile) {
			const current = await app.vault.readBinary(existing);
			if (bytesEqual(current, data)) continue;
			await app.vault.modifyBinary(existing, data);
		} else {
			await ensureFolder(app, dirname(path));
			await app.vault.createBinary(path, data);
		}
	}
}
