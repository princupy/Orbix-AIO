const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ContainerBuilder,
  PermissionsBitField,
  SeparatorBuilder,
  SeparatorSpacingSize,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextDisplayBuilder,
} = require('discord.js');
const emojis = require('../emojis');
const { cv2Payload } = require('./cv2');

// ─── UI helpers ────────────────────────────────────────────────────

function createSeparator() {
  return new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small);
}

function createFooter() {
  const emoji = emojis.getEmoji('cutu.nitish') || emojis.getEmoji('status.success') || '*';
  return new TextDisplayBuilder().setContent(`${emoji} Made by [Tanmay](https://www.instagram.com/tanmoy_here8388/)`);
}

function deleteRow(prefix, ownerId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${prefix}${ownerId}`)
      .setLabel('Delete')
      .setStyle(ButtonStyle.Secondary),
  );
}

function ephemeralText(content) {
  return cv2Payload(
    new ContainerBuilder().addTextDisplayComponents(
      new TextDisplayBuilder().setContent(content),
    ),
    { ephemeral: true },
  );
}

/**
 * Build a voice command response container.
 * @param {'success'|'error'|'warning'} type
 */
function vcContainer({ type = 'success', title, description, deletePrefix, ownerId }) {
  const label =
    type === 'error'   ? emojis.label('status.error',   title) :
    type === 'warning' ? emojis.label('status.warning', title) :
                         emojis.label('status.success', title);

  const c = new ContainerBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${label}`))
    .addSeparatorComponents(createSeparator());

  if (description) {
    c.addTextDisplayComponents(new TextDisplayBuilder().setContent(description))
     .addSeparatorComponents(createSeparator());
  }

  if (deletePrefix && ownerId) {
    c.addActionRowComponents(deleteRow(deletePrefix, ownerId))
     .addSeparatorComponents(createSeparator());
  }

  c.addTextDisplayComponents(createFooter());
  return c;
}

// ─── Parsing helpers ───────────────────────────────────────────────

function extractUserId(v) {
  const m = String(v || '').match(/^<@!?(\d{17,20})>$/);
  return m ? m[1] : (/^\d{17,20}$/.test(v || '') ? v : null);
}

function extractRoleId(v) {
  const m = String(v || '').match(/^<@&(\d{17,20})>$/);
  return m ? m[1] : (/^\d{17,20}$/.test(v || '') ? v : null);
}

function extractChannelId(v) {
  const m = String(v || '').match(/^<#(\d{17,20})>$/);
  return m ? m[1] : (/^\d{17,20}$/.test(v || '') ? v : null);
}

// ─── Permission helpers ────────────────────────────────────────────

/** True if member has Administrator OR every one of the given flags. */
function hasPerm(member, ...flags) {
  if (!member) return false;
  if (member.permissions?.has(PermissionsBitField.Flags.Administrator)) return true;
  return flags.every((f) => member.permissions?.has(f));
}

// ─── Voice channel helpers ─────────────────────────────────────────

/** All voice channels in the guild, sorted by position. */
function getVoiceChannels(guild) {
  return [...guild.channels.cache.values()]
    .filter((ch) => ch.type === ChannelType.GuildVoice || ch.type === ChannelType.GuildStageVoice)
    .sort((a, b) => (a.rawPosition ?? 0) - (b.rawPosition ?? 0));
}

/** True if the channel is a normal or stage voice channel. */
function isVoiceChannel(channel) {
  return Boolean(channel)
    && (channel.type === ChannelType.GuildVoice || channel.type === ChannelType.GuildStageVoice);
}

/**
 * Resolve a target voice/stage channel from a raw argument.
 * Accepts a <#id> mention, a raw ID, or a channel name (exact match, then partial).
 * Falls back to the author's current voice channel when no argument is given.
 * Returns the channel or null.
 */
function resolveVoiceChannel(message, rawArg) {
  const arg = String(rawArg || '').trim();

  if (arg) {
    const id = extractChannelId(arg);
    if (id) {
      const byId = message.guild.channels.cache.get(id);
      return isVoiceChannel(byId) ? byId : null;
    }

    const query = arg.toLowerCase();
    const channels = getVoiceChannels(message.guild);
    return channels.find((ch) => ch.name.toLowerCase() === query)
      || channels.find((ch) => ch.name.toLowerCase().includes(query))
      || null;
  }

  return message.member?.voice?.channel && isVoiceChannel(message.member.voice.channel)
    ? message.member.voice.channel
    : null;
}

/**
 * Build a StringSelectMenu ActionRow of voice channels.
 * Returns null if there are no options to show.
 */
function vcSelectRow(customId, placeholder, channels) {
  const list = channels.slice(0, 25);
  if (!list.length) return null;

  const options = list.map((ch) =>
    new StringSelectMenuOptionBuilder()
      .setLabel(ch.name.slice(0, 100))
      .setValue(ch.id)
      .setDescription(`${ch.members.size} member${ch.members.size === 1 ? '' : 's'}`),
  );

  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(customId)
      .setPlaceholder(placeholder)
      .addOptions(options),
  );
}

// ─── Component handlers ────────────────────────────────────────────

async function handleDelete(interaction, prefix) {
  const ownerId = interaction.customId.slice(prefix.length);

  if (interaction.user.id !== ownerId) {
    await interaction.reply(ephemeralText('Only the command user can delete this panel.')).catch(() => null);
    return;
  }

  await interaction.deferUpdate().catch(() => null);
  await interaction.message.delete().catch(() => null);
}

module.exports = {
  createSeparator,
  createFooter,
  deleteRow,
  ephemeralText,
  vcContainer,
  extractUserId,
  extractRoleId,
  extractChannelId,
  hasPerm,
  getVoiceChannels,
  isVoiceChannel,
  resolveVoiceChannel,
  vcSelectRow,
  handleDelete,
};
