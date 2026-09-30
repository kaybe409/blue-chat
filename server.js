const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = Number(process.env.PORT) || 3002;
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'store.json');
const DEMO_PASSWORD = 'password123';
const onlineSockets = new Map();

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored || !password) return false;
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const verify = crypto.scryptSync(password, salt, 64).toString('hex');
  if (hash.length !== verify.length) return false;
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(verify, 'hex'));
}

function defaultSettings() {
  return {
    theme: 'light',
    density: 'comfortable',
    fontSize: 'medium',
    notifications: true,
    sound: true,
    readReceipts: true,
    showLastSeen: true,
    compactSidebar: false,
    showMessageTimes: true,
    reduceMotion: false
  };
}

function enrichUser(user) {
  const username = user.username || String(user.name || 'user').split(' ')[0].toLowerCase();
  return {
    ...user,
    username,
    firstName: user.firstName || String(user.name || '').split(' ')[0] || '',
    lastName: user.lastName || String(user.name || '').split(' ').slice(1).join(' ') || '',
    age: user.age ?? null,
    timeOfBirth: user.timeOfBirth || '',
    passwordHash: user.passwordHash || hashPassword(DEMO_PASSWORD),
    settings: { ...defaultSettings(), ...(user.settings || {}) },
    lastSeenAt: user.lastSeenAt || user.createdAt || new Date().toISOString(),
    activity: Array.isArray(user.activity) ? user.activity : []
  };
}

const defaultUsers = [
  { id: 'u1', name: 'Ava Stone', email: 'ava@example.com', phone: '+1 555 0101', bio: 'Product designer', avatar: 'A', status: 'offline', createdAt: new Date().toISOString() },
  { id: 'u2', name: 'Noah Park', email: 'noah@example.com', phone: '+1 555 0102', bio: 'Frontend engineer', avatar: 'N', status: 'offline', createdAt: new Date().toISOString() },
  { id: 'u3', name: 'Mila Chen', email: 'mila@example.com', phone: '+1 555 0103', bio: 'Community lead', avatar: 'M', status: 'offline', createdAt: new Date().toISOString() },
  { id: 'u4', name: 'Leo Grant', email: 'leo@example.com', phone: '+1 555 0104', bio: 'Backend engineer', avatar: 'L', status: 'offline', createdAt: new Date().toISOString() }
].map(enrichUser);

const defaultConversations = [
  {
    id: 'c1',
    type: 'direct',
    title: 'Ava & Noah',
    participants: ['u1', 'u2'],
    messages: [
      { id: 'm1', senderId: 'u1', text: 'Morning! Are we still on for the launch review?', createdAt: new Date().toISOString(), readBy: ['u1', 'u2'] },
      { id: 'm2', senderId: 'u2', text: 'Yes, 3pm works for me. I’ll share the prototype link.', createdAt: new Date(Date.now() - 1000 * 60 * 7).toISOString(), readBy: ['u1', 'u2'] }
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'c2',
    type: 'group',
    title: 'Design Team',
    participants: ['u1', 'u2', 'u3', 'u4'],
    groupId: 'g1',
    messages: [
      { id: 'm3', senderId: 'u3', text: 'Design review is moved to Thursday.', createdAt: new Date(Date.now() - 1000 * 60 * 27).toISOString(), readBy: ['u1', 'u2', 'u3'] },
      { id: 'm4', senderId: 'u1', text: 'Thanks! I’ll update the roadmap after the meeting.', createdAt: new Date(Date.now() - 1000 * 60 * 18).toISOString(), readBy: ['u1', 'u2', 'u3', 'u4'] }
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
];

const defaultGroups = [
  {
    id: 'g1',
    name: 'Design Team',
    description: 'Product design, frontend, and community team',
    avatar: 'D',
    admins: ['u1'],
    members: ['u1', 'u2', 'u3', 'u4'],
    conversationId: 'c2',
    createdBy: 'u1',
    createdAt: new Date().toISOString()
  }
];

function ensureDataFiles() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({
      users: defaultUsers,
      conversations: defaultConversations,
      groups: defaultGroups,
      sessions: []
    }, null, 2));
  }
}

function migrateStore(store) {
  store.users = (store.users || []).map(enrichUser);
  store.conversations = store.conversations || [];
  store.groups = store.groups || [];
  store.sessions = store.sessions || [];
  return store;
}

function readStore() {
  ensureDataFiles();
  const raw = fs.readFileSync(DATA_FILE, 'utf8');
  const parsed = JSON.parse(raw);
  const needsMigration = !(parsed.sessions) || parsed.users.some((user) => !user.passwordHash || !user.username || !user.settings);
  const store = migrateStore(parsed);
  if (needsMigration) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2));
  }
  return store;
}

function writeStore(store) {
  ensureDataFiles();
  fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2));
}

function getUserById(store, userId) {
  return store.users.find((user) => user.id === userId);
}

function getConversationById(store, conversationId) {
  return store.conversations.find((conversation) => conversation.id === conversationId);
}

function sanitizeUser(user, options = {}) {
  if (!user) return null;
  const { passwordHash, ...rest } = user;
  let liveStatus = 'offline';
  if (rest.status === 'away') {
    liveStatus = 'away';
  } else if (rest.status === 'offline') {
    liveStatus = 'offline';
  } else if (onlineSockets.has(user.id)) {
    liveStatus = 'online';
  }
  return {
    ...rest,
    status: liveStatus,
    isSelf: options.viewerId ? user.id === options.viewerId : undefined
  };
}

function addActivity(user, type, detail) {
  user.activity = user.activity || [];
  user.activity.unshift({
    id: crypto.randomUUID(),
    type,
    detail,
    createdAt: new Date().toISOString()
  });
  user.activity = user.activity.slice(0, 40);
}

function createSession(store, userId) {
  const token = crypto.randomBytes(24).toString('hex');
  store.sessions.push({
    token,
    userId,
    createdAt: new Date().toISOString()
  });
  return token;
}

function getSessionUser(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : (req.query.token || req.body?.token);
  if (!token) return null;
  const store = readStore();
  const session = store.sessions.find((item) => item.token === token);
  if (!session) return null;
  const user = getUserById(store, session.userId);
  return user ? { store, user, token } : null;
}

function requireAuth(req, res, next) {
  const session = getSessionUser(req);
  if (!session) {
    return res.status(401).json({ error: 'Please log in' });
  }
  req.auth = session;
  next();
}

function addMessageToConversation(conversation, senderId, text, metadata = {}) {
  const message = {
    id: crypto.randomUUID(),
    senderId,
    text,
    createdAt: new Date().toISOString(),
    readBy: [senderId],
    ...(metadata.replyTo ? { replyTo: metadata.replyTo } : {}),
    ...(metadata.forwardedFrom ? { forwardedFrom: metadata.forwardedFrom } : {}),
    ...(metadata.audioClip ? { audioClip: metadata.audioClip } : {})
  };
  conversation.messages.push(message);
  conversation.updatedAt = message.createdAt;
  return message;
}

function setPresence(userId, status) {
  const store = readStore();
  const user = getUserById(store, userId);
  if (!user) return;
  user.status = status;
  user.lastSeenAt = new Date().toISOString();
  writeStore(store);
  io.emit('presence_update', { userId: user.id, status: sanitizeUser(user).status, lastSeenAt: user.lastSeenAt });
  io.emit('active_people', getActivePeople());
}

function getActivePeople() {
  const store = readStore();
  return store.users
    .filter((user) => onlineSockets.has(user.id) || user.status === 'online' || user.status === 'away')
    .map((user) => sanitizeUser(user))
    .sort((a, b) => {
      if (a.status === b.status) return a.name.localeCompare(b.name);
      if (a.status === 'online') return -1;
      if (b.status === 'online') return 1;
      return 0;
    });
}

app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

app.post('/api/auth/register', (req, res) => {
  const store = readStore();
  const {
    email,
    username,
    firstName,
    lastName,
    phone,
    age,
    timeOfBirth,
    password,
    confirmPassword
  } = req.body || {};

  const errors = [];
  if (!email || !String(email).includes('@')) errors.push('A valid email is required');
  if (!username || String(username).trim().length < 3) errors.push('Username must be at least 3 characters');
  if (!firstName || !lastName) errors.push('First and last names are required');
  if (!phone) errors.push('Phone number is required');
  const ageNum = Number(age);
  if (!Number.isFinite(ageNum) || ageNum < 13 || ageNum > 120) errors.push('Age must be 13 or older');
  if (!timeOfBirth) errors.push('Time of birth is required');
  if (!password || String(password).length < 6) errors.push('Password must be at least 6 characters');
  if (password !== confirmPassword) errors.push('Password and confirm password must match');

  const emailNorm = String(email || '').trim().toLowerCase();
  const usernameNorm = String(username || '').trim().toLowerCase();

  if (store.users.some((user) => user.email.toLowerCase() === emailNorm)) {
    errors.push('Email is already registered');
  }
  if (store.users.some((user) => String(user.username).toLowerCase() === usernameNorm)) {
    errors.push('Username is already taken');
  }

  if (errors.length) {
    return res.status(400).json({ error: errors[0], errors });
  }

  const name = `${String(firstName).trim()} ${String(lastName).trim()}`.trim();
  const user = enrichUser({
    id: crypto.randomUUID(),
    name,
    firstName: String(firstName).trim(),
    lastName: String(lastName).trim(),
    username: usernameNorm,
    email: emailNorm,
    phone: String(phone).trim(),
    age: ageNum,
    timeOfBirth: String(timeOfBirth),
    bio: '',
    avatar: name.slice(0, 1).toUpperCase(),
    status: 'online',
    createdAt: new Date().toISOString(),
    passwordHash: hashPassword(password)
  });
  addActivity(user, 'account', 'Created an account');
  store.users.push(user);
  const token = createSession(store, user.id);
  writeStore(store);

  res.status(201).json({ token, user: sanitizeUser(user, { viewerId: user.id }) });
});

app.post('/api/auth/login', (req, res) => {
  const store = readStore();
  const { identifier, email, username, password } = req.body || {};
  const loginId = String(identifier || email || username || '').trim().toLowerCase();

  if (!loginId || !password) {
    return res.status(400).json({ error: 'Email or username and password are required' });
  }

  const user = store.users.find((item) => {
    return item.email.toLowerCase() === loginId || String(item.username).toLowerCase() === loginId;
  });

  if (!user || !verifyPassword(password, user.passwordHash)) {
    return res.status(401).json({ error: 'Invalid login details' });
  }

  user.status = 'online';
  user.lastSeenAt = new Date().toISOString();
  addActivity(user, 'login', 'Signed in');
  const token = createSession(store, user.id);
  writeStore(store);

  res.json({ token, user: sanitizeUser(user, { viewerId: user.id }) });
});

app.post('/api/auth/logout', requireAuth, (req, res) => {
  const { store, user, token } = req.auth;
  store.sessions = store.sessions.filter((item) => item.token !== token);
  if (!onlineSockets.has(user.id)) {
    user.status = 'offline';
    user.lastSeenAt = new Date().toISOString();
  }
  addActivity(user, 'logout', 'Signed out');
  writeStore(store);
  res.json({ ok: true });
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json(sanitizeUser(req.auth.user, { viewerId: req.auth.user.id }));
});

app.get('/api/users', requireAuth, (req, res) => {
  const store = req.auth.store;
  res.json(store.users.map((user) => sanitizeUser(user, { viewerId: req.auth.user.id })));
});

app.get('/api/users/active', requireAuth, (req, res) => {
  res.json(getActivePeople());
});

app.get('/api/users/:id', requireAuth, (req, res) => {
  const store = req.auth.store;
  const user = getUserById(store, req.params.id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  res.json(sanitizeUser(user, { viewerId: req.auth.user.id }));
});

app.patch('/api/users/:id', requireAuth, (req, res) => {
  const store = req.auth.store;
  if (req.params.id !== req.auth.user.id) {
    return res.status(403).json({ error: 'You can only edit your own profile' });
  }
  const user = getUserById(store, req.params.id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const update = req.body || {};
  if (update.avatar !== undefined) {
    const isInitial = typeof update.avatar === 'string' && /^[\p{L}\p{N}]{1,8}$/u.test(update.avatar);
    const isProfileImage = typeof update.avatar === 'string'
      && update.avatar.length <= 1400000
      && /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(update.avatar);
    if (!isInitial && !isProfileImage) {
      return res.status(400).json({ error: 'Profile pictures must be a small JPEG image or a short initial' });
    }
  }
  Object.assign(user, {
    name: update.name ?? user.name,
    firstName: update.firstName ?? user.firstName,
    lastName: update.lastName ?? user.lastName,
    bio: update.bio ?? user.bio,
    avatar: update.avatar ?? user.avatar,
    email: update.email ?? user.email,
    phone: update.phone ?? user.phone,
    age: update.age ?? user.age,
    timeOfBirth: update.timeOfBirth ?? user.timeOfBirth,
    status: ['online', 'offline', 'away'].includes(update.status) ? update.status : user.status
  });
  addActivity(user, 'profile', 'Updated profile');
  writeStore(store);
  io.emit('presence_update', { userId: user.id, status: sanitizeUser(user).status, lastSeenAt: user.lastSeenAt });
  res.json(sanitizeUser(user, { viewerId: user.id }));
});

app.patch('/api/users/:id/settings', requireAuth, (req, res) => {
  const store = req.auth.store;
  if (req.params.id !== req.auth.user.id) {
    return res.status(403).json({ error: 'You can only change your own settings' });
  }
  const user = getUserById(store, req.params.id);
  user.settings = { ...defaultSettings(), ...(user.settings || {}), ...(req.body || {}) };
  addActivity(user, 'settings', 'Updated settings');
  writeStore(store);
  res.json({ settings: user.settings, user: sanitizeUser(user, { viewerId: user.id }) });
});

app.get('/api/groups', requireAuth, (req, res) => {
  res.json(req.auth.store.groups);
});

app.get('/api/conversations', requireAuth, (req, res) => {
  const userId = req.auth.user.id;
  const store = req.auth.store;
  const userConversations = store.conversations
    .filter((conversation) => conversation.participants.includes(userId))
    .map((conversation) => {
      const latestMessage = conversation.messages[conversation.messages.length - 1];
      const group = store.groups.find((item) => item.conversationId === conversation.id);
      const otherUser = conversation.type === 'direct'
        ? getUserById(store, conversation.participants.find((id) => id !== userId))
        : null;
      return {
        ...conversation,
        unreadCount: conversation.messages.filter((message) => !message.readBy?.includes(userId)).length,
        latestMessage,
        title: conversation.type === 'group'
          ? (group ? group.name : conversation.title)
          : (otherUser ? otherUser.name : conversation.title),
        members: store.users.filter((user) => conversation.participants.includes(user.id)).map((user) => sanitizeUser(user))
      };
    })
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

  res.json(userConversations);
});

app.get('/api/conversations/:id', requireAuth, (req, res) => {
  const store = req.auth.store;
  const conversation = getConversationById(store, req.params.id);
  if (!conversation) {
    return res.status(404).json({ error: 'Conversation not found' });
  }
  if (!conversation.participants.includes(req.auth.user.id)) {
    return res.status(403).json({ error: 'Not allowed' });
  }
  res.json({
    ...conversation,
    members: store.users.filter((user) => conversation.participants.includes(user.id)).map((user) => sanitizeUser(user))
  });
});

app.post('/api/conversations/direct', requireAuth, (req, res) => {
  const store = req.auth.store;
  const userA = req.auth.user.id;
  const { userB } = req.body;

  if (!userB) {
    return res.status(400).json({ error: 'userB is required' });
  }

  const existing = store.conversations.find((conversation) => {
    return conversation.type === 'direct'
      && conversation.participants.length === 2
      && conversation.participants.includes(userA)
      && conversation.participants.includes(userB);
  });

  if (existing) {
    return res.status(200).json(existing);
  }

  const title = `${getUserById(store, userA)?.name || 'User'} & ${getUserById(store, userB)?.name || 'User'}`;
  const conversation = {
    id: crypto.randomUUID(),
    type: 'direct',
    title,
    participants: [userA, userB],
    messages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  store.conversations.unshift(conversation);
  writeStore(store);
  res.status(201).json(conversation);
});

app.post('/api/groups', requireAuth, (req, res) => {
  const store = req.auth.store;
  const createdBy = req.auth.user.id;
  const { name, description, members } = req.body;

  if (!name || !Array.isArray(members) || members.length === 0) {
    return res.status(400).json({ error: 'name and members are required' });
  }

  const uniqueMembers = [...new Set([createdBy, ...members])];
  const conversationId = crypto.randomUUID();
  const group = {
    id: crypto.randomUUID(),
    name,
    description: description || '',
    avatar: name.slice(0, 1).toUpperCase(),
    admins: [createdBy],
    members: uniqueMembers,
    conversationId,
    createdBy,
    createdAt: new Date().toISOString()
  };

  store.groups.push(group);
  store.conversations.unshift({
    id: conversationId,
    type: 'group',
    title: name,
    participants: uniqueMembers,
    groupId: group.id,
    messages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  writeStore(store);
  res.status(201).json({ group, conversation: store.conversations[0] });
});

app.post('/api/groups/:id/members', requireAuth, (req, res) => {
  const store = req.auth.store;
  const { userId } = req.body;
  const actorId = req.auth.user.id;
  const group = store.groups.find((item) => item.id === req.params.id);

  if (!group) {
    return res.status(404).json({ error: 'Group not found' });
  }

  if (!group.admins.includes(actorId)) {
    return res.status(403).json({ error: 'Only admins can add members' });
  }

  if (!group.members.includes(userId)) {
    group.members.push(userId);
    const conversation = getConversationById(store, group.conversationId);
    if (conversation && !conversation.participants.includes(userId)) {
      conversation.participants.push(userId);
    }
  }

  writeStore(store);
  res.json(group);
});

app.post('/api/groups/:id/remove-member', requireAuth, (req, res) => {
  const store = req.auth.store;
  const { userId } = req.body;
  const actorId = req.auth.user.id;
  const group = store.groups.find((item) => item.id === req.params.id);

  if (!group) {
    return res.status(404).json({ error: 'Group not found' });
  }

  if (!group.admins.includes(actorId)) {
    return res.status(403).json({ error: 'Only admins can remove members' });
  }

  group.members = group.members.filter((id) => id !== userId);
  const conversation = getConversationById(store, group.conversationId);
  if (conversation) {
    conversation.participants = conversation.participants.filter((id) => id !== userId);
  }

  writeStore(store);
  res.json(group);
});

app.get('/api/search', requireAuth, (req, res) => {
  const store = req.auth.store;
  const query = String(req.query.q || '').trim().toLowerCase();

  if (!query) {
    return res.json({ users: [], groups: [] });
  }

  const users = store.users
    .filter((user) => [user.name, user.email, user.phone, user.username].join(' ').toLowerCase().includes(query))
    .map((user) => sanitizeUser(user));

  const groups = store.groups.filter((group) => {
    return [group.name, group.description].join(' ').toLowerCase().includes(query);
  });

  res.json({ users, groups });
});

app.post('/api/conversations/:id/messages', requireAuth, (req, res) => {
  const store = req.auth.store;
  const conversation = getConversationById(store, req.params.id);
  const senderId = req.auth.user.id;
  const { text, replyTo, forwardedFrom, audioClip } = req.body;

  if (!conversation) {
    return res.status(404).json({ error: 'Conversation not found' });
  }

  if (!conversation.participants.includes(senderId)) {
    return res.status(403).json({ error: 'Not allowed' });
  }

  const messageText = typeof text === 'string' ? text.trim() : '';
  let safeAudioClip = null;
  if (audioClip !== undefined) {
    const dataUrl = typeof audioClip?.dataUrl === 'string' ? audioClip.dataUrl : '';
    const mimeMatch = dataUrl.match(/^data:(audio\/(?:webm|mp4|ogg|wav))(?:;[^,]*)?;base64,[A-Za-z0-9+/]+={0,2}$/i);
    if (!mimeMatch || dataUrl.length > 1400000) {
      return res.status(400).json({ error: 'Voice clips must be supported audio under 1 MB' });
    }
    const duration = Number(audioClip.duration);
    if (!Number.isFinite(duration) || duration < 0 || duration > 60) {
      return res.status(400).json({ error: 'Voice clips must be 60 seconds or shorter' });
    }
    safeAudioClip = { dataUrl, mimeType: mimeMatch[1].toLowerCase(), duration };
  }
  if (!messageText && !safeAudioClip) {
    return res.status(400).json({ error: 'text or a voice clip is required' });
  }

  let reply = null;
  if (replyTo?.id) {
    const sourceMessage = conversation.messages.find((item) => item.id === replyTo.id);
    if (sourceMessage) {
      reply = {
        id: sourceMessage.id,
        senderName: getUserById(store, sourceMessage.senderId)?.name || 'Someone',
        text: (sourceMessage.text || 'Voice clip').slice(0, 300)
      };
    }
  }
  const forwarded = forwardedFrom && typeof forwardedFrom.senderName === 'string'
    ? {
      senderName: forwardedFrom.senderName.slice(0, 80),
      conversationTitle: String(forwardedFrom.conversationTitle || 'a conversation').slice(0, 120)
    }
    : null;
  const message = addMessageToConversation(conversation, senderId, messageText, {
    replyTo: reply,
    forwardedFrom: forwarded,
    audioClip: safeAudioClip
  });
  writeStore(store);

  io.to(conversation.id).emit('message_received', {
    conversationId: conversation.id,
    message
  });

  io.emit('conversation_updated', {
    conversationId: conversation.id,
    lastMessage: message
  });

  res.status(201).json({ conversation, message });
});

app.post('/api/conversations/:id/messages/:messageId/reactions', requireAuth, (req, res) => {
  const store = req.auth.store;
  const conversation = getConversationById(store, req.params.id);
  const userId = req.auth.user.id;
  const { emoji } = req.body || {};
  const allowedReactions = ['❤️', '😂', '👍', '😮', '😢', '👏'];

  if (!conversation) {
    return res.status(404).json({ error: 'Conversation not found' });
  }
  if (!conversation.participants.includes(userId)) {
    return res.status(403).json({ error: 'Not allowed' });
  }
  if (!allowedReactions.includes(emoji)) {
    return res.status(400).json({ error: 'Choose a supported reaction' });
  }

  const message = conversation.messages.find((item) => item.id === req.params.messageId);
  if (!message) {
    return res.status(404).json({ error: 'Message not found' });
  }
  message.reactions = message.reactions || [];
  const existingIndex = message.reactions.findIndex((item) => item.userId === userId && item.emoji === emoji);
  if (existingIndex >= 0) {
    message.reactions.splice(existingIndex, 1);
  } else {
    message.reactions.push({ userId, emoji });
  }

  writeStore(store);
  io.to(conversation.id).emit('message_updated', { conversationId: conversation.id, message });
  res.json({ message });
});

app.post('/api/conversations/:id/read', requireAuth, (req, res) => {
  const store = req.auth.store;
  const conversation = getConversationById(store, req.params.id);
  const userId = req.auth.user.id;
  const { messageId } = req.body;

  if (!conversation) {
    return res.status(404).json({ error: 'Conversation not found' });
  }

  if (messageId) {
    conversation.messages = conversation.messages.map((message) => {
      if (message.id === messageId && !message.readBy.includes(userId)) {
        message.readBy.push(userId);
      }
      return message;
    });
  }

  writeStore(store);
  io.to(conversation.id).emit('read_receipt', {
    conversationId: conversation.id,
    userId,
    messageId
  });

  res.json({ ok: true });
});

app.post('/api/presence', requireAuth, (req, res) => {
  const store = req.auth.store;
  const user = getUserById(store, req.auth.user.id);
  const { status } = req.body;
  user.status = ['online', 'offline', 'away'].includes(status) ? status : 'online';
  user.lastSeenAt = new Date().toISOString();
  writeStore(store);
  io.emit('presence_update', { userId: user.id, status: user.status, lastSeenAt: user.lastSeenAt });
  io.emit('active_people', getActivePeople());
  res.json(sanitizeUser(user, { viewerId: user.id }));
});

io.on('connection', (socket) => {
  socket.on('register_user', (payload) => {
    const userId = typeof payload === 'string' ? payload : payload?.userId;
    if (!userId) return;
    socket.data.userId = userId;
    socket.join(`user:${userId}`);
    const current = onlineSockets.get(userId) || new Set();
    current.add(socket.id);
    onlineSockets.set(userId, current);
    setPresence(userId, 'online');
  });

  socket.on('join_conversation', (conversationId) => {
    if (conversationId) {
      socket.join(conversationId);
    }
  });

  socket.on('typing', ({ conversationId, userId, isTyping }) => {
    if (!conversationId || !userId) return;
    socket.to(conversationId).emit('typing_status', {
      conversationId,
      userId,
      isTyping
    });
  });

  socket.on('message_sent', ({ conversationId, senderId, text }) => {
    const store = readStore();
    const conversation = getConversationById(store, conversationId);
    if (!conversation) return;
    const message = addMessageToConversation(conversation, senderId, text);
    writeStore(store);
    io.to(conversationId).emit('message_received', { conversationId, message });
  });

  socket.on('mark_read', ({ conversationId, userId, messageId }) => {
    const store = readStore();
    const conversation = getConversationById(store, conversationId);
    if (!conversation) return;

    conversation.messages = conversation.messages.map((message) => {
      if (message.id === messageId && !message.readBy.includes(userId)) {
        message.readBy.push(userId);
      }
      return message;
    });

    writeStore(store);
    io.to(conversationId).emit('read_receipt', { conversationId, userId, messageId });
  });

  socket.on('disconnect', () => {
    const userId = socket.data.userId;
    if (!userId) return;
    const current = onlineSockets.get(userId);
    if (current) {
      current.delete(socket.id);
      if (current.size === 0) {
        onlineSockets.delete(userId);
        setPresence(userId, 'offline');
      } else {
        onlineSockets.set(userId, current);
      }
    }
  });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

server.listen(PORT, () => {
  console.log(`Chat app running at http://localhost:${PORT}`);
});
