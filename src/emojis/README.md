# Emoji Registry

All bot emoji references should come from this folder only.

Add custom Discord emoji IDs directly in `src/emojis/index.js`, then use the registry:

```js
const emojis = require('../../emojis');

emojis.label('utility.ping', 'Pong');
emojis.getEmoji('status.success');
emojis.button('actions.refresh');
```

Keep Discord custom emoji names and numeric IDs in `src/emojis/index.js`.
