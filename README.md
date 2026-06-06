# LR Discord CV2 AIO Bot

A modern Discord.js moderation and utility bot built around prefix commands, Discord Components V2 responses, Supabase-backed settings, and clean interactive panels.

The bot ships with server prefix management, latency cards, user avatar/banner panels, message purge tools, deleted-message sniping, emoji/sticker stealing, and owner-only noprefix access.

## Highlights

- Discord.js v14 bot using prefix commands.
- Components V2 response layout for command panels and notices.
- Supabase persistence for custom guild prefixes and noprefix users.
- Recursive command loader with alias support and component handlers.
- Multi-word command support, including `npx add`, `npx remove`, and `npx list`.
- Canvas-generated cards for ping and permission feedback.
- Per-server prefix fallback to `LR!` when Supabase is not configured.
- In-memory deleted-message cache for the `snipe` command.

## Tech Stack

| Area | Package / Tool |
| --- | --- |
| Runtime | Node.js 18+ |
| Discord API | `discord.js` v14 |
| Database | Supabase |
| Canvas | `@napi-rs/canvas` |
| Image conversion | `sharp` |
| Config | `dotenv` |

## Commands

Default prefix: `LR!`

### Utility

| Command | Aliases | Description |
| --- | --- | --- |
| `LR!help` | `h`, `commands` | Opens the interactive command help panel. |
| `LR!ping` | `latency` | Shows bot latency and websocket ping with a generated image card. |
| `LR!avatar [@user | user_id]` | `av`, `pfp` | Shows a user's server/global avatar with size links. |
| `LR!banner [@user | user_id]` | `bn` | Shows a user's profile banner and accent color when available. |

### Config

| Command | Aliases | Description |
| --- | --- | --- |
| `LR!setprefix <new-prefix>` | `prefix` | Sets the server-specific bot prefix. Requires Manage Server or Administrator. |

### Moderation

| Command | Aliases | Description |
| --- | --- | --- |
| `LR!purge [amount]` | `prune`, `clear` | Deletes recent messages from the current channel. Requires Manage Messages or Administrator. |
| `LR!purge @user [amount]` | `prune`, `clear` | Deletes recent messages from a specific user. |
| `LR!purge bots [amount]` | `prune`, `clear` | Deletes recent bot messages. |
| `LR!snipe` | `s` | Shows the most recently deleted message in the channel. Deleted messages expire after 5 minutes. |
| `LR!steal` | `yoink`, `grab` | Reply to a message with a custom emoji or sticker, then add it to the server. Requires Administrator. |

### Owner

These commands are restricted to the bot owner configured in `.env`.

| Command | Alias | Description |
| --- | --- | --- |
| `LR!npx add @user` | `npx add` | Adds a user to global noprefix access with a duration menu. |
| `LR!npx remove @user` | `npx remove` | Removes a user from global noprefix access. |
| `LR!npx list` | `npx list` | Lists active noprefix users with pagination. |

Active noprefix users can run commands without the server prefix.

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Copy `.env.example` to `.env` and fill in your values.

```env
DISCORD_TOKEN=your_discord_bot_token
DEFAULT_PREFIX=LR!
BOT_OWNER_ID=your_discord_user_id

SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
SUPABASE_ANON_KEY=your_supabase_anon_key
```

Notes:

- `DISCORD_TOKEN` is required.
- `DEFAULT_PREFIX` defaults to `LR!` when empty.
- `BOT_OWNER_ID` is required for owner-only noprefix commands.
- `BOT_OWNER_IDS` is also supported if you want multiple owners. Separate IDs with spaces or commas.
- Supabase is required for custom prefixes and noprefix storage. Without it, the bot can still start and use the default prefix.

### 3. Enable Discord intents

In the Discord Developer Portal, enable:

- Message Content Intent

The bot uses prefix commands, so message content access is required.

### 4. Run Supabase SQL

Open the Supabase SQL editor and run the files in this order:

```text
src/supabase/SQL/001_guild_settings.sql
src/supabase/SQL/002_noprefix_users.sql
```

The SQL creates:

- `public.guild_settings` for per-server prefixes.
- `public.noprefix_users` for global noprefix access.
- `set_updated_at()` trigger support for updated timestamps.

### 5. Start the bot

```bash
npm start
```

For development with Node's watch mode:

```bash
npm run dev
```

## Required Bot Permissions

Give the bot permissions based on the commands you want to use:

| Feature | Recommended Permission |
| --- | --- |
| Read/respond to prefix commands | View Channels, Send Messages, Read Message History |
| Components V2 panels | Send Messages |
| `purge` | Manage Messages |
| `snipe` | Read Message History |
| `steal` | Manage Expressions |
| General moderation setup | Administrator is simplest for testing |

## Project Structure

```text
src/
  canvas/                 Generated image cards
  commands/
    config/               Prefix/config commands
    moderation/           Purge, snipe, steal
    owner/noprefix/       Owner-only noprefix commands
    utility/              Help, ping, avatar, banner
  emojis/                 Custom emoji registry
  handlers/               Discord event and command routing
  supabase/               Database client and data helpers
    SQL/                  Manual Supabase setup scripts
  utils/                  Shared Components V2 payload helpers
```

## How It Works

- `src/index.js` creates the Discord client, registers handlers, and logs in.
- `src/handlers/commandLoader.js` recursively loads command files from `src/commands`.
- `src/handlers/messageCreate.js` resolves the current guild prefix, supports noprefix access, and matches the longest command name first.
- `src/handlers/interactionCreate.js` routes button and select-menu interactions to each command's `componentHandlers`.
- `src/utils/cv2.js` builds Components V2 payloads with safe default mention behavior.
- `src/supabase/guildSettings.js` stores and caches server prefixes.
- `src/supabase/noPrefixUsers.js` stores, expires, caches, and lists noprefix users.

## Adding a Command

Create a new `.js` file anywhere under `src/commands/` and export:

```js
module.exports = {
  name: 'example',
  aliases: ['ex'],
  category: 'utility',
  description: 'Shows an example response.',
  usage: 'LR!example',
  async execute({ message }) {
    await message.reply('Example command');
  },
};
```

Commands can also export `componentHandlers` for Components V2 buttons or select menus. The loader registers them automatically.

## GitHub Push Checklist

Before pushing this repo publicly:

- Keep `.env` private. It is already ignored by `.gitignore`.
- Commit `.env.example`, not `.env`.
- Do not commit `node_modules/`.
- Run a quick syntax check if you changed command files:

```powershell
Get-ChildItem -Recurse -Filter *.js src | ForEach-Object { node --check $_.FullName }
```

## Scripts

| Script | Purpose |
| --- | --- |
| `npm start` | Runs `node src/index.js`. |
| `npm run dev` | Runs the bot with Node watch mode. |

## Credits

Built by Prince as a Discord Components V2 all-in-one bot foundation.
