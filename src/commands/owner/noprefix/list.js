const { BOT_OWNER_IDS, isBotOwner } = require('../../../config');
const { listNoPrefixUsers } = require('../../../supabase/noPrefixUsers');
const {
  LIST_PAGE_CUSTOM_ID_PREFIX,
  createListPayload,
  createNoticePayload,
  createOwnerOnlyPayload,
  replyEphemeralNotice,
} = require('../../../utils/noprefixComponents');

async function sendList({ client, message, ownerId, page = 0 }) {
  const result = await listNoPrefixUsers();

  if (!result.ok) {
    await message.reply(createNoticePayload({
      client,
      title: 'Noprefix Error',
      description: result.reason,
    }));
    return;
  }

  await message.channel.send(await createListPayload({
    client,
    ownerId,
    users: result.users,
    page,
  }));
}

async function execute({ client, message }) {
  if (!isBotOwner(message.author.id)) {
    await message.reply(createOwnerOnlyPayload({
      client,
      ownerConfigured: BOT_OWNER_IDS.length > 0,
    }));
    return;
  }

  await sendList({
    client,
    message,
    ownerId: message.author.id,
  });
}

async function handleListPage({ client, interaction }) {
  const [, , ownerId, rawPage] = interaction.customId.split(':');

  if (interaction.user.id !== ownerId) {
    await replyEphemeralNotice(
      interaction,
      'Owner Only',
      'Only the user who opened this list can use these buttons.',
    );
    return;
  }

  if (!isBotOwner(interaction.user.id)) {
    await replyEphemeralNotice(
      interaction,
      'Owner Only',
      'Only the bot owner configured in `.env` can use this list.',
    );
    return;
  }

  const result = await listNoPrefixUsers();

  if (!result.ok) {
    await replyEphemeralNotice(interaction, 'Noprefix Error', result.reason);
    return;
  }

  await interaction.update(await createListPayload({
    client,
    ownerId,
    users: result.users,
    page: Number(rawPage) || 0,
  }));
}

module.exports = {
  name: 'noprefix list',
  aliases: ['npx list'],
  category: 'owner',
  description: 'Lists global noprefix users.',
  usage: 'LR!npx list',
  execute,
  componentHandlers: [
    {
      customIdPrefix: LIST_PAGE_CUSTOM_ID_PREFIX,
      execute: handleListPage,
    },
  ],
};
