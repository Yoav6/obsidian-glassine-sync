import { requestUrl } from 'obsidian';

/**
 * A thin client for Glassine's sync API (see the server's
 * documentation/sync-api.md). Uses Obsidian's `requestUrl` rather than
 * `fetch` — it works the same on desktop and mobile and isn't subject to the
 * browser CORS restrictions a plugin's webview otherwise runs under.
 */

export type PairStartResult = { code: string; pairUrl: string; expiresAt: string };
export type PairPollResult =
	| { status: 'pending' }
	| { status: 'approved'; token: string }
	| { status: 'expired' };
export type SyncDocument = { slug: string; relativePath: string; title: string; version: number; url: string };

export class GlassineApiError extends Error {}

export class GlassineClient {
	constructor(
		private serverUrl: string,
		private token: string | null
	) {}

	private endpoint(path: string): string {
		return `${this.serverUrl.replace(/\/+$/, '')}${path}`;
	}

	private headers(): Record<string, string> {
		const headers: Record<string, string> = { 'Content-Type': 'application/json' };
		if (this.token) headers['Authorization'] = `Bearer ${this.token}`;
		return headers;
	}

	private async request(path: string, method: 'GET' | 'POST', body?: unknown): Promise<unknown> {
		const res = await requestUrl({
			url: this.endpoint(path),
			method,
			headers: this.headers(),
			body: body === undefined ? undefined : JSON.stringify(body),
			throw: false
		});
		if (res.status < 200 || res.status >= 300) {
			const message =
				(res.json as { message?: string } | undefined)?.message ?? `${method} ${path} failed (${res.status})`;
			throw new GlassineApiError(message);
		}
		return res.json;
	}

	async pairStart(deviceName: string): Promise<PairStartResult> {
		return (await this.request('/api/sync/pair/start', 'POST', { deviceName })) as PairStartResult;
	}

	async pairPoll(code: string): Promise<PairPollResult> {
		return (await this.request('/api/sync/pair/poll', 'POST', { code })) as PairPollResult;
	}

	async listDocuments(): Promise<SyncDocument[]> {
		const result = (await this.request('/api/sync/documents', 'GET')) as { documents: SyncDocument[] };
		return result.documents;
	}

	async pull(slug: string): Promise<{ content: string; version: number }> {
		return (await this.request(`/api/sync/documents/${encodeURIComponent(slug)}`, 'GET')) as {
			content: string;
			version: number;
		};
	}

	async push(slug: string, content: string): Promise<{ version: number }> {
		return (await this.request(`/api/sync/documents/${encodeURIComponent(slug)}`, 'POST', { content })) as {
			version: number;
		};
	}

	async create(filename: string, content: string): Promise<{ slug: string; version: number; url: string }> {
		return (await this.request('/api/sync/documents', 'POST', { filename, content })) as {
			slug: string;
			version: number;
			url: string;
		};
	}
}
