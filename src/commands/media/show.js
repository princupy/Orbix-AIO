const emojis = require('../../emojis');
const { listMediaOnlyChannels } = require('../../supabase/mediaOnlyChannels');
const { cv2Payload } = require('../../utils/cv2');
const {
  MEDIA_DELETE_CUSTOM_ID_PREFIX,
  buildMediaShowContainer,
  buildNoticeContainer,
  handleDeleteButton,
} = require('../../utils/mediaOnlyCommand');

async function execute({ message, prefix }) {
  const ownerId = message.author.id;
  const result = await listMediaOnlyChannels(message.guild.id);

  if (!result.ok) {
    await message.reply(cv2Payload(buildNoticeContainer({
      ownerId,
      title: emojis.label('status.error', 'Media List Failed'),
      description: `Could not load media-only channels.\n\`${result.reason}\``,
    })));
    return;
  }

  await message.channel.send(cv2Payload(buildMediaShowContainer({
    channelIds: result.channels.map((row) => row.channel_id),
    guild: message.guild,
    ownerId,
    prefix,
  })));
}

module.exports = {
  name: 'media show',
  aliases: ['media list', 'mediaonly show', 'mediaonly list'],
  category: 'media',
  description: 'Shows current media-only channels.',
  usage: 'LR!media show',
  execute,
  componentHandlers: [
    {
      customIdPrefix: MEDIA_DELETE_CUSTOM_ID_PREFIX,
      execute: handleDeleteButton,
    },
  ],
};
