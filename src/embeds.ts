/**
 * Finding image embeds in note text — pure string logic, no Obsidian API, so
 * it's easy to test on its own. Glassine understands both plain markdown
 * `![]()` and Obsidian's own `![[wiki-style]]` embeds natively (see
 * documentation/sync-api.md on the server), so pushing an embed never needs
 * to change its syntax — only its path, since a wiki-embed's link may rely on
 * Obsidian's vault-wide fuzzy filename resolution, which Glassine doesn't
 * have, so it's substituted for the fully-resolved vault path before pushing.
 *
 * Only wiki-style embeds are treated as local images to upload on push. A
 * plain `![]()` markdown image is left exactly as written and never uploaded
 * — it's far more likely to already be a URL Glassine can display as-is (its
 * renderer resolves an absolute URL directly) than a local file the user
 * wants duplicated onto the server. Pulling is unaffected by that
 * restriction: content coming *from* Glassine may contain either syntax
 * (whatever's actually stored), and both are downloaded the same way.
 */

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif', 'bmp', 'ico']);

export function isImagePath(path: string): boolean {
	const dot = path.lastIndexOf('.');
	if (dot <= 0) return false;
	return IMAGE_EXTENSIONS.has(path.slice(dot + 1).toLowerCase());
}

/** Absolute / data / blob URLs — never a local vault file. */
export function isExternalRef(src: string): boolean {
	const trimmed = src.trim();
	if (!trimmed) return true;
	return /^[a-z][a-z0-9+.-]*:/i.test(trimmed) || trimmed.startsWith('//');
}

export type ImageEmbed = { raw: string; linkpath: string; alias: string | null };

const WIKI_EMBED_RE = /!\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?]]/g;
const MD_EMBED_RE = /!\[([^\]]*)]\(([^)\s]+)(?:\s+(?:"[^"]*"|'[^']*'))?\)/g;

function* wikiImageEmbeds(content: string): Generator<ImageEmbed> {
	for (const m of content.matchAll(WIKI_EMBED_RE)) {
		const linkpath = m[1].trim();
		if (!isImagePath(linkpath)) continue;
		yield { raw: m[0], linkpath, alias: m[2]?.trim() || null };
	}
}

function* markdownImageEmbeds(content: string): Generator<ImageEmbed> {
	for (const m of content.matchAll(MD_EMBED_RE)) {
		const rawDest = m[2].trim();
		if (isExternalRef(rawDest)) continue;
		let linkpath = rawDest;
		try {
			linkpath = decodeURIComponent(rawDest);
		} catch {
			/* keep raw */
		}
		if (!isImagePath(linkpath)) continue;
		yield { raw: m[0], linkpath, alias: m[1]?.trim() || null };
	}
}

/** Local images to upload on push — wiki-style embeds only (see the module doc comment for why). */
export function extractLocalImageEmbeds(content: string): ImageEmbed[] {
	return [...wikiImageEmbeds(content)];
}

/** Local image embeds already naming a real, resolved vault path — everything a pulled document might contain, in either syntax. */
export function extractPlainImageEmbeds(content: string): ImageEmbed[] {
	return [...wikiImageEmbeds(content), ...markdownImageEmbeds(content)];
}

/**
 * The wiki-embed Glassine understands natively, for a resolved vault-relative
 * path — Glassine's own wiki-embed resolution always treats the path as
 * vault-root-relative (see the server's images.ts), matching how a fully
 * resolved Obsidian link path already works, so no leading-slash marker or
 * percent-encoding is needed the way plain markdown links require.
 */
export function wikiEmbed(vaultPath: string, alias: string | null): string {
	return alias ? `![[${vaultPath}|${alias}]]` : `![[${vaultPath}]]`;
}
