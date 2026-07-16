const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
} = require('discord.js');
const emojis = require('../../emojis');
const { cv2Payload } = require('../../utils/cv2');

const BANNER_DELETE_CUSTOM_ID_PREFIX = 'banner:delete:';

const BANNER_SIZES = [128, 256, 512, 1024, 2048, 4096];
const DISPLAY_SIZE = 4096;

/* ── Reusable helpers ── */

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

function getBannerUrl(user) {
  if (!user.banner) {
    return null;
  }

  return user.bannerURL({
    extension: 'png',
    size: DISPLAY_SIZE,
    forceStatic: false,
  });
}

function createSizeLinks(baseUrl) {
  return BANNER_SIZES
    .map((size) => {
      const url = baseUrl.replace(/[?&]size=\d+/, '').replace(/\?$/, '');
      const separator = url.includes('?') ? '&' : '?';
      return `[${size}](${url}${separator}size=${size})`;
    })
    .join(' · ');
}

function getBannerColor(user) {
  if (!user.hexAccentColor) {
    return null;
  }

  return user.hexAccentColor;
}

/* ── Container builders ── */

function buildBannerContainer({ targetUser, bannerUrl, ownerId }) {
  const userTag = targetUser.tag || `${targetUser.username}#${targetUser.discriminator}`;
  const accentColor = getBannerColor(targetUser);

  const detailLines = [
    `**User:** <@${targetUser.id}> (\`${userTag}\`)`,
    `**Sizes:** ${createSizeLinks(bannerUrl)}`,
  ];

  if (accentColor) {
    detailLines.push(`**Accent Color:** \`${accentColor}\``);
  }

  return new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${emojis.label('status.success', 'User Banner')}`,
      ),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(detailLines.join('\n')),
    )
    .addSeparatorComponents(createSeparator())
    .addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder()
          .setURL(bannerUrl)
          .setDescription(`${userTag} banner`),
      ),
    )
    .addSeparatorComponents(createSeparator())
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setStyle(ButtonStyle.Link)
          .setLabel('Open in Browser')
          .setURL(bannerUrl),
        new ButtonBuilder()
          .setCustomId(`${BANNER_DELETE_CUSTOM_ID_PREFIX}${ownerId}`)
          .setLabel('Delete')
          .setStyle(ButtonStyle.Secondary),
      ),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`Panel owner: <@${ownerId}>`),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(createFooterText());
}

function buildNoBannerContainer({ targetUser, ownerId }) {
  const userTag = targetUser.tag || `${targetUser.username}#${targetUser.discriminator}`;
  const accentColor = getBannerColor(targetUser);

  const detailLines = [
    `**User:** <@${targetUser.id}> (\`${userTag}\`)`,
    '',
    'This user does not have a profile banner set.',
  ];

  if (accentColor) {
    detailLines.push(`However, their accent color is \`${accentColor}\`.`);
  }

  return new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${emojis.label('status.warning', 'No Banner Found')}`,
      ),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(detailLines.join('\n')),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(createFooterText());
}

function buildUserNotFoundContainer() {
  return new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${emojis.label('status.error', 'User Not Found')}`,
      ),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        'Could not find the specified user. Please mention a user or provide a valid user ID.',
      ),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(createFooterText());
}

/* ── Resolve target user (force-fetch for banner data) ── */

async function resolveTarget({ message, args }) {
  const mentioned = message.mentions.users.first();
  let userId = null;

  if (mentioned) {
    userId = mentioned.id;
  } else if (args[0] && /^\d{17,20}$/.test(args[0])) {
    userId = args[0];
  } else {
    userId = message.author.id;
  }

  try {
    /* force: true ensures we get banner data from the API */
    const user = await message.client.users.fetch(userId, { force: true });
    return user;
  } catch {
    return null;
  }
}

/* ── Command execute ── */

async function execute({ args, message }) {
  const targetUser = await resolveTarget({ message, args });

  if (!targetUser) {
    await message.reply(cv2Payload(buildUserNotFoundContainer()));
    return;
  }

  const bannerUrl = getBannerUrl(targetUser);

  if (!bannerUrl) {
    await message.reply(cv2Payload(buildNoBannerContainer({
      targetUser,
      ownerId: message.author.id,
    })));
    return;
  }

  await message.channel.send(cv2Payload(buildBannerContainer({
    targetUser,
    bannerUrl,
    ownerId: message.author.id,
  })));
}

/* ── Button handler ── */

async function handleDeleteButton({ interaction }) {
  const ownerId = interaction.customId.slice(BANNER_DELETE_CUSTOM_ID_PREFIX.length);

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
  name: 'banner',
  aliases: ['bn'],
  category: 'utility',
  description: 'Shows a user\'s profile banner.',
  usage: 'LR!banner [@user | user_id]',
  execute,
  componentHandlers: [
    {
      customIdPrefix: BANNER_DELETE_CUSTOM_ID_PREFIX,
      execute: handleDeleteButton,
    },
  ],
};
