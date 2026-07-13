const { cv2Payload } = require('../../utils/cv2');
const {
  addBlacklistTarget,
  listBlacklist,
  removeBlacklistTarget,
} = require('../../supabase/leveling');
const {
  LEVELING_DELETE_CUSTOM_ID_PREFIX,
  buildErrorContainer,
  buildLevelingContainer,
  buildSuccessContainer,
  extractChannelId,
  getLevelAdminCheck,
  handleDeleteButton,
  resolveTextChannel,
} = require('../../utils/leveling');

function formatChannels(targets) {
  if (targets.length === 0) {
    return '`None`';
  }

  return targets
    .map((row, index) => `${index + 1}. <#${row.target_id}> (\`${row.target_id}\`)`)
    .join('\n');
}

async function execute({ args, message, prefix }) {
  const ownerId = message.author.id;
  const permissionError = getLevelAdminCheck(message);

  if (permissionError) {
    await message.reply(cv2Payload(permissionError));
    return;
  }

  const action = args[0]?.toLowerCase();

  if (!['add', 'remove', 'list'].includes(action)) {
    await message.reply(cv2Payload(buildErrorContainer({
      description: `Usage: \`${prefix}blacklistchannel <add|remove|list> [#channel]\``,
      ownerId,
      title: 'Channel Blacklist Usage',
    })));
    return;
  }

  if (action === 'list') {
    const result = await listBlacklist(message.guild.id, 'channel');

    if (!result.ok) {
      await message.reply(cv2Payload(buildErrorContainer({
        description: result.reason,
        ownerId,
        title: 'Blacklist Load Failed',
      })));
      return;
    }

    await message.channel.send(cv2Payload(buildLevelingContainer({
      ownerId,
      title: 'Blacklisted XP Channels',
      description: formatChannels(result.targets),
    }), {
      allowedMentions: {
        parse: [],
        repliedUser: false,
      },
    }));
    return;
  }

  const channel = await resolveTextChannel(message, args[1]);
  const channelId = channel?.id || extractChannelId(args[1]);

  if (!channelId) {
    await message.reply(cv2Payload(buildErrorContainer({
      description: `Usage: \`${prefix}blacklistchannel ${action} #channel\``,
      ownerId,
      title: 'Invalid Channel',
    })));
    return;
  }

  const result = action === 'add'
    ? await addBlacklistTarget({ guildId: message.guild.id, targetId: channelId, type: 'channel' })
    : await removeBlacklistTarget({ guildId: message.guild.id, targetId: channelId, type: 'channel' });

  if (!result.ok) {
    await message.reply(cv2Payload(buildErrorContainer({
      description: result.reason,
      ownerId,
      title: 'Blacklist Update Failed',
    })));
    return;
  }

  await message.channel.send(cv2Payload(buildSuccessContainer({
    ownerId,
    title: action === 'add' ? 'Channel Blacklisted' : 'Channel Removed',
    description: action === 'add'
      ? `<#${channelId}> will no longer give XP.`
      : `<#${channelId}> can give XP again.`,
  }), {
    allowedMentions: {
      parse: [],
      repliedUser: false,
    },
  }));
}

module.exports = {
  name: 'blacklistchannel',
  aliases: ['blchannel'],
  category: 'leveling',
  description: 'Add, remove, or list channels where XP is disabled.',
  usage: 'LR!blacklistchannel <add|remove|list> [#channel]',
  execute,
  componentHandlers: [
    {
      customIdPrefix: LEVELING_DELETE_CUSTOM_ID_PREFIX,
      execute: handleDeleteButton,
    },
  ],
};
