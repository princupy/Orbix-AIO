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
const sharp = require('sharp');
const emojis = require('../../emojis');
const { cv2Payload } = require('../../utils/cv2');

const STEAL_MODE_PREFIX = 'steal:mode:';
const STEAL_DELETE_PREFIX = 'steal:delete:';

const CUSTOM_EMOJI_REGEX = /<(a?):(\w+):(\d+)>/;

/* ── Session storage for steal data ── */

const stealSessions = new Map();
const SESSION_TTL = 5 * 60 * 1000; // 5 minutes

function cleanupSessions() {
  const now = Date.now();
  for (const [key, session] of stealSessions) {
    if (now - session.createdAt > SESSION_TTL) {
      stealSessions.delete(key);
    }
  }
}

/* ── Reusable helpers (matches existing codebase style) ── */

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
      .setCustomId(`${STEAL_DELETE_PREFIX}${ownerId}`)
      .setLabel('Delete')
      .setStyle(ButtonStyle.Secondary),
  );
}

function hasAdmin(member) {
  return Boolean(member?.permissions?.has(PermissionsBitField.Flags.Administrator));
}

/* ── Extractors ── */

function extractFirstCustomEmoji(content) {
  const match = (content || '').match(CUSTOM_EMOJI_REGEX);

  if (!match) {
    return null;
  }

  const animated = match[1] === 'a';
  const emojiId = match[3];

  return {
    animated,
    name: match[2],
    id: emojiId,
    /* .png for sticker creation (static is fine, stickers accept APNG) */
    url: `https://cdn.discordapp.com/emojis/${emojiId}.png`,
    /* .gif for animated emoji creation (Discord requires GIF for animated emojis) */
    gifUrl: animated ? `https://cdn.discordapp.com/emojis/${emojiId}.gif` : null,
    /* .webp as fallback — Discord CDN serves animated WebP reliably */
    webpUrl: animated ? `https://cdn.discordapp.com/emojis/${emojiId}.webp` : null,
  };
}

function extractSticker(message) {
  const sticker = message.stickers?.first();

  if (!sticker) {
    return null;
  }

  // StickerFormatType: 1 = PNG, 2 = APNG, 3 = Lottie, 4 = GIF
  const format = sticker.format ?? sticker.formatType ?? 1;
  let ext = 'png';

  if (format === 3) {
    ext = 'json';
  } else if (format === 4) {
    ext = 'gif';
  }

  return {
    name: sticker.name,
    id: sticker.id,
    format,
    url: `https://media.discordapp.net/stickers/${sticker.id}.${ext}`,
    fallbackUrl: null,
    isLottie: format === 3,
  };
}

async function downloadImage(url) {
  const https = require('https');
  const http = require('http');

  return new Promise((resolve, reject) => {
    const handler = (res) => {
      /* Follow redirects (301, 302, 303, 307, 308) */
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const redirectUrl = res.headers.location;
        const client = redirectUrl.startsWith('https') ? https : http;
        client.get(redirectUrl, handler).on('error', reject);
        return;
      }

      if (res.statusCode !== 200) {
        reject(new Error(`Download failed (HTTP ${res.statusCode}) for ${url}`));
        return;
      }

      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    };

    https.get(url, handler).on('error', reject);
  });
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
        'You need **Administrator** permission to use this command.',
      ),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(createFooterText());
}

function buildNoReplyContainer() {
  return new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${emojis.label('status.error', 'No Emoji/Sticker Found')}`,
      ),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        'Please **reply** to a message containing a custom emoji or sticker to use this command.',
      ),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(createFooterText());
}

function buildNothingFoundContainer() {
  return new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${emojis.label('status.error', 'Nothing to Steal')}`,
      ),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        'The replied message does not contain any **custom emoji** or **sticker** that can be stolen.\n\n*Note: Default Discord emojis cannot be stolen.*',
      ),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(createFooterText());
}

function buildStealMenuContainer({ ownerId, emojiInfo, stickerInfo }) {
  const lines = ['**Found in replied message:**'];

  if (emojiInfo) {
    const animLabel = emojiInfo.animated ? ' (Animated)' : '';
    lines.push(`> Emoji: \`${emojiInfo.name}\`${animLabel}`);
  }

  if (stickerInfo) {
    const lottieWarn = stickerInfo.isLottie ? ' ⚠️ Lottie' : '';
    lines.push(`> Sticker: \`${stickerInfo.name}\`${lottieWarn}`);
  }

  lines.push(
    '',
    'Select how you want to steal from the menu below.',
    '',
    '> **Steal as Emoji** — Adds it as a custom emoji to this server',
    '> **Steal as Sticker** — Adds it as a sticker to this server',
  );

  const select = new StringSelectMenuBuilder()
    .setCustomId(`${STEAL_MODE_PREFIX}${ownerId}`)
    .setPlaceholder('How do you want to steal?')
    .addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel('Steal as Emoji')
        .setDescription('Add to this server as a custom emoji')
        .setValue('emoji'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Steal as Sticker')
        .setDescription('Add to this server as a sticker')
        .setValue('sticker'),
    );

  return new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent('## <:icons8heartballoon64:1512778356217610300> **Steal Emoji / Sticker**'),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(lines.join('\n')),
    )
    .addSeparatorComponents(createSeparator())
    .addActionRowComponents(new ActionRowBuilder().addComponents(select))
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`Panel owner: <@${ownerId}>`),
    )
    .addActionRowComponents(createDeleteRow(ownerId))
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(createFooterText());
}

function buildLoadingContainer({ ownerId, mode }) {
  const loadingEmoji = emojis.getEmoji('status.loading') || '⏳';
  const typeLabel = mode === 'emoji' ? 'emoji' : 'sticker';

  return new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${loadingEmoji} **Stealing...**`,
      ),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `Downloading and adding as **${typeLabel}** to this server, please wait...`,
      ),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(createFooterText());
}

function buildSuccessContainer({ type, name, ownerId }) {
  const typeLabel = type === 'emoji' ? 'Emoji' : 'Sticker';

  return new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${emojis.label('status.success', `${typeLabel} Stolen!`)}`,
      ),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        `Successfully added **${name}** as a **${typeLabel.toLowerCase()}** to this server! <:icons8partyingface64:1512778008661069865>`,
        '',
        `*Stolen by <@${ownerId}>*`,
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
        `## ${emojis.label('status.error', 'Steal Failed')}`,
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

/* ── Command execute (prefix usage) ── */

async function execute({ message }) {
  if (!hasAdmin(message.member)) {
    await message.reply(cv2Payload(buildMissingPermContainer()));
    return;
  }

  /* Must be a reply to another message */
  const ref = message.reference;

  if (!ref?.messageId) {
    await message.reply(cv2Payload(buildNoReplyContainer()));
    return;
  }

  const repliedMsg = await message.channel.messages
    .fetch(ref.messageId)
    .catch(() => null);

  if (!repliedMsg) {
    await message.reply(cv2Payload(buildNoReplyContainer()));
    return;
  }

  /* Extract emoji & sticker from the replied message */
  const emojiInfo = extractFirstCustomEmoji(repliedMsg.content);
  const stickerInfo = extractSticker(repliedMsg);

  if (!emojiInfo && !stickerInfo) {
    await message.reply(cv2Payload(buildNothingFoundContainer()));
    return;
  }

  /* Store session data and show the steal menu */
  cleanupSessions();
  stealSessions.set(message.author.id, {
    emojiInfo,
    stickerInfo,
    createdAt: Date.now(),
  });

  await message.reply(cv2Payload(buildStealMenuContainer({
    ownerId: message.author.id,
    emojiInfo,
    stickerInfo,
  })));
}

/* ── Interaction handlers ── */

function getReadableError(error) {
  if (error.code === 30008) {
    return 'This server has reached the **maximum number of emojis**! Remove some emojis to make room.';
  }

  if (error.code === 30039) {
    return 'This server has reached the **maximum number of stickers**! Remove some stickers to make room.';
  }

  if (error.code === 50035) {
    return [
      'The image is **too large** or in an **unsupported format** for this operation.',
      '',
      '*Emoji images must be under 256 KB. Sticker images should be PNG format under 512 KB.*',
    ].join('\n');
  }

  if (error.code === 50013) {
    return 'I don\'t have permission to manage emojis/stickers in this server. Please give me the **Manage Expressions** permission.';
  }

  return `An error occurred while stealing.\n\`${error.message}\``;
}

async function handleModeSelect({ interaction }) {
  const ownerId = interaction.customId.slice(STEAL_MODE_PREFIX.length);

  if (interaction.user.id !== ownerId) {
    await interaction.reply(
      createEphemeralTextPayload('Only the panel owner can use this menu.'),
    ).catch(() => null);
    return;
  }

  const session = stealSessions.get(ownerId);

  if (!session) {
    await interaction.reply(
      createEphemeralTextPayload(
        `${emojis.label('status.error', 'Session Expired')}\n\nThis steal session has expired. Please run the command again.`,
      ),
    ).catch(() => null);
    return;
  }

  const mode = interaction.values?.[0]; // 'emoji' or 'sticker'
  const { emojiInfo, stickerInfo } = session;

  /* Pick the best source — prefer emoji for emoji, sticker for sticker, fallback to whatever exists */
  const source = (mode === 'emoji' ? (emojiInfo || stickerInfo) : (stickerInfo || emojiInfo));

  if (!source) {
    await interaction.reply(
      createEphemeralTextPayload('No source found. Please run the command again.'),
    ).catch(() => null);
    return;
  }

  /* Lottie stickers cannot be downloaded as images */
  if (source.isLottie) {
    await interaction.reply(
      createEphemeralTextPayload([
        `${emojis.label('status.error', 'Unsupported Format')}`,
        '',
        'Lottie stickers use a vector animation format and **cannot be stolen**.',
        'Only PNG, APNG, and GIF stickers can be stolen.',
      ].join('\n')),
    ).catch(() => null);
    return;
  }

  /* Show loading state */
  await interaction.update(
    cv2Payload(buildLoadingContainer({ ownerId, mode })),
  );

  try {
    let imageBuffer = await downloadImage(source.url);
    const guild = interaction.guild;

    if (mode === 'emoji') {
      /* ── Steal as Emoji ── */

      /*
       * Discord requires GIF format for animated emojis.
       * Strategy: .gif URL → .webp URL (convert via sharp) → .png (static fallback)
       */
      const isAnimated = source.animated || source.format === 2 || source.format === 4;

      if (isAnimated) {
        let gotAnimated = false;

        /* 1) Try .gif URL directly (works for some emojis) */
        if (source.gifUrl) {
          try {
            imageBuffer = await downloadImage(source.gifUrl);
            gotAnimated = true;
          } catch {
            /* .gif returned 415 or failed, try next */
          }
        }

        /* 2) Try .webp URL and convert to GIF via sharp */
        if (!gotAnimated && source.webpUrl) {
          try {
            const webpBuffer = await downloadImage(source.webpUrl);
            imageBuffer = await sharp(webpBuffer, { animated: true, pages: -1 })
              .gif()
              .toBuffer();
            gotAnimated = true;
          } catch {
            /* WebP download or conversion failed, try next */
          }
        }

        /* 3) For APNG stickers, try converting the already-downloaded buffer */
        if (!gotAnimated && (source.format === 2 || source.format === 4)) {
          try {
            imageBuffer = await sharp(imageBuffer, { animated: true, pages: -1 })
              .gif()
              .toBuffer();
            gotAnimated = true;
          } catch {
            /* Conversion failed — emoji will be static */
          }
        }

        if (!gotAnimated) {
          console.warn('Could not get animated format, emoji will be static');
        }
      }

      const rawName = (source.name || 'stolen')
        .replace(/[^a-zA-Z0-9_]/g, '_')
        .slice(0, 30);
      const emojiName = rawName.length >= 2 ? rawName : `${rawName}_emoji`;

      const created = await guild.emojis.create({
        attachment: imageBuffer,
        name: emojiName,
      });

      stealSessions.delete(ownerId);

      await interaction.editReply(
        cv2Payload(buildSuccessContainer({
          type: 'emoji',
          name: created.name,
          ownerId,
        })),
      );
    } else {
      /* ── Steal as Sticker ── */
      const rawName = (source.name || 'stolen')
        .replace(/[^a-zA-Z0-9_ -]/g, '')
        .trim()
        .slice(0, 30);
      const stickerName = rawName.length >= 2 ? rawName : `${rawName} sticker`;

      const created = await guild.stickers.create({
        file: imageBuffer,
        name: stickerName,
        tags: '⭐',
        description: 'Stolen via steal command',
      });

      stealSessions.delete(ownerId);

      await interaction.editReply(
        cv2Payload(buildSuccessContainer({
          type: 'sticker',
          name: created.name,
          ownerId,
        })),
      );
    }
  } catch (error) {
    console.error('Steal failed:', error);
    stealSessions.delete(ownerId);

    await interaction.editReply(
      cv2Payload(buildErrorContainer({
        errorMessage: getReadableError(error),
        ownerId,
      })),
    ).catch(() => null);
  }
}

async function handleDeleteButton({ interaction }) {
  const ownerId = interaction.customId.slice(STEAL_DELETE_PREFIX.length);

  if (interaction.user.id !== ownerId) {
    await interaction.reply(
      createEphemeralTextPayload('Only the command user can delete this panel.'),
    ).catch(() => null);
    return;
  }

  await interaction.deferUpdate().catch(() => null);

  const deleted = await interaction.message.delete()
    .then(() => true)
    .catch(() => false);

  if (!deleted) {
    await interaction.followUp(
      createEphemeralTextPayload('I could not delete this panel.'),
    ).catch(() => null);
  }
}

module.exports = {
  name: 'steal',
  aliases: ['yoink', 'grab'],
  category: 'moderation',
  description: 'Steal an emoji or sticker from another server by replying to a message containing one.',
  usage: 'Reply to a message with emoji/sticker → LR!steal',
  execute,
  componentHandlers: [
    {
      customIdPrefix: STEAL_MODE_PREFIX,
      execute: handleModeSelect,
    },
    {
      customIdPrefix: STEAL_DELETE_PREFIX,
      execute: handleDeleteButton,
    },
  ],
};
