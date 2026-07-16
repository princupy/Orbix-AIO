const { PermissionsBitField } = require('discord.js');
const emojis = require('../../emojis');
const { cv2Payload } = require('../../utils/cv2');
const { getTicket, getTicketConfig } = require('../../supabase/tickets');
const { buildSimpleNotice, isSupportMember } = require('../../utils/tickets');

function resolveUserId(message, args) {
  const mentioned = message.mentions.users.first();

  if (mentioned) {
    return mentioned.id;
  }

  return /^\d{17,20}$/.test(args[0] || '') ? args[0] : null;
}

function reply(message, container) {
  return message.reply(cv2Payload(container, {
    allowedMentions: { parse: [], repliedUser: false, roles: [], users: [] },
  }));
}

async function execute({ args, message, prefix }) {
  const { ticket } = await getTicket(message.channel.id);

  if (!ticket) {
    await reply(message, buildSimpleNotice(
      emojis.label('status.error', 'Not a Ticket'),
      'This command can only be used inside a ticket channel.',
    ));
    return;
  }

  const { config } = await getTicketConfig(message.guild.id);
  const isOpener = message.author.id === ticket.opener_id;

  if (!isOpener && !isSupportMember(message.member, config)) {
    await reply(message, buildSimpleNotice(
      emojis.label('status.error', 'Missing Permission'),
      'Only the ticket opener or support staff can add members.',
    ));
    return;
  }

  const targetId = resolveUserId(message, args);

  if (!targetId) {
    await reply(message, buildSimpleNotice(
      emojis.label('status.warning', 'Add To Ticket'),
      `Mention a user or provide their ID.\nUsage: \`${prefix}ticketadd <@user>\``,
    ));
    return;
  }

  const success = await message.channel.permissionOverwrites.edit(targetId, {
    AttachFiles: true,
    ReadMessageHistory: true,
    SendMessages: true,
    ViewChannel: true,
  }).then(() => true).catch(() => false);

  await reply(message, success
    ? buildSimpleNotice(emojis.label('status.success', 'Member Added'), `<@${targetId}> can now access this ticket.`)
    : buildSimpleNotice(emojis.label('status.error', 'Failed'), 'I could not add that member. Check my permissions.'));
}

module.exports = {
  name: 'ticketadd',
  aliases: ['adduser'],
  category: 'ticket',
  description: 'Adds a user to the current ticket channel.',
  usage: 'LR!ticketadd <@user>',
  noTimeout: true,
  execute,
};
