const catalog = {
  utility: {
    ping: {
      name: 'lr_ping',
      id: '1505807163560296498',
      animated: false,
    },
  },
  status: {
    success: {
      name: 'lr_success',
      id: '1505659352521113843',
      animated: false,
    },
    error: {
      name: 'lr_error',
      id: '1505659399606239252',
      animated: false,
    },
    warning: {
      name: 'lr_warning',
      id: '1505660387385807059',
      animated: false,
    },
    loading: {
      name: 'lr_loading',
      id: '1505660233660502046',
      animated: true,
    },
  },
  actions: {
    refresh: {
      name: 'lr_refresh',
      id: '1505660634497290462',
      animated: false,
    },
  },
  config: {
    prefix: {
      name: 'lr_prefix',
      id: '1505809585263611984',
      animated: false,
    },
    settings: {
      name: 'lr_settings',
      id: '1505809585263611984',
      animated: false,
    },
  },
  lr: {
    diamond: {
      name: 'diamond',
      id: '1510659066605605157',
      animated: true,
    },
    logo: {
      name: 'lr_logo',
      id: '1505803623794212905',
      animated: false,
    },
  },
  noprefix: {
    noprefix: {
      name: 'lr_noprefix_add',
      id: '1510659066605605157',
      animated: true,
    },
  },
  orbix: {
    orbix: {
      name: 'orbix',
      id: '1525406542277378108',
      animated: false,
    }
  },
};

function getDefinition(path) {
  return path.split('.').reduce((current, key) => current?.[key], catalog);
}

function getEmoji(path) {
  const definition = getDefinition(path);
  const id = definition?.id;

  if (!definition || !id) {
    return '';
  }

  const prefix = definition.animated ? 'a' : '';
  return `<${prefix}:${definition.name}:${id}>`;
}

function label(path, text) {
  const emoji = getEmoji(path);
  return emoji ? `${emoji} ${text}` : text;
}

function button(path) {
  const definition = getDefinition(path);
  const id = definition?.id;

  if (!definition || !id) {
    return null;
  }

  return {
    id,
    name: definition.name,
    animated: definition.animated,
  };
}

module.exports = {
  button,
  catalog,
  getEmoji,
  label,
};
