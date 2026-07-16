const emojis = require('../../emojis');
const { cv2Payload } = require('../../utils/cv2');
const { getTicket, getTicketConfig } = require('../../supabase/tickets');
const { buildCloseConfirm, buildSimpleNotice, isSupportMember } = require('../../utils/tickets');

async function execute({ message }) {
  const { ticket } = await getTicket(message.channel.id);

  if (!ticket) {
    await message.reply(cv2Payload(buildSimpleNotice(
      emojis.label('status.error', 'Not a Ticket'),
      'This command can only be used inside a ticket channel.',
    )));
    return;
  }

  const { config } = await getTicketConfig(message.guild.id);
  const isOpener = message.author.id === ticket.opener_id;

  if (!isOpener && !isSupportMember(message.member, config)) {
    await message.reply(cv2Payload(buildSimpleNotice(
      emojis.label('status.error', 'Missing Permission'),
      'Only the ticket opener or support staff can close this ticket.',
    )));
    return;
  }

  await message.channel.send(cv2Payload(buildCloseConfirm()));
}

module.exports = {
  name: 'ticketclose',
  aliases: ['closeticket', 'close'],
  category: 'ticket',
  description: 'Closes the current ticket (asks for confirmation).',
  usage: 'LR!ticketclose',
  noTimeout: true,
  execute,
};
