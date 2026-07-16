const fs = require('fs');
const path = require('path');
const { Collection } = require('discord.js');

function walkJavaScriptFiles(directory) {
  if (!fs.existsSync(directory)) {
    return [];
  }

  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      return walkJavaScriptFiles(entryPath);
    }

    return entry.isFile() && entry.name.endsWith('.js') ? [entryPath] : [];
  });
}

function loadCommands(client) {
  client.commands = new Collection();
  client.aliases = new Collection();
  client.componentHandlers = [];

  const commandsPath = path.join(__dirname, '..', 'commands');
  const commandFiles = walkJavaScriptFiles(commandsPath);

  for (const filePath of commandFiles) {
    // Load each command in isolation: a single broken/missing file must never
    // crash startup or corrupt the whole command set (e.g. during help reloads).
    try {
      const command = require(filePath);

      if (!command?.name || typeof command.execute !== 'function') {
        console.warn(`Skipping invalid command file: ${filePath}`);
        continue;
      }

      const commandName = command.name.toLowerCase();
      client.commands.set(commandName, command);

      for (const alias of command.aliases || []) {
        client.aliases.set(alias.toLowerCase(), commandName);
      }

      for (const handler of command.componentHandlers || []) {
        client.componentHandlers.push({
          ...handler,
          commandName,
        });
      }
    } catch (error) {
      console.error(`Failed to load command file: ${filePath}`, error);
    }
  }
}

module.exports = {
  loadCommands,
};
