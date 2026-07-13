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
const emojis = require('../../emojis');
const { getGuildPrefix } = require('../../supabase/guildSettings');
const { cv2Payload } = require('../../utils/cv2');

const HELP_CATEGORY_CUSTOM_ID_PREFIX = 'help:category:';
const HELP_DELETE_CUSTOM_ID_PREFIX = 'help:delete:';
const HELP_HOME_CUSTOM_ID_PREFIX = 'help:home:';
const HELP_PAGE_CUSTOM_ID_PREFIX = 'help:page:';
const PAGE_SIZE = 5;

const CATEGORY_ORDER = ['utility', 'moderation', 'leveling', 'media', 'config', 'owner'];
const CATEGORY_LABELS = {
  config: 'Config',
  leveling: 'Leveling',
  media: 'Media',
  moderation: 'Moderation',
  owner: 'Owner',
  utility: 'Utility',
};
const CATEGORY_DESCRIPTIONS = {
  config: 'Server setup commands for prefix and bot configuration.',
  leveling: 'XP, ranks, leaderboards, reward roles, and leveling settings.',
  media: 'Media-only channel setup and enforcement tools.',
  moderation: 'Server moderation tools to manage messages and users.',
  owner: 'Bot owner controls for global noprefix access management.',
  utility: 'General bot tools for help, latency, and quick checks.',
};

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

function createFooterText() {
  const poweredEmoji = emojis.getEmoji('lr.logo') || emojis.getEmoji('status.success') || '*';
  return new TextDisplayBuilder().setContent(`${poweredEmoji} **Powered by Prince**`);
}

function createHeaderSection({ client }) {
  const botName = client?.user?.username || 'LR Bot';
  const section = new SectionBuilder().addTextDisplayComponents(
    new TextDisplayBuilder().setContent([
      `## <a:hello:1510659633612718083> ${(botName)}`,
      'The ultimate all-in-one Discord bot. Powerful moderation, fun commands, auto-roles, and much more - simple setup, zero clutter.',
    ].join('\n')),
  );
  const avatarUrl = getBotAvatarUrl(client);

  if (avatarUrl) {
    section.setThumbnailAccessory(
      new ThumbnailBuilder()
        .setURL(avatarUrl)
        .setDescription(`${botName} avatar`),
    );
  }

  return section;
}

function replaceDefaultPrefix(usage, prefix) {
  if (!usage) {
    return null;
  }

  return usage.replace(/^LR!/, prefix);
}

function getCommandUsage(command, prefix) {
  return replaceDefaultPrefix(command.usage, prefix) || `${prefix}${command.name}`;
}

function getCategoryWeight(category) {
  const index = CATEGORY_ORDER.indexOf(category);
  return index === -1 ? CATEGORY_ORDER.length : index;
}

function getCategoryLabel(category) {
  return CATEGORY_LABELS[category] || category[0].toUpperCase() + category.slice(1);
}

function getCategoryDescription(category) {
  return CATEGORY_DESCRIPTIONS[category] || 'Commands available in this category.';
}

function getGroupedCommands(client) {
  const commands = [...client.commands.values()]
    .sort((left, right) => {
      const categoryDiff = getCategoryWeight(left.category) - getCategoryWeight(right.category);

      if (categoryDiff !== 0) {
        return categoryDiff;
      }

      return left.name.localeCompare(right.name);
    });

  return commands.reduce((groups, command) => {
    const category = command.category || 'general';
    const current = groups.get(category) || [];
    current.push(command);
    groups.set(category, current);
    return groups;
  }, new Map());
}

function getPageData(commands, page) {
  const totalPages = Math.max(1, Math.ceil(commands.length / PAGE_SIZE));
  const safePage = Math.min(Math.max(Number(page) || 0, 0), totalPages - 1);
  const startIndex = safePage * PAGE_SIZE;
  const pageCommands = commands.slice(startIndex, startIndex + PAGE_SIZE);

  return {
    pageCommands,
    safePage,
    startIndex,
    totalPages,
  };
}

function formatCommandNames(commands, startIndex = 0) {
  return commands
    .map((command, index) => `${startIndex + index + 1}. \`${command.name}\``)
    .join('\n');
}

function formatCategoryNames(client) {
  const groupedCommands = getGroupedCommands(client);
  const names = [...groupedCommands.keys()]
    .map((category) => `> **${getCategoryLabel(category)}**`);

  return [
    '__Available Commands__',
    ...names,
  ].join('\n');
}

function formatAliases(command) {
  if (!command.aliases?.length) {
    return '`None`';
  }

  return command.aliases.map((alias) => `\`${alias}\``).join(', ');
}

function formatCommandDetails({
  commands,
  prefix,
  startIndex = 0,
}) {
  return commands.map((command, index) => [
    `### ${startIndex + index + 1}. ${command.name}`,
    `**Usage:** \`${getCommandUsage(command, prefix)}\``,
    `**Aliases:** ${formatAliases(command)}`,
    `**Detail:** ${command.description || 'No description available.'}`,
  ].join('\n')).join('\n\n');
}

function createCategorySelect({
  client,
  ownerId,
  selectedCategory = null,
}) {
  const groupedCommands = getGroupedCommands(client);
  const select = new StringSelectMenuBuilder()
    .setCustomId(`${HELP_CATEGORY_CUSTOM_ID_PREFIX}${ownerId}`)
    .setPlaceholder(selectedCategory ? `${getCategoryLabel(selectedCategory)} Commands` : 'Select a category');

  for (const [category, commands] of groupedCommands.entries()) {
    select.addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel(getCategoryLabel(category))
        .setDescription(`${commands.length} command${commands.length === 1 ? '' : 's'} - ${getCategoryDescription(category)}`)
        .setValue(category)
        .setDefault(category === selectedCategory),
    );
  }

  return select;
}

function createCategorySelectRow({
  client,
  ownerId,
  selectedCategory = null,
}) {
  return new ActionRowBuilder().addComponents(
    createCategorySelect({
      client,
      ownerId,
      selectedCategory,
    }),
  );
}

function createOwnerActionRow(ownerId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${HELP_HOME_CUSTOM_ID_PREFIX}${ownerId}`)
      .setLabel('Home')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`${HELP_DELETE_CUSTOM_ID_PREFIX}${ownerId}`)
      .setLabel('Delete')
      .setStyle(ButtonStyle.Secondary),
  );
}

function createPageActionRow({
  category,
  ownerId,
  safePage,
  totalPages,
}) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${HELP_PAGE_CUSTOM_ID_PREFIX}${ownerId}:${category}:${safePage - 1}`)
      .setLabel('Previous')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(safePage <= 0),
    new ButtonBuilder()
      .setCustomId(`${HELP_PAGE_CUSTOM_ID_PREFIX}${ownerId}:${category}:${safePage + 1}`)
      .setLabel('Next')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(safePage >= totalPages - 1),
  );
}

function buildHelpContainer({ client, ownerId, prefix }) {
  const commandCount = client.commands?.size || 0;

  return new ContainerBuilder()
    .addSectionComponents(createHeaderSection({ client }))
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        '> <:star:1510658629278105800> Server management tools with clean CV2 responses.',
        `> <:star:1510658629278105800> Server Prefix: \`${prefix}\``,
        `> <:star:1510658629278105800> Total Commands: **${commandCount}**`,
      ].join('\n')),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(formatCategoryNames(client)),
    )
    .addSeparatorComponents(createSeparator())
    .addActionRowComponents(createCategorySelectRow({ client, ownerId }))
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`Panel owner: <@${ownerId}>`),
    )
    .addActionRowComponents(createOwnerActionRow(ownerId))
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(createFooterText());
}

function buildCategoryContainer({
  category,
  client,
  ownerId,
  page = 0,
  prefix,
}) {
  const groupedCommands = getGroupedCommands(client);
  const commands = groupedCommands.get(category) || [];
  const categoryLabel = getCategoryLabel(category);
  const {
    pageCommands,
    safePage,
    startIndex,
    totalPages,
  } = getPageData(commands, page);
  const container = new ContainerBuilder()
    .addSectionComponents(createHeaderSection({ client }))
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        `**Category:** ${categoryLabel}`,
        getCategoryDescription(category),
        '',
        `**Available ${categoryLabel} Commands**`,
        formatCommandNames(pageCommands, startIndex) || 'No commands found in this category.',
        '',
        `Page ${safePage + 1}/${totalPages} - Total ${commands.length}`,
      ].join('\n')),
    )
    .addSeparatorComponents(createSeparator());

  if (pageCommands.length > 0) {
    container
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(formatCommandDetails({
          commands: pageCommands,
          prefix,
          startIndex,
        })),
      )
      .addSeparatorComponents(createSeparator());
  }

  if (totalPages > 1) {
    container
      .addActionRowComponents(createPageActionRow({
        category,
        ownerId,
        safePage,
        totalPages,
      }))
      .addSeparatorComponents(createSeparator());
  }

  return container
    .addActionRowComponents(createCategorySelectRow({ client, ownerId, selectedCategory: category }))
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`Panel owner: <@${ownerId}>`),
    )
    .addActionRowComponents(createOwnerActionRow(ownerId))
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(createFooterText());
}

async function buildHelpPayload({
  client,
  ownerId,
  prefix,
}) {
  return cv2Payload(
    buildHelpContainer({
      client,
      ownerId,
      prefix,
    }),
  );
}

async function buildCategoryPayload({
  category,
  client,
  ownerId,
  page = 0,
  prefix,
}) {
  return cv2Payload(
    buildCategoryContainer({
      category,
      client,
      ownerId,
      page,
      prefix,
    }),
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

async function execute({ client, message, prefix }) {
  await message.channel.send(await buildHelpPayload({
    client,
    ownerId: message.author.id,
    prefix,
  }));
}

async function handleHomeButton({ client, interaction }) {
  const ownerId = interaction.customId.slice(HELP_HOME_CUSTOM_ID_PREFIX.length);

  if (interaction.user.id !== ownerId) {
    await interaction.reply(createEphemeralTextPayload('Only the panel owner can use this button.')).catch(() => null);
    return;
  }

  const prefix = await getGuildPrefix(interaction.guildId);
  await interaction.update(await buildHelpPayload({
    client,
    ownerId,
    prefix,
  }));
}

async function handleCategorySelect({ client, interaction }) {
  const ownerId = interaction.customId.slice(HELP_CATEGORY_CUSTOM_ID_PREFIX.length);

  if (interaction.user.id !== ownerId) {
    await interaction.reply(createEphemeralTextPayload('Only the panel owner can use this menu.')).catch(() => null);
    return;
  }

  const category = interaction.values?.[0];
  const groupedCommands = getGroupedCommands(client);

  if (!groupedCommands.has(category)) {
    await interaction.reply(createEphemeralTextPayload('This command category is not available now.')).catch(() => null);
    return;
  }

  const prefix = await getGuildPrefix(interaction.guildId);
  await interaction.update(await buildCategoryPayload({
    category,
    client,
    ownerId,
    page: 0,
    prefix,
  }));
}

async function handlePageButton({ client, interaction }) {
  const payload = interaction.customId.slice(HELP_PAGE_CUSTOM_ID_PREFIX.length);
  const [ownerId, category, rawPage] = payload.split(':');

  if (interaction.user.id !== ownerId) {
    await interaction.reply(createEphemeralTextPayload('Only the panel owner can use these buttons.')).catch(() => null);
    return;
  }

  const groupedCommands = getGroupedCommands(client);

  if (!groupedCommands.has(category)) {
    await interaction.reply(createEphemeralTextPayload('This command category is not available now.')).catch(() => null);
    return;
  }

  const prefix = await getGuildPrefix(interaction.guildId);
  await interaction.update(await buildCategoryPayload({
    category,
    client,
    ownerId,
    page: Number(rawPage) || 0,
    prefix,
  }));
}

async function handleDeleteButton({ interaction }) {
  const ownerId = interaction.customId.slice(HELP_DELETE_CUSTOM_ID_PREFIX.length);

  if (interaction.user.id !== ownerId) {
    await interaction.reply(createEphemeralTextPayload('Only the panel owner can delete this help panel.')).catch(() => null);
    return;
  }

  await interaction.deferUpdate().catch(() => null);

  const deleted = await interaction.message.delete()
    .then(() => true)
    .catch(() => false);

  if (!deleted) {
    await interaction.followUp(createEphemeralTextPayload('I could not delete this help panel.')).catch(() => null);
  }
}

module.exports = {
  name: 'help',
  aliases: ['h', 'commands'],
  category: 'utility',
  description: 'Shows the bot command help panel.',
  usage: 'LR!help',
  execute,
  componentHandlers: [
    {
      customIdPrefix: HELP_HOME_CUSTOM_ID_PREFIX,
      execute: handleHomeButton,
    },
    {
      customIdPrefix: HELP_CATEGORY_CUSTOM_ID_PREFIX,
      execute: handleCategorySelect,
    },
    {
      customIdPrefix: HELP_PAGE_CUSTOM_ID_PREFIX,
      execute: handlePageButton,
    },
    {
      customIdPrefix: HELP_DELETE_CUSTOM_ID_PREFIX,
      execute: handleDeleteButton,
    },
  ],
};
