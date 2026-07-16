const { ChannelType } = require('discord.js');
const emojis = require('../../emojis');
const { cv2Payload } = require('../../utils/cv2');
const { getTicketConfig, updateTicketConfig } = require('../../supabase/tickets');
const { buildSimpleNotice, canManageTickets } = require('../../utils/tickets');

function extractId(value, mentionPattern) {
  const mentionMatch = String(value || '').match(mentionPattern);

  if (mentionMatch) {
    return mentionMatch[1];
  }

  return /^\d{17,20}$/.test(String(value || '')) ? String(value) : null;
}

function reply(message, container) {
  return message.reply(cv2Payload(container, {
    allowedMentions: { parse: [], repliedUser: false, roles: [], users: [] },
  }));
}

function buildConfigView(config, prefix) {
  return buildSimpleNotice(
    '🎫 Ticket Configuration',
    [
      `> 📂 **Category:** ${config.category_id ? `<#${config.category_id}>` : '`Not set`'}`,
      `> 🛡️ **Support Role:** ${config.support_role_id ? `<@&${config.support_role_id}>` : '`Not set`'}`,
      `> 📜 **Log Channel:** ${config.log_channel_id ? `<#${config.log_channel_id}>` : '`Not set`'}`,
      `> 🔢 **Max Open / User:** \`${config.max_open}\``,
      `> 🏷️ **Panel Title:** ${config.panel_title}`,
      '',
      '**Configure:**',
      `> \`${prefix}ticketconfig category <category_id>\``,
      `> \`${prefix}ticketconfig support <@role>\``,
      `> \`${prefix}ticketconfig log <#channel>\``,
      `> \`${prefix}ticketconfig maxopen <1-20>\``,
      `> \`${prefix}ticketconfig title <text>\` • \`${prefix}ticketconfig description <text>\``,
      '',
      `Then post the panel with \`${prefix}ticketpanel [#channel]\`.`,
    ].join('\n'),
  );
}

async function saveAndConfirm(message, patch, successText) {
  const result = await updateTicketConfig(message.guild.id, patch);

  if (!result.ok) {
    await reply(message, buildSimpleNotice(
      emojis.label('status.error', 'Save Failed'),
      `Could not save configuration.\n\`${result.reason}\``,
    ));
    return;
  }

  await reply(message, buildSimpleNotice(
    emojis.label('status.success', 'Configuration Updated'),
    successText,
  ));
}

async function execute({ args, message, prefix }) {
  if (!canManageTickets(message.member, message.author.id)) {
    await reply(message, buildSimpleNotice(
      emojis.label('status.error', 'Missing Permission'),
      'You need **Manage Server** or **Administrator** permission to configure tickets.',
    ));
    return;
  }

  const { config } = await getTicketConfig(message.guild.id);
  const sub = args[0]?.toLowerCase();

  if (!sub) {
    await reply(message, buildConfigView(config, prefix));
    return;
  }

  if (sub === 'category') {
    const id = extractId(args[1], /^<#(\d{17,20})>$/);
    const channel = id ? message.guild.channels.cache.get(id) : null;

    if (!channel || channel.type !== ChannelType.GuildCategory) {
      await reply(message, buildSimpleNotice(
        emojis.label('status.error', 'Invalid Category'),
        `Provide a valid **category ID**.\nUsage: \`${prefix}ticketconfig category <category_id>\``,
      ));
      return;
    }

    await saveAndConfirm(message, { category_id: id }, `Ticket category set to **${channel.name}**.`);
    return;
  }

  if (sub === 'support') {
    const id = extractId(args[1], /^<@&(\d{17,20})>$/);
    const role = id ? message.guild.roles.cache.get(id) : null;

    if (!role) {
      await reply(message, buildSimpleNotice(
        emojis.label('status.error', 'Invalid Role'),
        `Mention a role or provide its ID.\nUsage: \`${prefix}ticketconfig support <@role>\``,
      ));
      return;
    }

    await saveAndConfirm(message, { support_role_id: id }, `Support role set to <@&${id}>.`);
    return;
  }

  if (sub === 'log') {
    const id = extractId(args[1], /^<#(\d{17,20})>$/);
    const channel = id ? message.guild.channels.cache.get(id) : null;

    if (!channel || !channel.isTextBased?.()) {
      await reply(message, buildSimpleNotice(
        emojis.label('status.error', 'Invalid Channel'),
        `Mention a text channel or provide its ID.\nUsage: \`${prefix}ticketconfig log <#channel>\``,
      ));
      return;
    }

    await saveAndConfirm(message, { log_channel_id: id }, `Ticket log channel set to <#${id}>.`);
    return;
  }

  if (sub === 'maxopen') {
    const value = Number(args[1]);

    if (!Number.isInteger(value) || value < 1 || value > 20) {
      await reply(message, buildSimpleNotice(
        emojis.label('status.error', 'Invalid Value'),
        'Max open tickets per user must be between **1** and **20**.',
      ));
      return;
    }

    await saveAndConfirm(message, { max_open: value }, `Max open tickets per user set to **${value}**.`);
    return;
  }

  if (sub === 'title') {
    const value = args.slice(1).join(' ').trim();

    if (!value) {
      await reply(message, buildSimpleNotice(
        emojis.label('status.error', 'Missing Text'),
        `Usage: \`${prefix}ticketconfig title <text>\``,
      ));
      return;
    }

    await saveAndConfirm(message, { panel_title: value }, 'Panel title updated.');
    return;
  }

  if (sub === 'description' || sub === 'desc') {
    const value = args.slice(1).join(' ').trim();

    if (!value) {
      await reply(message, buildSimpleNotice(
        emojis.label('status.error', 'Missing Text'),
        `Usage: \`${prefix}ticketconfig description <text>\``,
      ));
      return;
    }

    await saveAndConfirm(message, { panel_description: value }, 'Panel description updated.');
    return;
  }

  await reply(message, buildConfigView(config, prefix));
}

module.exports = {
  name: 'ticketconfig',
  aliases: ['ticketset', 'tconfig'],
  category: 'ticket',
  description: 'Configure the ticket system (category, support role, log channel, panel).',
  usage: 'LR!ticketconfig [category|support|log|maxopen|title|description] <value>',
  noTimeout: true,
  execute,
};
