const { BOT_OWNER_IDS, isBotOwner } = require('../../../config');
const { removeNoPrefixUser } = require('../../../supabase/noPrefixUsers');
const {
  createNoticePayload,
  createOwnerOnlyPayload,
  createRemovedPayload,
  fetchUser,
  parseUserId,
} = require('../../../utils/noprefixComponents');

async function execute({ args, client, message, prefix }) {
  if (!isBotOwner(message.author.id)) {
    await message.reply(createOwnerOnlyPayload({
      client,
      ownerConfigured: BOT_OWNER_IDS.length > 0,
    }));
    return;
  }

  const targetUserId = parseUserId(args, message);

  if (!targetUserId) {
    await message.reply(createNoticePayload({
      client,
      title: 'Missing User',
      description: `Usage: \`${prefix}npx remove @user\``,
    }));
    return;
  }

  const result = await removeNoPrefixUser(targetUserId);

  if (!result.ok) {
    await message.reply(createNoticePayload({
      client,
      title: 'Noprefix Error',
      description: result.reason,
    }));
    return;
  }

  const targetUser = await fetchUser(client, targetUserId) || {
    id: targetUserId,
  };

  await message.channel.send(createRemovedPayload({
    client,
    targetUser,
    removed: result.removed,
  }));
}

module.exports = {
  name: 'noprefix remove',
  aliases: ['npx remove'],
  category: 'owner',
  description: 'Removes a user from the global noprefix list.',
  usage: 'LR!npx remove @user',
  execute,
};
