# LR Moderation Bot

Discord.js bot starter with default prefix `LR!`, Components V2 responses, and Supabase support.

## Setup

1. Install dependencies:

```bash
npm install
```

2. Copy `.env.example` to `.env` and fill `DISCORD_TOKEN` and `BOT_OWNER_ID`.

3. In Discord Developer Portal, enable the `Message Content Intent` for this bot. Prefix commands need it.

4. Run the SQL files from `src/supabase/SQL/` in Supabase.

5. Start the bot:

```bash
npm start
```

## First Command

Use this in your Discord server:

```text
LR!ping
```

The ping reply is sent using Discord Components V2.

## Owner Noprefix Commands

Set `BOT_OWNER_ID` in `.env` first. Then run:

```text
npx add @user
npx remove @user
npx list
```

The owner can also run these with the server prefix, for example `LR!npx add @user`.
`npx add` opens a duration dropdown. Active noprefix users can run commands without the server prefix.

## Project Paths

- Commands: `src/commands/`
- Utility ping command: `src/commands/utility/ping.js`
- Emoji registry: `src/emojis/`
- Supabase SQL files: `src/supabase/SQL/`
- Supabase client code: `src/supabase/`
