require('dotenv').config({ quiet: true });

const fs = require('fs');
const path = require('path');
const {
  ActivityType,
  Client,
  Events,
  GatewayIntentBits,
  Partials,
} = require('discord.js');
const { BOT_PRESENCE, DEFAULT_PREFIX } = require('./config');
const { loadCommands } = require('./handlers/commandLoader');
const { cleanupLeftGuildSettings, handleGuildDelete } = require('./handlers/guildDelete');
const { handleInteractionCreate } = require('./handlers/interactionCreate');
const { handleMessageCreate } = require('./handlers/messageCreate');
const { storeDeletedMessage } = require('./handlers/snipeStore');
const {
  handleGuildBanAdd,
  handleGuildBanRemove,
  handleGuildMemberAdd,
  handleGuildMemberRemove,
  handleGuildMemberUpdate,
  handleMessageDelete: handleLogMessageDelete,
  handleMessageUpdate: handleLogMessageUpdate,
  handleVoiceStateUpdate,
} = require('./utils/logs');
const { handleAutoroleMemberAdd } = require('./utils/autoroles');
const { handleWelcomeMemberAdd } = require('./utils/welcome');
const { initDashboardBridge, pushGuildStats } = require('./dashboard/bridge');
const { startDashboardBackend } = require('./dashboard/backendProcess');
const { startAnalyticsTasks } = require('./supabase/analytics');

const token = process.env.DISCORD_TOKEN;

if (!token) {
  console.error('Missing DISCORD_TOKEN in .env');
  process.exit(1);
}

const INSTANCE_LOCK_FILE = path.join(__dirname, '..', '.orbix-bot.lock');

function isProcessRunning(pid) {
  const processId = Number(pid);

  if (!Number.isInteger(processId) || processId <= 0 || processId === process.pid) {
    return false;
  }

  try {
    process.kill(processId, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

function releaseInstanceLock() {
  try {
    const currentLock = JSON.parse(fs.readFileSync(INSTANCE_LOCK_FILE, 'utf8'));

    if (currentLock.pid === process.pid) {
      fs.rmSync(INSTANCE_LOCK_FILE, { force: true });
    }
  } catch {
    // Ignore stale/missing lock cleanup errors.
  }
}

function ensureSingleInstance() {
  let existingLock = null;

  try {
    existingLock = JSON.parse(fs.readFileSync(INSTANCE_LOCK_FILE, 'utf8'));
  } catch {
    existingLock = null;
  }

  if (existingLock?.pid && isProcessRunning(existingLock.pid)) {
    console.error(`Another Orbix bot process is already running (PID ${existingLock.pid}). Stop it before starting this one.`);
    process.exit(1);
  }

  fs.writeFileSync(INSTANCE_LOCK_FILE, JSON.stringify({
    pid: process.pid,
    startedAt: new Date().toISOString(),
  }, null, 2));

  process.once('exit', releaseInstanceLock);

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => {
      releaseInstanceLock();
      process.exit(0);
    });
  }
}

ensureSingleInstance();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel, Partials.Message, Partials.Reaction, Partials.User],
});

const musicManager = require('./utils/music').initializeMusic(client);
require('./utils/musicUi').attachMusicUi(musicManager);
// Optionally launch the dashboard backend on this same host (before the bridge
// connects to it). Controlled by START_DASHBOARD_BACKEND in the bot's .env.
startDashboardBackend();
initDashboardBridge(client);

loadCommands(client);

const ACTIVITY_TYPES = {
  competing: ActivityType.Competing,
  listening: ActivityType.Listening,
  playing: ActivityType.Playing,
  streaming: ActivityType.Streaming,
  watching: ActivityType.Watching,
};

const STATUS_TYPES = new Set(['dnd', 'idle', 'invisible', 'online']);

function formatCommandCategoryCounts(commands) {
  const counts = [...commands.values()].reduce((totals, command) => {
    const category = command.category || 'general';
    totals.set(category, (totals.get(category) || 0) + 1);
    return totals;
  }, new Map());

  return [...counts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([category, count]) => `${category}:${count}`)
    .join(', ');
}

function applyBotPresence(readyClient) {
  const activityText = BOT_PRESENCE.activityText?.trim();

  if (!activityText) {
    return;
  }

  const activityType = ACTIVITY_TYPES[String(BOT_PRESENCE.activityType || 'Watching').toLowerCase()]
    ?? ActivityType.Watching;
  const statusValue = String(BOT_PRESENCE.status || 'online').toLowerCase();
  const status = STATUS_TYPES.has(statusValue)
    ? statusValue
    : 'online';

  readyClient.user.setPresence({
    activities: [
      {
        name: activityText,
        type: activityType,
      },
    ],
    status,
  });
}

client.once(Events.ClientReady, (readyClient) => {
  applyBotPresence(readyClient);

  console.log(`Logged in as ${readyClient.user.tag}`);
  console.log(`Default prefix: ${DEFAULT_PREFIX}`);
  console.log(`Loaded commands: ${readyClient.commands.size}`);
  console.log(`Command categories: ${formatCommandCategoryCounts(readyClient.commands)}`);
  console.log(`Presence: ${BOT_PRESENCE.status} / ${BOT_PRESENCE.activityType} ${BOT_PRESENCE.activityText}`);

  // Begin dashboard analytics recording (message flush + member snapshots).
  startAnalyticsTasks(readyClient);

  cleanupLeftGuildSettings(readyClient.guilds.cache.map((guild) => guild.id))
    .then((result) => {
      if (result.ok && result.removed > 0) {
        console.log(`Cleaned up settings for ${result.removed} left guild(s)`);
      }
    })
    .catch((error) => {
      console.warn('[supabase] Failed to clean up left guild settings:', error);
    });
});

client.on(Events.MessageCreate, (message) => {
  handleMessageCreate(client, message);
});

client.on(Events.InteractionCreate, (interaction) => {
  handleInteractionCreate(client, interaction);
});

client.on(Events.MessageDelete, (message) => {
  storeDeletedMessage(message);
  handleLogMessageDelete(message);
});

client.on(Events.MessageUpdate, (oldMessage, newMessage) => {
  handleLogMessageUpdate(oldMessage, newMessage);
});

client.on(Events.GuildBanAdd, (ban) => {
  handleGuildBanAdd(ban);
});

client.on(Events.GuildBanRemove, (ban) => {
  handleGuildBanRemove(ban);
});

client.on(Events.GuildMemberAdd, (member) => {
  handleGuildMemberAdd(member);
  handleAutoroleMemberAdd(member);
  handleWelcomeMemberAdd(member);
  pushGuildStats(member.guild);
});

client.on(Events.GuildMemberRemove, (member) => {
  handleGuildMemberRemove(member);
  pushGuildStats(member.guild);
});

client.on(Events.GuildMemberUpdate, (oldMember, newMember) => {
  handleGuildMemberUpdate(oldMember, newMember);
});

client.on(Events.VoiceStateUpdate, (oldState, newState) => {
  handleVoiceStateUpdate(oldState, newState);
});

client.on(Events.GuildDelete, (guild) => {
  handleGuildDelete(guild);
});

process.on('unhandledRejection', (error) => {
  console.error('Unhandled promise rejection:', error);
});

client.login(token);
