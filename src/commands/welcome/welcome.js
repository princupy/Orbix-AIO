const { PermissionsBitField } = require('discord.js');
const emojis = require('../../emojis');
const { cv2Payload } = require('../../utils/cv2');
const {
  MESSAGE_MAX_LENGTH,
  buildWelcomeContainer,
  buildWelcomeNotice,
  buildWelcomeStatus,
} = require('../../utils/welcome');
const {
  getWelcomeConfig,
  resetWelcomeData,
  updateWelcomeConfig,
} = require('../../supabase/welcome');

const CHANNEL_DISABLE_WORDS = new Set(['off', 'disable', 'none', 'remove', 'unset']);
const MESSAGE_RESET_WORDS = new Set(['default', 'reset', 'clear']);

function reply(message, container) {
  return message.reply(cv2Payload(container, {
    allowedMentions: {
      parse: [], repliedUser: false, roles: [], users: [],
    },
  }));
}

function hasPermission(member) {
  return Boolean(
    member?.permissions?.has(PermissionsBitField.Flags.Administrator)
    || member?.permissions?.has(PermissionsBitField.Flags.ManageGuild),
  );
}

function extractChannelId(value) {
  const mentionMatch = String(value || '').match(/^<#(\d{17,20})>$/);

  if (mentionMatch) {
    return mentionMatch[1];
  }

  return /^\d{17,20}$/.test(String(value || '')) ? String(value) : null;
}

// Raw message text after the command + subcommand tokens (preserves newlines).
function extractMessageText(message, usedPrefix) {
  let content = message.content ?? '';

  if (usedPrefix && content.toLowerCase().startsWith(usedPrefix.toLowerCase())) {
    content = content.slice(usedPrefix.length);
  }

  return content.replace(/^\s*\S+\s+\S+\s*/, '').trim();
}

function saveErrorNotice(result) {
  return buildWelcomeNotice(
    emojis.label('status.error', 'Save Failed'),
    `Could not update the welcome config.\n\`${result.reason || 'Unknown error'}\``,
  );
}

function usageNotice(prefix) {
  return buildWelcomeNotice(emojis.label('status.warning', 'Welcome Commands'), [
    `> \`${prefix}welcome channel #channel\` — set the welcome channel`,
    `> \`${prefix}welcome message <text>\` — set a custom message`,
    `> \`${prefix}welcome message default\` — use the default message`,
    `> \`${prefix}welcome toggle\` — enable/disable welcomes`,
    `> \`${prefix}welcome test\` — send a test welcome`,
    `> \`${prefix}welcome status\` — show current settings`,
    `> \`${prefix}welcome reset\` — reset to default`,
    '',
    '**Placeholders:** `{user}` `{username}` `{server}` `{membercount}`',
  ].join('\n'));
}

async function execute({
  args, message, prefix, usedPrefix,
}) {
  if (!hasPermission(message.member)) {
    await reply(message, buildWelcomeNotice(
      emojis.label('status.error', 'Missing Permission'),
      'You need **Manage Server** or **Administrator** permission to configure welcomes.',
    ));
    return;
  }

  const sub = (args[0] || 'status').toLowerCase();
  const { config } = await getWelcomeConfig(message.guild.id);

  if (sub === 'status' || sub === 'config') {
    await reply(message, buildWelcomeStatus({ config }));
    return;
  }

  if (sub === 'toggle') {
    const result = await updateWelcomeConfig(message.guild.id, { enabled: !config.enabled });

    if (!result.ok) {
      await reply(message, saveErrorNotice(result));
      return;
    }

    await reply(message, buildWelcomeNotice(
      emojis.label('status.success', 'Welcome Toggled'),
      `Welcome messages are now **${result.config.enabled ? 'Enabled' : 'Disabled'}**.`,
    ));
    return;
  }

  if (sub === 'reset') {
    const result = await resetWelcomeData(message.guild.id);

    if (!result.ok) {
      await reply(message, saveErrorNotice(result));
      return;
    }

    await reply(message, buildWelcomeNotice(
      emojis.label('status.success', 'Welcome Reset'),
      'Welcome configuration has been reset to default.',
    ));
    return;
  }

  if (sub === 'channel') {
    const value = args[1];

    if (value && CHANNEL_DISABLE_WORDS.has(value.toLowerCase())) {
      const result = await updateWelcomeConfig(message.guild.id, { channel_id: null });

      if (!result.ok) {
        await reply(message, saveErrorNotice(result));
        return;
      }

      await reply(message, buildWelcomeNotice(
        emojis.label('status.success', 'Welcome Channel Cleared'),
        'The welcome channel has been unset. No welcomes will be sent until you set one.',
      ));
      return;
    }

    const channelId = extractChannelId(value);
    const channel = channelId ? message.guild.channels.cache.get(channelId) : null;

    if (!channel || !channel.isTextBased?.() || channel.isThread?.()) {
      await reply(message, buildWelcomeNotice(
        emojis.label('status.error', 'Invalid Channel'),
        `Mention a text channel or provide its ID.\nUsage: \`${prefix}welcome channel #channel\``,
      ));
      return;
    }

    const botMember = message.guild.members.me || await message.guild.members.fetchMe().catch(() => null);
    const canSend = botMember && channel.permissionsFor(botMember)?.has([
      PermissionsBitField.Flags.ViewChannel,
      PermissionsBitField.Flags.SendMessages,
    ]);

    if (!canSend) {
      await reply(message, buildWelcomeNotice(
        emojis.label('status.warning', 'Missing Channel Access'),
        `I need **View Channel** and **Send Messages** in <#${channel.id}> to post welcomes there.`,
      ));
      return;
    }

    const result = await updateWelcomeConfig(message.guild.id, { channel_id: channelId });

    if (!result.ok) {
      await reply(message, saveErrorNotice(result));
      return;
    }

    await reply(message, buildWelcomeNotice(
      emojis.label('status.success', 'Welcome Channel Set'),
      `Welcome messages will be sent to <#${channelId}>.${config.enabled ? '' : `\n\nWelcomes are **disabled** — enable them with \`${prefix}welcome toggle\`.`}`,
    ));
    return;
  }

  if (sub === 'message') {
    const firstArg = (args[1] || '').toLowerCase();

    if (args.length > 1 && MESSAGE_RESET_WORDS.has(firstArg) && args.length === 2) {
      const result = await updateWelcomeConfig(message.guild.id, { message: null });

      if (!result.ok) {
        await reply(message, saveErrorNotice(result));
        return;
      }

      await reply(message, buildWelcomeNotice(
        emojis.label('status.success', 'Welcome Message Reset'),
        'The welcome message is now the **default**.',
      ));
      return;
    }

    const text = extractMessageText(message, usedPrefix);

    if (!text) {
      await reply(message, buildWelcomeNotice(
        emojis.label('status.warning', 'Set a Message'),
        [
          `**Usage:** \`${prefix}welcome message <text>\``,
          '**Placeholders:** `{user}` `{username}` `{server}` `{membercount}`',
          '',
          `Example: \`${prefix}welcome message Welcome {user} to {server}! You are member {membercount}.\``,
        ].join('\n'),
      ));
      return;
    }

    if (text.length > MESSAGE_MAX_LENGTH) {
      await reply(message, buildWelcomeNotice(
        emojis.label('status.error', 'Message Too Long'),
        `Your message is **${text.length}** characters. The maximum is **${MESSAGE_MAX_LENGTH}**.`,
      ));
      return;
    }

    const result = await updateWelcomeConfig(message.guild.id, { message: text });

    if (!result.ok) {
      await reply(message, saveErrorNotice(result));
      return;
    }

    await reply(message, buildWelcomeNotice(
      emojis.label('status.success', 'Welcome Message Set'),
      `Custom welcome message saved. Use \`${prefix}welcome test\` to preview it.`,
    ));
    return;
  }

  if (sub === 'test') {
    const targetChannel = config.channel_id
      ? (message.guild.channels.cache.get(config.channel_id)
        || await message.guild.channels.fetch(config.channel_id).catch(() => null))
      : message.channel;

    if (!targetChannel || typeof targetChannel.send !== 'function') {
      await reply(message, buildWelcomeNotice(
        emojis.label('status.error', 'Channel Not Found'),
        `Set a valid welcome channel first: \`${prefix}welcome channel #channel\`.`,
      ));
      return;
    }

    const sent = await targetChannel.send(cv2Payload(
      buildWelcomeContainer({ guild: message.guild, member: message.member, message: config.message }),
      { allowedMentions: { parse: [], users: [message.author.id] } },
    )).catch(() => null);

    if (!sent) {
      await reply(message, buildWelcomeNotice(
        emojis.label('status.error', 'Test Failed'),
        `I could not send to <#${targetChannel.id}>. Check my permissions there.`,
      ));
      return;
    }

    if (targetChannel.id !== message.channel.id) {
      await reply(message, buildWelcomeNotice(
        emojis.label('status.success', 'Test Sent'),
        `A test welcome was sent to <#${targetChannel.id}>.`,
      ));
    }

    return;
  }

  await reply(message, usageNotice(prefix));
}

module.exports = {
  name: 'welcome',
  aliases: ['welcomer', 'greet'],
  category: 'welcome',
  description: 'Send a welcome message to a set channel when a new member joins.',
  usage: 'LR!welcome <channel|message|toggle|test|status|reset> [value]',
  noTimeout: true,
  execute,
};
