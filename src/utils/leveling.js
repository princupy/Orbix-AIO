const {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ContainerBuilder,
  PermissionsBitField,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
} = require('discord.js');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { LEVELING_ADMIN_ROLE_IDS } = require('../config');
const emojis = require('../emojis');
const { cv2Payload } = require('./cv2');
const {
  LEADERBOARD_PAGE_SIZE,
  addXpToUser,
  getLeaderboard,
  getLevelConfig,
  getLevelProgress,
  getRankPosition,
  getUserLevel,
  listBlacklist,
  listLevelRoles,
  listMultipliers,
  markLevelUpNotified,
} = require('../supabase/leveling');

const LEVELING_DELETE_CUSTOM_ID_PREFIX = 'leveling:delete:';
const RANK_CARD_WIDTH = 900;
const RANK_CARD_HEIGHT = 280;
const STAT_CARD_WIDTH = 820;
const STAT_CARD_HEIGHT = 260;
const LEVELUP_CARD_WIDTH = 900;
const LEVELUP_CARD_HEIGHT = 320;
const LEADERBOARD_CARD_WIDTH = 940;
const LEADERBOARD_ROW_HEIGHT = 62;
const LEADERBOARD_HEADER_HEIGHT = 150;
const LEVELUP_DEDUPE_TTL_MS = 5 * 60 * 1000;
const MIN_LEVELING_MESSAGE_LENGTH = 3;

const recentLevelUpNotifications = new Map();

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
      .setCustomId(`${LEVELING_DELETE_CUSTOM_ID_PREFIX}${ownerId}`)
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

function buildLevelingContainer({
  description,
  ownerId,
  title,
}) {
  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${title}`),
    );

  if (description) {
    container
      .addSeparatorComponents(createSeparator())
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(description),
      );
  }

  return container
    .addSeparatorComponents(createSeparator())
    .addActionRowComponents(createDeleteRow(ownerId))
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(createFooterText());
}

function hasLevelAdminPermission(member) {
  return Boolean(
    member?.permissions?.has(PermissionsBitField.Flags.Administrator)
    || member?.permissions?.has(PermissionsBitField.Flags.ManageGuild)
    || LEVELING_ADMIN_ROLE_IDS.some((roleId) => member?.roles?.cache?.has(String(roleId))),
  );
}

function buildMissingAdminContainer(ownerId) {
  return buildLevelingContainer({
    ownerId,
    title: emojis.label('status.error', 'Missing Permission'),
    description: 'You need **Manage Server** or **Administrator** permission to use this leveling command.',
  });
}

function buildErrorContainer({ description, ownerId, title = 'Leveling Error' }) {
  return buildLevelingContainer({
    ownerId,
    title: emojis.label('status.error', title),
    description,
  });
}

function buildSuccessContainer({ description, ownerId, title = 'Leveling Updated' }) {
  return buildLevelingContainer({
    ownerId,
    title: emojis.label('status.success', title),
    description,
  });
}

function formatNumber(value) {
  return new Intl.NumberFormat('en-US').format(Math.floor(Number(value) || 0));
}

function formatDecimal(value) {
  const numeric = Number(value) || 0;
  return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

function createProgressBar(percent, size = 14) {
  const safePercent = Math.max(0, Math.min(1, Number(percent) || 0));
  const filled = Math.round(safePercent * size);
  return `[${'='.repeat(filled)}${'-'.repeat(Math.max(0, size - filled))}]`;
}

function extractUserId(value) {
  const mentionMatch = value?.match(/^<@!?(\d{17,20})>$/);

  if (mentionMatch) {
    return mentionMatch[1];
  }

  return /^\d{17,20}$/.test(value || '') ? value : null;
}

function extractRoleId(value) {
  const mentionMatch = value?.match(/^<@&(\d{17,20})>$/);

  if (mentionMatch) {
    return mentionMatch[1];
  }

  return /^\d{17,20}$/.test(value || '') ? value : null;
}

function extractChannelId(value) {
  const mentionMatch = value?.match(/^<#(\d{17,20})>$/);

  if (mentionMatch) {
    return mentionMatch[1];
  }

  return /^\d{17,20}$/.test(value || '') ? value : null;
}

async function resolveUser(message, value) {
  const userId = extractUserId(value) || message.author.id;
  return message.client.users.fetch(userId).catch(() => null);
}

async function resolveMember(message, value) {
  const userId = extractUserId(value);

  if (!userId) {
    return null;
  }

  return message.guild.members.fetch(userId).catch(() => null);
}

function resolveRole(message, value) {
  const roleId = extractRoleId(value);

  if (!roleId) {
    return null;
  }

  return message.guild.roles.cache.get(roleId) || null;
}

async function resolveTextChannel(message, value) {
  const channelId = extractChannelId(value);

  if (!channelId) {
    return null;
  }

  const channel = message.guild.channels.cache.get(channelId)
    || await message.guild.channels.fetch(channelId).catch(() => null);

  if (
    !channel
    || !channel.isTextBased?.()
    || channel.isDMBased?.()
    || channel.isThread?.()
    || typeof channel.send !== 'function'
    || ![
      ChannelType.GuildAnnouncement,
      ChannelType.GuildMedia,
      ChannelType.GuildText,
    ].includes(channel.type)
  ) {
    return null;
  }

  return channel;
}

function parsePositiveInteger(value, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (!/^\d+$/.test(String(value || ''))) {
    return null;
  }

  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    return null;
  }

  return parsed;
}

function parsePositiveNumber(value, { min = 0.01, max = 100 } = {}) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    return null;
  }

  return parsed;
}

function getMemberRoleIds(member) {
  return new Set(member?.roles?.cache?.keys?.() || []);
}

function isRoleManageableBy(member, role) {
  if (!member || !role) {
    return false;
  }

  if (member.id === member.guild.ownerId) {
    return true;
  }

  return member.roles.highest.position > role.position;
}

function getReadableRoleError(error) {
  if (error?.code === 50013) {
    return 'Bot role hierarchy ya **Manage Roles** permission ki wajah se reward role assign nahi ho paya.';
  }

  return error?.message || 'Unknown role error';
}

async function handleDeleteButton({ interaction }) {
  const ownerId = interaction.customId.slice(LEVELING_DELETE_CUSTOM_ID_PREFIX.length);

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

function getLevelAdminCheck(message) {
  if (hasLevelAdminPermission(message.member)) {
    return null;
  }

  return buildMissingAdminContainer(message.author.id);
}

function pickRandomXp(min, max) {
  const low = Math.min(Number(min) || 1, Number(max) || 1);
  const high = Math.max(Number(min) || 1, Number(max) || 1);
  return Math.floor(Math.random() * (high - low + 1)) + low;
}

function getBestMultiplier(member, multipliers) {
  const roleIds = getMemberRoleIds(member);
  let best = 1;

  for (const row of multipliers) {
    if (roleIds.has(String(row.role_id))) {
      best = Math.max(best, Number(row.multiplier) || 1);
    }
  }

  return best;
}

function fillLevelUpMessage(template, {
  guild,
  level,
  user,
}) {
  return String(template || '{mention} reached level {level}!')
    .replaceAll('{user}', user.username)
    .replaceAll('{level}', String(level))
    .replaceAll('{mention}', `<@${user.id}>`)
    .replaceAll('{server}', guild.name);
}

function fillLevelUpCanvasMessage(template, {
  guild,
  level,
  user,
}) {
  return String(template || '{user} reached level {level}!')
    .replaceAll('{user}', user.username)
    .replaceAll('{level}', String(level))
    .replaceAll('{mention}', `@${user.username}`)
    .replaceAll('{server}', guild.name);
}

function cleanupRecentLevelUps(now = Date.now()) {
  for (const [key, expiresAt] of recentLevelUpNotifications) {
    if (expiresAt <= now) {
      recentLevelUpNotifications.delete(key);
    }
  }
}

function shouldSendLevelUpNotification({ guildId, level, userId }) {
  cleanupRecentLevelUps();

  const key = `${guildId}:${userId}:${level}`;

  if (recentLevelUpNotifications.has(key)) {
    return false;
  }

  recentLevelUpNotifications.set(key, Date.now() + LEVELUP_DEDUPE_TTL_MS);
  return true;
}

async function canSendLevelUpNotification({ guildId, level, userId }) {
  if (!shouldSendLevelUpNotification({ guildId, level, userId })) {
    return false;
  }

  const result = await markLevelUpNotified({ guildId, level, userId });

  if (result.ok && !result.notified) {
    return false;
  }

  return true;
}

function fitText(ctx, text, maxWidth) {
  const value = String(text || '');

  if (ctx.measureText(value).width <= maxWidth) {
    return value;
  }

  let output = value;

  while (output.length > 0 && ctx.measureText(`${output}...`).width > maxWidth) {
    output = output.slice(0, -1);
  }

  return `${output.trim()}...`;
}

function drawWrappedText(ctx, text, x, y, maxWidth, lineHeight, maxLines = 2) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;

    if (ctx.measureText(testLine).width <= maxWidth) {
      currentLine = testLine;
      continue;
    }

    if (currentLine) {
      lines.push(currentLine);
    }

    currentLine = word;

    if (lines.length >= maxLines) {
      break;
    }
  }

  if (currentLine && lines.length < maxLines) {
    lines.push(currentLine);
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = index === maxLines - 1 && words.length > 0
      ? fitText(ctx, lines[index], maxWidth)
      : lines[index];
    ctx.fillText(line, x, y + (index * lineHeight));
  }
}

async function createLevelUpAttachment({
  guild,
  messageText,
  user,
  userLevel,
}) {
  const canvas = createCanvas(LEVELUP_CARD_WIDTH, LEVELUP_CARD_HEIGHT);
  const ctx = canvas.getContext('2d');
  const accent = '#48d597';
  const gold = '#f4c95d';
  const progress = getLevelProgress(userLevel.xp);

  const bg = ctx.createLinearGradient(0, 0, LEVELUP_CARD_WIDTH, LEVELUP_CARD_HEIGHT);
  bg.addColorStop(0, '#12161c');
  bg.addColorStop(0.55, '#1b1e28');
  bg.addColorStop(1, '#251827');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, LEVELUP_CARD_WIDTH, LEVELUP_CARD_HEIGHT);

  ctx.fillStyle = 'rgba(255,255,255,0.055)';
  drawRoundRect(ctx, 28, 26, LEVELUP_CARD_WIDTH - 56, LEVELUP_CARD_HEIGHT - 52, 28);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255,255,255,0.11)';
  ctx.lineWidth = 2;
  drawRoundRect(ctx, 28, 26, LEVELUP_CARD_WIDTH - 56, LEVELUP_CARD_HEIGHT - 52, 28);
  ctx.stroke();

  const avatar = await loadAvatar(user);
  const avatarSize = 134;
  const avatarX = 66;
  const avatarY = 88;

  ctx.save();
  ctx.beginPath();
  ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();

  if (avatar) {
    ctx.drawImage(avatar, avatarX, avatarY, avatarSize, avatarSize);
  } else {
    ctx.fillStyle = '#303743';
    ctx.fillRect(avatarX, avatarY, avatarSize, avatarSize);
  }

  ctx.restore();

  ctx.strokeStyle = accent;
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2 + 5, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = gold;
  ctx.font = 'bold 24px Arial';
  ctx.fillText('LEVEL UP', 240, 76);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 52px Arial';
  ctx.fillText(`Level ${userLevel.level}`, 240, 132);

  ctx.font = 'bold 30px Arial';
  drawWrappedText(ctx, messageText, 240, 178, 585, 36, 2);

  ctx.fillStyle = 'rgba(255,255,255,0.72)';
  ctx.font = '20px Arial';
  ctx.fillText(fitText(ctx, `${user.username} in ${guild.name}`, 585), 240, 254);

  const barX = 520;
  const barY = 252;
  const barWidth = 300;
  const barHeight = 16;

  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  drawRoundRect(ctx, barX, barY, barWidth, barHeight, 8);
  ctx.fill();

  ctx.fillStyle = accent;
  drawRoundRect(ctx, barX, barY, Math.max(12, barWidth * progress.percent), barHeight, 8);
  ctx.fill();

  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.font = '16px Arial';
  ctx.fillText(`${formatNumber(progress.currentXp)} / ${formatNumber(progress.neededXp)} XP`, barX, 292);

  return new AttachmentBuilder(canvas.toBuffer('image/png'), {
    name: `level-up-${user.id}-${userLevel.level}.png`,
  });
}

async function sendLevelUpMessage({ config, message, userLevel }) {
  if (!config.levelup_enabled) {
    return;
  }

  const canSend = await canSendLevelUpNotification({
    guildId: message.guild.id,
    level: userLevel.level,
    userId: message.author.id,
  });

  if (!canSend) {
    return;
  }

  const targetChannel = config.levelup_channel_id
    ? message.guild.channels.cache.get(config.levelup_channel_id)
      || await message.guild.channels.fetch(config.levelup_channel_id).catch(() => null)
    : message.channel;

  if (!targetChannel?.send) {
    return;
  }

  const content = fillLevelUpMessage(config.levelup_message, {
    guild: message.guild,
    level: userLevel.level,
    user: message.author,
  }).slice(0, 2000);

  await targetChannel.send({
    content,
    allowedMentions: {
      parse: [],
      users: [message.author.id],
      repliedUser: false,
    },
  }).catch(() => null);
}

async function applyLevelRoles({
  guild,
  member,
  newLevel,
  oldLevel = 0,
  stackRoles = true,
}) {
  const rewards = await listLevelRoles(guild.id);

  if (!rewards.ok || rewards.roles.length === 0 || !member) {
    return {
      added: [],
      removed: [],
      reason: rewards.reason,
      skipped: [],
    };
  }

  const botMember = guild.members.me
    || await guild.members.fetchMe().catch(() => null);
  const eligibleRewards = rewards.roles
    .filter((reward) => Number(reward.level) <= Number(newLevel))
    .sort((left, right) => Number(left.level) - Number(right.level));
  const added = [];
  const removed = [];
  const skipped = [];

  if (eligibleRewards.length === 0) {
    return {
      added,
      removed,
      skipped,
    };
  }

  const targetRewards = stackRoles
    ? rewards.roles.filter((reward) => Number(reward.level) > Number(oldLevel) && Number(reward.level) <= Number(newLevel))
    : [eligibleRewards[eligibleRewards.length - 1]];
  const rewardRoleIds = new Set(rewards.roles.map((reward) => String(reward.role_id)));
  const targetRoleIds = new Set(targetRewards.map((reward) => String(reward.role_id)));

  if (!stackRoles) {
    for (const roleId of rewardRoleIds) {
      if (targetRoleIds.has(roleId) || !member.roles.cache.has(roleId)) {
        continue;
      }

      const role = guild.roles.cache.get(roleId);

      if (!role || !isRoleManageableBy(botMember, role) || !role.editable) {
        skipped.push(roleId);
        continue;
      }

      await member.roles.remove(role, 'Level reward replace mode').then(() => {
        removed.push(roleId);
      }).catch((error) => {
        skipped.push(`${roleId}: ${getReadableRoleError(error)}`);
      });
    }
  }

  for (const reward of targetRewards) {
    const role = guild.roles.cache.get(String(reward.role_id));

    if (!role || member.roles.cache.has(role.id)) {
      continue;
    }

    if (!isRoleManageableBy(botMember, role) || !role.editable) {
      skipped.push(role?.id || String(reward.role_id));
      continue;
    }

    await member.roles.add(role, `Reached level ${reward.level}`).then(() => {
      added.push(role.id);
    }).catch((error) => {
        skipped.push(`${role.id}: ${getReadableRoleError(error)}`);
    });
  }

  return {
    added,
    removed,
    skipped,
  };
}

async function removeLevelRewardRoles({ guild, member }) {
  const rewards = await listLevelRoles(guild.id);

  if (!rewards.ok || rewards.roles.length === 0 || !member) {
    return {
      removed: [],
      reason: rewards.reason,
      skipped: [],
    };
  }

  const botMember = guild.members.me
    || await guild.members.fetchMe().catch(() => null);
  const removed = [];
  const skipped = [];

  for (const reward of rewards.roles) {
    const role = guild.roles.cache.get(String(reward.role_id));

    if (!role || !member.roles.cache.has(role.id)) {
      continue;
    }

    if (!isRoleManageableBy(botMember, role) || !role.editable) {
      skipped.push(role.id);
      continue;
    }

    await member.roles.remove(role, 'Level data reset').then(() => {
      removed.push(role.id);
    }).catch((error) => {
      skipped.push(`${role.id}: ${getReadableRoleError(error)}`);
    });
  }

  return {
    removed,
    skipped,
  };
}

async function processLevelingMessage(message, prefix) {
  if (!message.guild || message.author.bot) {
    return {
      awarded: false,
      reason: 'ignored',
    };
  }

  const content = message.content || '';

  if (content.toLowerCase().startsWith(String(prefix || '').toLowerCase())) {
    return {
      awarded: false,
      reason: 'command',
    };
  }

  if (content.trim().length < MIN_LEVELING_MESSAGE_LENGTH) {
    return {
      awarded: false,
      reason: 'too_short',
    };
  }

  const configResult = await getLevelConfig(message.guild.id);

  if (!configResult.ok || !configResult.config.leveling_enabled) {
    return {
      awarded: false,
      reason: configResult.reason || 'disabled',
    };
  }

  const channelBlacklist = await listBlacklist(message.guild.id, 'channel');

  if (!channelBlacklist.ok) {
    return {
      awarded: false,
      reason: channelBlacklist.reason,
    };
  }

  if (channelBlacklist.targets.some((row) => String(row.target_id) === message.channel.id)) {
    return {
      awarded: false,
      reason: 'channel_blacklisted',
    };
  }

  const roleBlacklist = await listBlacklist(message.guild.id, 'role');

  if (!roleBlacklist.ok) {
    return {
      awarded: false,
      reason: roleBlacklist.reason,
    };
  }

  const memberRoleIds = getMemberRoleIds(message.member);

  if (roleBlacklist.targets.some((row) => memberRoleIds.has(String(row.target_id)))) {
    return {
      awarded: false,
      reason: 'role_blacklisted',
    };
  }

  const userResult = await getUserLevel(message.guild.id, message.author.id);

  if (!userResult.ok) {
    return {
      awarded: false,
      reason: userResult.reason,
    };
  }

  const lastTimestamp = userResult.user.last_xp_timestamp
    ? Date.parse(userResult.user.last_xp_timestamp)
    : 0;
  const cooldownMs = Number(configResult.config.cooldown_seconds || 0) * 1000;

  if (lastTimestamp && Date.now() - lastTimestamp < cooldownMs) {
    return {
      awarded: false,
      reason: 'cooldown',
    };
  }

  const multiplierResult = await listMultipliers(message.guild.id);

  if (!multiplierResult.ok) {
    return {
      awarded: false,
      reason: multiplierResult.reason,
    };
  }

  const baseXp = pickRandomXp(configResult.config.xp_min, configResult.config.xp_max);
  const multiplier = getBestMultiplier(message.member, multiplierResult.multipliers);
  const xpToAdd = Math.max(1, Math.round(baseXp * multiplier));
  const result = await addXpToUser({
    amount: xpToAdd,
    countMessage: true,
    guildId: message.guild.id,
    touchCooldown: true,
    userId: message.author.id,
  });

  if (!result.ok) {
    return {
      awarded: false,
      reason: result.reason,
    };
  }

  if (result.leveledUp) {
    await applyLevelRoles({
      guild: message.guild,
      member: message.member,
      newLevel: result.after.level,
      oldLevel: result.before.level,
      stackRoles: configResult.config.stack_roles,
    });
    await sendLevelUpMessage({
      config: configResult.config,
      message,
      userLevel: result.after,
    });
  }

  return {
    awarded: true,
    baseXp,
    multiplier,
    result,
    xp: xpToAdd,
  };
}

function drawRoundRect(ctx, x, y, width, height, radius) {
  const safeRadius = Math.min(radius, width / 2, height / 2);

  ctx.beginPath();
  ctx.moveTo(x + safeRadius, y);
  ctx.arcTo(x + width, y, x + width, y + height, safeRadius);
  ctx.arcTo(x + width, y + height, x, y + height, safeRadius);
  ctx.arcTo(x, y + height, x, y, safeRadius);
  ctx.arcTo(x, y, x + width, y, safeRadius);
  ctx.closePath();
}

async function loadAvatar(user) {
  const avatarUrl = user.displayAvatarURL({
    extension: 'png',
    forceStatic: true,
    size: 256,
  });

  return loadImage(avatarUrl).catch(() => null);
}

async function createRankCard({
  guild,
  position,
  progress,
  user,
  userLevel,
}) {
  const canvas = createCanvas(RANK_CARD_WIDTH, RANK_CARD_HEIGHT);
  const ctx = canvas.getContext('2d');
  const accent = '#3ddc97';
  const accentTwo = '#f7c948';

  ctx.fillStyle = '#111318';
  ctx.fillRect(0, 0, RANK_CARD_WIDTH, RANK_CARD_HEIGHT);

  const gradient = ctx.createLinearGradient(0, 0, RANK_CARD_WIDTH, RANK_CARD_HEIGHT);
  gradient.addColorStop(0, '#182026');
  gradient.addColorStop(0.55, '#14161d');
  gradient.addColorStop(1, '#211923');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, RANK_CARD_WIDTH, RANK_CARD_HEIGHT);

  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 2;
  drawRoundRect(ctx, 20, 20, RANK_CARD_WIDTH - 40, RANK_CARD_HEIGHT - 40, 28);
  ctx.stroke();

  const avatar = await loadAvatar(user);
  const avatarX = 54;
  const avatarY = 58;
  const avatarSize = 154;

  ctx.save();
  ctx.beginPath();
  ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();

  if (avatar) {
    ctx.drawImage(avatar, avatarX, avatarY, avatarSize, avatarSize);
  } else {
    ctx.fillStyle = '#2f3640';
    ctx.fillRect(avatarX, avatarY, avatarSize, avatarSize);
  }

  ctx.restore();

  ctx.strokeStyle = accent;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2 + 4, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 38px Arial';
  ctx.fillText(user.username.slice(0, 24), 244, 82);

  ctx.fillStyle = 'rgba(255,255,255,0.72)';
  ctx.font = '22px Arial';
  ctx.fillText(guild.name.slice(0, 34), 244, 116);

  ctx.fillStyle = accentTwo;
  ctx.font = 'bold 28px Arial';
  ctx.fillText(`Rank #${position || '-'}`, 244, 162);

  ctx.fillStyle = '#ffffff';
  ctx.fillText(`Level ${userLevel.level}`, 430, 162);
  ctx.fillText(`${formatNumber(userLevel.xp)} XP`, 585, 162);

  const barX = 244;
  const barY = 190;
  const barWidth = 584;
  const barHeight = 28;

  ctx.fillStyle = 'rgba(255,255,255,0.11)';
  drawRoundRect(ctx, barX, barY, barWidth, barHeight, 14);
  ctx.fill();

  ctx.fillStyle = accent;
  drawRoundRect(ctx, barX, barY, Math.max(18, barWidth * progress.percent), barHeight, 14);
  ctx.fill();

  ctx.fillStyle = 'rgba(255,255,255,0.82)';
  ctx.font = '19px Arial';
  ctx.fillText(
    `${formatNumber(progress.currentXp)} / ${formatNumber(progress.neededXp)} XP to next level`,
    barX,
    246,
  );

  return new AttachmentBuilder(canvas.toBuffer('image/png'), {
    name: `rank-${user.id}.png`,
  });
}

async function buildRankAttachment({ guild, user, userLevel }) {
  const progress = getLevelProgress(userLevel.xp);
  const positionResult = await getRankPosition(guild.id, user.id);

  return createRankCard({
    guild,
    position: positionResult.position,
    progress,
    user,
    userLevel,
  });
}

async function buildLevelStatAttachment({
  guild,
  position,
  progress,
  type,
  user,
  userLevel,
}) {
  const isXpCard = type === 'xp';
  const canvas = createCanvas(STAT_CARD_WIDTH, STAT_CARD_HEIGHT);
  const ctx = canvas.getContext('2d');
  const accent = isXpCard ? '#59e0ff' : '#48d597';
  const gold = '#f4c95d';

  const bg = ctx.createLinearGradient(0, 0, STAT_CARD_WIDTH, STAT_CARD_HEIGHT);
  bg.addColorStop(0, '#11161d');
  bg.addColorStop(0.55, '#171b24');
  bg.addColorStop(1, '#281a28');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, STAT_CARD_WIDTH, STAT_CARD_HEIGHT);

  ctx.fillStyle = 'rgba(255,255,255,0.055)';
  drawRoundRect(ctx, 24, 22, STAT_CARD_WIDTH - 48, STAT_CARD_HEIGHT - 44, 24);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255,255,255,0.11)';
  ctx.lineWidth = 2;
  drawRoundRect(ctx, 24, 22, STAT_CARD_WIDTH - 48, STAT_CARD_HEIGHT - 44, 24);
  ctx.stroke();

  const avatar = await loadAvatar(user);
  const avatarSize = 118;
  const avatarX = 56;
  const avatarY = 70;

  ctx.save();
  ctx.beginPath();
  ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();

  if (avatar) {
    ctx.drawImage(avatar, avatarX, avatarY, avatarSize, avatarSize);
  } else {
    ctx.fillStyle = '#303743';
    ctx.fillRect(avatarX, avatarY, avatarSize, avatarSize);
  }

  ctx.restore();

  ctx.strokeStyle = accent;
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2 + 4, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = gold;
  ctx.font = 'bold 22px Arial';
  ctx.fillText(isXpCard ? 'TOTAL XP' : 'CURRENT LEVEL', 214, 70);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 48px Arial';
  ctx.fillText(isXpCard ? `${formatNumber(userLevel.xp)} XP` : `Level ${userLevel.level}`, 214, 124);

  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.font = '22px Arial';
  ctx.fillText(fitText(ctx, user.username, 280), 214, 162);

  ctx.fillStyle = 'rgba(255,255,255,0.64)';
  ctx.font = '18px Arial';
  ctx.fillText(fitText(ctx, guild.name, 390), 214, 192);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 22px Arial';
  ctx.fillText(`Rank #${position || '-'}`, 600, 84);
  ctx.fillText(`Level ${userLevel.level}`, 600, 124);

  ctx.fillStyle = accent;
  ctx.fillText(`${formatNumber(progress.remainingXp)} XP left`, 600, 164);

  const barX = 214;
  const barY = 210;
  const barWidth = 520;
  const barHeight = 18;

  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  drawRoundRect(ctx, barX, barY, barWidth, barHeight, 9);
  ctx.fill();

  ctx.fillStyle = accent;
  drawRoundRect(ctx, barX, barY, Math.max(14, barWidth * progress.percent), barHeight, 9);
  ctx.fill();

  ctx.fillStyle = 'rgba(255,255,255,0.78)';
  ctx.font = '15px Arial';
  ctx.fillText(
    `${formatNumber(progress.currentXp)} / ${formatNumber(progress.neededXp)} XP`,
    barX,
    246,
  );

  return new AttachmentBuilder(canvas.toBuffer('image/png'), {
    name: `${isXpCard ? 'xp' : 'level'}-${user.id}.png`,
  });
}

async function buildLeaderboardAttachment({
  guild,
  page,
  rows,
  total,
  totalPages,
}) {
  const safeRows = rows || [];
  const visibleRows = Math.max(1, safeRows.length);
  const height = LEADERBOARD_HEADER_HEIGHT + (visibleRows * LEADERBOARD_ROW_HEIGHT) + 66;
  const canvas = createCanvas(LEADERBOARD_CARD_WIDTH, height);
  const ctx = canvas.getContext('2d');
  const accent = '#48d597';
  const gold = '#f4c95d';

  const bg = ctx.createLinearGradient(0, 0, LEADERBOARD_CARD_WIDTH, height);
  bg.addColorStop(0, '#11161d');
  bg.addColorStop(0.55, '#171b24');
  bg.addColorStop(1, '#241823');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, LEADERBOARD_CARD_WIDTH, height);

  ctx.fillStyle = 'rgba(255,255,255,0.055)';
  drawRoundRect(ctx, 26, 24, LEADERBOARD_CARD_WIDTH - 52, height - 48, 24);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 2;
  drawRoundRect(ctx, 26, 24, LEADERBOARD_CARD_WIDTH - 52, height - 48, 24);
  ctx.stroke();

  ctx.fillStyle = gold;
  ctx.font = 'bold 24px Arial';
  ctx.fillText('SERVER LEADERBOARD', 58, 72);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 40px Arial';
  ctx.fillText(fitText(ctx, guild.name, 540), 58, 118);

  ctx.fillStyle = 'rgba(255,255,255,0.72)';
  ctx.font = '20px Arial';
  ctx.fillText(`Page ${page}/${totalPages} - ${formatNumber(total)} ranked users`, 58, 148);

  ctx.fillStyle = accent;
  ctx.font = 'bold 28px Arial';
  ctx.fillText('XP TOP 10', LEADERBOARD_CARD_WIDTH - 210, 92);

  if (safeRows.length === 0) {
    ctx.fillStyle = 'rgba(255,255,255,0.78)';
    ctx.font = 'bold 30px Arial';
    ctx.fillText('No XP data yet.', 58, LEADERBOARD_HEADER_HEIGHT + 56);

    return new AttachmentBuilder(canvas.toBuffer('image/png'), {
      name: `leaderboard-${guild.id}-${page}.png`,
    });
  }

  const startRank = (Math.max(1, Number(page) || 1) - 1) * LEADERBOARD_PAGE_SIZE;

  for (const [index, row] of safeRows.entries()) {
    const y = LEADERBOARD_HEADER_HEIGHT + (index * LEADERBOARD_ROW_HEIGHT);
    const rank = startRank + index + 1;
    const user = await guild.client.users.fetch(row.user_id).catch(() => null);
    const avatar = user ? await loadAvatar(user) : null;
    const rowColor = index % 2 === 0 ? 'rgba(255,255,255,0.075)' : 'rgba(255,255,255,0.045)';

    ctx.fillStyle = rowColor;
    drawRoundRect(ctx, 52, y, LEADERBOARD_CARD_WIDTH - 104, LEADERBOARD_ROW_HEIGHT - 10, 14);
    ctx.fill();

    ctx.fillStyle = rank <= 3 ? gold : accent;
    ctx.font = 'bold 28px Arial';
    ctx.fillText(`#${rank}`, 74, y + 36);

    const avatarSize = 42;
    const avatarX = 150;
    const avatarY = y + 8;

    ctx.save();
    ctx.beginPath();
    ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();

    if (avatar) {
      ctx.drawImage(avatar, avatarX, avatarY, avatarSize, avatarSize);
    } else {
      ctx.fillStyle = '#303743';
      ctx.fillRect(avatarX, avatarY, avatarSize, avatarSize);
    }

    ctx.restore();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 23px Arial';
    ctx.fillText(fitText(ctx, user?.username || `Unknown User ${row.user_id}`, 330), 208, y + 27);

    ctx.fillStyle = 'rgba(255,255,255,0.72)';
    ctx.font = '17px Arial';
    ctx.fillText(`Messages: ${formatNumber(row.total_messages)}`, 208, y + 49);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 22px Arial';
    ctx.fillText(`Level ${row.level}`, 585, y + 34);

    ctx.fillStyle = accent;
    ctx.font = 'bold 22px Arial';
    ctx.fillText(`${formatNumber(row.xp)} XP`, 712, y + 34);
  }

  return new AttachmentBuilder(canvas.toBuffer('image/png'), {
    name: `leaderboard-${guild.id}-${page}.png`,
  });
}

async function getRankData(message, value) {
  const user = await resolveUser(message, value);

  if (!user) {
    return {
      ok: false,
      reason: 'Could not find that user.',
    };
  }

  const levelResult = await getUserLevel(message.guild.id, user.id);

  if (!levelResult.ok) {
    return {
      ok: false,
      reason: levelResult.reason,
    };
  }

  const progress = getLevelProgress(levelResult.user.xp);
  const position = await getRankPosition(message.guild.id, user.id);

  return {
    ok: true,
    position: position.position,
    progress,
    user,
    userLevel: levelResult.user,
  };
}

async function sendStorageError(message, ownerId, reason) {
  await message.reply(cv2Payload(buildErrorContainer({
    description: `Leveling data could not be loaded.\n\`${reason || 'Unknown error'}\``,
    ownerId,
  }))).catch(() => null);
}

async function formatLeaderboardRows(guild, rows, page) {
  if (rows.length === 0) {
    return '`No XP data yet.`';
  }

  const startRank = (Math.max(1, Number(page) || 1) - 1) * LEADERBOARD_PAGE_SIZE;
  const lines = [];

  for (const [index, row] of rows.entries()) {
    const rank = startRank + index + 1;
    const user = await guild.client.users.fetch(row.user_id).catch(() => null);
    const label = user ? `${user.username}` : `Unknown User ${row.user_id}`;

    lines.push(`${rank}. **${label}** - Level **${row.level}**, **${formatNumber(row.xp)} XP**`);
  }

  return lines.join('\n');
}

module.exports = {
  LEVELING_DELETE_CUSTOM_ID_PREFIX,
  applyLevelRoles,
  buildErrorContainer,
  buildLeaderboardAttachment,
  buildLevelingContainer,
  buildMissingAdminContainer,
  buildLevelStatAttachment,
  buildRankAttachment,
  buildSuccessContainer,
  createProgressBar,
  extractChannelId,
  extractRoleId,
  extractUserId,
  formatDecimal,
  formatLeaderboardRows,
  formatNumber,
  getLevelAdminCheck,
  getRankData,
  handleDeleteButton,
  hasLevelAdminPermission,
  parsePositiveInteger,
  parsePositiveNumber,
  processLevelingMessage,
  removeLevelRewardRoles,
  resolveMember,
  resolveRole,
  resolveTextChannel,
  sendStorageError,
};
