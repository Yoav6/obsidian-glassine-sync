/**
 * Minimal raw-text frontmatter handling for a single flat key (the sync
 * property). Deliberately not a general YAML parser — it only ever touches
 * one line, so it never risks reformatting whatever else is in the block.
 */

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function propertyLineRegex(property: string): RegExp {
	return new RegExp(`^${escapeRegExp(property)}:\\s*(.*)$`);
}

function unquote(value: string): string {
	if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
		return value.slice(1, -1);
	}
	return value;
}

function splitFrontmatter(content: string): { block: string; body: string; hasBlock: boolean } {
	const match = content.match(FRONTMATTER_RE);
	if (!match) return { block: '', body: content, hasBlock: false };
	return { block: match[1], body: content.slice(match[0].length), hasBlock: true };
}

export type SyncProperty = { present: boolean; value: string };

/** Whether the note has the sync property at all, and its raw value (empty string if present but blank). */
export function readSyncProperty(content: string, property: string): SyncProperty {
	const { block, hasBlock } = splitFrontmatter(content);
	if (!hasBlock) return { present: false, value: '' };
	const line = property.length
		? block.split('\n').find((l) => propertyLineRegex(property).test(l))
		: undefined;
	if (!line) return { present: false, value: '' };
	const match = line.match(propertyLineRegex(property));
	return { present: true, value: unquote((match?.[1] ?? '').trim()) };
}

/**
 * Content to send to Glassine: the sync property is this plugin's own
 * bookkeeping, not document content, so it never leaves the vault.
 */
export function stripSyncProperty(content: string, property: string): string {
	const { block, body, hasBlock } = splitFrontmatter(content);
	if (!hasBlock) return content;
	const remaining = block
		.split('\n')
		.filter((line) => !propertyLineRegex(property).test(line))
		.join('\n')
		.trim();
	return remaining ? `---\n${remaining}\n---\n${body}` : body;
}

/** Sets (or inserts) the sync property, leaving the rest of the frontmatter and the body untouched. */
export function setSyncProperty(content: string, property: string, value: string): string {
	const { block, body, hasBlock } = splitFrontmatter(content);
	const line = `${property}: ${value}`;
	if (!hasBlock) return `---\n${line}\n---\n${content}`;
	const lines = block.split('\n');
	const idx = lines.findIndex((l) => propertyLineRegex(property).test(l));
	if (idx === -1) lines.push(line);
	else lines[idx] = line;
	return `---\n${lines.join('\n')}\n---\n${body}`;
}

/** The document slug from a Glassine document URL, ignoring the origin (robust to a later server-URL change). */
export function slugFromUrl(url: string): string | null {
	try {
		const parts = new URL(url).pathname.split('/').filter(Boolean);
		const idx = parts.indexOf('documents');
		if (idx === -1 || !parts[idx + 1]) return null;
		return decodeURIComponent(parts[idx + 1]);
	} catch {
		return null;
	}
}
