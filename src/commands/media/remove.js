const emojis = require('../../emojis');
const { removeMediaOnlyChannels } = require('../../supabase/mediaOnlyChannels');
const { cv2Payload } = require('../../utils/cv2');
const {
  MEDIA_DELETE_CUSTOM_ID_PREFIX,
  buildNoticeContainer,
  canManageMediaOnly,
  formatChannelList,
  getTargetChannelIds,
  handleDeleteButton,
} = require('../../utils/mediaOnlyCommand');

async function execute({ args, message, prefix }) {
  const ownerId = message.author.id;

  if (!canManageMediaOnly(message.member)) {
    await message.reply(cv2Payload(buildNoticeContainer({
      ownerId,
      title: emojis.label('status.error', 'Missing Permission'),
      description: 'You need **Manage Channels** or **Administrator** permission to use this command.',
    })));
    return;
  }

  const targetChannelIds = getTargetChannelIds(message, args);

  if (targetChannelIds.length === 0) {
    await message.reply(cv2Payload(buildNoticeContainer({
      ownerId,
      title: emojis.label('status.warning', 'No Valid Channels'),
      description: `Usage: \`${prefix}media remove [#channel/channelId]\``,
    })));
    return;
  }

  const result = await removeMediaOnlyChannels({
    guildId: message.guild.id,
    channelIds: targetChannelIds,
  });

  if (!result.ok) {
    await message.reply(cv2Payload(buildNoticeContainer({
      ownerId,
      title: emojis.label('status.error', 'Media Remove Failed'),
      description: `Could not remove media-only channels.\n\`${result.reason}\``,
    })));
    return;
  }

  await message.channel.send(cv2Payload(buildNoticeContainer({
    ownerId,
    title: emojis.label('status.success', 'Media Only Disabled'),
    description: [
      'Removed these channels from media-only mode:',
      '',
      formatChannelList(result.removed, message.guild),
    ].join('\n'),
  })));
}

module.exports = {
  name: 'media remove',
  aliases: ['media delete', 'mediaonly remove', 'mediaonly delete'],
  category: 'media',
  description: 'Remove channels from media-only mode.',
  usage: 'LR!media remove [#channel/channelId]',
  execute,
  componentHandlers: [
    {
      customIdPrefix: MEDIA_DELETE_CUSTOM_ID_PREFIX,
      execute: handleDeleteButton,
    },
  ],
};
