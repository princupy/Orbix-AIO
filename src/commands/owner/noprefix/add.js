const { BOT_OWNER_IDS, isBotOwner } = require('../../../config');
const { addNoPrefixUser } = require('../../../supabase/noPrefixUsers');
const {
  ADD_DURATION_CUSTOM_ID_PREFIX,
  createAddedPayload,
  createDurationSelectPayload,
  createNoticePayload,
  createOwnerOnlyPayload,
  fetchUser,
  parseUserId,
  replyEphemeralNotice,
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
      description: `Usage: \`${prefix}npx add @user\``,
    }));
    return;
  }

  const targetUser = await fetchUser(client, targetUserId) || {
    id: targetUserId,
  };

  await message.channel.send(createDurationSelectPayload({
    client,
    ownerId: message.author.id,
    targetUser,
  }));
}

async function handleDurationSelect({ client, interaction }) {
  const [, , ownerId, targetUserId] = interaction.customId.split(':');

  if (interaction.user.id !== ownerId) {
    await replyEphemeralNotice(
      interaction,
      'Owner Only',
      'Only the user who opened this duration menu can use it.',
    );
    return;
  }

  if (!isBotOwner(interaction.user.id)) {
    await replyEphemeralNotice(
      interaction,
      'Owner Only',
      'Only the bot owner can use this menu.',
    );
    return;
  }

  const durationKey = interaction.values?.[0];
  const result = await addNoPrefixUser({
    userId: targetUserId,
    addedBy: interaction.user.id,
    durationKey,
  });

  if (!result.ok) {
    await replyEphemeralNotice(interaction, 'Noprefix Error', result.reason);
    return;
  }

  const targetUser = await fetchUser(client, targetUserId) || {
    id: targetUserId,
  };

  await interaction.update(createAddedPayload({
    client,
    targetUser,
    duration: result.duration,
    expiresAt: result.expiresAt,
  }));
}

module.exports = {
  name: 'noprefix add',
  aliases: ['npx add'],
  category: 'owner',
  description: 'Adds a user to the global noprefix list.',
  usage: 'LR!npx add @user',
  execute,
  componentHandlers: [
    {
      customIdPrefix: ADD_DURATION_CUSTOM_ID_PREFIX,
      execute: handleDurationSelect,
    },
  ],
};
