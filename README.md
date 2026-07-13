# Orbix — Discord AIO Bot

> ⚠️ **Active Development** — This bot is currently under active development. Features are being added, improved, and refined continuously. Expect frequent updates and potential breaking changes until a stable release is reached.

A powerful, all-in-one Discord.js bot built with Components V2 responses, Supabase-backed persistence, and a growing suite of features — including a full leveling system, media-only channels, and a comprehensive moderation toolkit.

---

## ✨ Features

- **Discord.js v14** with prefix-command architecture
- **Components V2** panels for all interactive responses
- **Supabase** for persistent guild settings, leveling data, noprefix users, and media channels
- **Leveling System** — XP gain, rank cards, leaderboards, roles, multipliers, cooldowns, and full admin control
- **Media-Only Channels** — lock channels to media/attachment-only messages
- **Moderation Suite** — ban, kick, mute, lock, hide, nuke, role management, nickname, and more
- **Utility** — help panel, ping card, avatar/banner viewer, snipe, steal emoji/sticker
- **Owner Tools** — global noprefix access management with duration controls
- Recursive command loader with alias support and component handlers

---

## 🛠️ Tech Stack

| Area | Package / Tool |
| --- | --- |
| Runtime | Node.js 18+ |
| Discord API | `discord.js` v14 |
| Database | Supabase |
| Canvas | `@napi-rs/canvas` |
| Image processing | `sharp` |
| Config | `dotenv` |

---

## 📋 Commands

Default prefix: `LR!`

> Noprefix users (set by the bot owner) can run any command without the prefix.

---

### 🔧 Utility

| Command | Aliases | Description |
| --- | --- | --- |
| `LR!help` | `h`, `commands` | Opens the interactive command help panel. |
| `LR!ping` | `latency` | Shows bot and websocket latency with a generated image card. |
| `LR!avatar [@user\|id]` | `av`, `pfp` | Shows a user's server/global avatar with download links. |
| `LR!banner [@user\|id]` | `bn` | Shows a user's profile banner and accent color. |

---

### ⚙️ Config

| Command | Aliases | Description |
| --- | --- | --- |
| `LR!setprefix <new-prefix>` | `prefix` | Sets a server-specific bot prefix. Requires Manage Server. |

---

### 🔨 Moderation

| Command | Aliases | Description |
| --- | --- | --- |
| `LR!ban @user [reason]` | — | Bans a member from the server. |
| `LR!unban <user_id>` | — | Unbans a user by ID. |
| `LR!kick @user [reason]` | — | Kicks a member from the server. |
| `LR!mute @user [duration]` | — | Times out a member for a given duration. |
| `LR!unmute @user` | — | Removes timeout from a member. |
| `LR!nickname @user <name>` | `nick` | Changes a member's server nickname. |
| `LR!role @user @role` | — | Adds or removes a role from a member. |
| `LR!roleicon @role <emoji\|url>` | — | Sets or removes a role icon. |
| `LR!nuke` | — | Clones and deletes the current channel, wiping all messages. |
| `LR!purge [amount]` | `prune`, `clear` | Bulk-deletes recent messages (optionally filter by user or bots). |
| `LR!snipe` | `s` | Shows the most recently deleted message in the channel (expires in 5 min). |
| `LR!steal` | `yoink`, `grab` | Replies to a message with a custom emoji/sticker to add it to the server. |
| `LR!lock` | — | Locks the current channel (prevents members from sending messages). |
| `LR!unlock` | — | Unlocks the current channel. |
| `LR!lockall` | — | Locks all channels in the server. |
| `LR!unlockall` | — | Unlocks all channels in the server. |
| `LR!hide` | — | Hides the current channel from members. |
| `LR!unhide` | — | Unhides the current channel. |
| `LR!hideall` | — | Hides all channels in the server. |
| `LR!unhideall` | — | Unhides all channels in the server. |

---

### 📷 Media-Only Channels

| Command | Description |
| --- | --- |
| `LR!media setup <#channel>` | Marks a channel as media-only (attachments/images only). |
| `LR!media remove <#channel>` | Removes the media-only restriction from a channel. |
| `LR!media show` | Lists all media-only channels in the server. |
| `LR!media` | Shows the media command panel. |

---

### 📈 Leveling System

| Command | Description |
| --- | --- |
| `LR!rank [@user]` | Shows a user's current rank and XP. |
| `LR!level [@user]` | Shows a user's level info. |
| `LR!xp [@user]` | Shows a user's raw XP count. |
| `LR!rankprogress [@user]` | Shows detailed progress toward the next level. |
| `LR!leaderboard` | Shows the server XP leaderboard. |
| `LR!addxp @user <amount>` | Adds XP to a user (admin). |
| `LR!removexp @user <amount>` | Removes XP from a user (admin). |
| `LR!setlevel @user <level>` | Sets a user's level directly (admin). |
| `LR!setxprate <amount>` | Sets the XP gained per message. |
| `LR!setcooldown <seconds>` | Sets the XP gain cooldown per user. |
| `LR!multiplier <value>` | Sets the global XP multiplier. |
| `LR!levelrole <level> @role` | Assigns a role when a user reaches a level. |
| `LR!setlevelchannel <#channel>` | Sets the channel for level-up announcements. |
| `LR!setlevelupmessage <msg>` | Sets a custom level-up message. |
| `LR!togglelevelup` | Enables or disables level-up announcements. |
| `LR!levelconfig` | Shows the current leveling configuration. |
| `LR!blacklistchannel <#channel>` | Prevents XP from being earned in a channel. |
| `LR!blacklistrole @role` | Prevents users with a role from earning XP. |
| `LR!resetuser @user` | Resets a user's XP and level to zero (admin). |
| `LR!resetall` | Resets all leveling data for the entire server (admin). |

---

### 👑 Owner

These commands are restricted to the bot owner configured in `.env`.

| Command | Description |
| --- | --- |
| `LR!npx add @user` | Adds a user to global noprefix access with a duration selector. |
| `LR!npx remove @user` | Removes a user from noprefix access. |
| `LR!npx list` | Lists active noprefix users with pagination. |

---

## 🚀 Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Copy `.env.example` to `.env` and fill in your values:

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
- `BOT_OWNER_ID` is required for owner-only commands. Use `BOT_OWNER_IDS` (space or comma separated) for multiple owners.
- Supabase is required for custom prefixes, leveling data, media channels, and noprefix users.

### 3. Enable Discord intents

In the Discord Developer Portal, enable:
- **Message Content Intent** — required for prefix commands

### 4. Run Supabase SQL

Open the Supabase SQL editor and run the migration files **in order**:

```text
src/supabase/SQL/001_guild_settings.sql
src/supabase/SQL/002_noprefix_users.sql
src/supabase/SQL/003_media_only_channels.sql
src/supabase/SQL/004_leveling_system.sql
```

### 5. Start the bot

```bash
npm start
```

For development with hot reload:

```bash
npm run dev
```

---

## 🔐 Required Bot Permissions

| Feature | Required Permission |
| --- | --- |
| Prefix commands | View Channels, Send Messages, Read Message History |
| Moderation (ban/kick/mute) | Ban Members, Kick Members, Moderate Members |
| Channel lock/hide | Manage Channels |
| Nuke | Manage Channels |
| Purge | Manage Messages |
| Role management | Manage Roles |
| Nickname | Manage Nicknames |
| Steal emoji/sticker | Manage Expressions |
| Leveling (rank cards) | Send Messages, Embed Links |
| Media-only enforcement | Manage Messages |
| General testing | Administrator is simplest |

---

## 📁 Project Structure

```text
src/
  canvas/                   Generated image cards (rank, ping)
  commands/
    config/                 Prefix / config commands
    leveling/               Full leveling command suite (20 commands)
    media/                  Media-only channel commands
    moderation/             Ban, kick, mute, lock, hide, nuke, purge, snipe, steal, role, etc.
    owner/noprefix/         Owner-only noprefix management
    utility/                Help, ping, avatar, banner
  emojis/                   Custom emoji registry
  handlers/                 Discord event and command routing
  supabase/                 Database client and data helpers
    SQL/                    Supabase setup migration scripts
  utils/                    Shared helpers (CV2 payloads, leveling, moderation utilities)
```

---

## ⚙️ How It Works

- `src/index.js` — Creates the Discord client, registers handlers, and logs in.
- `src/handlers/commandLoader.js` — Recursively loads all command files from `src/commands/`.
- `src/handlers/messageCreate.js` — Resolves guild prefix, supports noprefix access, matches longest command name first.
- `src/handlers/interactionCreate.js` — Routes button and select-menu interactions to each command's `componentHandlers`.
- `src/utils/cv2.js` — Builds Components V2 payloads with safe default mention behavior.
- `src/utils/leveling.js` — Handles XP gain, cooldown, level-up events, and role rewards.
- `src/utils/channelModerationCommand.js` — Shared logic for lock/hide/unlock/unhide channel operations.
- `src/utils/mediaOnlyCommand.js` — Shared logic for media-only channel enforcement.
- `src/supabase/leveling.js` — All leveling DB queries (XP, levels, config, leaderboard).
- `src/supabase/mediaOnlyChannels.js` — Media-only channel DB queries.
- `src/supabase/guildSettings.js` — Stores and caches server prefixes.
- `src/supabase/noPrefixUsers.js` — Stores, expires, caches, and lists noprefix users.

---

## ➕ Adding a Command

Create a new `.js` file anywhere under `src/commands/` and export:

```js
module.exports = {
  name: 'example',
  aliases: ['ex'],
  category: 'utility',
  description: 'Shows an example response.',
  usage: 'LR!example',
  async execute({ message, args, client }) {
    await message.reply('Example command');
  },
};
```

Commands can also export `componentHandlers` for Components V2 buttons or select menus — the loader registers them automatically.

---

## 📜 Scripts

| Script | Purpose |
| --- | --- |
| `npm start` | Runs the bot via `node src/index.js`. |
| `npm run dev` | Runs the bot with Node.js watch mode (auto-restart on file change). |

---

## 🔒 GitHub Push Checklist

- Keep `.env` private — it is already in `.gitignore`.
- Always commit `.env.example`, not `.env`.
- Do not commit `node_modules/`.
- Quick syntax check before pushing:

```powershell
Get-ChildItem -Recurse -Filter *.js src | ForEach-Object { node --check $_.FullName }
```

---

## 🏷️ Credits

Built by **Prince** — an all-in-one Discord bot foundation powered by Components V2, Supabase, and Node.js.

> 🚧 More features are actively being developed. Stay tuned for updates!
