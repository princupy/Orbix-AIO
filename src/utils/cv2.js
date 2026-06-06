const {
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
} = require('discord.js');

function createNoticeContainer({ title, description }) {
  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${title}`),
    );

  if (description) {
    container
      .addSeparatorComponents(
        new SeparatorBuilder()
          .setDivider(true)
          .setSpacing(SeparatorSpacingSize.Small),
      )
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(description),
      );
  }

  return container;
}

function cv2Payload(componentOrComponents, options = {}) {
  let flags = MessageFlags.IsComponentsV2;

  if (options.ephemeral) {
    flags |= MessageFlags.Ephemeral;
  }

  const payload = {
    components: Array.isArray(componentOrComponents)
      ? componentOrComponents
      : [componentOrComponents],
    flags,
    allowedMentions: options.allowedMentions || {
      parse: [],
      repliedUser: false,
    },
  };

  if (options.files) {
    payload.files = options.files;
  }

  if (options.attachments) {
    payload.attachments = options.attachments;
  }

  return payload;
}

module.exports = {
  createNoticeContainer,
  cv2Payload,
};
