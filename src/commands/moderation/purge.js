const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  PermissionsBitField,
  SeparatorBuilder,
  SeparatorSpacingSize,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextDisplayBuilder,
} = require('discord.js');
const emojis = require('../../emojis');
const { cv2Payload } = require('../../utils/cv2');

const PURGE_MODE_CUSTOM_ID_PREFIX = 'purge:mode:';
const PURGE_DELETE_CUSTOM_ID_PREFIX = 'purge:delete:';
const PURGE_CONFIRM_CUSTOM_ID_PREFIX = 'purge:confirm:';
const PURGE_CANCEL_CUSTOM_ID_PREFIX = 'purge:cancel:';

const MAX_PURGE_AMOUNT = 100;
const MIN_PURGE_AMOUNT = 1;
const DEFAULT_PURGE_AMOUNT = 10;
const MEDIA_URL_PATTERN = /https?:\/\/\S+\.(?:png|jpe?g|gif|webp|mp4|mov|webm|m4v|mp3|wav|ogg)(?:[?#]\S*)?/i;

/* ── Reusable helpers (matches existing codebase style) ── */

function createSeparator() {
  return new SeparatorBuilder()
    .setDivider(true)
    .setSpacing(SeparatorSpacingSize.Small);
}

function createFooterText() {
  const poweredEmoji = emojis.getEmoji('cutu.nitish') || emojis.getEmoji('status.success') || '*';
  return new TextDisplayBuilder().setContent(`${poweredEmoji} Made by [Tanmay](https://www.instagram.com/tanmoy_here8388/)`);
}

function createEphemeralTextPayload(content) {
  return cv2Payload(
    new ContainerBuilder().addTextDisplayComponents(
      new TextDisplayBuilder().setContent(content),
    ),
    { ephemeral: true },
  );
}

function canPurge(member) {
  return Boolean(
    member?.permissions?.has(PermissionsBitField.Flags.Administrator)
    || member?.permissions?.has(PermissionsBitField.Flags.ManageMessages),
  );
}

function createDeleteRow(ownerId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${PURGE_DELETE_CUSTOM_ID_PREFIX}${ownerId}`)
      .setLabel('Delete')
      .setStyle(ButtonStyle.Secondary),
  );
}

/* ── Container builders ── */

function buildMissingPermContainer() {
  return new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${emojis.label('status.error', 'Missing Permission')}`,
      ),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        'You need **Manage Messages** or **Administrator** permission to use this command.',
      ),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(createFooterText());
}

function buildPurgeMenuContainer({ ownerId, prefix }) {
  const select = new StringSelectMenuBuilder()
    .setCustomId(`${PURGE_MODE_CUSTOM_ID_PREFIX}${ownerId}`)
    .setPlaceholder('Select purge mode')
    .addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel('Purge All Messages')
        .setDescription('Delete messages from all users in this channel')
        .setValue('all'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Purge User Messages')
        .setDescription('Delete messages from a specific user')
        .setValue('user'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Purge Bot Messages')
        .setDescription('Delete messages sent by bots in this channel')
        .setValue('bots'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Purge Media Messages')
        .setDescription('Delete messages containing media only')
        .setValue('media'),
    );

  return new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## <:icons8deletemessage64:1512413134697267342> **Purge Messages**`,
      ),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        'Select how you want to purge messages from the menu below.',
        '',
        '> **All Messages** — Delete recent messages from everyone',
        '> **User Messages** — Delete messages from a specific user',
        '> **Bot Messages** — Delete messages sent by bots',
        '> **Media Messages** — Delete messages containing media only',
        '',
        `**Usage:**`,
        `\`${prefix}purge <amount>\` — Purge all messages`,
        `\`${prefix}purge @user <amount>\` — Purge a user's messages`,
        `\`${prefix}purge bots <amount>\` — Purge bot messages`,
        `\`${prefix}purge media <amount>\` — Purge media messages`,
        '',
        `*Max: **${MAX_PURGE_AMOUNT}** messages per purge | Default: **${DEFAULT_PURGE_AMOUNT}***`,
      ].join('\n')),
    )
    .addSeparatorComponents(createSeparator())
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(select),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`Panel owner: <@${ownerId}>`),
    )
    .addActionRowComponents(createDeleteRow(ownerId))
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(createFooterText());
}

function buildConfirmContainer({ ownerId, mode, amount, targetUserId }) {
  let modeLabel = 'all messages';

  if (mode === 'user') {
    modeLabel = `messages from <@${targetUserId}>`;
  } else if (mode === 'bots') {
    modeLabel = 'bot messages';
  } else if (mode === 'media') {
    modeLabel = 'media messages';
  }

  return new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${emojis.label('status.warning', 'Confirm Purge')}`,
      ),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        `Are you sure you want to delete **${amount}** ${modeLabel} in this channel?`,
        '',
        '*This action cannot be undone.*',
      ].join('\n')),
    )
    .addSeparatorComponents(createSeparator())
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`${PURGE_CONFIRM_CUSTOM_ID_PREFIX}${ownerId}:${mode}:${amount}:${targetUserId || 'none'}`)
          .setLabel('Confirm Purge')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(`${PURGE_CANCEL_CUSTOM_ID_PREFIX}${ownerId}`)
          .setLabel('Cancel')
          .setStyle(ButtonStyle.Secondary),
      ),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(createFooterText());
}

function buildSuccessContainer({ deleted, mode, targetUserId, ownerId }) {
  let modeLabel = 'from all users';

  if (mode === 'user') {
    modeLabel = `from <@${targetUserId}>`;
  } else if (mode === 'bots') {
    modeLabel = 'from bots';
  } else if (mode === 'media') {
    modeLabel = 'containing media';
  }

  return new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${emojis.label('status.success', 'Purge Complete')}`,
      ),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        `Successfully deleted **${deleted}** message${deleted !== 1 ? 's' : ''} ${modeLabel}.`,
        '',
        `*Purged by <@${ownerId}>*`,
      ].join('\n')),
    )
    .addSeparatorComponents(createSeparator())
    .addActionRowComponents(createDeleteRow(ownerId))
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(createFooterText());
}

function buildErrorContainer({ errorMessage, ownerId }) {
  return new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${emojis.label('status.error', 'Purge Failed')}`,
      ),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(errorMessage),
    )
    .addSeparatorComponents(createSeparator())
    .addActionRowComponents(createDeleteRow(ownerId))
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(createFooterText());
}

/* ── Purge logic ── */

function parseAmount(raw) {
  const num = parseInt(raw, 10);

  if (Number.isNaN(num) || num < MIN_PURGE_AMOUNT) {
    return MIN_PURGE_AMOUNT;
  }

  return Math.min(num, MAX_PURGE_AMOUNT);
}

function hasMedia(message) {
  if (message.attachments?.size > 0 || message.stickers?.size > 0) {
    return true;
  }

  if (message.embeds?.some((embed) => (
    embed.image
    || embed.thumbnail
    || embed.video
    || ['image', 'gifv', 'video'].includes(embed.type)
  ))) {
    return true;
  }

  return MEDIA_URL_PATTERN.test(message.content || '');
}

async function performPurge({ channel, amount, targetUserId, botsOnly, mediaOnly }) {
  if (targetUserId) {
    /* Fetch more messages so we can filter by user and still reach the requested count */
    const fetched = await channel.messages.fetch({ limit: 100 });
    const userMessages = fetched
      .filter((msg) => msg.author.id === targetUserId)
      .first(amount);

    if (userMessages.length === 0) {
      return 0;
    }

    const deleted = await channel.bulkDelete(userMessages, true);
    return deleted.size;
  }

  if (botsOnly) {
    /* Fetch messages and filter only bot messages */
    const fetched = await channel.messages.fetch({ limit: 100 });
    const botMessages = fetched
      .filter((msg) => msg.author.bot)
      .first(amount);

    if (botMessages.length === 0) {
      return 0;
    }

    const deleted = await channel.bulkDelete(botMessages, true);
    return deleted.size;
  }

  if (mediaOnly) {
    /* Fetch messages and filter only media messages */
    const fetched = await channel.messages.fetch({ limit: 100 });
    const mediaMessages = fetched
      .filter((msg) => hasMedia(msg))
      .first(amount);

    if (mediaMessages.length === 0) {
      return 0;
    }

    const deleted = await channel.bulkDelete(mediaMessages, true);
    return deleted.size;
  }

  const deleted = await channel.bulkDelete(amount, true);
  return deleted.size;
}

/* ── Command execute (prefix usage) ── */

async function execute({ args, message, prefix }) {
  if (!canPurge(message.member)) {
    await message.reply(cv2Payload(buildMissingPermContainer()));
    return;
  }

  const mentionedUser = message.mentions.users.first();
  const isBotMode = args[0]?.toLowerCase() === 'bots' || args[0]?.toLowerCase() === 'bot';
  const isMediaMode = ['media', 'medias', 'image', 'images', 'attachment', 'attachments', 'file', 'files']
    .includes(args[0]?.toLowerCase());

  /* LR!purge (no args) → show select menu */
  if (args.length === 0 && !mentionedUser) {
    await message.channel.send(cv2Payload(buildPurgeMenuContainer({
      ownerId: message.author.id,
      prefix,
    })));
    return;
  }

  /* LR!purge <amount> → purge all */
  /* LR!purge @user <amount> → purge user */
  /* LR!purge bots <amount> → purge bot messages */
  /* LR!purge media <amount> → purge media messages */
  let mode = 'all';

  if (mentionedUser) {
    mode = 'user';
  } else if (isBotMode) {
    mode = 'bots';
  } else if (isMediaMode) {
    mode = 'media';
  }

  const rawAmount = (mentionedUser || isBotMode || isMediaMode)
    ? args.find((a) => /^\d+$/.test(a)) || String(DEFAULT_PURGE_AMOUNT)
    : args[0];
  const amount = parseAmount(rawAmount);

  /* Delete the command message itself first */
  await message.delete().catch(() => null);

  try {
    const deleted = await performPurge({
      channel: message.channel,
      amount,
      targetUserId: mentionedUser?.id || null,
      botsOnly: mode === 'bots',
      mediaOnly: mode === 'media',
    });

    await message.channel.send(cv2Payload(buildSuccessContainer({
      deleted,
      mode,
      targetUserId: mentionedUser?.id || null,
      ownerId: message.author.id,
    })));
  } catch (error) {
    console.error('Purge failed:', error);

    const errorMessage = error.code === 50034
      ? 'Cannot delete messages older than **14 days**. Discord does not allow bulk deletion of old messages.'
      : `An error occurred while purging messages.\n\`${error.message}\``;

    await message.channel.send(cv2Payload(buildErrorContainer({
      errorMessage,
      ownerId: message.author.id,
    })));
  }
}

/* ── Interaction handlers (Select Menu & Buttons) ── */

async function handleModeSelect({ interaction }) {
  const ownerId = interaction.customId.slice(PURGE_MODE_CUSTOM_ID_PREFIX.length);

  if (interaction.user.id !== ownerId) {
    await interaction.reply(createEphemeralTextPayload('Only the panel owner can use this menu.')).catch(() => null);
    return;
  }

  const mode = interaction.values?.[0];

  if (mode === 'user') {
    await interaction.reply(createEphemeralTextPayload(
      [
        `${emojis.label('status.success', 'User Purge Mode Selected')}`,
        '',
        'Now use the command with a user mention:',
        '`LR!purge @user <amount>`',
        '',
        `Example: \`LR!purge @user 20\``,
      ].join('\n'),
    )).catch(() => null);
    return;
  }

  /* mode === 'all', 'bots', or 'media' */
  const amount = DEFAULT_PURGE_AMOUNT;

  await interaction.update(cv2Payload(buildConfirmContainer({
    ownerId,
    mode,
    amount,
    targetUserId: null,
  })));
}

async function handleConfirmButton({ interaction }) {
  const payload = interaction.customId.slice(PURGE_CONFIRM_CUSTOM_ID_PREFIX.length);
  const [ownerId, mode, rawAmount, rawTargetUserId] = payload.split(':');

  if (interaction.user.id !== ownerId) {
    await interaction.reply(createEphemeralTextPayload('Only the panel owner can confirm this purge.')).catch(() => null);
    return;
  }

  const amount = parseAmount(rawAmount);
  const targetUserId = rawTargetUserId === 'none' ? null : rawTargetUserId;

  await interaction.deferUpdate().catch(() => null);

  /* Delete the confirmation panel itself */
  await interaction.message.delete().catch(() => null);

  try {
    const deleted = await performPurge({
      channel: interaction.channel,
      amount,
      targetUserId,
      botsOnly: mode === 'bots',
      mediaOnly: mode === 'media',
    });

    await interaction.channel.send(cv2Payload(buildSuccessContainer({
      deleted,
      mode,
      targetUserId,
      ownerId,
    })));
  } catch (error) {
    console.error('Purge failed:', error);

    const errorMessage = error.code === 50034
      ? 'Cannot delete messages older than **14 days**. Discord does not allow bulk deletion of old messages.'
      : `An error occurred while purging messages.\n\`${error.message}\``;

    await interaction.channel.send(cv2Payload(buildErrorContainer({
      errorMessage,
      ownerId,
    })));
  }
}

async function handleCancelButton({ interaction }) {
  const ownerId = interaction.customId.slice(PURGE_CANCEL_CUSTOM_ID_PREFIX.length);

  if (interaction.user.id !== ownerId) {
    await interaction.reply(createEphemeralTextPayload('Only the panel owner can cancel this purge.')).catch(() => null);
    return;
  }

  await interaction.deferUpdate().catch(() => null);

  await interaction.message.delete()
    .catch(() => null);
}

async function handleDeleteButton({ interaction }) {
  const ownerId = interaction.customId.slice(PURGE_DELETE_CUSTOM_ID_PREFIX.length);

  if (interaction.user.id !== ownerId) {
    await interaction.reply(createEphemeralTextPayload('Only the command user can delete this panel.')).catch(() => null);
    return;
  }

  await interaction.deferUpdate().catch(() => null);

  const deleted = await interaction.message.delete()
    .then(() => true)
    .catch(() => false);

  if (!deleted) {
    await interaction.followUp(createEphemeralTextPayload('I could not delete this panel.')).catch(() => null);
  }
}

module.exports = {
  name: 'purge',
  aliases: ['prune', 'clear'],
  category: 'moderation',
  description: 'Purge messages from the channel — all, user, bot, or media messages.',
  usage: 'LR!purge [amount] | LR!purge @user [amount] | LR!purge bots [amount] | LR!purge media [amount]',
  execute,
  componentHandlers: [
    {
      customIdPrefix: PURGE_MODE_CUSTOM_ID_PREFIX,
      execute: handleModeSelect,
    },
    {
      customIdPrefix: PURGE_CONFIRM_CUSTOM_ID_PREFIX,
      execute: handleConfirmButton,
    },
    {
      customIdPrefix: PURGE_CANCEL_CUSTOM_ID_PREFIX,
      execute: handleCancelButton,
    },
    {
      customIdPrefix: PURGE_DELETE_CUSTOM_ID_PREFIX,
      execute: handleDeleteButton,
    },
  ],
};
