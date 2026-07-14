require('dotenv').config({ quiet: true });

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

const token = process.env.DISCORD_TOKEN;

if (!token) {
  console.error('Missing DISCORD_TOKEN in .env');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel, Partials.Message, Partials.Reaction, Partials.User],
});

loadCommands(client);

const ACTIVITY_TYPES = {
  competing: ActivityType.Competing,
  listening: ActivityType.Listening,
  playing: ActivityType.Playing,
  streaming: ActivityType.Streaming,
  watching: ActivityType.Watching,
};

const STATUS_TYPES = new Set(['dnd', 'idle', 'invisible', 'online']);

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
  console.log(`Presence: ${BOT_PRESENCE.status} / ${BOT_PRESENCE.activityType} ${BOT_PRESENCE.activityText}`);

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
});

client.on(Events.GuildDelete, (guild) => {
  handleGuildDelete(guild);
});

process.on('unhandledRejection', (error) => {
  console.error('Unhandled promise rejection:', error);
});

client.login(token);
