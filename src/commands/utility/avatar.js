const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  ThumbnailBuilder,
} = require('discord.js');
const emojis = require('../../emojis');
const { cv2Payload } = require('../../utils/cv2');

const AVATAR_SERVER_CUSTOM_ID_PREFIX = 'avatar:server:';
const AVATAR_GLOBAL_CUSTOM_ID_PREFIX = 'avatar:global:';
const AVATAR_DELETE_CUSTOM_ID_PREFIX = 'avatar:delete:';

const AVATAR_SIZES = [128, 256, 512, 1024, 2048, 4096];
const DISPLAY_SIZE = 4096;

/* ── Reusable helpers ── */

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

function getAvatarUrl(userOrMember, options = {}) {
  return userOrMember.displayAvatarURL({
    extension: 'png',
    size: options.size || DISPLAY_SIZE,
    forceStatic: false,
  });
}

function getUserAvatarUrl(user, options = {}) {
  return user.displayAvatarURL({
    extension: 'png',
    size: options.size || DISPLAY_SIZE,
    forceStatic: false,
  });
}

function getMemberAvatarUrl(member) {
  if (!member?.avatar) {
    return null;
  }

  return member.displayAvatarURL({
    extension: 'png',
    size: DISPLAY_SIZE,
    forceStatic: false,
  });
}

function createSizeLinks(baseUrl) {
  return AVATAR_SIZES
    .map((size) => {
      const url = baseUrl.replace(/[?&]size=\d+/, '').replace(/\?$/, '');
      const separator = url.includes('?') ? '&' : '?';
      return `[${size}](${url}${separator}size=${size})`;
    })
    .join(' · ');
}

/* ── Container builders ── */

function buildAvatarContainer({ targetUser, avatarUrl, mode, ownerId, hasServerAvatar }) {
  const modeLabel = mode === 'server' ? 'Server Avatar' : 'Global Avatar';
  const userTag = targetUser.tag || `${targetUser.username}#${targetUser.discriminator}`;

  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${emojis.label('status.success', `${modeLabel}`)}`,
      ),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        `**User:** <@${targetUser.id}> (\`${userTag}\`)`,
        `**Type:** ${modeLabel}`,
        `**Sizes:** ${createSizeLinks(avatarUrl)}`,
      ].join('\n')),
    )
    .addSeparatorComponents(createSeparator())
    .addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder()
          .setURL(avatarUrl)
          .setDescription(`${userTag} ${modeLabel}`),
      ),
    )
    .addSeparatorComponents(createSeparator());

  /* Toggle buttons */
  const buttons = [];

  if (hasServerAvatar) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(`${AVATAR_SERVER_CUSTOM_ID_PREFIX}${ownerId}:${targetUser.id}`)
        .setLabel('Server Avatar')
        .setStyle(mode === 'server' ? ButtonStyle.Primary : ButtonStyle.Secondary)
        .setDisabled(mode === 'server'),
    );
  }

  buttons.push(
    new ButtonBuilder()
      .setCustomId(`${AVATAR_GLOBAL_CUSTOM_ID_PREFIX}${ownerId}:${targetUser.id}`)
      .setLabel('Global Avatar')
      .setStyle(mode === 'global' ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setDisabled(mode === 'global'),
  );

  buttons.push(
    new ButtonBuilder()
      .setStyle(ButtonStyle.Link)
      .setLabel('Open in Browser')
      .setURL(avatarUrl),
  );

  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(...buttons),
  );

  container
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`Panel owner: <@${ownerId}>`),
    )
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`${AVATAR_DELETE_CUSTOM_ID_PREFIX}${ownerId}`)
          .setLabel('Delete')
          .setStyle(ButtonStyle.Secondary),
      ),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(createFooterText());

  return container;
}

function buildNoAvatarContainer({ ownerId }) {
  return new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${emojis.label('status.warning', 'No Avatar Found')}`,
      ),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        'This user does not have an avatar set.',
      ),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(createFooterText());
}

/* ── Resolve target user ── */

async function resolveTarget({ message, args }) {
  const mentioned = message.mentions.users.first();

  if (mentioned) {
    return {
      user: mentioned,
      member: message.guild.members.cache.get(mentioned.id) || await message.guild.members.fetch(mentioned.id).catch(() => null),
    };
  }

  const idArg = args[0];

  if (idArg && /^\d{17,20}$/.test(idArg)) {
    try {
      const member = await message.guild.members.fetch(idArg);
      return { user: member.user, member };
    } catch {
      try {
        const user = await message.client.users.fetch(idArg);
        return { user, member: null };
      } catch {
        return null;
      }
    }
  }

  return {
    user: message.author,
    member: message.member,
  };
}

/* ── Command execute ── */

async function execute({ args, message }) {
  const target = await resolveTarget({ message, args });

  if (!target) {
    await message.reply(cv2Payload(buildNoAvatarContainer({
      ownerId: message.author.id,
    })));
    return;
  }

  const { user, member } = target;
  const serverAvatarUrl = getMemberAvatarUrl(member);
  const globalAvatarUrl = getUserAvatarUrl(user);
  const hasServerAvatar = Boolean(serverAvatarUrl);

  /* Default to server avatar if available, else global */
  const mode = hasServerAvatar ? 'server' : 'global';
  const avatarUrl = hasServerAvatar ? serverAvatarUrl : globalAvatarUrl;

  await message.channel.send(cv2Payload(buildAvatarContainer({
    targetUser: user,
    avatarUrl,
    mode,
    ownerId: message.author.id,
    hasServerAvatar,
  })));
}

/* ── Button handlers ── */

async function handleServerButton({ interaction }) {
  const payload = interaction.customId.slice(AVATAR_SERVER_CUSTOM_ID_PREFIX.length);
  const [ownerId, targetUserId] = payload.split(':');

  if (interaction.user.id !== ownerId) {
    await interaction.reply(createEphemeralTextPayload('Only the panel owner can use this button.')).catch(() => null);
    return;
  }

  const member = interaction.guild?.members?.cache.get(targetUserId)
    || await interaction.guild?.members?.fetch(targetUserId).catch(() => null);
  const user = member?.user || await interaction.client.users.fetch(targetUserId).catch(() => null);

  if (!user) {
    await interaction.reply(createEphemeralTextPayload('Could not fetch this user.')).catch(() => null);
    return;
  }

  const serverAvatarUrl = getMemberAvatarUrl(member);

  if (!serverAvatarUrl) {
    await interaction.reply(createEphemeralTextPayload('This user does not have a server avatar.')).catch(() => null);
    return;
  }

  await interaction.update(cv2Payload(buildAvatarContainer({
    targetUser: user,
    avatarUrl: serverAvatarUrl,
    mode: 'server',
    ownerId,
    hasServerAvatar: true,
  })));
}

async function handleGlobalButton({ interaction }) {
  const payload = interaction.customId.slice(AVATAR_GLOBAL_CUSTOM_ID_PREFIX.length);
  const [ownerId, targetUserId] = payload.split(':');

  if (interaction.user.id !== ownerId) {
    await interaction.reply(createEphemeralTextPayload('Only the panel owner can use this button.')).catch(() => null);
    return;
  }

  const member = interaction.guild?.members?.cache.get(targetUserId)
    || await interaction.guild?.members?.fetch(targetUserId).catch(() => null);
  const user = member?.user || await interaction.client.users.fetch(targetUserId).catch(() => null);

  if (!user) {
    await interaction.reply(createEphemeralTextPayload('Could not fetch this user.')).catch(() => null);
    return;
  }

  const globalAvatarUrl = getUserAvatarUrl(user);
  const hasServerAvatar = Boolean(getMemberAvatarUrl(member));

  await interaction.update(cv2Payload(buildAvatarContainer({
    targetUser: user,
    avatarUrl: globalAvatarUrl,
    mode: 'global',
    ownerId,
    hasServerAvatar,
  })));
}

async function handleDeleteButton({ interaction }) {
  const ownerId = interaction.customId.slice(AVATAR_DELETE_CUSTOM_ID_PREFIX.length);

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
  name: 'avatar',
  aliases: ['av', 'pfp'],
  category: 'utility',
  description: 'Shows a user\'s avatar — toggle between server and global avatar.',
  usage: 'LR!avatar [@user | user_id]',
  execute,
  componentHandlers: [
    {
      customIdPrefix: AVATAR_SERVER_CUSTOM_ID_PREFIX,
      execute: handleServerButton,
    },
    {
      customIdPrefix: AVATAR_GLOBAL_CUSTOM_ID_PREFIX,
      execute: handleGlobalButton,
    },
    {
      customIdPrefix: AVATAR_DELETE_CUSTOM_ID_PREFIX,
      execute: handleDeleteButton,
    },
  ],
};
