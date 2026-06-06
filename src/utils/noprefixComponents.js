const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
} = require('discord.js');
const emojis = require('../emojis');
const { cv2Payload } = require('./cv2');
const { DURATION_OPTIONS, formatRemaining } = require('../supabase/noPrefixUsers');

const PAGE_SIZE = 5;
const ADD_DURATION_CUSTOM_ID_PREFIX = 'noprefix:add:';
const LIST_PAGE_CUSTOM_ID_PREFIX = 'noprefix:list:';

function createSeparator() {
  return new SeparatorBuilder()
    .setDivider(true)
    .setSpacing(SeparatorSpacingSize.Small);
}

function getBotAvatarUrl(client) {
  return client?.user?.displayAvatarURL?.({
    extension: 'png',
    size: 128,
  }) || 'https://cdn.discordapp.com/embed/avatars/0.png';
}

function emojiLabel(path, fallbackPath, text) {
  const emoji = emojis.getEmoji(path) || emojis.getEmoji(fallbackPath);
  return emoji ? `${emoji} ${text}` : text;
}

function createFooterText() {
  const poweredEmoji = emojis.getEmoji('lr.logo') || emojis.getEmoji('status.success') || '*';
  return new TextDisplayBuilder().setContent(`${poweredEmoji} **Powered by Prince**`);
}

function createHeaderSection({ client, title }) {
  const section = new SectionBuilder().addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`## ${title}`),
  );
  const avatarUrl = getBotAvatarUrl(client);

  if (avatarUrl) {
    section.setThumbnailAccessory(
      new ThumbnailBuilder()
        .setURL(avatarUrl)
        .setDescription(`${client?.user?.username || 'Bot'} avatar`),
    );
  }

  return section;
}

function createStyledContainer({ client, title, description }) {
  const container = new ContainerBuilder()
    .addSectionComponents(createHeaderSection({ client, title }))
    .addSeparatorComponents(createSeparator());

  if (description) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(description),
    );
  }

  return container;
}

function addFooter(container) {
  return container
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(createFooterText());
}

function createNoticePayload({
  client,
  title,
  description,
  ephemeral = false,
}) {
  return cv2Payload(
    addFooter(createStyledContainer({
      client,
      title,
      description,
    })),
    { ephemeral },
  );
}

function parseUserId(args, message) {
  const mentionedUser = message.mentions.users.first();

  if (mentionedUser) {
    return mentionedUser.id;
  }

  const rawId = args[0]?.replace(/[<@!>]/g, '');
  return /^\d{15,25}$/.test(rawId) ? rawId : null;
}

async function fetchUser(client, userId) {
  return client.users.fetch(userId).catch(() => null);
}

function getDisplayName(user, fallbackId) {
  return user?.globalName || user?.username || user?.tag || fallbackId;
}

function getAvatarUrl(user) {
  return user?.displayAvatarURL?.({
    extension: 'png',
    size: 128,
  }) || null;
}

function createDurationSelectPayload({ client, ownerId, targetUser }) {
  const select = new StringSelectMenuBuilder()
    .setCustomId(`${ADD_DURATION_CUSTOM_ID_PREFIX}${ownerId}:${targetUser.id}`)
    .setPlaceholder('Select noprefix duration')
    .addOptions(
      DURATION_OPTIONS.map((option) => new StringSelectMenuOptionBuilder()
        .setLabel(option.label)
        .setDescription(option.description)
        .setValue(option.key)),
    );

  const container = createStyledContainer({
    client,
    title: emojiLabel('noprefix.noprefix', 'lr.logo', 'Select Noprefix Duration'),
    description: [
      `User: <@${targetUser.id}>`,
      `Name: **${getDisplayName(targetUser, targetUser.id)}**`,
      '',
      'Choose one duration from the dropdown below.',
    ].join('\n'),
  })
    .addSeparatorComponents(createSeparator())
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(select),
    );

  return cv2Payload(addFooter(container));
}

function createAddedPayload({ client, targetUser, duration, expiresAt }) {
  return createNoticePayload({
    client,
    title: emojiLabel('status.success', 'lr.logo', 'Noprefix Added'),
    description: [
      `User: <@${targetUser.id}>`,
      `Name: **${getDisplayName(targetUser, targetUser.id)}**`,
      `Duration: **${duration.label}** - ${formatRemaining(expiresAt)}`,
    ].join('\n'),
  });
}

function createRemovedPayload({ client, targetUser, removed }) {
  return createNoticePayload({
    client,
    title: removed
      ? emojiLabel('status.success', 'lr.logo', 'Noprefix Removed')
      : emojiLabel('status.warning', 'lr.logo', 'Noprefix Not Found'),
    description: removed
      ? `Removed noprefix access from <@${targetUser.id}>.`
      : `<@${targetUser.id}> is not in the noprefix list.`,
  });
}

function createOwnerOnlyPayload({ client, ownerConfigured }) {
  return createNoticePayload({
    client,
    title: emojiLabel('status.error', 'lr.logo', 'Owner Only'),
    description: ownerConfigured
      ? 'Only the bot owner can use this command.'
      : 'Set `BOT_OWNER_ID` in `.env` before using owner commands.',
  });
}

async function createListPayload({ client, ownerId, users, page = 0 }) {
  const totalPages = Math.max(1, Math.ceil(users.length / PAGE_SIZE));
  const safePage = Math.min(Math.max(Number(page) || 0, 0), totalPages - 1);
  const pageUsers = users.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);
  const container = new ContainerBuilder()
    .addSectionComponents(
      createHeaderSection({
        client,
        title: emojiLabel('noprefix.noprefix', 'lr.logo', 'Noprefix Users'),
      }),
    );

  if (pageUsers.length === 0) {
    container
      .addSeparatorComponents(createSeparator())
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent('No noprefix users found.'),
      );
  }

  for (const [index, row] of pageUsers.entries()) {
    const user = await fetchUser(client, row.user_id);
    const displayName = getDisplayName(user, row.user_id);
    const absoluteIndex = safePage * PAGE_SIZE + index + 1;
    const section = new SectionBuilder().addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        `**${absoluteIndex}.** <@${row.user_id}>`,
        `Name: **${displayName}**`,
        `Duration: **${row.duration_label || 'Unknown'}** - ${formatRemaining(row.expires_at)}`,
      ].join('\n')),
    );
    const avatarUrl = getAvatarUrl(user);

    if (avatarUrl) {
      section.setThumbnailAccessory(
        new ThumbnailBuilder()
          .setURL(avatarUrl)
          .setDescription(`${displayName} avatar`),
      );
    }

    container
      .addSeparatorComponents(createSeparator())
      .addSectionComponents(section);
  }

  container
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`Page ${safePage + 1}/${totalPages} - Total ${users.length}`),
    );

  if (totalPages > 1) {
    container.addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`${LIST_PAGE_CUSTOM_ID_PREFIX}${ownerId}:${safePage - 1}`)
          .setLabel('Previous')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(safePage <= 0),
        new ButtonBuilder()
          .setCustomId(`${LIST_PAGE_CUSTOM_ID_PREFIX}${ownerId}:${safePage + 1}`)
          .setLabel('Next')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(safePage >= totalPages - 1),
      ),
    );
  }

  return cv2Payload(addFooter(container));
}

async function replyEphemeralNotice(interaction, title, description) {
  const payload = createNoticePayload({
    client: interaction.client,
    title,
    description,
    ephemeral: true,
  });

  if (interaction.deferred || interaction.replied) {
    await interaction.followUp(payload).catch(() => null);
    return;
  }

  await interaction.reply(payload).catch(() => null);
}

module.exports = {
  ADD_DURATION_CUSTOM_ID_PREFIX,
  LIST_PAGE_CUSTOM_ID_PREFIX,
  createAddedPayload,
  createDurationSelectPayload,
  createListPayload,
  createNoticePayload,
  createOwnerOnlyPayload,
  createRemovedPayload,
  fetchUser,
  parseUserId,
  replyEphemeralNotice,
};
