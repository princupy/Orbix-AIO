const { cv2Payload } = require('../../utils/cv2');
const {
  addExemption,
  listExemptions,
  removeExemption,
} = require('../../supabase/automod');
const {
  AUTOMOD_DELETE_CUSTOM_ID_PREFIX,
  buildAutomodError,
  buildAutomodSuccess,
  buildAutomodWarning,
  canManageAutomod,
  handleAutomodDelete,
} = require('../../utils/automod');

function detectTarget(message, raw) {
  const value = String(raw || '');
  const roleMention = value.match(/^<@&(\d{17,20})>$/);

  if (roleMention) {
    return { id: roleMention[1], type: 'role' };
  }

  const channelMention = value.match(/^<#(\d{17,20})>$/);

  if (channelMention) {
    return { id: channelMention[1], type: 'channel' };
  }

  if (/^\d{17,20}$/.test(value)) {
    if (message.guild.channels.cache.has(value)) {
      return { id: value, type: 'channel' };
    }

    if (message.guild.roles.cache.has(value)) {
      return { id: value, type: 'role' };
    }
  }

  return null;
}

function formatTarget(type, id) {
  return type === 'role' ? `<@&${id}>` : `<#${id}>`;
}

function buildExemptOverview(exemptions, prefix) {
  const roleText = exemptions.roles.length === 0
    ? '`None`'
    : exemptions.roles.map((id) => `<@&${id}>`).join(', ');
  const channelText = exemptions.channels.length === 0
    ? '`None`'
    : exemptions.channels.map((id) => `<#${id}>`).join(', ');

  return [
    'Members with an exempt role, and messages in exempt channels, are **ignored by AutoMod**.',
    '',
    `**Exempt Roles (${exemptions.roles.length}):** ${roleText}`,
    `**Exempt Channels (${exemptions.channels.length}):** ${channelText}`,
    '',
    '*Administrators and members with **Manage Server** are always exempt.*',
    '',
    '**Manage:**',
    `> \`${prefix}automodexempt add <@role|#channel>\``,
    `> \`${prefix}automodexempt remove <@role|#channel>\``,
  ].join('\n');
}

async function execute({ args, message, prefix }) {
  const ownerId = message.author.id;

  if (!canManageAutomod(message.member, ownerId)) {
    await message.reply(cv2Payload(buildAutomodError({
      description: 'You need **Manage Server** or **Administrator** permission to configure AutoMod.',
      ownerId,
      title: 'Missing Permission',
    })));
    return;
  }

  const sub = args[0]?.toLowerCase();
  const isAdding = sub === 'add';
  const isRemoving = sub === 'remove' || sub === 'delete' || sub === 'del';

  if (isAdding || isRemoving) {
    const target = detectTarget(message, args[1]);

    if (!target) {
      await message.reply(cv2Payload(buildAutomodError({
        description: [
          'Mention a valid role or channel, or provide its ID.',
          `Usage: \`${prefix}automodexempt ${isAdding ? 'add' : 'remove'} <@role|#channel>\``,
        ].join('\n'),
        ownerId,
        title: 'Invalid Target',
      })));
      return;
    }

    const result = isAdding
      ? await addExemption({
        addedBy: ownerId,
        guildId: message.guild.id,
        targetId: target.id,
        type: target.type,
      })
      : await removeExemption({
        guildId: message.guild.id,
        targetId: target.id,
        type: target.type,
      });

    if (!result.ok) {
      await message.reply(cv2Payload(buildAutomodError({
        description: `Could not update exemptions.\n\`${result.reason}\``,
        ownerId,
        title: 'Save Failed',
      })));
      return;
    }

    await message.channel.send(cv2Payload(buildAutomodSuccess({
      description: isAdding
        ? `${formatTarget(target.type, target.id)} is now **exempt** from AutoMod.`
        : `${formatTarget(target.type, target.id)} is no longer exempt from AutoMod.`,
      ownerId,
      title: isAdding ? 'Exemption Added' : 'Exemption Removed',
    }), {
      allowedMentions: { parse: [], roles: [], repliedUser: false },
    }));
    return;
  }

  const exemptions = await listExemptions(message.guild.id);

  if (!exemptions.ok && exemptions.reason) {
    await message.reply(cv2Payload(buildAutomodError({
      description: `Could not load exemptions.\n\`${exemptions.reason}\``,
      ownerId,
      title: 'Load Failed',
    })));
    return;
  }

  await message.channel.send(cv2Payload(buildAutomodWarning({
    description: buildExemptOverview(exemptions, prefix),
    ownerId,
    title: 'AutoMod Exemptions',
  }), {
    allowedMentions: { parse: [], roles: [], repliedUser: false },
  }));
}

module.exports = {
  name: 'automodexempt',
  aliases: ['automodignore', 'amexempt', 'amignore', 'automodbypass'],
  category: 'automod',
  description: 'Manage roles and channels that bypass AutoMod filters.',
  usage: 'LR!automodexempt <add|remove|list> <@role|#channel>',
  noTimeout: true,
  execute,
  componentHandlers: [
    {
      customIdPrefix: AUTOMOD_DELETE_CUSTOM_ID_PREFIX,
      execute: handleAutomodDelete,
    },
  ],
};
