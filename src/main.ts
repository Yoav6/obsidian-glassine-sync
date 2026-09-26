import { Notice, Plugin, TFile } from 'obsidian';
import { GlassineClient } from './api';
import { DEFAULT_SETTINGS, GlassineSyncSettingTab, type GlassineSyncSettings } from './settings';
import { SyncEngine } from './sync';

export default class GlassineSyncPlugin extends Plugin {
	settings: GlassineSyncSettings = DEFAULT_SETTINGS;
	private engine!: SyncEngine;
	private pullIntervalId: number | null = null;

	async onload() {
		await this.loadSettings();

		this.engine = new SyncEngine(
			this.app.vault,
			this.app.fileManager,
			() => (this.settings.serverUrl && this.settings.token ? this.client() : null),
			() => this.settings.property
		);

		this.addSettingTab(new GlassineSyncSettingTab(this.app, this));

		this.addCommand({
			id: 'pull-from-glassine',
			name: 'Pull from Glassine',
			callback: () => this.pullNow()
		});

		this.registerEvent(this.app.vault.on('modify', (file) => this.handleChange(file)));
		this.registerEvent(this.app.vault.on('create', (file) => this.handleChange(file)));
		this.registerEvent(
			this.app.workspace.on('file-open', (file) => {
				if (file) void this.engine.pullFile(file);
			})
		);

		this.app.workspace.onLayoutReady(() => this.pullEverything());
		this.restartPullInterval();
	}

	onunload() {
		if (this.pullIntervalId !== null) window.clearInterval(this.pullIntervalId);
		this.engine.dispose();
	}

	client(): GlassineClient {
		return new GlassineClient(this.settings.serverUrl, this.settings.token);
	}

	restartPullInterval(): void {
		if (this.pullIntervalId !== null) window.clearInterval(this.pullIntervalId);
		const ms = Math.max(1, this.settings.pullIntervalMinutes) * 60 * 1000;
		this.pullIntervalId = window.setInterval(() => this.pullEverything(), ms);
		this.registerInterval(this.pullIntervalId);
	}

	private handleChange(file: unknown) {
		if (file instanceof TFile) this.engine.scheduleSync(file);
	}

	private pullEverything(): void {
		void this.engine.pullAll(this.app.vault.getMarkdownFiles());
	}

	/** The "Pull from Glassine" command: same as the background pull, but reports what happened. */
	private async pullNow(): Promise<void> {
		if (!this.settings.serverUrl || !this.settings.token) {
			new Notice('Glassine: pair this vault first (plugin settings).');
			return;
		}
		new Notice('Pulling from Glassine…');
		const changed = await this.engine.pullAll(this.app.vault.getMarkdownFiles());
		new Notice(changed > 0 ? `Glassine: updated ${changed} note(s).` : 'Glassine: already up to date.');
	}

	async loadSettings() {
		const stored = (await this.loadData()) as Partial<GlassineSyncSettings> | null;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, stored ?? {});
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
