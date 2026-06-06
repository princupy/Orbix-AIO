require('dotenv').config({ quiet: true });

const { Client, Events, GatewayIntentBits, Partials } = require('discord.js');
const { DEFAULT_PREFIX } = require('./config');
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
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

loadCommands(client);

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}`);
  console.log(`Default prefix: ${DEFAULT_PREFIX}`);
  console.log(`Loaded commands: ${readyClient.commands.size}`);

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
