import { App, Modal, Notice, Setting } from 'obsidian';
import type { GlassineClient } from './api';

const POLL_INTERVAL_MS = 1500;
const POLL_TIMEOUT_MS = 10 * 60 * 1000;

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => window.setTimeout(resolve, ms));
}

class PairingModal extends Modal {
	cancelled = false;

	constructor(
		app: App,
		private pairUrl: string
	) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl('h2', { text: 'Approve this device in Glassine' });
		contentEl.createEl('p', {
			text: "A browser tab should have opened to approve this device. If it didn't, open this link yourself:"
		});
		const linkRow = contentEl.createDiv();
		const link = linkRow.createEl('a', { text: this.pairUrl, href: this.pairUrl });
		link.setAttr('target', '_blank');
		new Setting(contentEl).addButton((button) =>
			button.setButtonText('Copy link').onClick(async () => {
				await navigator.clipboard.writeText(this.pairUrl);
				new Notice('Link copied');
			})
		);
		contentEl.createEl('p', { text: 'Waiting for approval…', cls: 'glassine-pairing-status' });
		new Setting(contentEl).addButton((button) =>
			button.setButtonText('Cancel').onClick(() => {
				this.cancelled = true;
				this.close();
			})
		);
	}

	onClose() {
		this.contentEl.empty();
	}
}

/** Runs the device-pairing exchange (documentation/sync-api.md) end to end, returning the minted device token. */
export async function runPairingFlow(app: App, client: GlassineClient, deviceName: string): Promise<string> {
	const { code, pairUrl } = await client.pairStart(deviceName);
	window.open(pairUrl, '_blank');
	const modal = new PairingModal(app, pairUrl);
	modal.open();
	try {
		const deadline = Date.now() + POLL_TIMEOUT_MS;
		while (Date.now() < deadline) {
			if (modal.cancelled) throw new Error('Pairing cancelled');
			await sleep(POLL_INTERVAL_MS);
			const result = await client.pairPoll(code);
			if (result.status === 'approved') return result.token;
			if (result.status === 'expired') throw new Error('Pairing code expired — try again');
		}
		throw new Error('Timed out waiting for approval');
	} finally {
		modal.close();
	}
}
