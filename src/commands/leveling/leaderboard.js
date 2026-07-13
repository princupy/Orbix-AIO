const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const { cv2Payload } = require('../../utils/cv2');
const {
  LEADERBOARD_PAGE_SIZE,
  getLeaderboard,
} = require('../../supabase/leveling');
const {
  LEVELING_DELETE_CUSTOM_ID_PREFIX,
  buildErrorContainer,
  buildLeaderboardAttachment,
  handleDeleteButton,
  parsePositiveInteger,
} = require('../../utils/leveling');

const LEADERBOARD_PREVIOUS_CUSTOM_ID_PREFIX = 'leveling:leaderboard:previous:';
const LEADERBOARD_NEXT_CUSTOM_ID_PREFIX = 'leveling:leaderboard:next:';

function createLeaderboardRow({
  ownerId,
  page,
  totalPages,
}) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${LEADERBOARD_PREVIOUS_CUSTOM_ID_PREFIX}${ownerId}:${page}`)
      .setLabel('Previous')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page <= 1),
    new ButtonBuilder()
      .setCustomId(`${LEADERBOARD_NEXT_CUSTOM_ID_PREFIX}${ownerId}:${page}`)
      .setLabel('Next')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(page >= totalPages),
  );
}

async function buildLeaderboardPayload({
  guild,
  ownerId,
  page,
}) {
  const result = await getLeaderboard(guild.id, page, LEADERBOARD_PAGE_SIZE);

  if (!result.ok) {
    return {
      page: 1,
      options: cv2Payload(buildErrorContainer({
        description: `Leaderboard load failed.\n\`${result.reason}\``,
        ownerId,
        title: 'Leaderboard Failed',
      })),
      totalPages: 1,
    };
  }

  if (result.total > 0 && result.page > result.totalPages) {
    return buildLeaderboardPayload({
      guild,
      ownerId,
      page: result.totalPages,
    });
  }

  const attachment = await buildLeaderboardAttachment({
    guild,
    page: result.page,
    rows: result.rows,
    total: result.total,
    totalPages: result.totalPages,
  });

  return {
    page: result.page,
    options: {
      components: [
        createLeaderboardRow({
          ownerId,
          page: result.page,
          totalPages: result.totalPages,
        }),
      ],
      files: [attachment],
    },
    totalPages: result.totalPages,
  };
}

async function execute({ args, message }) {
  const ownerId = message.author.id;
  let currentPage = parsePositiveInteger(args[0], { min: 1, max: 9999 }) || 1;
  let rendered = await buildLeaderboardPayload({
    guild: message.guild,
    ownerId,
    page: currentPage,
  });
  currentPage = rendered.page;

  const sent = await message.channel.send(rendered.options);
  await sent.suppressEmbeds(false).catch(() => null);
}

async function handlePageButton({ interaction }) {
  const isPrevious = interaction.customId.startsWith(LEADERBOARD_PREVIOUS_CUSTOM_ID_PREFIX);
  const prefix = isPrevious
    ? LEADERBOARD_PREVIOUS_CUSTOM_ID_PREFIX
    : LEADERBOARD_NEXT_CUSTOM_ID_PREFIX;
  const [ownerId, rawPage] = interaction.customId.slice(prefix.length).split(':');

  if (interaction.user.id !== ownerId) {
    await interaction.reply(cv2Payload(buildErrorContainer({
      description: 'Only the command user can use these leaderboard buttons.',
      ownerId,
      title: 'Leaderboard Locked',
    }), {
      ephemeral: true,
    })).catch(() => null);
    return;
  }

  const currentPage = parsePositiveInteger(rawPage, { min: 1, max: 9999 }) || 1;
  const rendered = await buildLeaderboardPayload({
    guild: interaction.guild,
    ownerId,
    page: isPrevious ? currentPage - 1 : currentPage + 1,
  });

  await interaction.update({
    ...rendered.options,
    attachments: [],
  }).catch(() => null);
}

module.exports = {
  name: 'leaderboard',
  aliases: ['lb', 'top'],
  category: 'leveling',
  description: 'Shows server top XP holders with reaction pagination.',
  usage: 'LR!leaderboard [page]',
  execute,
  componentHandlers: [
    {
      customIdPrefix: LEVELING_DELETE_CUSTOM_ID_PREFIX,
      execute: handleDeleteButton,
    },
    {
      customIdPrefix: LEADERBOARD_PREVIOUS_CUSTOM_ID_PREFIX,
      execute: handlePageButton,
    },
    {
      customIdPrefix: LEADERBOARD_NEXT_CUSTOM_ID_PREFIX,
      execute: handlePageButton,
    },
  ],
};
