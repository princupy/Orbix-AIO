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
      'Only the ticket opener or support staff can remove members.',
    ));
    return;
  }

  const targetId = resolveUserId(message, args);

  if (!targetId) {
    await reply(message, buildSimpleNotice(
      emojis.label('status.warning', 'Remove From Ticket'),
      `Mention a user or provide their ID.\nUsage: \`${prefix}ticketremove <@user>\``,
    ));
    return;
  }

  if (targetId === ticket.opener_id) {
    await reply(message, buildSimpleNotice(
      emojis.label('status.error', 'Cannot Remove'),
      'You cannot remove the ticket opener.',
    ));
    return;
  }

  const success = await message.channel.permissionOverwrites.delete(targetId, 'Removed from ticket')
    .then(() => true)
    .catch(() => false);

  await reply(message, success
    ? buildSimpleNotice(emojis.label('status.success', 'Member Removed'), `<@${targetId}> can no longer access this ticket.`)
    : buildSimpleNotice(emojis.label('status.error', 'Failed'), 'I could not remove that member. Check my permissions.'));
}

module.exports = {
  name: 'ticketremove',
  aliases: ['removeuser'],
  category: 'ticket',
  description: 'Removes a user from the current ticket channel.',
  usage: 'LR!ticketremove <@user>',
  noTimeout: true,
  execute,
};
