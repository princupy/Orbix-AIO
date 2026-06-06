const {
  AttachmentBuilder,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  PermissionsBitField,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  ThumbnailBuilder,
} = require('discord.js');
const { createMissingPermissionCard } = require('../../canvas/missingPermissionCard');
const { DEFAULT_PREFIX } = require('../../config');
const emojis = require('../../emojis');
const { setGuildPrefix } = require('../../supabase/guildSettings');
const { cv2Payload } = require('../../utils/cv2');

const MAX_PREFIX_LENGTH = 12;
const RESPONSE_EXPIRE_MS = 10_000;

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

function createPlainContainer({ client, title, description }) {
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

  const container = new ContainerBuilder()
    .addSectionComponents(section)
    .addSeparatorComponents(
      new SeparatorBuilder()
        .setDivider(true)
        .setSpacing(SeparatorSpacingSize.Small),
    );

  if (description) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(description),
    );
  }

  return container
    .addSeparatorComponents(
      new SeparatorBuilder()
        .setDivider(true)
        .setSpacing(SeparatorSpacingSize.Small),
    )
    .addTextDisplayComponents(createFooterText());
}

function createSetPrefixContainer({ client, oldPrefix, newPrefix, authorId }) {
  return createPlainContainer({
    client,
    title: emojiLabel('status.success', 'lr.logo', 'Prefix Updated'),
    description: [
      `**Old Prefix:** \`${oldPrefix}\``,
      `**New Prefix:** \`${newPrefix}\``,
      `**Updated By:** <@${authorId}>`,
      '',
      `Use \`${newPrefix}ping\` to test the new prefix.`,
    ].join('\n'),
  });
}

function createUsageContainer({ client, currentPrefix }) {
  return createPlainContainer({
    client,
    title: emojiLabel('config.settings', 'lr.logo', 'Set Prefix'),
    description: [
      `Usage: \`${currentPrefix}setprefix <new-prefix>\``,
      `Example: \`${currentPrefix}setprefix !\``,
      '',
      `Prefix must be ${MAX_PREFIX_LENGTH} characters or fewer.`,
    ].join('\n'),
  });
}

function createExpiredPayload() {
  return cv2Payload(
    new ContainerBuilder().addTextDisplayComponents(
      new TextDisplayBuilder().setContent('Session expired'),
    ),
    {
      attachments: [],
    },
  );
}

async function sendTemporaryResponse(channel, payload) {
  const sentMessage = await channel.send(payload);

  const expireTimer = setTimeout(async () => {
    try {
      await sentMessage.edit(createExpiredPayload());
    } catch {
      // The message may already be deleted or no longer editable.
    }
  }, RESPONSE_EXPIRE_MS);
  expireTimer.unref?.();

  return sentMessage;
}

function createMissingPermissionGallery(filename) {
  return new MediaGalleryBuilder().addItems(
    new MediaGalleryItemBuilder()
      .setURL(`attachment://${filename}`)
      .setDescription('Missing permission details'),
  );
}

async function createMissingPermissionPayload(client) {
  const filename = `missing-permission-${Date.now()}.png`;
  const canvas = await createMissingPermissionCard();
  const attachment = new AttachmentBuilder(canvas, {
    name: filename,
    description: 'Missing permission details',
  });
  const container = new ContainerBuilder()
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`## ${emojis.label('status.error', 'Missing Permission')}`),
        )
        .setThumbnailAccessory(
          new ThumbnailBuilder()
            .setURL(getBotAvatarUrl(client))
            .setDescription(`${client?.user?.username || 'Bot'} avatar`),
        ),
    )
    .addSeparatorComponents(
      new SeparatorBuilder()
        .setDivider(true)
        .setSpacing(SeparatorSpacingSize.Small),
    )
    .addMediaGalleryComponents(createMissingPermissionGallery(filename))
    .addSeparatorComponents(
      new SeparatorBuilder()
        .setDivider(true)
        .setSpacing(SeparatorSpacingSize.Small),
    )
    .addTextDisplayComponents(createFooterText());

  return cv2Payload(container, {
    files: [attachment],
  });
}

function canManageGuild(member) {
  return Boolean(member?.permissions?.has(PermissionsBitField.Flags.Administrator)
    || member?.permissions?.has(PermissionsBitField.Flags.ManageGuild));
}

function validatePrefix(prefix) {
  if (!prefix) {
    return 'missing';
  }

  if (prefix.length > MAX_PREFIX_LENGTH) {
    return `Prefix can be up to ${MAX_PREFIX_LENGTH} characters.`;
  }

  if (/\s/.test(prefix)) {
    return 'Prefix cannot contain spaces.';
  }

  if (prefix.includes('@everyone') || prefix.includes('@here')) {
    return 'Prefix cannot contain mass mentions.';
  }

  return null;
}

async function execute({ args, client, message, prefix }) {
  if (!canManageGuild(message.member)) {
    await sendTemporaryResponse(message.channel, await createMissingPermissionPayload(client));
    return;
  }

  const newPrefix = args[0]?.trim();
  const validationError = validatePrefix(newPrefix);

  if (validationError === 'missing') {
    await sendTemporaryResponse(
      message.channel,
      cv2Payload(createUsageContainer({
        client,
        currentPrefix: prefix,
      })),
    );
    return;
  }

  if (validationError) {
    const container = createPlainContainer({
      client,
      title: emojis.label('status.warning', 'Invalid Prefix'),
      description: validationError,
    });

    await sendTemporaryResponse(message.channel, cv2Payload(container));
    return;
  }

  const result = await setGuildPrefix(message.guild.id, newPrefix);

  if (!result.ok) {
    const container = createPlainContainer({
      client,
      title: emojis.label('status.error', 'Database Error'),
      description: [
        'Prefix could not be saved.',
        `Reason: \`${result.reason}\``,
        '',
        `If Supabase is not configured, the bot will use the default prefix \`${DEFAULT_PREFIX}\`.`,
      ].join('\n'),
    });

    await sendTemporaryResponse(message.channel, cv2Payload(container));
    return;
  }

  await sendTemporaryResponse(
    message.channel,
    cv2Payload(
      createSetPrefixContainer({
        client,
        oldPrefix: prefix,
        newPrefix,
        authorId: message.author.id,
      }),
    ),
  );
}

module.exports = {
  name: 'setprefix',
  aliases: ['prefix'],
  category: 'config',
  description: 'Sets this server custom bot prefix.',
  usage: 'LR!setprefix <new-prefix>',
  execute,
};
