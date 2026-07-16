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

const HELP_COMPONENT_PREFIX = 'orbix-help:v2:';
const HELP_CATEGORY_CUSTOM_ID_PREFIX = `${HELP_COMPONENT_PREFIX}category:`;
const HELP_DELETE_CUSTOM_ID_PREFIX = `${HELP_COMPONENT_PREFIX}delete:`;
const HELP_HOME_CUSTOM_ID_PREFIX = `${HELP_COMPONENT_PREFIX}home:`;
const HELP_PAGE_CUSTOM_ID_PREFIX = `${HELP_COMPONENT_PREFIX}page:`;
const PAGE_SIZE = 5;

const CATEGORY_ORDER = ['utility', 'moderation', 'automod', 'ticket', 'voice', 'leveling', 'media', 'setup-roles', 'config', 'owner'];
const CATEGORY_LABELS = {
  automod: 'AutoMod',
  config: 'Config',
  leveling: 'Leveling',
  media: 'Media',
  moderation: 'Moderation',
  owner: 'Owner',
  'setup-roles': 'Setup Roles',
  ticket: 'Tickets',
  utility: 'Utility',
  voice: 'Voice',
};
const CATEGORY_DESCRIPTIONS = {
  automod: 'Automatic filters for invites, links, spam, mentions, caps, emojis, and bad words.',
  config: 'Server setup commands for prefix and bot configuration.',
  leveling: 'XP, ranks, leaderboards, reward roles, and leveling settings.',
  media: 'Media-only channel setup and enforcement tools.',
  moderation: 'Server moderation tools to manage messages and users.',
  owner: 'Bot owner controls for global noprefix access management.',
  'setup-roles': 'Guild-specific staff access and named role assignment commands.',
  ticket: 'Support ticket panel, creation, claiming, and transcripts.',
  utility: 'General bot tools for help, latency, and quick checks.',
  voice: 'Mute, deafen, kick, pull, and move users in voice channels.',
};
const CATEGORY_ALIASES = {
  automod: 'automod',
  automoderation: 'automod',
  setuprole: 'setup-roles',
  setuproles: 'setup-roles',
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
  const poweredEmoji = emojis.getEmoji('cutu.nitish') || emojis.getEmoji('status.success') || '*';
  return new TextDisplayBuilder().setContent(`${poweredEmoji} Made by [Tanmay](https://www.instagram.com/tanmoy_here8388/)`);
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

function canonicalizeCategory(value) {
  const normalized = String(value || 'general').trim().toLowerCase();
  const compact = normalized.replace(/[\s_-]+/g, '');

  return CATEGORY_ALIASES[normalized]
    || CATEGORY_ALIASES[compact]
    || normalized;
}

function getCategoryWeight(category) {
  const index = CATEGORY_ORDER.indexOf(canonicalizeCategory(category));
  return index === -1 ? CATEGORY_ORDER.length : index;
}

function getCategoryLabel(category) {
  const canonicalCategory = canonicalizeCategory(category);

  return CATEGORY_LABELS[canonicalCategory]
    || canonicalCategory[0].toUpperCase() + canonicalCategory.slice(1);
}

function getCategoryDescription(category) {
  return CATEGORY_DESCRIPTIONS[canonicalizeCategory(category)]
    || 'Commands available in this category.';
}

function normalizeCategoryValue(value, groupedCommands) {
  const rawValue = String(value || '').trim();

  if (!rawValue) {
    return null;
  }

  const canonicalValue = canonicalizeCategory(rawValue);

  if (groupedCommands.has(canonicalValue)) {
    return canonicalValue;
  }

  return [...groupedCommands.keys()].find((category) => (
    canonicalizeCategory(category) === canonicalValue
    || getCategoryLabel(category).toLowerCase() === rawValue.toLowerCase()
  )) || null;
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
    const category = canonicalizeCategory(command.category);
    const current = groups.get(category) || [];
    current.push(command);
    groups.set(category, current);
    return groups;
  }, new Map());
}

function resolveCategorySelection(client, value) {
  // Resolve purely from the already-loaded command registry.
  // We deliberately do NOT re-run loadCommands() here: re-requiring every
  // command file on a button click is slow, mutates the shared client.commands,
  // and, if any file fails to re-require at runtime, silently drops commands
  // (which caused whole categories to vanish / "interaction failed"). Commands
  // are loaded once at startup and stay valid for the process lifetime.
  const groupedCommands = getGroupedCommands(client);
  const category = normalizeCategoryValue(value, groupedCommands);

  return {
    category,
    groupedCommands,
    reloaded: false,
  };
}

function warnMissingCategory({ groupedCommands, rawCategory, reloaded }) {
  const availableCategories = [...groupedCommands.keys()].join(', ') || 'none';
  console.warn(
    `[help] Category "${rawCategory || 'unknown'}" is not available. `
    + `Reloaded commands: ${reloaded ? 'yes' : 'no'}. `
    + `Available categories: ${availableCategories}`,
  );
}

function getOrderedCategoryEntries(groupedCommands) {
  const ordered = [];
  const seen = new Set();

  for (const category of CATEGORY_ORDER) {
    const commands = groupedCommands.get(category);
    if (!commands?.length) continue;
    ordered.push([category, commands]);
    seen.add(category);
  }

  for (const [category, commands] of groupedCommands.entries()) {
    if (seen.has(category) || !commands?.length) continue;
    ordered.push([category, commands]);
  }

  return ordered;
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
  const names = getOrderedCategoryEntries(groupedCommands)
    .map(([category]) => category)
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

function buildSelectOption(category, commands, selectedCategory) {
  const desc = `${commands.length} command${commands.length === 1 ? '' : 's'} - ${getCategoryDescription(category)}`;
  return new StringSelectMenuOptionBuilder()
    .setLabel(getCategoryLabel(category))
    .setDescription(desc.slice(0, 100)) // Discord hard-limit: 100 chars
    .setValue(category)
    .setDefault(category === selectedCategory);
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

  for (const [category, commands] of getOrderedCategoryEntries(groupedCommands)) {
    select.addOptions(buildSelectOption(category, commands, selectedCategory));
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

async function replyEphemeral(interaction, content) {
  const payload = createEphemeralTextPayload(content);

  if (interaction.deferred || interaction.replied) {
    await interaction.followUp(payload).catch(() => null);
    return;
  }

  await interaction.reply(payload).catch(() => null);
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
    await replyEphemeral(interaction, 'Only the panel owner can use this button.');
    return;
  }

  await interaction.deferUpdate();

  try {
    const prefix = await getGuildPrefix(interaction.guildId);
    await interaction.editReply(await buildHelpPayload({
      client,
      ownerId,
      prefix,
    }));
  } catch (error) {
    console.error('[help] Failed to return to the help home:', error);
    await replyEphemeral(interaction, `Could not open the help home: \`${error?.message || error}\``);
  }
}

async function handleCategorySelect({ client, interaction }) {
  const ownerId = interaction.customId.slice(HELP_CATEGORY_CUSTOM_ID_PREFIX.length);

  if (interaction.user.id !== ownerId) {
    await replyEphemeral(interaction, 'Only the panel owner can use this menu.');
    return;
  }

  await interaction.deferUpdate();

  const rawCategory = interaction.values?.[0];
  const {
    category,
    groupedCommands,
    reloaded,
  } = resolveCategorySelection(client, rawCategory);

  if (!category) {
    warnMissingCategory({ groupedCommands, rawCategory, reloaded });
    await replyEphemeral(interaction, 'This command category is not available now.');
    return;
  }

  try {
    const prefix = await getGuildPrefix(interaction.guildId);
    await interaction.editReply(await buildCategoryPayload({
      category,
      client,
      ownerId,
      page: 0,
      prefix,
    }));
  } catch (error) {
    const code = error?.code ?? error?.rawError?.code;

    // 40060 (already acknowledged) / 10062 (unknown interaction) are benign:
    // they mean this exact interaction was already handled or expired, which
    // typically happens when the SAME interaction is delivered twice (e.g. two
    // bot instances running on the same token). Do not spam or double-reply.
    if (code === 40060 || code === 10062) {
      return;
    }

    const count = (groupedCommands.get(category) || []).length;
    console.error(`[help] Failed to open category "${category}" (${count} commands):`, error);
    await replyEphemeral(
      interaction,
      `Could not open **${getCategoryLabel(category)}**: \`${error?.message || error}\``,
    );
  }
}

async function handlePageButton({ client, interaction }) {
  const payload = interaction.customId.slice(HELP_PAGE_CUSTOM_ID_PREFIX.length);
  const [ownerId, rawCategory, rawPage] = payload.split(':');

  if (interaction.user.id !== ownerId) {
    await replyEphemeral(interaction, 'Only the panel owner can use these buttons.');
    return;
  }

  await interaction.deferUpdate();

  const {
    category,
    groupedCommands,
    reloaded,
  } = resolveCategorySelection(client, rawCategory);

  if (!category) {
    warnMissingCategory({ groupedCommands, rawCategory, reloaded });
    await replyEphemeral(interaction, 'This command category is not available now.');
    return;
  }

  try {
    const prefix = await getGuildPrefix(interaction.guildId);
    await interaction.editReply(await buildCategoryPayload({
      category,
      client,
      ownerId,
      page: Number(rawPage) || 0,
      prefix,
    }));
  } catch (error) {
    const code = error?.code ?? error?.rawError?.code;

    if (code === 40060 || code === 10062) {
      return;
    }

    console.error(`[help] Failed to open page for category "${category}":`, error);
    await replyEphemeral(
      interaction,
      `Could not open **${getCategoryLabel(category)}**: \`${error?.message || error}\``,
    );
  }
}

async function handleDeleteButton({ interaction }) {
  const ownerId = interaction.customId.slice(HELP_DELETE_CUSTOM_ID_PREFIX.length);

  if (interaction.user.id !== ownerId) {
    await replyEphemeral(interaction, 'Only the panel owner can delete this help panel.');
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
  noTimeout: true, // Help panel has persistent interactive components (dropdowns, buttons)
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
