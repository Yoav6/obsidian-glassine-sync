/**
 * Finding image embeds in note text — pure string logic, no Obsidian API, so
 * it's easy to test on its own. Glassine's own renderer only understands
 * plain markdown `![]()` embeds (see documentation/sync-api.md on the
 * server), so content pushed there needs Obsidian's `![[wiki-style]]` embeds
 * translated; content pulled from there is always already plain markdown.
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

/** Every local image embed in a note, in whichever syntax Obsidian wrote it. */
export function extractLocalImageEmbeds(content: string): ImageEmbed[] {
	return [...wikiImageEmbeds(content), ...markdownImageEmbeds(content)];
}

/** Local image embeds already in Glassine's own markdown form — all a pulled document will ever contain. */
export function extractPlainImageEmbeds(content: string): ImageEmbed[] {
	return [...markdownImageEmbeds(content)];
}

/**
 * `encodeURIComponent` leaves `(` and `)` unescaped, which breaks this
 * module's own (non-CommonMark, no-balanced-parens) link destination regex —
 * and a colliding filename gets a literal `" (2)"` suffix from Glassine's own
 * `uniqueAssetRelativePath`, so this isn't a hypothetical case.
 */
function encodePathSegment(part: string): string {
	return encodeURIComponent(part).replace(/[()]/g, (c) => (c === '(' ? '%28' : '%29'));
}

/** The markdown embed Glassine's renderer understands, for a resolved vault-relative path. */
export function markdownEmbed(vaultPath: string, alias: string | null): string {
	const encoded = vaultPath.split('/').map(encodePathSegment).join('/');
	return `![${alias ?? ''}](${encoded})`;
}
