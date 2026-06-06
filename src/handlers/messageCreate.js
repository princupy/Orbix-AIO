const { isBotOwner } = require('../config');
const { getGuildPrefix } = require('../supabase/guildSettings');
const { isNoPrefixUser } = require('../supabase/noPrefixUsers');
const { createNoticeContainer, cv2Payload } = require('../utils/cv2');

function resolveCommand(client, input) {
  const parts = input.split(/\s+/).filter(Boolean);

  for (let length = parts.length; length > 0; length -= 1) {
    const candidate = parts.slice(0, length).join(' ').toLowerCase();
    const resolvedName = client.aliases.get(candidate) || candidate;
    const command = client.commands.get(resolvedName);

    if (command) {
      return {
        args: parts.slice(length),
        command,
        resolvedName,
      };
    }
  }

  return null;
}

async function handleMessageCreate(client, message) {
  if (!message.guild || message.author.bot) {
    return;
  }

  const prefix = await getGuildPrefix(message.guild.id);
  const hasPrefix = message.content.toLowerCase().startsWith(prefix.toLowerCase());
  let input;
  let resolvedCommand = null;
  let usedNoPrefix = false;

  if (hasPrefix) {
    input = message.content.slice(prefix.length).trim();
  } else {
    input = message.content.trim();
    resolvedCommand = resolveCommand(client, input);
    const canUseOwnerCommand = resolvedCommand?.command?.category === 'owner'
      && isBotOwner(message.author.id);
    const canUseNoPrefix = canUseOwnerCommand
      || await isNoPrefixUser(message.author.id);

    if (!canUseNoPrefix) {
      return;
    }
    usedNoPrefix = true;
  }

  if (!input) {
    return;
  }

  resolvedCommand ||= resolveCommand(client, input);

  if (!resolvedCommand) {
    return;
  }

  try {
    await resolvedCommand.command.execute({
      args: resolvedCommand.args,
      client,
      message,
      noPrefix: usedNoPrefix,
      prefix,
      usedPrefix: hasPrefix ? prefix : '',
    });
  } catch (error) {
    console.error(`Command failed: ${resolvedCommand.resolvedName}`, error);

    const container = createNoticeContainer({
      title: 'Command Error',
      description: 'An error occurred while running this command. Check the console logs.',
    });

    await message.reply(cv2Payload(container)).catch(() => null);
  }
}

module.exports = {
  handleMessageCreate,
};
