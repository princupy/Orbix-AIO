const { cv2Payload } = require('../../utils/cv2');
const { updateLevelConfig } = require('../../supabase/leveling');
const {
  LEVELING_DELETE_CUSTOM_ID_PREFIX,
  buildErrorContainer,
  buildSuccessContainer,
  getLevelAdminCheck,
  handleDeleteButton,
} = require('../../utils/leveling');

const MAX_MESSAGE_LENGTH = 1500;

async function execute({ args, message, prefix }) {
  const ownerId = message.author.id;
  const permissionError = getLevelAdminCheck(message);

  if (permissionError) {
    await message.reply(cv2Payload(permissionError));
    return;
  }

  const template = args.join(' ').trim();

  if (!template) {
    await message.reply(cv2Payload(buildErrorContainer({
      description: [
        `Usage: \`${prefix}setlevelupmessage <text>\``,
        'Placeholders: `{user}`, `{level}`, `{mention}`, `{server}`',
      ].join('\n'),
      ownerId,
      title: 'Level-up Message Usage',
    })));
    return;
  }

  const result = await updateLevelConfig(message.guild.id, {
    levelup_message: template.slice(0, MAX_MESSAGE_LENGTH),
  });

  if (!result.ok) {
    await message.reply(cv2Payload(buildErrorContainer({
      description: result.reason,
      ownerId,
      title: 'Message Update Failed',
    })));
    return;
  }

  await message.channel.send(cv2Payload(buildSuccessContainer({
    ownerId,
    title: 'Level-up Message Updated',
    description: [
      'New message:',
      result.config.levelup_message,
      '',
      'Placeholders supported: `{user}`, `{level}`, `{mention}`, `{server}`',
    ].join('\n'),
  })));
}

module.exports = {
  name: 'setlevelupmessage',
  aliases: ['levelupmessage'],
  category: 'leveling',
  description: 'Set the custom level-up message.',
  usage: 'LR!setlevelupmessage <text>',
  execute,
  componentHandlers: [
    {
      customIdPrefix: LEVELING_DELETE_CUSTOM_ID_PREFIX,
      execute: handleDeleteButton,
    },
  ],
};
