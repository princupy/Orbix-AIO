const { PermissionsBitField } = require('discord.js');
const emojis = require('../../emojis');
const { cv2Payload } = require('../../utils/cv2');
const {
  botCanAssignRole,
  buildAutoroleNotice,
  buildAutoroleStatus,
  isConfigurableRole,
} = require('../../utils/autoroles');
const {
  CATEGORY_COLUMNS,
  getAutoroleConfig,
  resetAutoroleData,
  updateAutoroleConfig,
} = require('../../supabase/autoroles');

const CATEGORY_LABELS = {
  all: 'Everyone',
  bots: 'Bots only',
  humans: 'Humans only',
};

const ROLE_SUBCOMMANDS = new Set(['set', 'add', 'bots', 'humans', 'remove']);

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
    || member?.permissions?.has(PermissionsBitField.Flags.ManageRoles),
  );
}

function resolveRole(message, roleArgs) {
  const mentioned = message.mentions.roles.first();

  if (mentioned) {
    return mentioned;
  }

  const raw = roleArgs.join(' ').trim();

  if (!raw) {
    return null;
  }

  const idMatch = raw.match(/^(?:<@&)?(\d{17,20})>?$/);

  if (idMatch) {
    return message.guild.roles.cache.get(idMatch[1]) || null;
  }

  const lower = raw.toLowerCase();

  return message.guild.roles.cache.find((role) => role.name.toLowerCase() === lower)
    || message.guild.roles.cache.find((role) => role.name.toLowerCase().includes(lower))
    || null;
}

function saveErrorNotice(result) {
  return buildAutoroleNotice(
    emojis.label('status.error', 'Save Failed'),
    `Could not update the autorole config.\n\`${result.reason || 'Unknown error'}\``,
  );
}

function usageNotice(prefix) {
  return buildAutoroleNotice(emojis.label('status.warning', 'Autorole Commands'), [
    `> \`${prefix}autorole set @role\` — set the role everyone gets on join`,
    `> \`${prefix}autorole add @role\` — add another role for everyone`,
    `> \`${prefix}autorole humans @role\` — role for humans only`,
    `> \`${prefix}autorole bots @role\` — role for bots only`,
    `> \`${prefix}autorole remove @role\` — remove a role from autoroles`,
    `> \`${prefix}autorole list\` — show all auto roles`,
    `> \`${prefix}autorole status\` — show system status`,
    `> \`${prefix}autorole toggle\` — enable/disable the system`,
    `> \`${prefix}autorole clear\` — remove all auto roles`,
    `> \`${prefix}autorole reset\` — reset to default`,
  ].join('\n'));
}

async function execute({ args, message, prefix }) {
  if (!hasPermission(message.member)) {
    await reply(message, buildAutoroleNotice(
      emojis.label('status.error', 'Missing Permission'),
      'You need **Manage Roles** or **Administrator** permission to configure autoroles.',
    ));
    return;
  }

  const sub = (args[0] || 'status').toLowerCase();
  const { config } = await getAutoroleConfig(message.guild.id);

  if (sub === 'status' || sub === 'list') {
    await reply(message, buildAutoroleStatus({ config, guild: message.guild }));
    return;
  }

  if (sub === 'toggle') {
    const result = await updateAutoroleConfig(message.guild.id, { enabled: !config.enabled });

    if (!result.ok) {
      await reply(message, saveErrorNotice(result));
      return;
    }

    await reply(message, buildAutoroleNotice(
      emojis.label('status.success', 'Autorole Toggled'),
      `The autorole system is now **${result.config.enabled ? 'Enabled' : 'Disabled'}**.`,
    ));
    return;
  }

  if (sub === 'clear') {
    const result = await updateAutoroleConfig(message.guild.id, {
      all_role_ids: [],
      bot_role_ids: [],
      human_role_ids: [],
    });

    if (!result.ok) {
      await reply(message, saveErrorNotice(result));
      return;
    }

    await reply(message, buildAutoroleNotice(
      emojis.label('status.success', 'Autoroles Cleared'),
      'All auto roles have been removed. The system is still '
        + `**${config.enabled ? 'enabled' : 'disabled'}**.`,
    ));
    return;
  }

  if (sub === 'reset') {
    const result = await resetAutoroleData(message.guild.id);

    if (!result.ok) {
      await reply(message, saveErrorNotice(result));
      return;
    }

    await reply(message, buildAutoroleNotice(
      emojis.label('status.success', 'Autorole Reset'),
      'Autorole configuration has been reset to default (enabled, no roles).',
    ));
    return;
  }

  if (!ROLE_SUBCOMMANDS.has(sub)) {
    await reply(message, usageNotice(prefix));
    return;
  }

  const role = resolveRole(message, args.slice(1));

  if (!role) {
    await reply(message, buildAutoroleNotice(
      emojis.label('status.error', 'Role Not Found'),
      `Mention a role, or provide its ID/name.\nUsage: \`${prefix}autorole ${sub} @role\``,
    ));
    return;
  }

  if (sub === 'remove') {
    const inAnyList = [config.all_role_ids, config.bot_role_ids, config.human_role_ids]
      .some((list) => list.includes(role.id));

    if (!inAnyList) {
      await reply(message, buildAutoroleNotice(
        emojis.label('status.warning', 'Not an Autorole'),
        `<@&${role.id}> is not in any autorole list.`,
      ));
      return;
    }

    const result = await updateAutoroleConfig(message.guild.id, {
      all_role_ids: config.all_role_ids.filter((id) => id !== role.id),
      bot_role_ids: config.bot_role_ids.filter((id) => id !== role.id),
      human_role_ids: config.human_role_ids.filter((id) => id !== role.id),
    });

    if (!result.ok) {
      await reply(message, saveErrorNotice(result));
      return;
    }

    await reply(message, buildAutoroleNotice(
      emojis.label('status.success', 'Autorole Removed'),
      `<@&${role.id}> has been removed from autoroles.`,
    ));
    return;
  }

  // set / add / bots / humans — validate the role first.
  if (!isConfigurableRole(message.guild, role)) {
    await reply(message, buildAutoroleNotice(
      emojis.label('status.error', 'Invalid Role'),
      'You cannot use `@everyone` or a bot/integration-managed role as an autorole.',
    ));
    return;
  }

  const isAdmin = message.member.permissions.has(PermissionsBitField.Flags.Administrator);

  if (!isAdmin && role.position >= message.member.roles.highest.position) {
    await reply(message, buildAutoroleNotice(
      emojis.label('status.error', 'Role Too High'),
      `<@&${role.id}> is higher than or equal to your highest role, so you cannot set it as an autorole.`,
    ));
    return;
  }

  const category = sub === 'set' || sub === 'add' ? 'all' : sub;
  const column = CATEGORY_COLUMNS[category];
  let patch;

  if (sub === 'set') {
    patch = { [column]: [role.id] };
  } else {
    const current = config[column] || [];

    if (current.includes(role.id)) {
      await reply(message, buildAutoroleNotice(
        emojis.label('status.warning', 'Already Added'),
        `<@&${role.id}> is already in the **${CATEGORY_LABELS[category]}** list.`,
      ));
      return;
    }

    patch = { [column]: [...current, role.id] };
  }

  const result = await updateAutoroleConfig(message.guild.id, patch);

  if (!result.ok) {
    await reply(message, saveErrorNotice(result));
    return;
  }

  const lines = [
    sub === 'set'
      ? `<@&${role.id}> is now the autorole — everyone will get it on join.`
      : `<@&${role.id}> added to the **${CATEGORY_LABELS[category]}** list.`,
  ];

  if (!botCanAssignRole(message.guild, role)) {
    lines.push('', '⚠️ I currently **cannot assign** this role — either I lack **Manage Roles** or my highest role is below it. Move my role above it.');
  }

  if (!config.enabled) {
    lines.push('', `The autorole system is **disabled**. Enable it with \`${prefix}autorole toggle\`.`);
  }

  await reply(message, buildAutoroleNotice(
    emojis.label('status.success', 'Autorole Updated'),
    lines.join('\n'),
  ));
}

module.exports = {
  name: 'autorole',
  aliases: ['autoroles', 'joinrole'],
  category: 'auto-roles',
  description: 'Automatically assign roles to members (and bots) when they join.',
  usage: 'LR!autorole <set|add|humans|bots|remove|list|status|toggle|clear|reset> [role]',
  noTimeout: true,
  execute,
};
