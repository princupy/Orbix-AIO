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
const { getDeletedMessage } = require('../../handlers/snipeStore');

const SNIPE_DELETE_CUSTOM_ID_PREFIX = 'snipe:delete:';

function createSeparator() {
  return new SeparatorBuilder()
    .setDivider(true)
    .setSpacing(SeparatorSpacingSize.Small);
}

function createFooterText() {
  const poweredEmoji = emojis.getEmoji('cutu.nitish') || emojis.getEmoji('status.success') || '*';
  return new TextDisplayBuilder().setContent(`${poweredEmoji} Made by [Tanmay](https://www.instagram.com/tanmoy_here8388/)`);
}

function canSnipe(member) {
  return Boolean(
    member?.permissions?.has(PermissionsBitField.Flags.Administrator)
    || member?.permissions?.has(PermissionsBitField.Flags.ManageMessages),
  );
}

function formatTimestamp(ms) {
  return `<t:${Math.floor(ms / 1000)}:R>`;
}

function truncateContent(content, max = 1800) {
  if (!content || content.length <= max) {
    return content;
  }

  return `${content.slice(0, max)}…`;
}

function createDeleteRow(ownerId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${SNIPE_DELETE_CUSTOM_ID_PREFIX}${ownerId}`)
      .setLabel('Delete')
      .setStyle(ButtonStyle.Secondary),
  );
}

function createEphemeralTextPayload(content) {
  return cv2Payload(
    new ContainerBuilder().addTextDisplayComponents(
      new TextDisplayBuilder().setContent(content),
    ),
    { ephemeral: true },
  );
}

function buildSnipeContainer({ entry, ownerId }) {
  const detailLines = [
    `**Author:** <@${entry.authorId}> (\`${entry.authorTag}\`)`,
    `**Channel:** <#${entry.channelId}>`,
    `**Sent:** ${formatTimestamp(entry.createdAt)}`,
    `**Deleted:** ${formatTimestamp(entry.deletedAt)}`,
  ];

  if (entry.content) {
    detailLines.push('', `**Content:**\n${truncateContent(entry.content)}`);
  }

  if (entry.attachments.length > 0) {
    const attachmentList = entry.attachments
      .map((a) => `• [${a.name}](${a.url})`)
      .join('\n');
    detailLines.push('', `**Attachments:**\n${attachmentList}`);
  }

  if (!entry.content && entry.attachments.length === 0) {
    detailLines.push('', '*No text content or attachments.*');
  }

  return new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${emojis.label('status.success', 'Sniped Message')}`,
      ),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(detailLines.join('\n')),
    )
    .addSeparatorComponents(createSeparator())
    .addActionRowComponents(createDeleteRow(ownerId))
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(createFooterText());
}

function buildNoMessageContainer() {
  return new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${emojis.label('status.warning', 'Nothing to Snipe')}`,
      ),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        'No recently deleted message found in this channel.',
      ),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(createFooterText());
}

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

async function execute({ client, message }) {
  if (!canSnipe(message.member)) {
    await message.reply(cv2Payload(buildMissingPermContainer()));
    return;
  }

  const entry = getDeletedMessage(message.channelId);

  if (!entry) {
    await message.reply(cv2Payload(buildNoMessageContainer()));
    return;
  }

  await message.channel.send(cv2Payload(buildSnipeContainer({
    entry,
    ownerId: message.author.id,
  })));
}

async function handleDeleteButton({ interaction }) {
  const ownerId = interaction.customId.slice(SNIPE_DELETE_CUSTOM_ID_PREFIX.length);

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
  name: 'snipe',
  aliases: ['s'],
  category: 'moderation',
  description: 'Shows the most recently deleted message in this channel.',
  usage: 'LR!snipe',
  execute,
  componentHandlers: [
    {
      customIdPrefix: SNIPE_DELETE_CUSTOM_ID_PREFIX,
      execute: handleDeleteButton,
    },
  ],
};
