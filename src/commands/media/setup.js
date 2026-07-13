const emojis = require('../../emojis');
const { addMediaOnlyChannels } = require('../../supabase/mediaOnlyChannels');
const { cv2Payload } = require('../../utils/cv2');
const {
  MEDIA_DELETE_CUSTOM_ID_PREFIX,
  buildNoticeContainer,
  canEnforceMediaOnly,
  canManageMediaOnly,
  formatChannelList,
  getTargetChannels,
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

  const botMember = message.guild.members.me
    || await message.guild.members.fetchMe().catch(() => null);
  const targets = await getTargetChannels(message, args);

  if (targets.length === 0) {
    await message.reply(cv2Payload(buildNoticeContainer({
      ownerId,
      title: emojis.label('status.warning', 'No Valid Channels'),
      description: [
        `Usage: \`${prefix}media setup [#channel/channelId]\``,
        '',
        'Only normal text-based guild channels are supported.',
      ].join('\n'),
    })));
    return;
  }

  const allowedTargets = targets.filter((channel) => canEnforceMediaOnly(botMember, channel));
  const skippedTargets = targets.filter((channel) => !allowedTargets.includes(channel));

  if (allowedTargets.length === 0) {
    await message.reply(cv2Payload(buildNoticeContainer({
      ownerId,
      title: emojis.label('status.error', 'Bot Permission Missing'),
      description: 'I need **Manage Messages** permission in the selected channel(s) to enforce media-only mode.',
    })));
    return;
  }

  const result = await addMediaOnlyChannels({
    guildId: message.guild.id,
    channelIds: allowedTargets.map((channel) => channel.id),
    addedBy: ownerId,
  });

  if (!result.ok) {
    await message.reply(cv2Payload(buildNoticeContainer({
      ownerId,
      title: emojis.label('status.error', 'Media Setup Failed'),
      description: `Could not save media-only channels.\n\`${result.reason}\``,
    })));
    return;
  }

  const skippedText = skippedTargets.length > 0
    ? [
      '',
      '**Skipped:**',
      formatChannelList(skippedTargets.map((channel) => channel.id), message.guild),
      '',
      '*I need Manage Messages in skipped channels.*',
    ].join('\n')
    : '';

  await message.channel.send(cv2Payload(buildNoticeContainer({
    ownerId,
    title: emojis.label('status.success', 'Media Only Enabled'),
    description: [
      'Added these channels to media-only mode:',
      '',
      formatChannelList(result.added, message.guild),
      skippedText,
    ].join('\n'),
  })));
}

module.exports = {
  name: 'media setup',
  aliases: ['media add', 'mediaonly setup', 'mediaonly add'],
  category: 'media',
  description: 'Add channels to media-only mode.',
  usage: 'LR!media setup [#channel/channelId]',
  execute,
  componentHandlers: [
    {
      customIdPrefix: MEDIA_DELETE_CUSTOM_ID_PREFIX,
      execute: handleDeleteButton,
    },
  ],
};
