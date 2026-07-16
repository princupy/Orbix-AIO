const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  PermissionsBitField,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  ThumbnailBuilder,
} = require('discord.js');
const emojis = require('../../emojis');
const { cv2Payload } = require('../../utils/cv2');

const BANLIST_PAGE_CUSTOM_ID_PREFIX = 'banlist:page:';
const BANLIST_UNBAN_CUSTOM_ID_PREFIX = 'banlist:unban:';
const BANLIST_DELETE_CUSTOM_ID_PREFIX = 'banlist:delete:';
const PAGE_SIZE = 5;
const REASON_LIMIT = 150;
const IGNORED_INTERACTION_CODES = new Set([10062, 40060]);

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

function hasBanPermission(member) {
  return Boolean(
    member?.permissions?.has(PermissionsBitField.Flags.Administrator)
    || member?.permissions?.has(PermissionsBitField.Flags.BanMembers),
  );
}

function cleanReason(reason) {
  const text = (reason || 'No reason provided.').replace(/\s+/g, ' ').trim();
  return text.length > REASON_LIMIT ? `${text.slice(0, REASON_LIMIT - 3)}...` : text;
}

async function fetchSortedBans(guild) {
  const collection = await guild.bans.fetch().catch(() => null);

  if (!collection) {
    return null;
  }

  return [...collection.values()].sort((a, b) => {
    const nameA = (a.user.username || '').toLowerCase();
    const nameB = (b.user.username || '').toLowerCase();

    if (nameA !== nameB) {
      return nameA.localeCompare(nameB);
    }

    return a.user.id.localeCompare(b.user.id);
  });
}

/* ── Component builders ── */

function buildBanSection(ban, index) {
  const { user } = ban;
  const displayName = user.globalName || user.username || user.id;
  const avatarUrl = user.displayAvatarURL({
    extension: 'png',
    forceStatic: true,
    size: 128,
  });

  return new SectionBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        `**${index}. ${displayName}**`,
        `> <:star:1510658629278105800> \`@${user.username}\` • <:star:1510658629278105800> \`${user.id}\``,
        `> <:star:1510658629278105800> ${cleanReason(ban.reason)}`,
      ].join('\n')),
    )
    .setThumbnailAccessory(
      new ThumbnailBuilder()
        .setURL(avatarUrl)
        .setDescription(`${displayName} avatar`),
    );
}

function buildUnbanRow(targetId, page, requesterId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${BANLIST_UNBAN_CUSTOM_ID_PREFIX}${targetId}:${page}:${requesterId}`)
      .setLabel('Unban')
      .setEmoji('🔓')
      .setStyle(ButtonStyle.Success),
  );
}

function buildControlsRow({ requesterId, safePage, totalPages }) {
  const row = new ActionRowBuilder();

  if (totalPages > 1) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`${BANLIST_PAGE_CUSTOM_ID_PREFIX}${requesterId}:${safePage - 1}`)
        .setLabel('Previous')
        .setEmoji('◀️')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(safePage <= 0),
      new ButtonBuilder()
        .setCustomId(`${BANLIST_PAGE_CUSTOM_ID_PREFIX}${requesterId}:${safePage + 1}`)
        .setLabel('Next')
        .setEmoji('▶️')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(safePage >= totalPages - 1),
    );
  }

  row.addComponents(
    new ButtonBuilder()
      .setCustomId(`${BANLIST_DELETE_CUSTOM_ID_PREFIX}${requesterId}`)
      .setLabel('Delete')
      .setStyle(ButtonStyle.Danger),
  );

  return row;
}

function buildEmptyContainer({ guildName, requesterId }) {
  return new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## <:icons8banned64:1527211489352482918> ${guildName} — Ban List`,
      ),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        emojis.label('status.success', 'This server has no banned members.'),
      ),
    )
    .addSeparatorComponents(createSeparator())
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`${BANLIST_DELETE_CUSTOM_ID_PREFIX}${requesterId}`)
          .setLabel('Delete')
          .setStyle(ButtonStyle.Danger),
      ),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(createFooterText());
}

function buildBanListContainer({
  bans, guildName, page, requesterId,
}) {
  const total = bans.length;

  if (total === 0) {
    return buildEmptyContainer({ guildName, requesterId });
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(Math.max(Number(page) || 0, 0), totalPages - 1);
  const startIndex = safePage * PAGE_SIZE;
  const pageItems = bans.slice(startIndex, startIndex + PAGE_SIZE);

  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        `## <:icons8banned64:1527211489352482918> ${guildName} — Ban List`,
        `**Total Banned:** \`${total}\` member${total === 1 ? '' : 's'}  •  Page \`${safePage + 1}\`/\`${totalPages}\``,
      ].join('\n')),
    )
    .addSeparatorComponents(createSeparator());

  pageItems.forEach((ban, index) => {
    container
      .addSectionComponents(buildBanSection(ban, startIndex + index + 1))
      .addActionRowComponents(buildUnbanRow(ban.user.id, safePage, requesterId));
  });

  return container
    .addActionRowComponents(buildControlsRow({ requesterId, safePage, totalPages }))
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`Requested by <@${requesterId}>`),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(createFooterText());
}

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
        'You need **Ban Members** or **Administrator** permission to view the ban list.',
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
        'I need the **Ban Members** permission to read this server\'s ban list.',
      ),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(createFooterText());
}

function buildFetchErrorContainer() {
  return new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${emojis.label('status.error', 'Ban List Unavailable')}`,
      ),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        'I could not fetch the ban list. Make sure I have the **Ban Members** permission and try again.',
      ),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(createFooterText());
}

/* ── Command execute ── */

async function execute({ message }) {
  const requesterId = message.author.id;

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

  const bans = await fetchSortedBans(message.guild);

  if (bans === null) {
    await message.reply(cv2Payload(buildFetchErrorContainer()));
    return;
  }

  await message.channel.send(cv2Payload(
    buildBanListContainer({
      bans,
      guildName: message.guild.name,
      page: 0,
      requesterId,
    }),
    { allowedMentions: { parse: [], repliedUser: false, users: [] } },
  ));
}

/* ── Handlers ── */

async function handlePageButton({ interaction }) {
  const payload = interaction.customId.slice(BANLIST_PAGE_CUSTOM_ID_PREFIX.length);
  const separatorIndex = payload.indexOf(':');
  const requesterId = payload.slice(0, separatorIndex);
  const page = Number(payload.slice(separatorIndex + 1)) || 0;

  if (interaction.user.id !== requesterId) {
    await interaction.reply(createEphemeralTextPayload('Only the command user can use these buttons.')).catch(() => null);
    return;
  }

  try {
    const bans = await fetchSortedBans(interaction.guild);

    if (bans === null) {
      await interaction.reply(createEphemeralTextPayload('I could not fetch the ban list.')).catch(() => null);
      return;
    }

    await interaction.update(cv2Payload(
      buildBanListContainer({
        bans,
        guildName: interaction.guild.name,
        page,
        requesterId,
      }),
      { allowedMentions: { parse: [], repliedUser: false, users: [] } },
    ));
  } catch (error) {
    const code = error?.code ?? error?.rawError?.code;

    if (IGNORED_INTERACTION_CODES.has(code)) {
      return;
    }

    console.error('[banlist] Failed to change page:', error);
  }
}

async function handleUnbanButton({ interaction }) {
  const payload = interaction.customId.slice(BANLIST_UNBAN_CUSTOM_ID_PREFIX.length);
  const [targetId, pageValue, requesterId] = payload.split(':');
  const page = Number(pageValue) || 0;

  if (interaction.user.id !== requesterId) {
    await interaction.reply(createEphemeralTextPayload('Only the command user can use these buttons.')).catch(() => null);
    return;
  }

  if (!hasBanPermission(interaction.member)) {
    await interaction.reply(createEphemeralTextPayload('You need **Ban Members** or **Administrator** permission to unban.')).catch(() => null);
    return;
  }

  const botMember = interaction.guild.members.me
    || await interaction.guild.members.fetchMe().catch(() => null);

  if (!hasBanPermission(botMember)) {
    await interaction.reply(createEphemeralTextPayload('I need the **Ban Members** permission to unban users.')).catch(() => null);
    return;
  }

  try {
    await interaction.guild.bans.remove(
      targetId,
      `Unbanned via banlist by ${interaction.user.tag} (${interaction.user.id})`,
    );
  } catch (error) {
    const code = error?.code ?? error?.rawError?.code;

    // 10026 = Unknown Ban (already unbanned) → fall through and just refresh.
    if (code !== 10026) {
      await interaction.reply(createEphemeralTextPayload(`Could not unban that user.\n\`${error?.message || error}\``)).catch(() => null);
      return;
    }
  }

  try {
    const bans = await fetchSortedBans(interaction.guild);
    const filtered = bans ? bans.filter((ban) => ban.user.id !== targetId) : [];

    await interaction.update(cv2Payload(
      buildBanListContainer({
        bans: filtered,
        guildName: interaction.guild.name,
        page,
        requesterId,
      }),
      { allowedMentions: { parse: [], repliedUser: false, users: [] } },
    ));

    await interaction.followUp(createEphemeralTextPayload(
      emojis.label('status.success', `Unbanned <@${targetId}> (\`${targetId}\`).`),
    )).catch(() => null);
  } catch (error) {
    const code = error?.code ?? error?.rawError?.code;

    if (IGNORED_INTERACTION_CODES.has(code)) {
      return;
    }

    console.error('[banlist] Failed to refresh after unban:', error);
  }
}

async function handleDeleteButton({ interaction }) {
  const requesterId = interaction.customId.slice(BANLIST_DELETE_CUSTOM_ID_PREFIX.length);

  if (interaction.user.id !== requesterId) {
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
  name: 'banlist',
  aliases: ['bans', 'bl'],
  category: 'utility',
  description: 'Shows a paginated list of banned members with avatars and reasons.',
  usage: 'LR!banlist',
  noTimeout: true,
  execute,
  componentHandlers: [
    {
      customIdPrefix: BANLIST_PAGE_CUSTOM_ID_PREFIX,
      execute: handlePageButton,
    },
    {
      customIdPrefix: BANLIST_UNBAN_CUSTOM_ID_PREFIX,
      execute: handleUnbanButton,
    },
    {
      customIdPrefix: BANLIST_DELETE_CUSTOM_ID_PREFIX,
      execute: handleDeleteButton,
    },
  ],
};
