const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  PermissionsBitField,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
} = require('discord.js');
const emojis = require('../../emojis');
const { cv2Payload } = require('../../utils/cv2');

const MUTE_DELETE_CUSTOM_ID_PREFIX = 'mute:delete:';
const MAX_TIMEOUT_MS = 28 * 24 * 60 * 60 * 1000;
const DEFAULT_REASON = 'No reason provided.';
const DISCORD_REASON_LIMIT = 512;

const DURATION_UNITS = {
  d: 24 * 60 * 60 * 1000,
  day: 24 * 60 * 60 * 1000,
  days: 24 * 60 * 60 * 1000,
  h: 60 * 60 * 1000,
  hour: 60 * 60 * 1000,
  hours: 60 * 60 * 1000,
  hr: 60 * 60 * 1000,
  hrs: 60 * 60 * 1000,
  m: 60 * 1000,
  min: 60 * 1000,
  mins: 60 * 1000,
  minute: 60 * 1000,
  minutes: 60 * 1000,
  s: 1000,
  sec: 1000,
  secs: 1000,
  second: 1000,
  seconds: 1000,
  w: 7 * 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
  weeks: 7 * 24 * 60 * 60 * 1000,
};

/* ── Reusable helpers (matches existing codebase style) ── */

function createSeparator() {
  return new SeparatorBuilder()
    .setDivider(true)
    .setSpacing(SeparatorSpacingSize.Small);
}

function createFooterText() {
  const poweredEmoji = emojis.getEmoji('lr.logo') || emojis.getEmoji('status.success') || '*';
  return new TextDisplayBuilder().setContent(`${poweredEmoji} **Powered by Prince**`);
}

function createDeleteRow(ownerId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${MUTE_DELETE_CUSTOM_ID_PREFIX}${ownerId}`)
      .setLabel('Delete')
      .setStyle(ButtonStyle.Secondary),
  );
}

function createEphemeralTextPayload(content) {
  return cv2Payload(
    new ContainerBuilder().addTextDisplayComponents(
      new TextDisplayBuilder().setContent(content),
    ),
    { ephemeral: true },
  );
}

function hasMutePermission(member) {
  return Boolean(
    member?.permissions?.has(PermissionsBitField.Flags.Administrator)
    || member?.permissions?.has(PermissionsBitField.Flags.ModerateMembers),
  );
}

/* ── Container builders ── */

function buildMissingUserPermContainer() {
  return new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${emojis.label('status.error', 'Missing Permission')}`,
      ),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        'You need **Moderate Members / Timeout Members** or **Administrator** permission to use this command.',
      ),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(createFooterText());
}

function buildMissingBotPermContainer({ ownerId }) {
  return new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${emojis.label('status.error', 'Bot Permission Missing')}`,
      ),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        'I need **Moderate Members / Timeout Members** or **Administrator** permission to mute members.',
      ),
    )
    .addSeparatorComponents(createSeparator())
    .addActionRowComponents(createDeleteRow(ownerId))
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(createFooterText());
}

function buildUsageContainer({ prefix, ownerId }) {
  return new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${emojis.label('status.warning', 'Mute Usage')}`,
      ),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        `**Usage:** \`${prefix}mute @user <duration> [reason]\``,
        '',
        '**Examples:**',
        `> \`${prefix}mute @user 10m spam\``,
        `> \`${prefix}mute @user 1h30m toxic chat\``,
        `> \`${prefix}mute 123456789012345678 2 days rule violation\``,
        '',
        '*Duration supports seconds, minutes, hours, days, and weeks. Max: **28 days**.*',
      ].join('\n')),
    )
    .addSeparatorComponents(createSeparator())
    .addActionRowComponents(createDeleteRow(ownerId))
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(createFooterText());
}

function buildErrorContainer({ errorMessage, ownerId, title = 'Mute Failed' }) {
  return new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${emojis.label('status.error', title)}`,
      ),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(errorMessage),
    )
    .addSeparatorComponents(createSeparator())
    .addActionRowComponents(createDeleteRow(ownerId))
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(createFooterText());
}

function buildSuccessContainer({
  durationLabel,
  mutedUntil,
  ownerId,
  reason,
  targetMember,
}) {
  return new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${emojis.label('status.success', 'User Muted')}`,
      ),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        `Successfully muted <@${targetMember.id}> for **${durationLabel}**.`,
        `**Until:** <t:${Math.floor(mutedUntil / 1000)}:F> (<t:${Math.floor(mutedUntil / 1000)}:R>)`,
        `**Reason:** ${reason}`,
        '',
        `*Muted by <@${ownerId}>*`,
      ].join('\n')),
    )
    .addSeparatorComponents(createSeparator())
    .addActionRowComponents(createDeleteRow(ownerId))
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(createFooterText());
}

/* ── Parsing helpers ── */

function extractUserId(value) {
  const mentionMatch = value?.match(/^<@!?(\d{17,20})>$/);

  if (mentionMatch) {
    return mentionMatch[1];
  }

  return /^\d{17,20}$/.test(value || '') ? value : null;
}

function isDurationUnit(value) {
  return Boolean(DURATION_UNITS[String(value || '').toLowerCase()]);
}

function parseDurationPart(part) {
  const text = String(part || '').toLowerCase().replace(/\s+/g, '');

  if (/^\d+$/.test(text)) {
    return Number(text) * DURATION_UNITS.m;
  }

  let total = 0;
  let consumed = '';
  const pattern = /(\d+)(seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|hr|h|days?|d|weeks?|w)/g;
  let match;

  while ((match = pattern.exec(text)) !== null) {
    total += Number(match[1]) * DURATION_UNITS[match[2]];
    consumed += match[0];
  }

  if (!total || consumed.length !== text.length) {
    return null;
  }

  return total;
}

function consumeDuration(args, startIndex) {
  const parts = [];
  let index = startIndex;

  while (index < args.length) {
    const current = args[index];
    const next = args[index + 1];

    if (/^\d+$/.test(current || '') && isDurationUnit(next)) {
      parts.push(`${current}${next}`);
      index += 2;
      continue;
    }

    const parsed = parseDurationPart(current);

    if (!parsed) {
      break;
    }

    parts.push(current);
    index += 1;
  }

  if (parts.length === 0) {
    return {
      durationMs: null,
      nextIndex: startIndex,
    };
  }

  const durationMs = parts.reduce((sum, part) => sum + parseDurationPart(part), 0);

  return {
    durationMs,
    nextIndex: index,
  };
}

function formatDuration(durationMs) {
  const units = [
    ['day', DURATION_UNITS.d],
    ['hour', DURATION_UNITS.h],
    ['minute', DURATION_UNITS.m],
    ['second', DURATION_UNITS.s],
  ];
  let remaining = durationMs;
  const labels = [];

  for (const [label, unitMs] of units) {
    const amount = Math.floor(remaining / unitMs);

    if (amount > 0) {
      labels.push(`${amount} ${label}${amount === 1 ? '' : 's'}`);
      remaining -= amount * unitMs;
    }
  }

  return labels.join(', ') || '0 seconds';
}

function cleanReason(reason) {
  const normalized = reason?.trim() || DEFAULT_REASON;
  return normalized.slice(0, DISCORD_REASON_LIMIT);
}

async function resolveTargetMember(message, targetArg) {
  const targetId = extractUserId(targetArg);

  if (!targetId) {
    return null;
  }

  return message.guild.members.fetch(targetId).catch(() => null);
}

function canMemberModerateTarget(actorMember, targetMember) {
  if (actorMember.id === actorMember.guild.ownerId) {
    return true;
  }

  if (targetMember.id === actorMember.guild.ownerId) {
    return false;
  }

  return actorMember.roles.highest.position > targetMember.roles.highest.position;
}

function getReadableError(error) {
  if (error.code === 50013) {
    return 'I could not mute this member because my role is too low or I am missing **Moderate Members** permission.';
  }

  if (error.code === 50035) {
    return 'Discord rejected the mute request. Please check the duration and try again.';
  }

  return `An error occurred while muting this member.\n\`${error.message}\``;
}

/* ── Command execute (prefix usage) ── */

async function execute({ args, message, prefix }) {
  const ownerId = message.author.id;

  if (!hasMutePermission(message.member)) {
    await message.reply(cv2Payload(buildMissingUserPermContainer()));
    return;
  }

  const botMember = message.guild.members.me
    || await message.guild.members.fetchMe().catch(() => null);

  if (!hasMutePermission(botMember)) {
    await message.reply(cv2Payload(buildMissingBotPermContainer({ ownerId })));
    return;
  }

  const targetMember = await resolveTargetMember(message, args[0]);

  if (!targetMember) {
    await message.reply(cv2Payload(buildUsageContainer({ prefix, ownerId })));
    return;
  }

  const { durationMs, nextIndex } = consumeDuration(args, 1);

  if (!durationMs || durationMs < DURATION_UNITS.s || durationMs > MAX_TIMEOUT_MS) {
    await message.reply(cv2Payload(buildErrorContainer({
      errorMessage: 'Please provide a valid duration between **1 second** and **28 days**.',
      ownerId,
      title: 'Invalid Duration',
    })));
    return;
  }

  if (targetMember.id === message.author.id) {
    await message.reply(cv2Payload(buildErrorContainer({
      errorMessage: 'You cannot mute yourself.',
      ownerId,
    })));
    return;
  }

  if (targetMember.id === message.client.user.id) {
    await message.reply(cv2Payload(buildErrorContainer({
      errorMessage: 'I cannot mute myself.',
      ownerId,
    })));
    return;
  }

  if (!canMemberModerateTarget(message.member, targetMember)) {
    await message.reply(cv2Payload(buildErrorContainer({
      errorMessage: 'You cannot mute this member because their highest role is equal to or higher than yours, or they own the server.',
      ownerId,
    })));
    return;
  }

  if (!canMemberModerateTarget(botMember, targetMember) || !targetMember.moderatable) {
    await message.reply(cv2Payload(buildErrorContainer({
      errorMessage: 'I cannot mute this member because their highest role is equal to or higher than mine, or they own the server.',
      ownerId,
    })));
    return;
  }

  const reason = cleanReason(args.slice(nextIndex).join(' '));
  const auditReason = cleanReason(`Muted by ${message.author.tag} (${message.author.id}): ${reason}`);
  const mutedUntil = Date.now() + durationMs;

  try {
    await targetMember.timeout(durationMs, auditReason);

    await message.channel.send(cv2Payload(buildSuccessContainer({
      durationLabel: formatDuration(durationMs),
      mutedUntil,
      ownerId,
      reason,
      targetMember,
    })));
  } catch (error) {
    console.error('Mute failed:', error);

    await message.channel.send(cv2Payload(buildErrorContainer({
      errorMessage: getReadableError(error),
      ownerId,
    })));
  }
}

async function handleDeleteButton({ interaction }) {
  const ownerId = interaction.customId.slice(MUTE_DELETE_CUSTOM_ID_PREFIX.length);

  if (interaction.user.id !== ownerId) {
    await interaction.reply(createEphemeralTextPayload('Only the command user can delete this panel.')).catch(() => null);
    return;
  }

  await interaction.deferUpdate().catch(() => null);

  const deleted = await interaction.message.delete()
    .then(() => true)
    .catch(() => false);

  if (!deleted) {
    await interaction.followUp(createEphemeralTextPayload('I could not delete this panel.')).catch(() => null);
  }
}

module.exports = {
  name: 'mute',
  aliases: ['timeout', 'tmute'],
  category: 'moderation',
  description: 'Mute a member using Discord timeout with permission and role hierarchy checks.',
  usage: 'LR!mute @user <duration> [reason]',
  execute,
  componentHandlers: [
    {
      customIdPrefix: MUTE_DELETE_CUSTOM_ID_PREFIX,
      execute: handleDeleteButton,
    },
  ],
};
