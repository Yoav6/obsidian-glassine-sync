import { App, Notice, PluginSettingTab, type Setting, type SettingDefinitionItem } from 'obsidian';
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
	/** Ephemeral — the device name typed before pairing. Never persisted. */
	private deviceNameDraft = '';

	constructor(app: App, plugin: GlassineSyncPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	getControlValue(key: string): unknown {
		return (this.plugin.settings as unknown as Record<string, unknown>)[key];
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
		switch (key) {
			case 'serverUrl':
				this.plugin.settings.serverUrl = typeof value === 'string' ? value.trim() : '';
				break;
			case 'property':
				this.plugin.settings.property =
					typeof value === 'string' && value.trim() ? value.trim() : DEFAULT_SETTINGS.property;
				break;
			case 'pullIntervalMinutes': {
				const minutes = Number(value);
				if (!Number.isFinite(minutes) || minutes <= 0) return;
				this.plugin.settings.pullIntervalMinutes = minutes;
				await this.plugin.saveSettings();
				this.plugin.restartPullInterval();
				return;
			}
			default:
				return;
		}
		await this.plugin.saveSettings();
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		return [
			{
				type: 'group',
				heading: 'Connection',
				items: [
					{
						name: 'Glassine server URL',
						desc: 'e.g. https://glassine.example.com — the same origin you would use to open a document in a browser.',
						control: { type: 'text', key: 'serverUrl', placeholder: 'https://glassine.example.com' }
					},
					{
						name: 'Sync property',
						desc:
							'The frontmatter property that marks a note for sync. Its presence means "sync this note"; ' +
							"its value is the note's Glassine document URL, filled in automatically.",
						control: { type: 'text', key: 'property', placeholder: 'glassine' }
					},
					{
						name: 'Pull interval (minutes)',
						desc: 'How often to check for remote changes on synced notes, since Glassine never pushes to the plugin.',
						control: { type: 'number', key: 'pullIntervalMinutes', placeholder: '5', min: 1 }
					}
				]
			},
			{
				type: 'group',
				heading: 'Pairing',
				items: [
					{
						name: 'Pairing',
						// Rendered imperatively: which controls to show depends on whether
						// this vault is already paired, and pairing itself is a multi-step
						// flow (see pairing.ts) rather than a single persisted value.
						render: (setting) => this.renderPairing(setting)
					}
				]
			}
		];
	}

	private renderPairing(setting: Setting): void {
		if (this.plugin.settings.token) {
			setting
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
						this.update();
					})
				);
			return;
		}

		setting
			.setName('Pair with server')
			.setDesc('Give this device a name, then approve it in the browser tab that opens.')
			.addText((text) =>
				text.setPlaceholder('e.g. My laptop').onChange((value) => {
					this.deviceNameDraft = value.trim();
				})
			)
			.addButton((button) =>
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
							const token = await runPairingFlow(this.app, this.plugin.client(), this.deviceNameDraft);
							this.plugin.settings.token = token;
							this.plugin.settings.pairedDeviceName = this.deviceNameDraft;
							await this.plugin.saveSettings();
							this.update();
						} catch (err) {
							new Notice(`Pairing failed: ${err instanceof Error ? err.message : String(err)}`);
						}
					})
			);
	}
}
