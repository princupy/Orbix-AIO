const {
  ContainerBuilder,
  PermissionsBitField,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
} = require('discord.js');
const emojis = require('../../emojis');
const { cv2Payload } = require('../../utils/cv2');
const {
  LOG_TYPES,
  getLogConfig,
  resetLogData,
  resolveLogType,
  updateLogConfig,
} = require('../../supabase/logs');

const DISABLE_WORDS = new Set(['disable', 'off', 'none', 'remove', 'clear', 'unset']);

function createSeparator() {
  return new SeparatorBuilder()
    .setDivider(true)
    .setSpacing(SeparatorSpacingSize.Small);
}

function createFooterText() {
  const poweredEmoji = emojis.getEmoji('cutu.nitish') || emojis.getEmoji('status.success') || '*';
  return new TextDisplayBuilder().setContent(`${poweredEmoji} Made by [Tanmay](https://www.instagram.com/tanmoy_here8388/)`);
}

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

function buildNotice(title, description) {
  return new ContainerBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${title}`))
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(description))
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(createFooterText());
}

function buildConfigView(config, prefix) {
  const rows = LOG_TYPES.map((type) => {
    const channelId = config[type.column];
    const value = channelId ? `<#${channelId}>` : '`Not set`';
    return `> ${type.emoji} **${type.label}:** ${value}`;
  });

  return new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${emojis.label('orbix.orbix', 'Logging Configuration')}`),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(rows.join('\n')))
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        '**Set a log channel:**',
        `> \`${prefix}logs <type> <#channel>\``,
        '**Disable a log:**',
        `> \`${prefix}logs <type> disable\``,
        '**Reset all logs:**',
        `> \`${prefix}logs reset\``,
        '',
        `**Types:** ${LOG_TYPES.map((type) => `\`${type.key}\``).join(', ')}`,
        '',
        '**Example:**',
        `> \`${prefix}logs ban #mod-logs\``,
      ].join('\n')),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(createFooterText());
}

async function execute({ args, message, prefix }) {
  if (!hasPermission(message.member)) {
    await reply(message, buildNotice(
      emojis.label('status.error', 'Missing Permission'),
      'You need **Manage Server** or **Administrator** permission to configure logging.',
    ));
    return;
  }

  const { config } = await getLogConfig(message.guild.id);
  const sub = args[0]?.toLowerCase();

  if (!sub) {
    await reply(message, buildConfigView(config, prefix));
    return;
  }

  if (sub === 'reset') {
    const result = await resetLogData(message.guild.id);

    if (!result.ok) {
      await reply(message, buildNotice(
        emojis.label('status.error', 'Reset Failed'),
        `Could not reset logging config.\n\`${result.reason}\``,
      ));
      return;
    }

    await reply(message, buildNotice(
      emojis.label('status.success', 'Logging Reset'),
      'All log channels have been cleared.',
    ));
    return;
  }

  const type = resolveLogType(sub);

  if (!type) {
    await reply(message, buildNotice(
      emojis.label('status.error', 'Unknown Log Type'),
      [
        `\`${sub}\` is not a valid log type.`,
        '',
        `**Valid types:** ${LOG_TYPES.map((entry) => `\`${entry.key}\``).join(', ')}`,
        '',
        `Usage: \`${prefix}logs <type> <#channel>\``,
      ].join('\n'),
    ));
    return;
  }

  const value = args[1];

  if (!value) {
    await reply(message, buildNotice(
      emojis.label('status.warning', `${type.label} Setup`),
      [
        `**Set:** \`${prefix}logs ${type.key} <#channel>\``,
        `**Disable:** \`${prefix}logs ${type.key} disable\``,
      ].join('\n'),
    ));
    return;
  }

  if (DISABLE_WORDS.has(value.toLowerCase())) {
    const result = await updateLogConfig(message.guild.id, { [type.column]: null });

    if (!result.ok) {
      await reply(message, buildNotice(
        emojis.label('status.error', 'Save Failed'),
        `Could not update the config.\n\`${result.reason}\``,
      ));
      return;
    }

    await reply(message, buildNotice(
      emojis.label('status.success', 'Log Disabled'),
      `**${type.label}** have been disabled.`,
    ));
    return;
  }

  const channelId = extractChannelId(value);
  const channel = channelId ? message.guild.channels.cache.get(channelId) : null;

  if (!channel || !channel.isTextBased?.() || channel.isThread?.()) {
    await reply(message, buildNotice(
      emojis.label('status.error', 'Invalid Channel'),
      `Mention a text channel or provide its ID.\nUsage: \`${prefix}logs ${type.key} <#channel>\``,
    ));
    return;
  }

  const botMember = message.guild.members.me || await message.guild.members.fetchMe().catch(() => null);
  const canSend = botMember
    && channel.permissionsFor(botMember)?.has([
      PermissionsBitField.Flags.ViewChannel,
      PermissionsBitField.Flags.SendMessages,
    ]);

  if (!canSend) {
    await reply(message, buildNotice(
      emojis.label('status.warning', 'Missing Channel Access'),
      `I need **View Channel** and **Send Messages** permission in <#${channel.id}> to post logs there.`,
    ));
    return;
  }

  const result = await updateLogConfig(message.guild.id, { [type.column]: channelId });

  if (!result.ok) {
    await reply(message, buildNotice(
      emojis.label('status.error', 'Save Failed'),
      `Could not update the config.\n\`${result.reason}\``,
    ));
    return;
  }

  await reply(message, buildNotice(
    emojis.label('status.success', 'Log Channel Set'),
    `**${type.label}** will now be sent to <#${channelId}>.`,
  ));
}

module.exports = {
  name: 'logs',
  aliases: ['logconfig', 'setlog', 'setlogs'],
  category: 'logs',
  description: 'Configure per-type log channels (message, mute, unmute, ban, kick, join, leave, voice).',
  usage: 'LR!logs [type] [#channel|disable] | LR!logs reset',
  noTimeout: true,
  execute,
};
