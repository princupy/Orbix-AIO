const {
  ContainerBuilder,
  PermissionsBitField,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
} = require('discord.js');
const emojis = require('../emojis');
const { cv2Payload } = require('./cv2');
const { getAutoroleConfig } = require('../supabase/autoroles');

function createSeparator() {
  return new SeparatorBuilder()
    .setDivider(true)
    .setSpacing(SeparatorSpacingSize.Small);
}

function createFooterText() {
  const poweredEmoji = emojis.getEmoji('cutu.nitish') || emojis.getEmoji('status.success') || '*';
  return new TextDisplayBuilder().setContent(`${poweredEmoji} Made by [Tanmay](https://www.instagram.com/tanmoy_here8388/)`);
}

/**
 * True if a role can be configured as an autorole at all
 * (not @everyone and not a managed/integration role).
 */
function isConfigurableRole(guild, role) {
  return Boolean(role) && role.id !== guild.id && !role.managed;
}

/**
 * True if the bot can currently assign this role (has Manage Roles and the
 * role sits below the bot's highest role).
 */
function botCanAssignRole(guild, role) {
  const me = guild.members.me;

  if (!me || !me.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
    return false;
  }

  return isConfigurableRole(guild, role) && role.position < me.roles.highest.position;
}

function formatRoleMentions(guild, ids) {
  const mentions = (ids || [])
    .map((id) => (guild.roles.cache.get(id) ? `<@&${id}>` : null))
    .filter(Boolean);

  return mentions.length ? mentions.join(' ') : '`None`';
}

/* ── CV2 builders ── */

function buildAutoroleNotice(title, description) {
  return new ContainerBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${title}`))
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(description))
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(createFooterText());
}

function buildAutoroleStatus({ config, guild }) {
  const enabledLabel = config.enabled
    ? `${emojis.getEmoji('status.success') || '✅'} Enabled`
    : `${emojis.getEmoji('status.error') || '❌'} Disabled`;

  return new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${emojis.label('orbix.orbix', 'Autorole Status')}`),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        `**System:** ${enabledLabel}`,
        '',
        `> 👥 **Everyone:** ${formatRoleMentions(guild, config.all_role_ids)}`,
        `> 🙂 **Humans only:** ${formatRoleMentions(guild, config.human_role_ids)}`,
        `> 🤖 **Bots only:** ${formatRoleMentions(guild, config.bot_role_ids)}`,
      ].join('\n')),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(createFooterText());
}

/* ── On-join assignment ── */

/**
 * Return the role IDs a joining member should receive: all-roles plus the
 * bot/human list, filtered to roles that exist, are not @everyone or managed,
 * and sit below the bot's highest role. Returns [] when the bot cannot assign.
 */
function selectAssignableRoleIds({
  config, guild, isBot, me,
}) {
  const targetIds = new Set([
    ...config.all_role_ids,
    ...(isBot ? config.bot_role_ids : config.human_role_ids),
  ]);

  if (targetIds.size === 0 || !me || !me.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
    return [];
  }

  const highest = me.roles.highest.position;

  return [...targetIds].filter((id) => {
    const role = guild.roles.cache.get(id);
    return role && role.id !== guild.id && !role.managed && role.position < highest;
  });
}

async function handleAutoroleMemberAdd(member) {
  try {
    const { guild, user } = member;

    if (!guild || !user) {
      return;
    }

    const { config } = await getAutoroleConfig(guild.id);

    if (!config.enabled) {
      return;
    }

    const me = guild.members.me || await guild.members.fetchMe().catch(() => null);
    const assignableIds = selectAssignableRoleIds({
      config, guild, isBot: user.bot, me,
    });

    if (assignableIds.length === 0) {
      return;
    }

    await member.roles.add(assignableIds, `Autorole on join (${user.bot ? 'bot' : 'human'})`).catch((error) => {
      console.warn(`[autorole] Failed to assign roles in guild ${guild.id}:`, error?.message || error);
    });
  } catch (error) {
    console.warn('[autorole] member add handler failed:', error?.message || error);
  }
}

module.exports = {
  botCanAssignRole,
  buildAutoroleNotice,
  buildAutoroleStatus,
  createFooterText,
  createSeparator,
  handleAutoroleMemberAdd,
  isConfigurableRole,
  selectAssignableRoleIds,
};
