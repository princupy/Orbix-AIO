const { cv2Payload } = require('../../utils/cv2');
const { resetUserLevel } = require('../../supabase/leveling');
const {
  LEVELING_DELETE_CUSTOM_ID_PREFIX,
  buildErrorContainer,
  buildSuccessContainer,
  getLevelAdminCheck,
  handleDeleteButton,
  removeLevelRewardRoles,
  resolveMember,
} = require('../../utils/leveling');

async function execute({ args, message, prefix }) {
  const ownerId = message.author.id;
  const permissionError = getLevelAdminCheck(message);

  if (permissionError) {
    await message.reply(cv2Payload(permissionError));
    return;
  }

  const targetMember = await resolveMember(message, args[0]);

  if (!targetMember) {
    await message.reply(cv2Payload(buildErrorContainer({
      description: `Usage: \`${prefix}resetuser @user\``,
      ownerId,
      title: 'Reset User Usage',
    })));
    return;
  }

  const result = await resetUserLevel(message.guild.id, targetMember.id);

  if (!result.ok) {
    await message.reply(cv2Payload(buildErrorContainer({
      description: result.reason,
      ownerId,
      title: 'Reset User Failed',
    })));
    return;
  }

  const roleResult = await removeLevelRewardRoles({
    guild: message.guild,
    member: targetMember,
  });

  await message.channel.send(cv2Payload(buildSuccessContainer({
    ownerId,
    title: 'User Level Reset',
    description: [
      `Reset XP, level, and message count for <@${targetMember.id}>.`,
      `Reward roles removed: ${roleResult.removed.map((roleId) => `<@&${roleId}>`).join(', ') || '`None`'}`,
    ].join('\n'),
  }), {
    allowedMentions: {
      parse: [],
      users: [targetMember.id],
      roles: [],
      repliedUser: false,
    },
  }));
}

module.exports = {
  name: 'resetuser',
  aliases: ['resetlevel'],
  category: 'leveling',
  description: 'Reset one user XP, level, and message count.',
  usage: 'LR!resetuser @user',
  execute,
  componentHandlers: [
    {
      customIdPrefix: LEVELING_DELETE_CUSTOM_ID_PREFIX,
      execute: handleDeleteButton,
    },
  ],
};
