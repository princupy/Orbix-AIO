const {
  ContainerBuilder,
  PermissionsBitField,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  ThumbnailBuilder,
} = require('discord.js');
const emojis = require('../emojis');
const { cv2Payload } = require('./cv2');
const { getWelcomeConfig } = require('../supabase/welcome');
const { isModuleEnabled } = require('../supabase/modules');

const DEFAULT_WELCOME_MESSAGE = 'Welcome {user} to **{server}**! You are our **{membercount}**th member. 🎉';
const MESSAGE_MAX_LENGTH = 1500;

function createSeparator() {
  return new SeparatorBuilder()
    .setDivider(true)
    .setSpacing(SeparatorSpacingSize.Small);
}

function createFooterText() {
  const poweredEmoji = emojis.getEmoji('cutu.nitish') || emojis.getEmoji('status.success') || '*';
  return new TextDisplayBuilder().setContent(`${poweredEmoji} Made by [Tanmay](https://www.instagram.com/tanmoy_here8388/)`);
}

function truncate(value, max = MESSAGE_MAX_LENGTH) {
  const text = String(value ?? '');
  return text.length <= max ? text : `${text.slice(0, Math.max(0, max - 1))}…`;
}

/**
 * Replace supported placeholders in a welcome message template.
 * Supported: {user} {username} {tag} {server} {membercount} {members}
 */
function applyPlaceholders(template, { guild, member }) {
  const { user } = member;

  return String(template)
    .replaceAll('{user}', `<@${user.id}>`)
    .replaceAll('{username}', user.username)
    .replaceAll('{tag}', user.tag)
    .replaceAll('{server}', guild.name)
    .replaceAll('{membercount}', String(guild.memberCount))
    .replaceAll('{members}', String(guild.memberCount));
}

/* ── CV2 builders ── */

function buildWelcomeContainer({ guild, member, message }) {
  const { user } = member;
  const text = truncate(applyPlaceholders(message || DEFAULT_WELCOME_MESSAGE, { guild, member }));

  const section = new SectionBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(text),
    )
    .setThumbnailAccessory(
      new ThumbnailBuilder()
        .setURL(user.displayAvatarURL({ extension: 'png', size: 256 }))
        .setDescription(`${user.username} avatar`),
    );

  return new ContainerBuilder()
    .addSectionComponents(section)
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(createFooterText());
}

function buildWelcomeNotice(title, description) {
  return new ContainerBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${title}`))
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(description))
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(createFooterText());
}

function buildWelcomeStatus({ config }) {
  const enabledLabel = config.enabled
    ? `${emojis.getEmoji('status.success') || '✅'} Enabled`
    : `${emojis.getEmoji('status.error') || '❌'} Disabled`;
  const channelLabel = config.channel_id ? `<#${config.channel_id}>` : '`Not set`';

  return new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${emojis.label('orbix.orbix', 'Welcome Settings')}`),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        `> **System:** ${enabledLabel}`,
        `> **Channel:** ${channelLabel}`,
        '',
        '**Message:**',
        config.message ? truncate(config.message, 800) : '`Default message`',
        '',
        '**Placeholders:** `{user}` `{username}` `{server}` `{membercount}`',
      ].join('\n')),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(createFooterText());
}

/* ── On-join handler ── */

async function handleWelcomeMemberAdd(member) {
  try {
    const { guild, user } = member;

    if (!guild || !user || user.bot) {
      return;
    }

    if (!(await isModuleEnabled(guild.id, 'welcome'))) {
      return;
    }

    const { config } = await getWelcomeConfig(guild.id);

    if (!config.enabled || !config.channel_id) {
      return;
    }

    const channel = guild.channels.cache.get(config.channel_id)
      || await guild.channels.fetch(config.channel_id).catch(() => null);

    if (!channel || typeof channel.send !== 'function' || !channel.isTextBased?.()) {
      return;
    }

    const me = guild.members.me || await guild.members.fetchMe().catch(() => null);
    const perms = me ? channel.permissionsFor(me) : null;

    if (perms && !perms.has([PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages])) {
      return;
    }

    await channel.send(cv2Payload(buildWelcomeContainer({ guild, member, message: config.message }), {
      allowedMentions: { parse: [], users: [user.id] },
    })).catch((error) => {
      console.warn(`[welcome] Failed to send welcome in guild ${guild.id}:`, error?.message || error);
    });
  } catch (error) {
    console.warn('[welcome] member add handler failed:', error?.message || error);
  }
}

module.exports = {
  DEFAULT_WELCOME_MESSAGE,
  MESSAGE_MAX_LENGTH,
  applyPlaceholders,
  buildWelcomeContainer,
  buildWelcomeNotice,
  buildWelcomeStatus,
  handleWelcomeMemberAdd,
};
