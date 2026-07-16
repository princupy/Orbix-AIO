const emojis = require('../../emojis');
const { cv2Payload } = require('../../utils/cv2');
const { getTicketConfig } = require('../../supabase/tickets');
const {
  buildPanelContainer,
  buildSimpleNotice,
  canManageTickets,
  ticketComponentHandlers,
} = require('../../utils/tickets');

function reply(message, container) {
  return message.reply(cv2Payload(container, {
    allowedMentions: { parse: [], repliedUser: false, roles: [], users: [] },
  }));
}

async function execute({ args, message, prefix }) {
  if (!canManageTickets(message.member, message.author.id)) {
    await reply(message, buildSimpleNotice(
      emojis.label('status.error', 'Missing Permission'),
      'You need **Manage Server** or **Administrator** permission to post a ticket panel.',
    ));
    return;
  }

  const { config } = await getTicketConfig(message.guild.id);

  if (!config.category_id || !config.support_role_id) {
    await reply(message, buildSimpleNotice(
      emojis.label('status.warning', 'Setup Required'),
      [
        'Configure the ticket system before posting a panel:',
        `> \`${prefix}ticketconfig category <category_id>\``,
        `> \`${prefix}ticketconfig support <@role>\``,
        '',
        `See all options with \`${prefix}ticketconfig\`.`,
      ].join('\n'),
    ));
    return;
  }

  const targetChannel = message.mentions.channels.first() || message.channel;

  if (!targetChannel.isTextBased?.() || typeof targetChannel.send !== 'function') {
    await reply(message, buildSimpleNotice(
      emojis.label('status.error', 'Invalid Channel'),
      'Please mention a valid text channel to post the panel in.',
    ));
    return;
  }

  const sent = await targetChannel.send(cv2Payload(buildPanelContainer(config))).catch(() => null);

  if (!sent) {
    await reply(message, buildSimpleNotice(
      emojis.label('status.error', 'Failed'),
      `I could not post the panel in <#${targetChannel.id}>. Check my permissions there.`,
    ));
    return;
  }

  await reply(message, buildSimpleNotice(
    emojis.label('status.success', 'Panel Posted'),
    `The ticket panel has been posted in <#${targetChannel.id}>.`,
  ));
}

module.exports = {
  name: 'ticketpanel',
  aliases: ['ticketsetup', 'sendpanel'],
  category: 'ticket',
  description: 'Posts the ticket creation panel in a channel.',
  usage: 'LR!ticketpanel [#channel]',
  noTimeout: true,
  execute,
  componentHandlers: ticketComponentHandlers,
};
