const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ContainerBuilder,
  PermissionsBitField,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
} = require('discord.js');
const emojis = require('../emojis');
const { cv2Payload } = require('./cv2');

const DEFAULT_REASON = 'No reason provided.';
const DISCORD_REASON_LIMIT = 512;

const HIDE_CHANNEL_TYPES = new Set([
  ChannelType.GuildAnnouncement,
  ChannelType.GuildCategory,
  ChannelType.GuildForum,
  ChannelType.GuildMedia,
  ChannelType.GuildStageVoice,
  ChannelType.GuildText,
  ChannelType.GuildVoice,
]);

const LOCK_CHANNEL_TYPES = new Set([
  ChannelType.GuildAnnouncement,
  ChannelType.GuildForum,
  ChannelType.GuildMedia,
  ChannelType.GuildStageVoice,
  ChannelType.GuildText,
  ChannelType.GuildVoice,
]);

const OPERATION_CONFIG = {
  hide: {
    descriptionAction: 'hide',
    noChannelsTitle: 'No Channels to Hide',
    overwrite: { ViewChannel: false },
    successTitle: 'Channel Hidden',
    successTitleAll: 'Channels Hidden',
    targetTypes: HIDE_CHANNEL_TYPES,
    alreadyStateTitle: 'Already Hidden',
    alreadyStateMessage: 'This channel is already hidden.',
    alreadyStateTitleAll: 'Already Hidden',
  },
  lock: {
    descriptionAction: 'lock',
    noChannelsTitle: 'No Channels to Lock',
    overwrite: {
      SendMessages: false,
      SendMessagesInThreads: false,
    },
    successTitle: 'Channel Locked',
    successTitleAll: 'Channels Locked',
    targetTypes: LOCK_CHANNEL_TYPES,
    alreadyStateTitle: 'Already Locked',
    alreadyStateMessage: 'This channel is already locked.',
    alreadyStateTitleAll: 'Already Locked',
  },
  unhide: {
    descriptionAction: 'unhide',
    noChannelsTitle: 'No Channels to Unhide',
    overwrite: { ViewChannel: null },
    successTitle: 'Channel Unhidden',
    successTitleAll: 'Channels Unhidden',
    targetTypes: HIDE_CHANNEL_TYPES,
    alreadyStateTitle: 'Already Visible',
    alreadyStateMessage: 'This channel is not hidden — it is already visible to members.',
    alreadyStateTitleAll: 'Already Visible',
  },
  unlock: {
    descriptionAction: 'unlock',
    noChannelsTitle: 'No Channels to Unlock',
    overwrite: {
      SendMessages: null,
      SendMessagesInThreads: null,
    },
    successTitle: 'Channel Unlocked',
    successTitleAll: 'Channels Unlocked',
    targetTypes: LOCK_CHANNEL_TYPES,
    alreadyStateTitle: 'Already Unlocked',
    alreadyStateMessage: 'This channel is not locked — it is already unlocked.',
    alreadyStateTitleAll: 'Already Unlocked',
  },
};

function createSeparator() {
  return new SeparatorBuilder()
    .setDivider(true)
    .setSpacing(SeparatorSpacingSize.Small);
}

function createFooterText() {
  const poweredEmoji = emojis.getEmoji('lr.logo') || emojis.getEmoji('status.success') || '*';
  return new TextDisplayBuilder().setContent(`${poweredEmoji} **Powered by Prince**`);
}

function createDeleteRow(customIdPrefix, ownerId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${customIdPrefix}${ownerId}`)
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

function hasManageChannelsPermission(member) {
  return Boolean(
    member?.permissions?.has(PermissionsBitField.Flags.Administrator)
    || member?.permissions?.has(PermissionsBitField.Flags.ManageChannels),
  );
}

function cleanReason(reason) {
  const normalized = reason?.trim() || DEFAULT_REASON;
  return normalized.slice(0, DISCORD_REASON_LIMIT);
}

function getChannelLabel(channel) {
  if (!channel) {
    return 'Unknown channel';
  }

  if (channel.type === ChannelType.GuildCategory) {
    return `Category: ${channel.name}`;
  }

  return `<#${channel.id}>`;
}

function supportsOperation(channel, operation) {
  const config = OPERATION_CONFIG[operation];

  return Boolean(
    channel?.guild
    && channel?.permissionOverwrites?.edit
    && config?.targetTypes?.has(channel.type),
  );
}

function getTargetChannels(message, operation, allChannels) {
  if (!allChannels) {
    return supportsOperation(message.channel, operation)
      ? [message.channel]
      : [];
  }

  return [...message.guild.channels.cache.values()]
    .filter((channel) => supportsOperation(channel, operation))
    .sort((left, right) => (left.rawPosition ?? 0) - (right.rawPosition ?? 0));
}

/**
 * Check if a channel is already in the desired state for the given operation.
 * Returns true if the operation would be a no-op (channel already matches target state).
 */
function isAlreadyInState(channel, operation, everyoneRole) {
  const overwrite = channel.permissionOverwrites.cache.get(everyoneRole.id);

  if (operation === 'lock') {
    // Already locked = @everyone SendMessages is explicitly denied (false)
    return overwrite?.deny?.has(PermissionsBitField.Flags.SendMessages) === true;
  }

  if (operation === 'unlock') {
    // Already unlocked = @everyone SendMessages is NOT explicitly denied
    return overwrite?.deny?.has(PermissionsBitField.Flags.SendMessages) !== true;
  }

  if (operation === 'hide') {
    // Already hidden = @everyone ViewChannel is explicitly denied (false)
    return overwrite?.deny?.has(PermissionsBitField.Flags.ViewChannel) === true;
  }

  if (operation === 'unhide') {
    // Already visible = @everyone ViewChannel is NOT explicitly denied
    return overwrite?.deny?.has(PermissionsBitField.Flags.ViewChannel) !== true;
  }

  return false;
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
        'You need **Manage Channels** or **Administrator** permission to use this command.',
      ),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(createFooterText());
}

function buildMissingBotPermContainer({ customIdPrefix, ownerId }) {
  return new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${emojis.label('status.error', 'Bot Permission Missing')}`,
      ),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        'I need **Manage Channels** or **Administrator** permission to edit channel permissions.',
      ),
    )
    .addSeparatorComponents(createSeparator())
    .addActionRowComponents(createDeleteRow(customIdPrefix, ownerId))
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(createFooterText());
}

function buildNoChannelsContainer({
  allChannels,
  customIdPrefix,
  operation,
  ownerId,
}) {
  const config = OPERATION_CONFIG[operation];

  return new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${emojis.label('status.warning', config.noChannelsTitle)}`,
      ),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        allChannels
          ? 'I could not find any supported channels to update.'
          : 'This command cannot be used in this channel type.',
      ),
    )
    .addSeparatorComponents(createSeparator())
    .addActionRowComponents(createDeleteRow(customIdPrefix, ownerId))
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(createFooterText());
}

function buildAlreadyInStateContainer({
  customIdPrefix,
  operation,
  ownerId,
}) {
  const config = OPERATION_CONFIG[operation];

  return new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${emojis.label('status.warning', config.alreadyStateTitle)}`,
      ),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(config.alreadyStateMessage),
    )
    .addSeparatorComponents(createSeparator())
    .addActionRowComponents(createDeleteRow(customIdPrefix, ownerId))
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(createFooterText());
}

function buildAlreadyInStateAllContainer({
  alreadyCount,
  customIdPrefix,
  operation,
  ownerId,
}) {
  const config = OPERATION_CONFIG[operation];

  return new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${emojis.label('status.warning', config.alreadyStateTitleAll)}`,
      ),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `All **${alreadyCount}** channel${alreadyCount === 1 ? ' is' : 's are'} already in the desired state. No changes were made.`,
      ),
    )
    .addSeparatorComponents(createSeparator())
    .addActionRowComponents(createDeleteRow(customIdPrefix, ownerId))
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(createFooterText());
}

function buildResultContainer({
  allChannels,
  customIdPrefix,
  failed,
  operation,
  ownerId,
  reason,
  targets,
  updated,
}) {
  const config = OPERATION_CONFIG[operation];
  const title = allChannels ? config.successTitleAll : config.successTitle;
  const detailLines = allChannels
    ? [
      `Successfully updated **${updated}** channel${updated === 1 ? '' : 's'}.`,
      failed.length > 0 ? `Failed: **${failed.length}** channel${failed.length === 1 ? '' : 's'}.` : null,
    ].filter(Boolean)
    : [
      `Successfully updated ${getChannelLabel(targets[0])}.`,
    ];

  return new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${emojis.label('status.success', title)}`,
      ),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        ...detailLines,
        `**Reason:** ${reason}`,
        '',
        `*Updated by <@${ownerId}>*`,
      ].join('\n')),
    )
    .addSeparatorComponents(createSeparator())
    .addActionRowComponents(createDeleteRow(customIdPrefix, ownerId))
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(createFooterText());
}

function buildErrorContainer({
  customIdPrefix,
  errorMessage,
  ownerId,
  title = 'Channel Update Failed',
}) {
  return new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${emojis.label('status.error', title)}`,
      ),
    )
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(errorMessage),
    )
    .addSeparatorComponents(createSeparator())
    .addActionRowComponents(createDeleteRow(customIdPrefix, ownerId))
    .addSeparatorComponents(createSeparator())
    .addTextDisplayComponents(createFooterText());
}

function getReadableError(error) {
  if (error.code === 50013) {
    return 'I could not edit channel permissions because my role is too low or I am missing **Manage Channels** permission.';
  }

  if (error.code === 50001) {
    return 'I do not have access to one or more channels.';
  }

  return `An error occurred while editing channel permissions.\n\`${error.message}\``;
}

async function applyOverwrite({ channel, operation, reason, targetRole }) {
  const config = OPERATION_CONFIG[operation];
  await channel.permissionOverwrites.edit(targetRole, config.overwrite, { reason });
}

function createChannelPermissionCommand({
  aliases = [],
  allChannels = false,
  name,
  operation,
  usage,
}) {
  const config = OPERATION_CONFIG[operation];

  if (!config) {
    throw new Error(`Unknown channel permission operation: ${operation}`);
  }

  const deleteCustomIdPrefix = `${name}:delete:`;

  async function execute({ args, message }) {
    const ownerId = message.author.id;

    if (!hasManageChannelsPermission(message.member)) {
      await message.reply(cv2Payload(buildMissingUserPermContainer()));
      return;
    }

    const botMember = message.guild.members.me
      || await message.guild.members.fetchMe().catch(() => null);

    if (!hasManageChannelsPermission(botMember)) {
      await message.reply(cv2Payload(buildMissingBotPermContainer({
        customIdPrefix: deleteCustomIdPrefix,
        ownerId,
      })));
      return;
    }

    const targets = getTargetChannels(message, operation, allChannels);

    if (targets.length === 0) {
      await message.reply(cv2Payload(buildNoChannelsContainer({
        allChannels,
        customIdPrefix: deleteCustomIdPrefix,
        operation,
        ownerId,
      })));
      return;
    }

    const everyoneRole = message.guild.roles.everyone;
    const reason = cleanReason(args.join(' '));
    const auditReason = cleanReason(`${name} used by ${message.author.tag} (${message.author.id}): ${reason}`);
    const failed = [];
    let updated = 0;
    let alreadySkipped = 0;

    // Single channel — check if already in desired state before doing anything
    if (!allChannels) {
      if (isAlreadyInState(targets[0], operation, everyoneRole)) {
        await message.reply(cv2Payload(buildAlreadyInStateContainer({
          customIdPrefix: deleteCustomIdPrefix,
          operation,
          ownerId,
        })));
        return;
      }
    }

    for (const channel of targets) {
      // For bulk ops — skip channels already in the desired state
      if (allChannels && isAlreadyInState(channel, operation, everyoneRole)) {
        alreadySkipped += 1;
        continue;
      }

      try {
        await applyOverwrite({
          channel,
          operation,
          reason: auditReason,
          targetRole: everyoneRole,
        });
        updated += 1;
      } catch (error) {
        failed.push({ channel, error });
      }
    }

    // All channels were already in desired state (bulk only)
    if (allChannels && updated === 0 && failed.length === 0) {
      await message.channel.send(cv2Payload(buildAlreadyInStateAllContainer({
        alreadyCount: alreadySkipped,
        customIdPrefix: deleteCustomIdPrefix,
        operation,
        ownerId,
      })));
      return;
    }

    if (updated === 0) {
      const firstError = failed[0]?.error;
      await message.channel.send(cv2Payload(buildErrorContainer({
        customIdPrefix: deleteCustomIdPrefix,
        errorMessage: firstError ? getReadableError(firstError) : 'No channels were updated.',
        ownerId,
      })));
      return;
    }

    await message.channel.send(cv2Payload(buildResultContainer({
      allChannels,
      customIdPrefix: deleteCustomIdPrefix,
      failed,
      operation,
      ownerId,
      reason,
      targets,
      updated,
    })));
  }

  async function handleDeleteButton({ interaction }) {
    const ownerId = interaction.customId.slice(deleteCustomIdPrefix.length);

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

  return {
    name,
    aliases,
    category: 'moderation',
    description: `${allChannels ? 'Bulk ' : ''}${config.descriptionAction} channel permissions.`,
    usage,
    execute,
    componentHandlers: [
      {
        customIdPrefix: deleteCustomIdPrefix,
        execute: handleDeleteButton,
      },
    ],
  };
}

module.exports = {
  createChannelPermissionCommand,
};
