import { Notice, TFile, Vault, type FileManager } from 'obsidian';
import { GlassineApiError, type GlassineClient } from './api';
import { readSyncProperty, setSyncProperty, slugFromUrl, stripSyncProperty } from './frontmatter';

const PUSH_DEBOUNCE_MS = 1500;
/**
 * How long to wait, from the first time the sync property is seen present but
 * not resolving to an existing document, before creating a new one. Gives the
 * user a chance to paste an existing document's URL into the property
 * instead. Fixed from that first sighting — further edits don't push it back.
 */
const CREATE_GRACE_MS = 5000;

/**
 * Owns the actual sync behaviour: which files are selected (the frontmatter
 * property), matching them to Glassine documents, and pushing/pulling
 * content. Kept independent of Obsidian's `Plugin` lifecycle so it's easy to
 * reason about on its own.
 */
export class SyncEngine {
	/** The last content (property stripped) this plugin knows the server has, per vault path — the loop guard for both push and pull. */
	private lastKnownServerContent = new Map<string, string>();
	private pushTimers = new Map<string, number>();
	private createTimers = new Map<string, number>();

	constructor(
		private vault: Vault,
		private fileManager: FileManager,
		private getClient: () => GlassineClient | null,
		private getProperty: () => string
	) {}

	/** Debounced push, called on every local edit of a markdown file. */
	scheduleSync(file: TFile): void {
		if (file.extension !== 'md') return;
		const existing = this.pushTimers.get(file.path);
		if (existing) window.clearTimeout(existing);
		const timer = window.setTimeout(() => {
			this.pushTimers.delete(file.path);
			void this.syncFile(file);
		}, PUSH_DEBOUNCE_MS);
		this.pushTimers.set(file.path, timer);
	}

	private async syncFile(file: TFile): Promise<void> {
		const client = this.getClient();
		if (!client) return;
		const property = this.getProperty();
		const content = await this.vault.read(file);
		const sync = readSyncProperty(content, property);
		if (!sync.present) return;

		const slug = sync.value ? slugFromUrl(sync.value) : null;
		if (!slug) {
			// Nothing to push to yet. Wait for CREATE_GRACE_MS of quiet before
			// treating this as "create a new document" — the user may still be
			// about to paste an existing document's URL in.
			this.scheduleCreate(file);
			return;
		}
		this.cancelPendingCreate(file.path);

		const payload = stripSyncProperty(content, property);
		if (this.lastKnownServerContent.get(file.path) === payload) return;
		try {
			await client.push(slug, payload);
			this.lastKnownServerContent.set(file.path, payload);
		} catch (err) {
			this.reportError(file, err);
		}
	}

	private scheduleCreate(file: TFile): void {
		if (this.createTimers.has(file.path)) return;
		const timer = window.setTimeout(() => {
			this.createTimers.delete(file.path);
			void this.createFile(file);
		}, CREATE_GRACE_MS);
		this.createTimers.set(file.path, timer);
	}

	private cancelPendingCreate(path: string): void {
		const existing = this.createTimers.get(path);
		if (existing === undefined) return;
		window.clearTimeout(existing);
		this.createTimers.delete(path);
	}

	private async createFile(file: TFile): Promise<void> {
		const client = this.getClient();
		if (!client) return;
		const property = this.getProperty();
		const content = await this.vault.read(file);
		const sync = readSyncProperty(content, property);
		// The property may have been removed, or resolved to a real document,
		// while we were waiting — either way there's nothing to create.
		if (!sync.present || (sync.value && slugFromUrl(sync.value))) return;

		const payload = stripSyncProperty(content, property);
		try {
			const result = await client.create(file.name, payload);
			await this.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
				fm[property] = result.url;
			});
			this.lastKnownServerContent.set(file.path, payload);
		} catch (err) {
			this.reportError(file, err);
		}
	}

	/** Pulls the current server content into a paired file, if it's changed. Returns whether the file was written to. */
	async pullFile(file: TFile): Promise<boolean> {
		if (file.extension !== 'md') return false;
		const client = this.getClient();
		if (!client) return false;
		const property = this.getProperty();
		const content = await this.vault.read(file);
		const sync = readSyncProperty(content, property);
		if (!sync.present || !sync.value) return false;
		const slug = slugFromUrl(sync.value);
		if (!slug) return false;

		try {
			const remote = await client.pull(slug);
			const localPayload = stripSyncProperty(content, property);
			if (remote.content === localPayload) {
				this.lastKnownServerContent.set(file.path, remote.content);
				return false;
			}
			const next = setSyncProperty(remote.content, property, sync.value);
			this.lastKnownServerContent.set(file.path, remote.content);
			await this.vault.modify(file, next);
			return true;
		} catch (err) {
			this.reportError(file, err);
			return false;
		}
	}

	/** Pulls every given file, returning how many were actually updated. */
	async pullAll(files: TFile[]): Promise<number> {
		let changed = 0;
		for (const file of files) {
			if (await this.pullFile(file)) changed++;
		}
		return changed;
	}

	/** Cancels any pending debounced push/create timers — call on plugin unload. */
	dispose(): void {
		for (const timer of this.pushTimers.values()) window.clearTimeout(timer);
		for (const timer of this.createTimers.values()) window.clearTimeout(timer);
		this.pushTimers.clear();
		this.createTimers.clear();
	}

	private reportError(file: TFile, err: unknown) {
		const message = err instanceof GlassineApiError ? err.message : err instanceof Error ? err.message : String(err);
		new Notice(`Glassine sync failed for "${file.basename}": ${message}`);
	}
}
