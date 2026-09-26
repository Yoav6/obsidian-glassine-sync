import { App, Notice, PluginSettingTab, Setting } from 'obsidian';
import type GlassineSyncPlugin from './main';
import { runPairingFlow } from './pairing';

export interface GlassineSyncSettings {
	serverUrl: string;
	token: string | null;
	pairedDeviceName: string | null;
	property: string;
	pullIntervalMinutes: number;
}

export const DEFAULT_SETTINGS: GlassineSyncSettings = {
	serverUrl: '',
	token: null,
	pairedDeviceName: null,
	property: 'glassine',
	pullIntervalMinutes: 5
};

export class GlassineSyncSettingTab extends PluginSettingTab {
	plugin: GlassineSyncPlugin;
	private deviceNameDraft = '';

	constructor(app: App, plugin: GlassineSyncPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName('Glassine server URL')
			.setDesc('e.g. https://glassine.example.com — the same origin you would use to open a document in a browser.')
			.addText((text) =>
				text
					.setPlaceholder('https://glassine.example.com')
					.setValue(this.plugin.settings.serverUrl)
					.onChange(async (value) => {
						this.plugin.settings.serverUrl = value.trim();
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('Sync property')
			.setDesc(
				'The frontmatter property that marks a note for sync. Its presence means "sync this note"; ' +
					"its value is the note's Glassine document URL, filled in automatically."
			)
			.addText((text) =>
				text
					.setPlaceholder('glassine')
					.setValue(this.plugin.settings.property)
					.onChange(async (value) => {
						this.plugin.settings.property = value.trim() || DEFAULT_SETTINGS.property;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('Pull interval (minutes)')
			.setDesc('How often to check for remote changes on synced notes, since Glassine never pushes to the plugin.')
			.addText((text) =>
				text
					.setPlaceholder('5')
					.setValue(String(this.plugin.settings.pullIntervalMinutes))
					.onChange(async (value) => {
						const minutes = Number(value);
						if (Number.isFinite(minutes) && minutes > 0) {
							this.plugin.settings.pullIntervalMinutes = minutes;
							await this.plugin.saveSettings();
							this.plugin.restartPullInterval();
						}
					})
			);

		new Setting(containerEl).setName('Pairing').setHeading();

		if (this.plugin.settings.token) {
			new Setting(containerEl)
				.setName('Paired')
				.setDesc(
					`This vault is paired as "${this.plugin.settings.pairedDeviceName ?? 'this device'}". ` +
						'Revoke access from Glassine’s Admin → Devices page, not here.'
				)
				.addButton((button) =>
					button.setButtonText('Unpair (locally)').onClick(async () => {
						this.plugin.settings.token = null;
						this.plugin.settings.pairedDeviceName = null;
						await this.plugin.saveSettings();
						this.display();
					})
				);
		} else {
			new Setting(containerEl)
				.setName('Device name')
				.setDesc('Shown to you in the browser approval step, and in Admin → Devices.')
				.addText((text) =>
					text.setPlaceholder('e.g. My laptop').onChange((value) => {
						this.deviceNameDraft = value.trim();
					})
				);

			new Setting(containerEl).setName('Pair with server').addButton((button) =>
				button
					.setButtonText('Pair')
					.setCta()
					.onClick(async () => {
						if (!this.plugin.settings.serverUrl) {
							new Notice('Set the Glassine server URL first.');
							return;
						}
						if (!this.deviceNameDraft) {
							new Notice('Give this device a name first.');
							return;
						}
						try {
							const token = await runPairingFlow(
								this.app,
								this.plugin.client(),
								this.deviceNameDraft
							);
							this.plugin.settings.token = token;
							this.plugin.settings.pairedDeviceName = this.deviceNameDraft;
							await this.plugin.saveSettings();
							this.display();
						} catch (err) {
							new Notice(`Pairing failed: ${err instanceof Error ? err.message : String(err)}`);
						}
					})
			);
		}
	}
}
