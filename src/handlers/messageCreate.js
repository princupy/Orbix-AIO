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
const { getMediaOnlyChannelIds } = require('../supabase/mediaOnlyChannels');
const { isNoPrefixUser } = require('../supabase/noPrefixUsers');
const { createNoticeContainer, cv2Payload } = require('../utils/cv2');
const { processLevelingMessage } = require('../utils/leveling');

const MEDIA_URL_PATTERN = /https?:\/\/\S+\.(?:png|jpe?g|gif|webp|mp4|mov|webm|m4v|mp3|wav|ogg)(?:[?#]\S*)?/i;
const MEDIA_NOTICE_DELETE_MS = 5000;
const MEDIA_ONLY_WARNING_CHANNEL_ID = '1363380374830452828';
const MEDIA_RELAY_CONTENT_MAX_LENGTH = 1500;
const GENERAL_CHAT_NAMES = new Set([
  'chat',
  'general',
  'generalchat',
  'generaldiscussion',
  'mainchat',
  'lobby',
  'offtopic',
  'offtopicchat',
]);

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

function hasMediaContent(message) {
  if (message.attachments?.size > 0 || message.stickers?.size > 0) {
    return true;
  }

  if (message.embeds?.some((embed) => (
    embed.image
    || embed.thumbnail
    || embed.video
    || ['image', 'gifv', 'video'].includes(embed.type)
  ))) {
    return true;
  }

  return MEDIA_URL_PATTERN.test(message.content || '');
}

function normalizeChannelName(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function isNormalTextChannel(channel) {
  return Boolean(
    channel?.guild
    && channel?.isTextBased?.()
    && !channel?.isDMBased?.()
    && !channel?.isThread?.()
  );
}

function findGeneralChatChannel(guild, mediaOnlyChannelIds, currentChannelId) {
  const preferredChannel = guild.channels.cache.get(MEDIA_ONLY_WARNING_CHANNEL_ID);

  if (
    preferredChannel
    && preferredChannel.id !== currentChannelId
    && isNormalTextChannel(preferredChannel)
    && !mediaOnlyChannelIds.has(preferredChannel.id)
    && preferredChannel.viewable
  ) {
    return preferredChannel;
  }

  const channels = [...guild.channels.cache.values()]
    .filter((channel) => (
      channel.id !== currentChannelId
      && isNormalTextChannel(channel)
      && !mediaOnlyChannelIds.has(channel.id)
      && channel.viewable
    ))
    .sort((left, right) => (left.rawPosition ?? 0) - (right.rawPosition ?? 0));

  return channels.find((channel) => GENERAL_CHAT_NAMES.has(normalizeChannelName(channel.name)))
    || channels.find((channel) => normalizeChannelName(channel.name).includes('general'))
    || channels.find((channel) => normalizeChannelName(channel.name).includes('chat'))
    || channels[0]
    || null;
}

function buildMediaOnlyNoticeContainer({ generalChannel }) {
  const chatTarget = MEDIA_ONLY_WARNING_CHANNEL_ID
    ? ` Please use <#${MEDIA_ONLY_WARNING_CHANNEL_ID}> for normal chat.`
    : generalChannel
      ? ` Please use ${generalChannel} for normal chat.`
      : ' Please use the general chat channel for normal chat.';

  return new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${emojis.label('status.warning', 'Media Only Channel')}`,
      ),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `This channel only allows media messages.${chatTarget}`,
      ),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(createFooterText());
}

function truncateText(value, maxLength) {
  const text = String(value || '');

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, Math.max(0, maxLength - 3))}...`;
}

function getRelayMentionedUserIds(message) {
  const botId = message.client.user?.id;

  return [...message.mentions.users.keys()]
    .filter((userId) => userId !== message.author.id && userId !== botId);
}

function formatQuotedMessage(content) {
  const quotedContent = truncateText(
    String(content || '').trim() || '[No text content]',
    MEDIA_RELAY_CONTENT_MAX_LENGTH,
  );

  return quotedContent
    .split(/\r?\n/)
    .map((line) => `> ${line || ' '}`)
    .join('\n');
}

function buildMediaRelayContent(message, mentionedUserIds) {
  const mentionedText = mentionedUserIds
    .map((userId) => `<@${userId}>`)
    .join(', ');
  const header = `<@${message.author.id}> mentioned ${mentionedText} in <#${message.channel.id}>:`;

  return truncateText([
    header,
    formatQuotedMessage(message.content),
  ].join('\n'), 2000);
}

async function resolveMediaRelayChannel(guild) {
  const channel = guild.channels.cache.get(MEDIA_ONLY_WARNING_CHANNEL_ID)
    || await guild.channels.fetch(MEDIA_ONLY_WARNING_CHANNEL_ID).catch(() => null);

  if (!isNormalTextChannel(channel) || !channel.viewable || typeof channel.send !== 'function') {
    return null;
  }

  return channel;
}

async function relayMentionedMediaOnlyMessage(message) {
  const mentionedUserIds = getRelayMentionedUserIds(message);

  if (mentionedUserIds.length === 0) {
    return;
  }

  const relayChannel = await resolveMediaRelayChannel(message.guild);

  if (!relayChannel) {
    return;
  }

  await relayChannel.send({
    content: buildMediaRelayContent(message, mentionedUserIds),
    allowedMentions: {
      parse: [],
      roles: [],
      users: [message.author.id, ...mentionedUserIds],
      repliedUser: false,
    },
  }).catch(() => null);
}

async function enforceMediaOnlyMessage(message) {
  const mediaOnlyChannelIds = await getMediaOnlyChannelIds(message.guild.id);
  const isMediaOnly = mediaOnlyChannelIds.has(message.channel.id);

  if (!isMediaOnly || hasMediaContent(message)) {
    return false;
  }

  const generalChannel = findGeneralChatChannel(
    message.guild,
    mediaOnlyChannelIds,
    message.channel.id,
  );

  await message.delete().catch(() => null);
  await relayMentionedMediaOnlyMessage(message);

  const notice = await message.channel.send(cv2Payload(buildMediaOnlyNoticeContainer({
    generalChannel,
  }), {
    allowedMentions: { parse: [], repliedUser: false },
  })).catch(() => null);

  if (notice) {
    const deleteTimer = setTimeout(() => {
      notice.delete().catch(() => null);
    }, MEDIA_NOTICE_DELETE_MS);
    deleteTimer.unref?.();
  }

  return true;
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

/**
 * Build a short bot info panel when the bot is mentioned.
 */
function buildBotMentionContainer({ client, prefix }) {
  const botName = client.user?.username || 'Orbix';
  const commandCount = client.commands?.size || 0;

  return new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${emojis.label('orbix.orbix', botName)}`,
      ),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        'I am your server moderation and utility bot.',
        '',
        `> **Server Prefix:** \`${prefix}\``,
        `> **Commands Loaded:** **${commandCount}**`,
        `> **Help:** \`${prefix}help\``,
      ].join('\n')),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(createFooterText());
}

function isBotMentioned(message, client) {
  const botId = client.user?.id;

  if (!botId) {
    return false;
  }

  return new RegExp(`<@!?${botId}>`).test(message.content);
}

async function sendBotMentionReply({ client, message, prefix }) {
  await message.reply(cv2Payload(buildBotMentionContainer({
    client,
    prefix,
  }), {
    allowedMentions: { parse: [], repliedUser: false },
  })).catch(() => null);
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

const COMMAND_TIMEOUT_MS = 10_000;

/**
 * The payload used to replace a timed-out command response.
 * Shown in-place after COMMAND_TIMEOUT_MS milliseconds.
 */
const TIMEOUT_EDIT_PAYLOAD = cv2Payload(
  new ContainerBuilder().addTextDisplayComponents(
    new TextDisplayBuilder().setContent('*This response has expired.*'),
  ),
  { attachments: [] },
);

async function processLevelingSafely(message, prefix) {
  return processLevelingMessage(message, prefix).catch((error) => {
    console.warn(`[leveling] Failed to process XP for ${message.author.id} in ${message.guild.id}:`, error);
    return null;
  });
}

/**
 * Returns a Proxy around `message` that, after `delayMs` milliseconds, edits
 * every command reply / channel.send to show a timeout notice instead of the
 * original content.  Falls back to deletion if the edit fails.
 * Only ONE file (this one) needs to change — all commands benefit automatically.
 */
function createTimeoutProxy(message, delayMs) {
  function scheduleTimeout(promise) {
    return Promise.resolve(promise)
      .then((sent) => {
        if (sent) {
          const t = setTimeout(() => {
            sent.edit(TIMEOUT_EDIT_PAYLOAD)
              .catch(() => sent.delete().catch(() => null));
          }, delayMs);
          t.unref?.();
        }
        return sent;
      })
      .catch(() => null);
  }

  // Proxy for message.channel — intercepts .send()
  const channelProxy = new Proxy(message.channel, {
    get(target, prop, receiver) {
      if (prop === 'send') {
        return (...args) => scheduleTimeout(Reflect.get(target, prop, receiver).apply(target, args));
      }
      const value = Reflect.get(target, prop, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });

  // Proxy for message — intercepts .reply() and returns channelProxy for .channel
  return new Proxy(message, {
    get(target, prop, receiver) {
      if (prop === 'reply') {
        return (...args) => scheduleTimeout(Reflect.get(target, prop, receiver).apply(target, args));
      }
      if (prop === 'channel') {
        return channelProxy;
      }
      const value = Reflect.get(target, prop, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

async function handleMessageCreate(client, message) {
  if (!message.guild || message.author.bot) {
    return;
  }

  const prefix = await getGuildPrefix(message.guild.id);
  const hasPrefix = message.content.toLowerCase().startsWith(prefix.toLowerCase());
  const botWasMentioned = isBotMentioned(message, client);
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
      if (await enforceMediaOnlyMessage(message)) {
        return;
      }

      // Even without prefix, still process AFK mentions for normal messages
      await processAfk(message, false);
      await processLevelingSafely(message, prefix);
      if (botWasMentioned) {
        await sendBotMentionReply({ client, message, prefix });
      }

      return;
    }
    usedNoPrefix = true;
  }

  if (!input) {
    if (await enforceMediaOnlyMessage(message)) {
      return;
    }

    await processAfk(message, false);
    await processLevelingSafely(message, prefix);
    return;
  }

  resolvedCommand ||= resolveCommand(client, input);

  if (!resolvedCommand) {
    if (await enforceMediaOnlyMessage(message)) {
      return;
    }

    await processAfk(message, false);
    await processLevelingSafely(message, prefix);

    if (!hasPrefix && botWasMentioned) {
      await sendBotMentionReply({ client, message, prefix });
    }

    return;
  }

  // Process AFK before command execution
  const isAfkCommand = resolvedCommand.resolvedName === 'afk';
  await processAfk(message, isAfkCommand);

  // Wrap message so all command replies/sends show a timeout notice after COMMAND_TIMEOUT_MS.
  // Commands with noTimeout: true are excluded (e.g. help — it has persistent interactive components).
  const timedMessage = resolvedCommand.command.noTimeout
    ? message
    : createTimeoutProxy(message, COMMAND_TIMEOUT_MS);

  try {
    await resolvedCommand.command.execute({
      args: resolvedCommand.args,
      client,
      message: timedMessage,
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

    // Error reply also shows timeout notice
    const errMsg = await message.reply(cv2Payload(container)).catch(() => null);
    if (errMsg) {
      const t = setTimeout(() => {
        errMsg.edit(TIMEOUT_EDIT_PAYLOAD).catch(() => errMsg.delete().catch(() => null));
      }, COMMAND_TIMEOUT_MS);
      t.unref?.();
    }
  }
}

module.exports = {
  handleMessageCreate,
};
