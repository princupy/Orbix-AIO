const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  PermissionsBitField,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
} = require('discord.js');
const emojis = require('../../emojis');
const { cv2Payload } = require('../../utils/cv2');

const UNBANALL_CONFIRM_CUSTOM_ID_PREFIX = 'unbanall:confirm:';
const UNBANALL_CANCEL_CUSTOM_ID_PREFIX = 'unbanall:cancel:';
const UNBANALL_DELETE_CUSTOM_ID_PREFIX = 'unbanall:delete:';
const UNBAN_CHUNK_SIZE = 10;

/* ── Helpers ── */

function createSeparator() {
  return new SeparatorBuilder()
    .setDivider(true)
    .setSpacing(SeparatorSpacingSize.Small);
}

function createFooterText() {
  const poweredEmoji = emojis.getEmoji('lr.logo') || emojis.getEmoji('status.success') || '*';
  return new TextDisplayBuilder().setContent(`${poweredEmoji} **Powered by Prince**`);
}

function createEphemeralTextPayload(content) {
  return cv2Payload(
    new ContainerBuilder().addTextDisplayComponents(
      new TextDisplayBuilder().setContent(content),
    ),
    { ephemeral: true },
  );
}

function createDeleteRow(ownerId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${UNBANALL_DELETE_CUSTOM_ID_PREFIX}${ownerId}`)
      .setLabel('Delete')
      .setStyle(ButtonStyle.Secondary),
  );
}

function hasBanPermission(member) {
  return Boolean(
    member?.permissions?.has(PermissionsBitField.Flags.Administrator)
    || member?.permissions?.has(PermissionsBitField.Flags.BanMembers),
  );
}

async function fetchBanIds(guild) {
  const collection = await guild.bans.fetch().catch(() => null);

  if (!collection) {
    return null;
  }

  return [...collection.values()].map((ban) => ban.user.id);
}

/* ── Containers ── */

function buildMissingUserPermContainer() {
  return new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${emojis.label('status.error', 'Missing Permission')}`,
      ),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        'You need **Ban Members** or **Administrator** permission to use this command.',
      ),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(createFooterText());
}

function buildMissingBotPermContainer() {
  return new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${emojis.label('status.error', 'Bot Permission Missing')}`,
      ),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        'I need the **Ban Members** permission to unban members.',
      ),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(createFooterText());
}

function buildNoBansContainer() {
  return new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${emojis.label('status.success', 'Nothing To Unban')}`,
      ),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent('This server has no banned members.'),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(createFooterText());
}

function buildConfirmContainer({ ownerId, total }) {
  return new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${emojis.label('status.warning', 'Unban All Members')}`,
      ),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        `You are about to unban **all \`${total}\` banned member${total === 1 ? '' : 's'}** from this server.`,
        '',
        '**This action cannot be undone.** Are you sure?',
      ].join('\n')),
    )
    .addSeparatorComponents(createSeparator())
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`${UNBANALL_CONFIRM_CUSTOM_ID_PREFIX}${ownerId}`)
          .setLabel(`Unban All (${total})`)
          .setEmoji('🔓')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(`${UNBANALL_CANCEL_CUSTOM_ID_PREFIX}${ownerId}`)
          .setLabel('Cancel')
          .setStyle(ButtonStyle.Secondary),
      ),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`Requested by <@${ownerId}>`),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(createFooterText());
}

function buildProcessingContainer({ total }) {
  return new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${emojis.label('status.loading', 'Unbanning Members...')}`,
      ),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `Unbanning \`${total}\` member${total === 1 ? '' : 's'}. This may take a moment, please wait...`,
      ),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(createFooterText());
}

function buildResultContainer({
  failed, ownerId, success, total,
}) {
  return new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${emojis.label('status.success', 'Mass Unban Complete')}`,
      ),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        `${emojis.getEmoji('status.success') || '✅'} **Unbanned:** \`${success}\``,
        `${emojis.getEmoji('status.error') || '❌'} **Failed:** \`${failed}\``,
        `**Total processed:** \`${total}\``,
        '',
        `*Requested by <@${ownerId}>*`,
      ].join('\n')),
    )
    .addSeparatorComponents(createSeparator())
    .addActionRowComponents(createDeleteRow(ownerId))
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(createFooterText());
}

function buildCancelledContainer({ ownerId }) {
  return new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${emojis.label('status.error', 'Cancelled')}`,
      ),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent('Mass unban was cancelled. No members were unbanned.'),
    )
    .addSeparatorComponents(createSeparator())
    .addActionRowComponents(createDeleteRow(ownerId))
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(createFooterText());
}

/* ── Command execute ── */

async function execute({ message }) {
  const ownerId = message.author.id;

  if (!hasBanPermission(message.member)) {
    await message.reply(cv2Payload(buildMissingUserPermContainer()));
    return;
  }

  const botMember = message.guild.members.me
    || await message.guild.members.fetchMe().catch(() => null);

  if (!hasBanPermission(botMember)) {
    await message.reply(cv2Payload(buildMissingBotPermContainer()));
    return;
  }

  const banIds = await fetchBanIds(message.guild);

  if (banIds === null) {
    await message.reply(cv2Payload(buildMissingBotPermContainer()));
    return;
  }

  if (banIds.length === 0) {
    await message.reply(cv2Payload(buildNoBansContainer()));
    return;
  }

  await message.channel.send(cv2Payload(
    buildConfirmContainer({ ownerId, total: banIds.length }),
    { allowedMentions: { parse: [], repliedUser: false, users: [] } },
  ));
}

/* ── Handlers ── */

async function handleConfirmButton({ interaction }) {
  const ownerId = interaction.customId.slice(UNBANALL_CONFIRM_CUSTOM_ID_PREFIX.length);

  if (interaction.user.id !== ownerId) {
    await interaction.reply(createEphemeralTextPayload('Only the command user can confirm this action.')).catch(() => null);
    return;
  }

  if (!hasBanPermission(interaction.member)) {
    await interaction.reply(createEphemeralTextPayload('You no longer have **Ban Members** permission.')).catch(() => null);
    return;
  }

  const botMember = interaction.guild.members.me
    || await interaction.guild.members.fetchMe().catch(() => null);

  if (!hasBanPermission(botMember)) {
    await interaction.reply(createEphemeralTextPayload('I need the **Ban Members** permission to unban members.')).catch(() => null);
    return;
  }

  const banIds = await fetchBanIds(interaction.guild);

  if (!banIds || banIds.length === 0) {
    await interaction.update(cv2Payload(buildNoBansContainer())).catch(() => null);
    return;
  }

  await interaction.update(cv2Payload(buildProcessingContainer({ total: banIds.length }))).catch(() => null);

  const auditReason = `Mass unban by ${interaction.user.tag} (${interaction.user.id})`;
  let success = 0;
  let failed = 0;

  for (let i = 0; i < banIds.length; i += UNBAN_CHUNK_SIZE) {
    const chunk = banIds.slice(i, i + UNBAN_CHUNK_SIZE);
    const results = await Promise.allSettled(
      chunk.map((id) => interaction.guild.bans.remove(id, auditReason)),
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        success += 1;
      } else {
        failed += 1;
      }
    }
  }

  await interaction.editReply(cv2Payload(buildResultContainer({
    failed,
    ownerId,
    success,
    total: banIds.length,
  }))).catch(() => null);
}

async function handleCancelButton({ interaction }) {
  const ownerId = interaction.customId.slice(UNBANALL_CANCEL_CUSTOM_ID_PREFIX.length);

  if (interaction.user.id !== ownerId) {
    await interaction.reply(createEphemeralTextPayload('Only the command user can cancel this action.')).catch(() => null);
    return;
  }

  await interaction.update(cv2Payload(buildCancelledContainer({ ownerId }))).catch(() => null);
}

async function handleDeleteButton({ interaction }) {
  const ownerId = interaction.customId.slice(UNBANALL_DELETE_CUSTOM_ID_PREFIX.length);

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
  name: 'unbanall',
  aliases: ['massunban', 'unbaneveryone'],
  category: 'moderation',
  description: 'Unbans every banned member from the server (with confirmation).',
  usage: 'LR!unbanall',
  noTimeout: true,
  execute,
  componentHandlers: [
    {
      customIdPrefix: UNBANALL_CONFIRM_CUSTOM_ID_PREFIX,
      execute: handleConfirmButton,
    },
    {
      customIdPrefix: UNBANALL_CANCEL_CUSTOM_ID_PREFIX,
      execute: handleCancelButton,
    },
    {
      customIdPrefix: UNBANALL_DELETE_CUSTOM_ID_PREFIX,
      execute: handleDeleteButton,
    },
  ],
};
