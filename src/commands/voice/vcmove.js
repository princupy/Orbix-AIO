const { PermissionsBitField } = require('discord.js');
const { cv2Payload } = require('../../utils/cv2');
const { vcContainer, extractUserId, extractChannelId, hasPerm, handleDelete } = require('../../utils/voiceCommand');

const DEL = 'vcmove:delete:';

async function execute({ message, args }) {
  const ownerId = message.author.id;

  if (!hasPerm(message.member, PermissionsBitField.Flags.MoveMembers)) {
    await message.reply(cv2Payload(vcContainer({ type: 'error', title: 'Missing Permission', description: 'You need **Move Members** or **Administrator** permission.' })));
    return;
  }

  if (!hasPerm(message.guild.members.me, PermissionsBitField.Flags.MoveMembers)) {
    await message.reply(cv2Payload(vcContainer({ type: 'error', title: 'Bot Missing Permission', description: 'I need **Move Members** permission.', deletePrefix: DEL, ownerId })));
    return;
  }

  const userId = extractUserId(args[0]);
  if (!userId || !args[1]) {
    await message.reply(cv2Payload(vcContainer({ type: 'error', title: 'Invalid Usage', description: '**Usage:** `LR!vcmove @user <voice-channel-id>`' })));
    return;
  }

  const member = await message.guild.members.fetch(userId).catch(() => null);
  if (!member) {
    await message.reply(cv2Payload(vcContainer({ type: 'error', title: 'User Not Found', description: 'Could not find that user in this server.' })));
    return;
  }

  if (!member.voice?.channel) {
    await message.reply(cv2Payload(vcContainer({ type: 'error', title: 'Not in Voice', description: `${member} is not in any voice channel.` })));
    return;
  }

  const channelId = extractChannelId(args[1]) || args[1];
  const destChannel = message.guild.channels.cache.get(channelId);

  if (!destChannel || (destChannel.type !== 2 && destChannel.type !== 13)) {
    await message.reply(cv2Payload(vcContainer({ type: 'error', title: 'Invalid Channel', description: 'Please provide a valid voice channel ID.' })));
    return;
  }

  if (member.voice.channel.id === destChannel.id) {
    await message.reply(cv2Payload(vcContainer({ type: 'warning', title: 'Already There', description: `${member} is already in **${destChannel.name}**.` })));
    return;
  }

  try {
    await member.voice.setChannel(destChannel, `vcmove by ${message.author.tag}`);
    await message.reply(cv2Payload(vcContainer({
      type: 'success',
      title: 'Member Moved',
      description: `> **User:** ${member}\n> **Moved to:** ${destChannel}`,
      deletePrefix: DEL,
      ownerId,
    })));
  } catch (err) {
    await message.reply(cv2Payload(vcContainer({ type: 'error', title: 'Move Failed', description: err.code === 50013 ? 'Missing role hierarchy or **Move Members** permission.' : err.message })));
  }
}

module.exports = {
  name: 'vcmove',
  aliases: ['voicemove'],
  category: 'voice',
  description: 'Moves a user from their current voice channel to a specified one.',
  usage: 'LR!vcmove @user <voice-channel-id>',
  execute,
  componentHandlers: [{ customIdPrefix: DEL, execute: ({ interaction }) => handleDelete(interaction, DEL) }],
};
