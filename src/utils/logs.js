const {
  AuditLogEvent,
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
const { LOG_TYPE_BY_KEY, getLogConfig } = require('../supabase/logs');
const { isModuleEnabled } = require('../supabase/modules');
const { recordActivityLog } = require('../supabase/activityLogs');
const { deactivateActiveCases, recordModerationCase } = require('../supabase/moderationCases');
const { pushLogEvent, pushModAction } = require('../dashboard/bridge');

const CONTENT_LIMIT = 1000;
const AUDIT_WINDOW_MS = 8000;
const RECENT_BAN_TTL_MS = 15_000;

// Tracks users banned very recently so member-remove does not double-log a ban
// as a "leave" (works even when the bot lacks View Audit Log permission).
const recentBans = new Map();

/* ── Small helpers ── */

function createSeparator() {
  return new SeparatorBuilder()
    .setDivider(true)
    .setSpacing(SeparatorSpacingSize.Small);
}

function createFooterText() {
  const poweredEmoji = emojis.getEmoji('cutu.nitish') || emojis.getEmoji('status.success') || '*';
  return new TextDisplayBuilder().setContent(`${poweredEmoji} Made by [Tanmay](https://www.instagram.com/tanmoy_here8388/)`);
}

function truncate(value, max = CONTENT_LIMIT) {
  const text = String(value ?? '');

  if (text.length <= max) {
    return text;
  }

  return `${text.slice(0, Math.max(0, max - 1))}…`;
}

function unix(timestamp) {
  return Math.floor(Number(timestamp) / 1000);
}

function markRecentBan(guildId, userId) {
  const now = Date.now();

  for (const [key, time] of recentBans) {
    if (now - time > RECENT_BAN_TTL_MS) {
      recentBans.delete(key);
    }
  }

  recentBans.set(`${guildId}:${userId}`, now);
}

function wasRecentlyBanned(guildId, userId) {
  const key = `${guildId}:${userId}`;
  const time = recentBans.get(key);

  if (!time) {
    return false;
  }

  recentBans.delete(key);
  return Date.now() - time <= RECENT_BAN_TTL_MS;
}

/* ── Channel resolution + send ── */

async function getLogChannel(guild, typeKey) {
  const type = LOG_TYPE_BY_KEY.get(typeKey);

  if (!type) {
    return null;
  }

  const { config } = await getLogConfig(guild.id);
  const channelId = config?.[type.column];

  if (!channelId) {
    return null;
  }

  const channel = guild.channels.cache.get(channelId)
    || await guild.channels.fetch(channelId).catch(() => null);

  if (!channel || typeof channel.send !== 'function' || !channel.isTextBased?.()) {
    return null;
  }

  const me = guild.members.me || await guild.members.fetchMe().catch(() => null);
  const perms = me ? channel.permissionsFor(me) : null;

  if (perms && !perms.has([PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages])) {
    return null;
  }

  return channel;
}

async function sendLog(guild, typeKey, container, meta = null) {
  if (!(await isModuleEnabled(guild.id, 'logs'))) {
    return;
  }

  // Dashboard live feed: persist + push the event whenever logging is enabled,
  // independent of whether a Discord log channel is configured.
  if (meta) {
    const event = {
      guildId: guild.id,
      type: typeKey,
      title: meta.title || typeKey,
      description: meta.description || '',
      targetId: meta.targetId || null,
      targetTag: meta.targetTag || null,
      moderatorId: meta.moderatorId || null,
      moderatorTag: meta.moderatorTag || null,
      at: Date.now(),
    };

    recordActivityLog(event);

    try {
      pushLogEvent(event);
    } catch {
      // Bridge is optional; ignore push failures.
    }
  }

  const channel = await getLogChannel(guild, typeKey);

  if (!channel) {
    return;
  }

  await channel.send(cv2Payload(container, {
    allowedMentions: {
      parse: [], repliedUser: false, roles: [], users: [],
    },
  })).catch((error) => {
    console.warn(`[logs] Failed to send ${typeKey} log in ${guild.id}:`, error?.message || error);
  });
}

// Record a moderation case (best-effort) and push it to the dashboard's live
// moderation table. Fire-and-forget; never blocks the log handler.
async function recordCase(guild, caseType, {
  target, moderator, reason = null, active = false, durationMs = null, expiresAt = null,
}) {
  try {
    const entry = {
      guildId: guild.id,
      caseType,
      targetId: target?.id || null,
      targetTag: target?.tag || null,
      moderatorId: moderator?.id || null,
      moderatorTag: moderator?.tag || moderator?.username || null,
      reason,
      durationMs,
      expiresAt,
      active,
    };

    const result = await recordModerationCase(entry);

    pushModAction({
      guildId: guild.id,
      id: result?.id ?? null,
      type: caseType,
      targetId: entry.targetId,
      targetTag: entry.targetTag,
      moderatorId: entry.moderatorId,
      moderatorTag: entry.moderatorTag,
      reason: entry.reason,
      active: entry.active,
      at: Date.now(),
    });
  } catch (error) {
    console.warn('[logs] recordCase failed:', error?.message || error);
  }
}

/* ── Container builder ── */

function buildLogContainer({
  accentColor, bodyLines, thumbnailUrl, titleLine,
}) {
  const container = new ContainerBuilder();

  if (typeof accentColor === 'number') {
    container.setAccentColor(accentColor);
  }

  if (thumbnailUrl) {
    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(titleLine))
        .setThumbnailAccessory(
          new ThumbnailBuilder().setURL(thumbnailUrl).setDescription('Log entry'),
        ),
    );
  } else {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(titleLine));
  }

  return container
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(bodyLines.filter(Boolean).join('\n')))
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(createFooterText());
}

function titleFor(typeKey, text) {
  const type = LOG_TYPE_BY_KEY.get(typeKey);
  return `## ${type?.emoji || '📋'} ${text}`;
}

function avatarOf(user) {
  return user?.displayAvatarURL?.({ extension: 'png', size: 256 }) || null;
}

/* ── Audit log lookup ── */

async function fetchAuditExecutor(guild, actionType, targetId) {
  const me = guild.members.me || await guild.members.fetchMe().catch(() => null);

  if (me && !me.permissions.has(PermissionsBitField.Flags.ViewAuditLog)) {
    return { executor: null, reason: null };
  }

  const logs = await guild.fetchAuditLogs({ limit: 6, type: actionType }).catch(() => null);

  if (!logs) {
    return { executor: null, reason: null };
  }

  const now = Date.now();
  const entry = [...logs.entries.values()].find((item) => (
    item.target?.id === targetId && (now - item.createdTimestamp) < AUDIT_WINDOW_MS
  ));

  if (!entry) {
    return { executor: null, reason: null };
  }

  return { executor: entry.executor || null, reason: entry.reason || null };
}

function moderatorLine(executor) {
  if (!executor) {
    return '> **Moderator:** `Unknown`';
  }

  return `> **Moderator:** <@${executor.id}> (\`${executor.tag || executor.username}\`)`;
}

function reasonLine(reason) {
  return `> **Reason:** ${reason ? truncate(reason, 400) : '`No reason provided`'}`;
}

/* ── Event handlers ── */

async function handleMessageDelete(message) {
  try {
    const guild = message.guild;

    if (!guild) {
      return;
    }

    if (message.author?.bot) {
      return;
    }

    const channel = await getLogChannel(guild, 'message');

    if (!channel || channel.id === message.channelId) {
      return;
    }

    const authorLine = message.author
      ? `> **Author:** <@${message.author.id}> (\`${message.author.tag}\`)`
      : '> **Author:** `Unknown (uncached)`';

    const content = message.content
      ? truncate(message.content)
      : '`No text content / unavailable`';
    const attachments = message.attachments?.size
      ? `\n> **Attachments:** \`${message.attachments.size}\``
      : '';

    await sendLog(guild, 'message', buildLogContainer({
      accentColor: LOG_TYPE_BY_KEY.get('message').color,
      bodyLines: [
        authorLine,
        `> **Channel:** <#${message.channelId}>`,
        attachments ? attachments.slice(1) : null,
        '',
        '**Content:**',
        content,
      ],
      titleLine: titleFor('message', 'Message Deleted'),
    }), {
      title: 'Message Deleted',
      description: message.author
        ? `${message.author.tag} in #${message.channel?.name || message.channelId}`
        : `Message deleted in #${message.channel?.name || message.channelId}`,
      targetId: message.author?.id || null,
      targetTag: message.author?.tag || null,
    });
  } catch (error) {
    console.warn('[logs] message delete handler failed:', error?.message || error);
  }
}

async function handleMessageUpdate(oldMessage, newMessage) {
  try {
    const guild = newMessage.guild;

    if (!guild || newMessage.author?.bot) {
      return;
    }

    const oldContent = oldMessage?.content ?? '';
    const newContent = newMessage.content ?? '';

    if (oldContent === newContent) {
      return;
    }

    const channel = await getLogChannel(guild, 'message');

    if (!channel || channel.id === newMessage.channelId) {
      return;
    }

    await sendLog(guild, 'message', buildLogContainer({
      accentColor: LOG_TYPE_BY_KEY.get('message').color,
      bodyLines: [
        newMessage.author ? `> **Author:** <@${newMessage.author.id}> (\`${newMessage.author.tag}\`)` : '> **Author:** `Unknown`',
        `> **Channel:** <#${newMessage.channelId}>`,
        newMessage.url ? `> **Jump:** [Message](${newMessage.url})` : null,
        '',
        '**Before:**',
        oldContent ? truncate(oldContent) : '`Unavailable`',
        '',
        '**After:**',
        newContent ? truncate(newContent) : '`Unavailable`',
      ],
      titleLine: titleFor('message', 'Message Edited'),
    }), {
      title: 'Message Edited',
      description: `${newMessage.author?.tag || 'Unknown'} in #${newMessage.channel?.name || newMessage.channelId}`,
      targetId: newMessage.author?.id || null,
      targetTag: newMessage.author?.tag || null,
    });
  } catch (error) {
    console.warn('[logs] message update handler failed:', error?.message || error);
  }
}

async function handleGuildBanAdd(ban) {
  try {
    const { guild, user } = ban;
    markRecentBan(guild.id, user.id);

    const resolvedBan = typeof ban.fetch === 'function' ? await ban.fetch().catch(() => ban) : ban;
    const { executor, reason } = await fetchAuditExecutor(guild, AuditLogEvent.MemberBanAdd, user.id);

    await sendLog(guild, 'ban', buildLogContainer({
      accentColor: LOG_TYPE_BY_KEY.get('ban').color,
      bodyLines: [
        `> **User:** <@${user.id}> (\`${user.tag}\`)`,
        `> **User ID:** \`${user.id}\``,
        moderatorLine(executor),
        reasonLine(resolvedBan?.reason || reason),
      ],
      thumbnailUrl: avatarOf(user),
      titleLine: titleFor('ban', 'Member Banned'),
    }), {
      title: 'Member Banned',
      description: executor
        ? `${user.tag} · by ${executor.tag || executor.username}`
        : user.tag,
      targetId: user.id,
      targetTag: user.tag,
      moderatorId: executor?.id || null,
      moderatorTag: executor?.tag || executor?.username || null,
    });

    recordCase(guild, 'ban', {
      target: user,
      moderator: executor,
      reason: resolvedBan?.reason || reason,
      active: true,
    });
  } catch (error) {
    console.warn('[logs] ban handler failed:', error?.message || error);
  }
}

async function handleGuildBanRemove(ban) {
  try {
    const { guild, user } = ban;
    const { executor, reason } = await fetchAuditExecutor(guild, AuditLogEvent.MemberBanRemove, user.id);

    deactivateActiveCases(guild.id, user.id, ['ban']).catch(() => {});
    recordCase(guild, 'unban', {
      target: user,
      moderator: executor,
      reason,
      active: false,
    });
  } catch (error) {
    console.warn('[logs] ban remove handler failed:', error?.message || error);
  }
}

async function handleGuildMemberUpdate(oldMember, newMember) {
  try {
    const guild = newMember.guild;
    const now = Date.now();
    const oldUntil = oldMember?.communicationDisabledUntilTimestamp ?? null;
    const newUntil = newMember.communicationDisabledUntilTimestamp ?? null;

    const wasMuted = Boolean(oldUntil && oldUntil > now);
    const isMuted = Boolean(newUntil && newUntil > now);

    if (!wasMuted && isMuted) {
      const { executor, reason } = await fetchAuditExecutor(guild, AuditLogEvent.MemberUpdate, newMember.id);

      await sendLog(guild, 'mute', buildLogContainer({
        accentColor: LOG_TYPE_BY_KEY.get('mute').color,
        bodyLines: [
          `> **User:** <@${newMember.id}> (\`${newMember.user.tag}\`)`,
          moderatorLine(executor),
          `> **Muted Until:** <t:${unix(newUntil)}:F> (<t:${unix(newUntil)}:R>)`,
          reasonLine(reason),
        ],
        thumbnailUrl: avatarOf(newMember.user),
        titleLine: titleFor('mute', 'Member Muted'),
      }), {
        title: 'Member Muted',
        description: executor
          ? `${newMember.user.tag} · by ${executor.tag || executor.username}`
          : newMember.user.tag,
        targetId: newMember.id,
        targetTag: newMember.user.tag,
        moderatorId: executor?.id || null,
        moderatorTag: executor?.tag || executor?.username || null,
      });

      recordCase(guild, 'mute', {
        target: newMember.user,
        moderator: executor,
        reason,
        active: true,
        expiresAt: newUntil ? new Date(newUntil).toISOString() : null,
        durationMs: newUntil ? Math.max(0, newUntil - Date.now()) : null,
      });
      return;
    }

    if (wasMuted && !isMuted) {
      const { executor, reason } = await fetchAuditExecutor(guild, AuditLogEvent.MemberUpdate, newMember.id);

      await sendLog(guild, 'unmute', buildLogContainer({
        accentColor: LOG_TYPE_BY_KEY.get('unmute').color,
        bodyLines: [
          `> **User:** <@${newMember.id}> (\`${newMember.user.tag}\`)`,
          moderatorLine(executor),
          reasonLine(reason),
        ],
        thumbnailUrl: avatarOf(newMember.user),
        titleLine: titleFor('unmute', 'Member Unmuted'),
      }), {
        title: 'Member Unmuted',
        description: executor
          ? `${newMember.user.tag} · by ${executor.tag || executor.username}`
          : newMember.user.tag,
        targetId: newMember.id,
        targetTag: newMember.user.tag,
        moderatorId: executor?.id || null,
        moderatorTag: executor?.tag || executor?.username || null,
      });

      recordCase(guild, 'unmute', {
        target: newMember.user,
        moderator: executor,
        reason,
        active: false,
      });
      deactivateActiveCases(guild.id, newMember.id, ['mute']).catch(() => {});
    }
  } catch (error) {
    console.warn('[logs] member update handler failed:', error?.message || error);
  }
}

async function handleGuildMemberAdd(member) {
  try {
    const { guild, user } = member;
    const created = user.createdTimestamp;

    await sendLog(guild, 'join', buildLogContainer({
      accentColor: LOG_TYPE_BY_KEY.get('join').color,
      bodyLines: [
        `> **User:** <@${user.id}> (\`${user.tag}\`)`,
        `> **User ID:** \`${user.id}\``,
        `> **Account Created:** <t:${unix(created)}:D> (<t:${unix(created)}:R>)`,
        `> **Member Count:** \`${guild.memberCount}\``,
      ],
      thumbnailUrl: avatarOf(user),
      titleLine: titleFor('join', 'Member Joined'),
    }), {
      title: 'Member Joined',
      description: `${user.tag} · member #${guild.memberCount}`,
      targetId: user.id,
      targetTag: user.tag,
    });
  } catch (error) {
    console.warn('[logs] member add handler failed:', error?.message || error);
  }
}

async function handleGuildMemberRemove(member) {
  try {
    const { guild, user } = member;

    // A ban also fires member-remove; the ban handler already logs it.
    if (wasRecentlyBanned(guild.id, user.id)) {
      return;
    }

    const kick = await fetchAuditExecutor(guild, AuditLogEvent.MemberKick, user.id);

    if (kick.executor) {
      await sendLog(guild, 'kick', buildLogContainer({
        accentColor: LOG_TYPE_BY_KEY.get('kick').color,
        bodyLines: [
          `> **User:** <@${user.id}> (\`${user.tag}\`)`,
          `> **User ID:** \`${user.id}\``,
          moderatorLine(kick.executor),
          reasonLine(kick.reason),
        ],
        thumbnailUrl: avatarOf(user),
        titleLine: titleFor('kick', 'Member Kicked'),
      }), {
        title: 'Member Kicked',
        description: kick.executor
          ? `${user.tag} · by ${kick.executor.tag || kick.executor.username}`
          : user.tag,
        targetId: user.id,
        targetTag: user.tag,
        moderatorId: kick.executor?.id || null,
        moderatorTag: kick.executor?.tag || kick.executor?.username || null,
      });

      recordCase(guild, 'kick', {
        target: user,
        moderator: kick.executor,
        reason: kick.reason,
        active: false,
      });
      return;
    }

    const joinedAt = member.joinedTimestamp;
    const roles = member.roles?.cache
      ? [...member.roles.cache.values()].filter((role) => role.id !== guild.id).sort((a, b) => b.position - a.position)
      : [];
    const roleText = roles.length
      ? truncate(roles.slice(0, 15).map((role) => `<@&${role.id}>`).join(' '), 800)
      : '`None`';

    await sendLog(guild, 'leave', buildLogContainer({
      accentColor: LOG_TYPE_BY_KEY.get('leave').color,
      bodyLines: [
        `> **User:** <@${user.id}> (\`${user.tag}\`)`,
        `> **User ID:** \`${user.id}\``,
        joinedAt ? `> **Joined:** <t:${unix(joinedAt)}:D> (<t:${unix(joinedAt)}:R>)` : null,
        `> **Member Count:** \`${guild.memberCount}\``,
        '',
        `**Roles:** ${roleText}`,
      ],
      thumbnailUrl: avatarOf(user),
      titleLine: titleFor('leave', 'Member Left'),
    }), {
      title: 'Member Left',
      description: `${user.tag} · ${guild.memberCount} members`,
      targetId: user.id,
      targetTag: user.tag,
    });
  } catch (error) {
    console.warn('[logs] member remove handler failed:', error?.message || error);
  }
}

async function handleVoiceStateUpdate(oldState, newState) {
  try {
    const guild = newState.guild || oldState.guild;
    const oldChannelId = oldState.channelId;
    const newChannelId = newState.channelId;

    if (oldChannelId === newChannelId) {
      return;
    }

    const member = newState.member || oldState.member;
    const user = member?.user;
    const userLine = user
      ? `> **User:** <@${user.id}> (\`${user.tag}\`)`
      : `> **User:** <@${member?.id}>`;

    let action;
    let channelLine;

    if (!oldChannelId && newChannelId) {
      action = 'Voice Channel Joined';
      channelLine = `> **Channel:** <#${newChannelId}>`;
    } else if (oldChannelId && !newChannelId) {
      action = 'Voice Channel Left';
      channelLine = `> **Channel:** <#${oldChannelId}>`;
    } else {
      action = 'Voice Channel Moved';
      channelLine = `> **From:** <#${oldChannelId}>\n> **To:** <#${newChannelId}>`;
    }

    await sendLog(guild, 'voice', buildLogContainer({
      accentColor: LOG_TYPE_BY_KEY.get('voice').color,
      bodyLines: [userLine, channelLine],
      thumbnailUrl: avatarOf(user),
      titleLine: titleFor('voice', action),
    }), {
      title: action,
      description: user
        ? `${user.tag} · ${(newState.channel || oldState.channel)?.name || 'voice'}`
        : 'Voice update',
      targetId: user?.id || member?.id || null,
      targetTag: user?.tag || null,
    });
  } catch (error) {
    console.warn('[logs] voice handler failed:', error?.message || error);
  }
}

module.exports = {
  getLogChannel,
  handleGuildBanAdd,
  handleGuildBanRemove,
  handleGuildMemberAdd,
  handleGuildMemberRemove,
  handleGuildMemberUpdate,
  handleMessageDelete,
  handleMessageUpdate,
  handleVoiceStateUpdate,
};
