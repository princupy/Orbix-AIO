const {
  ContainerBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
} = require('discord.js');
const { isBotOwner } = require('../config');
const emojis = require('../emojis');
const { getAfk, isAfk, removeAfk } = require('./afkStore');
const { getGuildPrefix } = require('../supabase/guildSettings');
const { isNoPrefixUser } = require('../supabase/noPrefixUsers');
const { createNoticeContainer, cv2Payload } = require('../utils/cv2');

// ─── AFK helpers ───────────────────────────────────────────────────

function createSeparator() {
  return new SeparatorBuilder()
    .setDivider(true)
    .setSpacing(SeparatorSpacingSize.Small);
}

function createFooterText() {
  const poweredEmoji = emojis.getEmoji('lr.logo') || emojis.getEmoji('status.success') || '*';
  return new TextDisplayBuilder().setContent(`${poweredEmoji} **Powered by Prince**`);
}

function formatRelative(ms) {
  return `<t:${Math.floor(ms / 1000)}:R>`;
}

function formatFull(ms) {
  return `<t:${Math.floor(ms / 1000)}:F>`;
}

/**
 * Build a container shown to whoever pinged an AFK user.
 */
function buildAfkMentionContainer({ afkEntry, mentionedUser }) {
  const detailLines = [
    `> <:icons8avatar64:1512416926591090718> **User:** <@${afkEntry.userId}> (\`${mentionedUser.tag}\`)`,
    `> <:icons8time64:1514682697770078270> **AFK Since:** ${formatFull(afkEntry.timestamp)} (${formatRelative(afkEntry.timestamp)})`,
    `> <:icons8notetakingwithtextdocument:1514682923960369326> **Reason:** ${afkEntry.reason}`,
  ];

  return new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## <:icons8sleep64:1514684070615973989> ${mentionedUser.username} is AFK`,
      ),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(detailLines.join('\n')),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(createFooterText());
}

/**
 * Build a welcome-back container when an AFK user returns.
 */
function buildWelcomeBackContainer({ user, afkEntry }) {
  const successEmoji = emojis.getEmoji('status.success') || '✅';
  const duration = formatRelative(afkEntry.timestamp);

  return new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${successEmoji} Welcome Back!`,
      ),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          `> <:icons8huggingface64:1514683472348975236> Welcome back, <@${user.id}>! Your AFK status has been removed.`,
          `> <:icons8time64:1514682697770078270> **You were AFK since:** ${duration}`,
          `> <:icons8notetakingwithtextdocument:1514682923960369326> **Reason was:** ${afkEntry.reason}`,
        ].join('\n'),
      ),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(createFooterText());
}

// ─── Command resolver ──────────────────────────────────────────────

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

// ─── AFK processing ────────────────────────────────────────────────

async function processAfk(message, isAfkCommand) {
  const guildId = message.guild.id;
  const authorId = message.author.id;

  // 1) If the author is AFK and this is NOT the afk command → remove AFK
  if (!isAfkCommand && isAfk(guildId, authorId)) {
    const afkEntry = removeAfk(guildId, authorId);

    if (afkEntry) {
      const container = buildWelcomeBackContainer({
        user: message.author,
        afkEntry,
      });

      await message.reply(cv2Payload(container, {
        allowedMentions: { parse: [], repliedUser: true },
      })).catch(() => null);
    }
  }

  // 2) Check if any mentioned user is AFK → notify the author
  const mentionedUsers = message.mentions.users;

  if (mentionedUsers.size > 0) {
    for (const [mentionedId, mentionedUser] of mentionedUsers) {
      if (mentionedId === authorId) continue;

      const afkEntry = getAfk(guildId, mentionedId);

      if (afkEntry) {
        const container = buildAfkMentionContainer({ afkEntry, mentionedUser });

        await message.reply(cv2Payload(container, {
          allowedMentions: { parse: [], repliedUser: false },
        })).catch(() => null);
      }
    }
  }
}

// ─── Main handler ──────────────────────────────────────────────────

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
      // Even without prefix, still process AFK mentions for normal messages
      await processAfk(message, false);
      return;
    }
    usedNoPrefix = true;
  }

  if (!input) {
    await processAfk(message, false);
    return;
  }

  resolvedCommand ||= resolveCommand(client, input);

  // Process AFK before command execution
  const isAfkCommand = resolvedCommand?.resolvedName === 'afk';
  await processAfk(message, isAfkCommand);

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
