# Glassine Sync

An Obsidian plugin that syncs selected notes with a self-hosted Glassine instance over its REST sync API — an alternative to Glassine's git/`obsidian-git` adapter that works the same way on desktop and mobile.

## What it does

- Mark any note for sync by adding a frontmatter property (default `glassine`) to it. Its presence means "sync this note"; its value is a link to the note's document on Glassine, filled in automatically.
- Edits sync to Glassine shortly after you stop typing. Accepted edits and other changes made on Glassine are pulled back down on note open and on a timer.
- Pair as many vaults as you like — each one pairs independently and shows up as its own row in Glassine's Admin → Devices, where you can revoke it at any time.
- No conflict resolution: syncing promptly on every change keeps the window for a real collision small, and the rare conflict resolves as last-write-wins.
- Embedded images sync too, in either direction. On push, only Obsidian's `![[wiki-style]]` embeds are uploaded — a plain `![](path)` markdown image is left as-is, since it's far more likely to already be a URL than a local file meant for Glassine. Glassine understands `![[wiki-style]]` embeds natively, so a pushed image keeps that same syntax; only its path is rewritten, to the image's fully-resolved vault path (an Obsidian embed may rely on vault-wide fuzzy filename matching, which Glassine doesn't have). Pulled images — in either syntax, whichever the document actually contains — are downloaded to the vault-relative path the document names. Only the copy sent to Glassine is ever rewritten — a note's own embed syntax on disk is never touched.

See `documentation/sync-api.md` in the Glassine server's repository for the protocol this plugin speaks — it's a general-purpose API, not specific to Obsidian, if you'd rather write your own client.

## Setup

1. Install and enable the plugin, then open its settings.
2. Set **Glassine server URL** to your instance's origin (e.g. `https://glassine.example.com`).
3. Give this device a name and click **Pair**. A browser tab opens for you to approve the device while signed in to Glassine as the author; the plugin picks up its token automatically once approved.
4. Add the `glassine` property (empty value) to any note you want to sync. On its next edit, the plugin creates a matching document on Glassine and writes that document's URL back into the property.
5. To sync a note against an *existing* Glassine document instead, paste that document's URL as the property's value yourself.

## Notes on trust

The device token this plugin stores (in the vault's plugin data) is long-lived and stays valid until you revoke it from Glassine's Admin → Devices — there's no periodic re-login. Treat it like any other stored credential: it's stored in plain text in the plugin's local data, the same way Obsidian's own git plugin stores your git remote credentials.

## Development

```sh
npm install
npm run dev     # watch build
npm run build   # production build + typecheck
```
