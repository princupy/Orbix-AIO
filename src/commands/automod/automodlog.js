const { cv2Payload } = require('../../utils/cv2');
const { getAutomodConfig, updateAutomodConfig } = require('../../supabase/automod');
const {
  AUTOMOD_DELETE_CUSTOM_ID_PREFIX,
  buildAutomodError,
  buildAutomodSuccess,
  buildAutomodWarning,
  canManageAutomod,
  handleAutomodDelete,
  resolveTextChannel,
} = require('../../utils/automod');

const CLEAR_WORDS = new Set(['remove', 'off', 'none', 'disable', 'clear', 'reset', 'unset']);

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

  const configResult = await getAutomodConfig(message.guild.id);
  const config = configResult.config;
  const sub = args[0]?.toLowerCase();

  if (CLEAR_WORDS.has(sub)) {
    const result = await updateAutomodConfig(message.guild.id, { log_channel_id: null });

    if (!result.ok) {
      await message.reply(cv2Payload(buildAutomodError({
        description: `Could not save settings.\n\`${result.reason}\``,
        ownerId,
        title: 'Save Failed',
      })));
      return;
    }

    await message.channel.send(cv2Payload(buildAutomodSuccess({
      description: 'AutoMod logging has been **disabled**. Actions will no longer be logged.',
      ownerId,
      title: 'Log Channel Cleared',
    })));
    return;
  }

  const channelArg = sub === 'set' ? args[1] : args[0];

  if (!channelArg) {
    await message.channel.send(cv2Payload(buildAutomodWarning({
      description: [
        `**Current Log Channel:** ${config.log_channel_id ? `<#${config.log_channel_id}>` : '`Not set`'}`,
        '',
        'When set, every AutoMod action is logged with the user, filter, action, and message.',
        '',
        '**Manage:**',
        `> \`${prefix}automodlog <#channel>\` — set the log channel`,
        `> \`${prefix}automodlog remove\` — disable logging`,
      ].join('\n'),
      ownerId,
      title: 'AutoMod Log Channel',
    }), {
      allowedMentions: { parse: [], roles: [], repliedUser: false },
    }));
    return;
  }

  const channel = await resolveTextChannel(message.guild, channelArg);

  if (!channel) {
    await message.reply(cv2Payload(buildAutomodError({
      description: [
        'Mention a valid text channel, or provide its ID.',
        `Usage: \`${prefix}automodlog <#channel>\``,
      ].join('\n'),
      ownerId,
      title: 'Invalid Channel',
    })));
    return;
  }

  const result = await updateAutomodConfig(message.guild.id, { log_channel_id: channel.id });

  if (!result.ok) {
    await message.reply(cv2Payload(buildAutomodError({
      description: `Could not save settings.\n\`${result.reason}\``,
      ownerId,
      title: 'Save Failed',
    })));
    return;
  }

  await message.channel.send(cv2Payload(buildAutomodSuccess({
    description: `AutoMod actions will now be logged to <#${channel.id}>.`,
    ownerId,
    title: 'Log Channel Set',
  }), {
    allowedMentions: { parse: [], roles: [], repliedUser: false },
  }));
}

module.exports = {
  name: 'automodlog',
  aliases: ['automodlogs', 'amlog', 'automodlogchannel'],
  category: 'automod',
  description: 'Set or clear the channel where AutoMod actions are logged.',
  usage: 'LR!automodlog <#channel|remove>',
  noTimeout: true,
  execute,
  componentHandlers: [
    {
      customIdPrefix: AUTOMOD_DELETE_CUSTOM_ID_PREFIX,
      execute: handleAutomodDelete,
    },
  ],
};
