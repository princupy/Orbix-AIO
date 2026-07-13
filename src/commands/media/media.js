const { cv2Payload } = require('../../utils/cv2');
const {
  MEDIA_DELETE_CUSTOM_ID_PREFIX,
  buildMediaHomeContainer,
  handleDeleteButton,
} = require('../../utils/mediaOnlyCommand');

async function execute({ message, prefix }) {
  await message.channel.send(cv2Payload(buildMediaHomeContainer({
    ownerId: message.author.id,
    prefix,
  })));
}

module.exports = {
  name: 'media',
  aliases: ['mediaonly'],
  category: 'media',
  description: 'Shows media-only channel command usage.',
  usage: 'LR!media',
  execute,
  componentHandlers: [
    {
      customIdPrefix: MEDIA_DELETE_CUSTOM_ID_PREFIX,
      execute: handleDeleteButton,
    },
  ],
};
