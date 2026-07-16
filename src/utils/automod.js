const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ContainerBuilder,
  PermissionsBitField,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
} = require('discord.js');
const { isBotOwner } = require('../config');
const emojis = require('../emojis');
const { cv2Payload } = require('./cv2');
const {
  VALID_ACTIONS,
  getAutomodConfig,
  getAutomodExemptions,
  listBadWords,
  updateAutomodConfig,
} = require('../supabase/automod');

const AUTOMOD_DELETE_CUSTOM_ID_PREFIX = 'automod:delete:';
const NOTICE_DELETE_MS = 6000;
const TRACKER_TTL_MS = 10 * 60 * 1000;
const PRUNE_INTERVAL_MS = 60 * 1000;

/* ── Detection patterns ── */

const INVITE_PATTERN = /(?:https?:\/\/)?(?:www\.)?(?:discord(?:app)?\.com\/invite|discord\.gg|discord\.me|discord\.io|discord\.li|dsc\.gg|invite\.gg)\/[\w-]+/i;
const URL_PATTERN = /(?:https?:\/\/|www\.)[^\s]+/i;
const BARE_DOMAIN_PATTERN = /\b(?:[a-z0-9-]+\.)+(?:com|net|org|gg|io|me|xyz|tv|co|dev|app|link|site|online|store|shop|info|club|fun|live|ru|uk|us|in|de|fr|nl|edu|gov|biz|pro|top|vip|cc|ly|to|sh|gd|be)\b(?:\/[^\s]*)?/i;
const MENTION_TOKEN_PATTERN = /<@[!&]?\d{17,20}>/g;
const CUSTOM_EMOJI_PATTERN = /<a?:\w{2,32}:\d{17,20}>/g;
const UNICODE_EMOJI_PATTERN = /\p{Extended_Pictographic}/gu;

/* ── In-memory trackers (spam + duplicate) ── */

const spamTracker = new Map();
const duplicateTracker = new Map();
let lastPruneAt = Date.now();

function trackerKey(guildId, userId) {
  return `${guildId}:${userId}`;
}

function pruneTrackers(now = Date.now()) {
  if (now - lastPruneAt < PRUNE_INTERVAL_MS) {
    return;
  }

  lastPruneAt = now;

  for (const [key, value] of spamTracker) {
    if (now - value.lastSeen > TRACKER_TTL_MS) {
      spamTracker.delete(key);
    }
  }

  for (const [key, value] of duplicateTracker) {
    if (now - value.lastSeen > TRACKER_TTL_MS) {
      duplicateTracker.delete(key);
    }
  }
}

function registerSpam(guildId, userId, { count, intervalSeconds }) {
  const now = Date.now();
  const key = trackerKey(guildId, userId);
  const windowMs = Math.max(1, intervalSeconds) * 1000;
  const entry = spamTracker.get(key) || { lastSeen: now, timestamps: [] };

  entry.timestamps = entry.timestamps.filter((ts) => now - ts < windowMs);
  entry.timestamps.push(now);
  entry.lastSeen = now;
  spamTracker.set(key, entry);

  return entry.timestamps.length >= count;
}

function registerDuplicate(guildId, userId, content, { limit }) {
  const now = Date.now();
  const key = trackerKey(guildId, userId);
  const normalized = String(content || '').trim().toLowerCase();

  if (!normalized) {
    return false;
  }

  const entry = duplicateTracker.get(key) || { content: null, count: 0, lastSeen: now };

  if (entry.content === normalized) {
    entry.count += 1;
  } else {
    entry.content = normalized;
    entry.count = 1;
  }

  entry.lastSeen = now;
  duplicateTracker.set(key, entry);

  return entry.count >= limit;
}

/* ── Pure detectors ── */

function findInvite(content) {
  return INVITE_PATTERN.test(content || '');
}

function findLink(content) {
  const text = content || '';
  return URL_PATTERN.test(text) || BARE_DOMAIN_PATTERN.test(text);
}

function countMentions(message) {
  const content = message.content || '';
  const rawTokens = (content.match(MENTION_TOKEN_PATTERN) || []).length;
  const apiCount = (message.mentions?.users?.size || 0) + (message.mentions?.roles?.size || 0);
  const everyone = message.mentions?.everyone || /@everyone|@here/.test(content) ? 1 : 0;

  return Math.max(rawTokens, apiCount) + everyone;
}

function capsInfo(content) {
  const text = content || '';
  const letters = (text.match(/[a-zA-Z]/g) || []).length;
  const uppers = (text.match(/[A-Z]/g) || []).length;

  return {
    letters,
    percent: letters > 0 ? Math.round((uppers / letters) * 100) : 0,
  };
}

function countEmojis(content) {
  const text = content || '';
  const custom = (text.match(CUSTOM_EMOJI_PATTERN) || []).length;
  const unicode = (text.match(UNICODE_EMOJI_PATTERN) || []).length;

  return custom + unicode;
}

function findBadWord(content, words) {
  if (!words || words.length === 0) {
    return null;
  }

  const lower = String(content || '').toLowerCase();

  for (const word of words) {
    if (!word) {
      continue;
    }

    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = /^[a-z0-9]+$/i.test(word)
      ? new RegExp(`\\b${escaped}\\b`, 'i')
      : new RegExp(escaped, 'i');

    if (pattern.test(lower)) {
      return word;
    }
  }

  return null;
}

/* ── Action labels ── */

function parseAction(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return VALID_ACTIONS.includes(normalized) ? normalized : null;
}

function formatAction(action) {
  switch (action) {
    case 'warn':
      return 'Delete + Warn';
    case 'mute':
      return 'Delete + Mute';
    case 'kick':
      return 'Delete + Kick';
    case 'ban':
      return 'Delete + Ban';
    default:
      return 'Delete message';
  }
}

function formatDurationShort(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));

  if (total >= 86400 && total % 86400 === 0) {
    return `${total / 86400}d`;
  }

  if (total >= 3600 && total % 3600 === 0) {
    return `${total / 3600}h`;
  }

  if (total >= 60 && total % 60 === 0) {
    return `${total / 60}m`;
  }

  return `${total}s`;
}

function statusLabel(enabled) {
  return enabled
    ? emojis.label('status.success', '**Enabled**')
    : emojis.label('status.error', '**Disabled**');
}

/* ── Permission + resolution helpers ── */

function isAdministrator(member) {
  return Boolean(member?.permissions?.has(PermissionsBitField.Flags.Administrator));
}

function canManageAutomod(member, userId = member?.id) {
  return Boolean(
    isBotOwner(userId)
    || isAdministrator(member)
    || member?.permissions?.has(PermissionsBitField.Flags.ManageGuild),
  );
}

function isAutoExemptMember(member) {
  return Boolean(
    isAdministrator(member)
    || member?.permissions?.has(PermissionsBitField.Flags.ManageGuild),
  );
}

function extractRoleId(value) {
  const mentionMatch = String(value || '').match(/^<@&(\d{17,20})>$/);

  if (mentionMatch) {
    return mentionMatch[1];
  }

  return /^\d{17,20}$/.test(String(value || '')) ? String(value) : null;
}

function extractChannelId(value) {
  const mentionMatch = String(value || '').match(/^<#(\d{17,20})>$/);

  if (mentionMatch) {
    return mentionMatch[1];
  }

  return /^\d{17,20}$/.test(String(value || '')) ? String(value) : null;
}

function resolveRole(guild, value) {
  const roleId = extractRoleId(value);

  if (!roleId) {
    return null;
  }

  return guild.roles.cache.get(roleId) || null;
}

async function resolveTextChannel(guild, value) {
  const channelId = extractChannelId(value);

  if (!channelId) {
    return null;
  }

  const channel = guild.channels.cache.get(channelId)
    || await guild.channels.fetch(channelId).catch(() => null);

  if (
    !channel
    || !channel.isTextBased?.()
    || channel.isDMBased?.()
    || typeof channel.send !== 'function'
    || ![
      ChannelType.GuildAnnouncement,
      ChannelType.GuildText,
      ChannelType.PublicThread,
      ChannelType.PrivateThread,
    ].includes(channel.type)
  ) {
    return null;
  }

  return channel;
}

/* ── CV2 UI builders ── */

function createSeparator() {
  return new SeparatorBuilder()
    .setDivider(true)
    .setSpacing(SeparatorSpacingSize.Small);
}

function createFooterText() {
  const poweredEmoji = emojis.getEmoji('cutu.nitish') || emojis.getEmoji('status.success') || '*';
  return new TextDisplayBuilder().setContent(`${poweredEmoji} Made by [Tanmay](https://www.instagram.com/tanmoy_here8388/)`);
}

function createDeleteRow(ownerId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${AUTOMOD_DELETE_CUSTOM_ID_PREFIX}${ownerId}`)
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

function buildAutomodContainer({ description, ownerId, title }) {
  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${title}`),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(description),
    )
    .addSeparatorComponents(createSeparator());

  if (ownerId) {
    container.addActionRowComponents(createDeleteRow(ownerId))
      .addSeparatorComponents(createSeparator());
  }

  return container.addTextDisplayComponents(createFooterText());
}

function buildAutomodError({ description, ownerId, title = 'AutoMod Error' }) {
  return buildAutomodContainer({
    description,
    ownerId,
    title: emojis.label('status.error', title),
  });
}

function buildAutomodSuccess({ description, ownerId, title = 'AutoMod Updated' }) {
  return buildAutomodContainer({
    description,
    ownerId,
    title: emojis.label('status.success', title),
  });
}

function buildAutomodWarning({ description, ownerId, title = 'AutoMod' }) {
  return buildAutomodContainer({
    description,
    ownerId,
    title: emojis.label('status.warning', title),
  });
}

async function handleAutomodDelete({ interaction }) {
  const ownerId = interaction.customId.slice(AUTOMOD_DELETE_CUSTOM_ID_PREFIX.length);

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

/* ── Punishment ── */

function buildViolationNotice({ filterLabel, punishmentLabel, userId }) {
  return new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${emojis.label('status.warning', 'AutoMod')}`,
      ),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `<@${userId}>, your message was removed by **${filterLabel}**.\n**Action:** ${punishmentLabel}`,
      ),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(createFooterText());
}

function buildAutomodLog({
  channelId, content, filterLabel, punishmentLabel, userId,
}) {
  const preview = String(content || '').trim().slice(0, 400) || '*No text content*';

  return new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${emojis.label('status.warning', 'AutoMod Action')}`,
      ),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        `**User:** <@${userId}> (\`${userId}\`)`,
        `**Filter:** ${filterLabel}`,
        `**Action:** ${punishmentLabel}`,
        `**Channel:** <#${channelId}>`,
        '',
        `**Message:**\n>>> ${preview}`,
      ].join('\n')),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(createFooterText());
}

async function applyAutomodAction({
  action, config, content, filterLabel, message,
}) {
  const member = message.member;
  const userId = message.author.id;
  const auditReason = `AutoMod: ${filterLabel}`;
  let punishmentLabel = 'Message deleted';

  await message.delete().catch(() => null);

  try {
    if (action === 'mute' && member?.moderatable) {
      await member.timeout(config.mute_duration_seconds * 1000, auditReason);
      punishmentLabel = `Muted for ${formatDurationShort(config.mute_duration_seconds)}`;
    } else if (action === 'kick' && member?.kickable) {
      await member.kick(auditReason);
      punishmentLabel = 'Kicked';
    } else if (action === 'ban' && member?.bannable) {
      await member.ban({ deleteMessageSeconds: 0, reason: auditReason });
      punishmentLabel = 'Banned';
    } else if (action === 'warn') {
      punishmentLabel = 'Warned';
    }
  } catch (error) {
    console.warn(`[automod] Failed to apply ${action} in ${message.guild.id}:`, error?.message || error);
  }

  const notice = await message.channel.send(cv2Payload(buildViolationNotice({
    filterLabel,
    punishmentLabel,
    userId,
  }), {
    allowedMentions: {
      parse: [],
      roles: [],
      users: [userId],
      repliedUser: false,
    },
  })).catch(() => null);

  if (notice) {
    const timer = setTimeout(() => {
      notice.delete().catch(() => null);
    }, NOTICE_DELETE_MS);
    timer.unref?.();
  }

  if (config.log_channel_id) {
    const logChannel = message.guild.channels.cache.get(config.log_channel_id)
      || await message.guild.channels.fetch(config.log_channel_id).catch(() => null);

    if (logChannel?.send) {
      await logChannel.send(cv2Payload(buildAutomodLog({
        channelId: message.channel.id,
        content,
        filterLabel,
        punishmentLabel,
        userId,
      }), {
        allowedMentions: { parse: [], roles: [], repliedUser: false },
      })).catch(() => null);
    }
  }

  return { acted: true, filterLabel };
}

/* ── Message scanner ── */

async function processAutomodMessage(message) {
  if (!message.guild || message.author.bot || message.system) {
    return { acted: false };
  }

  const configResult = await getAutomodConfig(message.guild.id);
  const config = configResult.config;

  if (!config.enabled) {
    return { acted: false };
  }

  const member = message.member
    || await message.guild.members.fetch(message.author.id).catch(() => null);

  if (isAutoExemptMember(member)) {
    return { acted: false };
  }

  const exemptions = await getAutomodExemptions(message.guild.id);

  if (exemptions.channelIds.has(message.channel.id)) {
    return { acted: false };
  }

  if (member && [...exemptions.roleIds].some((roleId) => member.roles.cache.has(roleId))) {
    return { acted: false };
  }

  pruneTrackers();

  const content = message.content || '';
  const guildId = message.guild.id;
  const userId = message.author.id;

  const spamViolation = config.spam_enabled
    ? registerSpam(guildId, userId, {
      count: config.spam_message_count,
      intervalSeconds: config.spam_interval_seconds,
    })
    : false;

  const duplicateViolation = config.duplicate_enabled
    ? registerDuplicate(guildId, userId, content, { limit: config.duplicate_limit })
    : false;

  const act = (filterLabel, action) => applyAutomodAction({
    action,
    config,
    content,
    filterLabel,
    message,
  });

  if (spamViolation) {
    return act('Anti-Spam', config.spam_action);
  }

  if (config.mention_enabled && countMentions(message) > config.mention_limit) {
    return act('Mass Mention', config.mention_action);
  }

  if (config.invite_enabled && findInvite(content)) {
    return act('Anti-Invite', config.invite_action);
  }

  if (config.link_enabled && findLink(content)) {
    return act('Anti-Link', config.link_action);
  }

  if (config.badword_enabled) {
    const badWords = await listBadWords(guildId);

    if (badWords.ok && findBadWord(content, badWords.words)) {
      return act('Blocked Word', config.badword_action);
    }
  }

  if (config.caps_enabled) {
    const caps = capsInfo(content);

    if (content.length >= config.caps_min_length && caps.letters >= 5 && caps.percent >= config.caps_percentage) {
      return act('Excessive Caps', config.caps_action);
    }
  }

  if (config.emoji_enabled && countEmojis(content) > config.emoji_limit) {
    return act('Emoji Spam', config.emoji_action);
  }

  if (duplicateViolation) {
    return act('Duplicate Text', config.duplicate_action);
  }

  return { acted: false };
}

/* ── Generic filter command handler ── */

const ENABLE_WORDS = new Set(['on', 'enable', 'enabled', 'true', 'yes']);
const DISABLE_WORDS = new Set(['off', 'disable', 'disabled', 'false', 'no']);
const ACTION_WORDS = new Set(['action', 'punishment', 'punish', 'set']);

function buildFilterStatus({
  commandName, config, enabledField, actionField, filterLabel, prefix, thresholdSummary, whatItBlocks,
}) {
  const lines = [
    whatItBlocks,
    '',
    `**Status:** ${statusLabel(config[enabledField])}`,
    `**Action:** ${formatAction(config[actionField])}`,
  ];

  if (thresholdSummary) {
    lines.push(`**Threshold:** ${thresholdSummary}`);
  }

  if (!config.enabled) {
    lines.push('', `${emojis.getEmoji('status.warning') || '!'} Master AutoMod is **off** — enable it with \`${prefix}automod on\`.`);
  }

  lines.push(
    '',
    '**Controls:**',
    `> \`${prefix}${commandName} on\` / \`${prefix}${commandName} off\``,
    `> \`${prefix}${commandName} action <delete|warn|mute|kick|ban>\``,
  );

  return lines;
}

async function handleFilterCommand({
  args,
  commandName,
  enabledField,
  actionField,
  filterLabel,
  message,
  prefix,
  threshold,
  whatItBlocks,
}) {
  const ownerId = message.author.id;

  if (!canManageAutomod(message.member, ownerId)) {
    await message.reply(cv2Payload(buildAutomodError({
      description: 'You need **Manage Server** or **Administrator** permission to configure AutoMod.',
      ownerId,
      title: 'Missing Permission',
    })));
    return;
  }

  const configResult = await getAutomodConfig(message.guild.id);

  if (!configResult.ok && configResult.reason) {
    await message.reply(cv2Payload(buildAutomodError({
      description: `Could not load AutoMod settings.\n\`${configResult.reason}\``,
      ownerId,
      title: 'Database Error',
    })));
    return;
  }

  const config = configResult.config;
  const sub = args[0]?.toLowerCase();

  const sendStatus = (cfg) => message.channel.send(cv2Payload(buildAutomodWarning({
    description: buildFilterStatus({
      commandName,
      config: cfg,
      enabledField,
      actionField,
      filterLabel,
      prefix,
      thresholdSummary: threshold ? threshold.summary(cfg) : null,
      whatItBlocks,
    }).concat(threshold ? ['', ...threshold.usageLines(prefix, commandName)] : []).join('\n'),
    ownerId,
    title: filterLabel,
  }), {
    allowedMentions: { parse: [], roles: [], repliedUser: false },
  }));

  if (!sub) {
    await sendStatus(config);
    return;
  }

  const applyPatch = async (patch, successTitle, successDescription) => {
    const result = await updateAutomodConfig(message.guild.id, patch);

    if (!result.ok) {
      await message.reply(cv2Payload(buildAutomodError({
        description: `Could not save AutoMod settings.\n\`${result.reason}\``,
        ownerId,
        title: 'Save Failed',
      })));
      return null;
    }

    await message.channel.send(cv2Payload(buildAutomodSuccess({
      description: successDescription,
      ownerId,
      title: successTitle,
    }), {
      allowedMentions: { parse: [], roles: [], repliedUser: false },
    }));

    return result.config;
  };

  if (ENABLE_WORDS.has(sub)) {
    await applyPatch(
      { [enabledField]: true },
      `${filterLabel} Enabled`,
      [
        `**${filterLabel}** is now **enabled**.`,
        config.enabled ? '' : `Remember to enable master AutoMod: \`${prefix}automod on\`.`,
      ].filter(Boolean).join('\n'),
    );
    return;
  }

  if (DISABLE_WORDS.has(sub)) {
    await applyPatch(
      { [enabledField]: false },
      `${filterLabel} Disabled`,
      `**${filterLabel}** is now **disabled**.`,
    );
    return;
  }

  if (ACTION_WORDS.has(sub)) {
    const action = parseAction(args[1]);

    if (!action) {
      await message.reply(cv2Payload(buildAutomodError({
        description: `Choose one of: \`delete\`, \`warn\`, \`mute\`, \`kick\`, \`ban\`.\nUsage: \`${prefix}${commandName} action <action>\``,
        ownerId,
        title: 'Invalid Action',
      })));
      return;
    }

    await applyPatch(
      { [actionField]: action },
      `${filterLabel} Action Updated`,
      `**${filterLabel}** action set to **${formatAction(action)}**.`,
    );
    return;
  }

  if (threshold) {
    const parsed = threshold.parse(args);

    if (parsed?.error) {
      await message.reply(cv2Payload(buildAutomodError({
        description: parsed.error,
        ownerId,
        title: 'Invalid Value',
      })));
      return;
    }

    if (parsed?.patch) {
      await applyPatch(parsed.patch, `${filterLabel} Updated`, parsed.summary);
      return;
    }
  }

  await sendStatus(config);
}

module.exports = {
  AUTOMOD_DELETE_CUSTOM_ID_PREFIX,
  applyAutomodAction,
  buildAutomodContainer,
  buildAutomodError,
  buildAutomodSuccess,
  buildAutomodWarning,
  canManageAutomod,
  capsInfo,
  countEmojis,
  countMentions,
  createDeleteRow,
  extractChannelId,
  extractRoleId,
  findBadWord,
  findInvite,
  findLink,
  formatAction,
  formatDurationShort,
  handleAutomodDelete,
  handleFilterCommand,
  parseAction,
  processAutomodMessage,
  resolveRole,
  resolveTextChannel,
  statusLabel,
};
